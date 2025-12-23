import type { ILogger } from 'comon-utils'
import type Decimal from 'decimal.js'
import process from 'node:process'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import { GatewayApiClient } from '@radixdlt/babylon-gateway-api-sdk'
import { WeftLedgerSateFetcher } from '@weft-finance/ledger-state'
import { createLogger } from 'comon-utils'

const logger = createLogger({ service: 'indexer' })

export type Fetcher = Pick<WeftLedgerSateFetcher, 'getMultipleCdp'>

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value)
    throw new Error(`Missing required env var: ${name}`)
  return value
}

export function checkRisk(cdp: { liquidationLtv: Decimal }): boolean {
  return cdp.liquidationLtv.gte(1)
}

export function createMessageProcessor(params: {
  sqs: Pick<SQSClient, 'send'>
  s3: Pick<S3Client, 'send'>
  fetcher: Fetcher
  liquidationQueueUrl: string
  bucketName: string
  logger?: ILogger
  now?: () => Date
}) {
  const baseLogger = params.logger ?? logger
  const now = params.now ?? (() => new Date())

  if (!params.liquidationQueueUrl)
    throw new Error('Missing liquidationQueueUrl')
  if (!params.bucketName)
    throw new Error('Missing bucketName')

  return async function processMessage(message: any) {
    const messageId = typeof message?.MessageId === 'string' ? message.MessageId : undefined

    if (!message?.Body) {
      baseLogger.error({ event: 'indexer.message.missing_body', messageId })
      return
    }

    let body: any
    try {
      body = JSON.parse(message.Body)
    }
    catch (error) {
      baseLogger.error({
        event: 'indexer.message.invalid_json',
        messageId,
        bodyLength: typeof message.Body === 'string' ? message.Body.length : undefined,
        err: error,
      })
      return
    }

    const runId = typeof body.runId === 'string' ? body.runId : undefined
    const chunkIndex = typeof body.chunkIndex === 'number' ? body.chunkIndex : undefined
    const chunkCount = typeof body.chunkCount === 'number' ? body.chunkCount : undefined
    const cdpIds = Array.isArray(body.cdpIds) ? body.cdpIds : []

    // Create a child logger for this request context
    const localLogger = baseLogger.child({ runId, messageId, chunkIndex, chunkCount })

    if (cdpIds.length === 0) {
      localLogger.error({ event: 'indexer.message.missing_cdp_ids' })
      return
    }

    const ids = cdpIds.filter((id: any): id is string => typeof id === 'string' && id.length > 0)
    if (ids.length !== cdpIds.length) {
      localLogger.warn({
        event: 'indexer.message.invalid_cdp_ids',
        invalidCount: cdpIds.length - ids.length,
      })
    }

    try {
      localLogger.info({
        event: 'indexer.message.received',
        cdpCount: ids.length,
      })

      const fetchStart = Date.now()
      localLogger.info({
        event: 'indexer.fetch.start',
        cdpCount: ids.length,
      })

      let totalFetched = 0

      const result = await params.fetcher.getMultipleCdp(ids, {
        cdpPerBatch: 10,
        onProgress: (fetched: number) => {
          totalFetched += fetched
          localLogger.info({
            event: 'indexer.fetch.progress',
            fetchedCount: fetched,
            totalFetched,
            total: ids.length,
          })
        },
      })

      if (result.failedIds?.length) {
        localLogger.error({
          event: 'indexer.fetch.failed',
          failedCount: result.failedIds.length,
          failedIds: result.failedIds,
        })
        throw new Error('Failed to fetch some CDPs')
      }

      const cdps = result.data
      localLogger.info({
        event: 'indexer.fetch.complete',
        fetchedCount: cdps.length,
        durationMs: Date.now() - fetchStart,
      })

      const timestamp = now().getTime()
      const date = new Date(timestamp)
      const key = `cdp-data/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/cdp-batch-${timestamp}.json`
      const bodyString = JSON.stringify(cdps)

      await params.s3.send(new PutObjectCommand({
        Bucket: params.bucketName,
        Key: key,
        Body: bodyString,
        ContentType: 'application/json',
      }))
      localLogger.info({
        event: 'indexer.s3.write',
        key,
        bytes: Buffer.byteLength(bodyString),
      })

      const atRiskCdps = (cdps as any[]).filter(checkRisk)

      if (atRiskCdps.length > 0) {
        localLogger.info({
          event: 'indexer.at_risk.detected',
          atRiskCount: atRiskCdps.length,
        })

        await params.sqs.send(new SendMessageCommand({
          QueueUrl: params.liquidationQueueUrl,
          MessageBody: JSON.stringify({
            cdpIds: atRiskCdps.map((c: any) => c.id),
            reason: 'High LTV',
            runId,
          }),
        }))

        localLogger.info({
          event: 'indexer.liquidation.enqueued',
          atRiskCount: atRiskCdps.length,
        })
      }
    }
    catch (error) {
      localLogger.error({
        event: 'indexer.message.error',
        err: error,
      })
      throw error
    }
  }
}

export function createIndexerWorker(params: {
  sqs: Pick<SQSClient, 'send'>
  s3: Pick<S3Client, 'send'>
  fetcher: Fetcher
  queueUrl: string
  liquidationQueueUrl: string
  bucketName: string
  logger?: ILogger
  now?: () => Date
}) {
  const baseLogger = params.logger ?? logger
  if (!params.queueUrl)
    throw new Error('Missing queueUrl')

  const processMessage = createMessageProcessor({
    sqs: params.sqs,
    s3: params.s3,
    fetcher: params.fetcher,
    liquidationQueueUrl: params.liquidationQueueUrl,
    bucketName: params.bucketName,
    logger: baseLogger,
    now: params.now,
  })

  async function runOnce() {
    const { Messages } = await params.sqs.send(new ReceiveMessageCommand({
      QueueUrl: params.queueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 20,
    }))

    if (Messages) {
      for (const msg of Messages) {
        await processMessage(msg)
        if (msg.ReceiptHandle) {
          await params.sqs.send(new DeleteMessageCommand({
            QueueUrl: params.queueUrl,
            ReceiptHandle: msg.ReceiptHandle,
          }))
          baseLogger.info({ event: 'indexer.message.deleted', messageId: msg.MessageId })
        }
      }
    }
  }

  async function runForever() {
    baseLogger.info({ event: 'indexer.start', queueUrl: params.queueUrl })

    while (true) {
      try {
        await runOnce()
      }
      catch (error) {
        baseLogger.error({ event: 'indexer.loop.error', err: error })
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    }
  }

  return { processMessage, runOnce, runForever }
}

let cachedDefaultWorker: ReturnType<typeof createIndexerWorker> | undefined

function getDefaultWorker() {
  if (cachedDefaultWorker)
    return cachedDefaultWorker

  const sqs = new SQSClient({})
  const s3 = new S3Client({})
  const gatewayApi = GatewayApiClient.initialize({
    basePath: requireEnv('RADIX_GATEWAY_URL'),
    applicationName: 'Weft Indexer Worker',
  })

  const fetcher = WeftLedgerSateFetcher.setInstance(gatewayApi)

  cachedDefaultWorker = createIndexerWorker({
    sqs,
    s3,
    fetcher,
    queueUrl: requireEnv('QUEUE_URL'),
    liquidationQueueUrl: requireEnv('LIQUIDATION_QUEUE_URL'),
    bucketName: requireEnv('BUCKET_NAME'),
  })

  return cachedDefaultWorker
}

async function main() {
  await getDefaultWorker().runForever()
}

const isMain = typeof require !== 'undefined' && require.main === module
if (isMain) {
  void main()
}
