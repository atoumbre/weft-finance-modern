import type { ILogger } from '@local-packages/common-utils'
import process from 'node:process'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import { checkRisk, fetchCdpDetails } from './indexer'
import { createLogger } from '@local-packages/common-utils'
import { GatewayApiClient } from '@radixdlt/babylon-gateway-api-sdk'
import { WeftLedgerSateFetcher } from '@weft-finance/ledger-state'

const logger = createLogger({ service: 'indexer' })

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value)
    throw new Error(`Missing required env var: ${name}`)
  return value
}

export function createMessageProcessor(params: {
  sqs: Pick<SQSClient, 'send'>
  s3: Pick<S3Client, 'send'>
  fetcher: any // Type from package
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

    const localLogger = baseLogger.child({ runId, messageId, chunkIndex, chunkCount })

    if (cdpIds.length === 0) {
      localLogger.error({ event: 'indexer.message.missing_cdp_ids' })
      return
    }

    const ids = cdpIds.filter((id: any): id is string => typeof id === 'string' && id.length > 0)

    try {
      const result = await fetchCdpDetails({
        fetcher: params.fetcher,
        cdpIds: ids,
        logger: localLogger,
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
  fetcher: any // Type from package
  queueUrl: string
  liquidationQueueUrl: string
  bucketName: string
  logger?: ILogger
  now?: () => Date
}) {
  const baseLogger = params.logger ?? logger
  if (!params.queueUrl)
    throw new Error('Missing queueUrl')

  let shouldRun = true

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
    const maxMessages = Number.parseInt(process.env.MAX_MESSAGES ?? '10', 10)
    const waitTimeSeconds = Number.parseInt(process.env.WAIT_TIME_SECONDS ?? '20', 10)

    const { Messages } = await params.sqs.send(new ReceiveMessageCommand({
      QueueUrl: params.queueUrl,
      MaxNumberOfMessages: maxMessages,
      WaitTimeSeconds: waitTimeSeconds,
    }))

    if (Messages && Messages.length > 0) {
      baseLogger.debug({ event: 'indexer.receive_messages', count: Messages.length })
      await Promise.all(Messages.map(async (msg) => {
        try {
          await processMessage(msg)
          if (msg.ReceiptHandle) {
            await params.sqs.send(new DeleteMessageCommand({
              QueueUrl: params.queueUrl,
              ReceiptHandle: msg.ReceiptHandle,
            }))
            baseLogger.info({
              event: 'indexer.message.deleted',
              messageId: msg.MessageId,
            })
          }
        }
        catch (error) {
          baseLogger.error({
            event: 'indexer.message.processing_failed',
            messageId: msg.MessageId,
            err: error,
          })
          // On error, we don't delete the message, so SQS will retry it after visibility timeout
        }
      }))
    }
  }

  async function runForever() {
    baseLogger.info({ event: 'indexer.start', queueUrl: params.queueUrl })
    const errorDelay = Number.parseInt(process.env.LOOP_ERROR_DELAY_MS ?? '5000', 10)

    // eslint-disable-next-line no-unmodified-loop-condition
    while (shouldRun) {
      try {
        await runOnce()
      }
      catch (error) {
        baseLogger.error({ event: 'indexer.loop.error', err: error })
        await new Promise(resolve => setTimeout(resolve, errorDelay))
      }
    }

    baseLogger.info({ event: 'indexer.stop', queueUrl: params.queueUrl })
  }

  function stop() {
    shouldRun = false
  }

  return { processMessage, runOnce, runForever, stop, getStatus: () => ({ shouldRun }) }
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
export { main }
