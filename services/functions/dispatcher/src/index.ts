

import type { ILogger } from 'common-utils'
import { randomUUID } from 'node:crypto'
import { SendMessageBatchCommand, SQSClient } from '@aws-sdk/client-sqs'
import { GatewayApiClient } from '@radixdlt/babylon-gateway-api-sdk'
import { WeftLedgerSateFetcher } from '@weft-finance/ledger-state'
import { createLogger } from 'common-utils'

const logger = createLogger({ service: 'dispatcher' })

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value)
    throw new Error(`Missing required env var: ${name}`)
  return value
}

//

export type Fetcher = Pick<WeftLedgerSateFetcher, 'getCdpIds'>

export function createDispatcherHandler(params: {
  sqs: Pick<SQSClient, 'send'>
  fetcher: Fetcher
  indexerQueueUrl: string
  indexerBatchSize: number
  logger?: ILogger
  runIdFactory?: () => string
}) {
  const baseLogger = params.logger ?? logger
  const indexerBatchSize = params.indexerBatchSize
  const queueUrl = params.indexerQueueUrl
  const runIdFactory = params.runIdFactory ?? (() => randomUUID())

  if (!queueUrl)
    throw new Error('Missing indexerQueueUrl')
  if (!Number.isInteger(indexerBatchSize) || indexerBatchSize <= 0) {
    throw new Error(`Invalid indexerBatchSize: ${indexerBatchSize}`)
  }

  async function sendBatch(entries: { Id: string, MessageBody: string }[], localLogger: ILogger, context: { batchIndex: number, batchCount: number }) {
    localLogger.info({
      event: 'dispatcher.sqs.batch.send',
      batchIndex: context.batchIndex,
      batchCount: context.batchCount,
      messageCount: entries.length,
    })

    const response = await params.sqs.send(new SendMessageBatchCommand({
      QueueUrl: queueUrl,
      Entries: entries,
    }))

    const failed = response.Failed ?? []
    if (failed.length === 0) {
      localLogger.info({
        event: 'dispatcher.sqs.batch.sent',
        batchIndex: context.batchIndex,
        batchCount: context.batchCount,
        messageCount: entries.length,
      })
      return
    }

    const entryById = new Map(entries.map(entry => [entry.Id, entry]))
    const senderFaults = failed.filter(item => item.SenderFault)
    if (senderFaults.length > 0) {
      localLogger.error({
        event: 'dispatcher.sqs.batch.sender_faults',
        batchIndex: context.batchIndex,
        batchCount: context.batchCount,
        senderFaultCount: senderFaults.length,
        senderFaultIds: senderFaults.map(item => item.Id),
      })
    }

    const reTriable = failed.filter(item => !item.SenderFault)
    if (reTriable.length === 0)
      return

    const retryEntries = reTriable
      .map(item => entryById.get(item.Id!))
      .filter((entry): entry is { Id: string, MessageBody: string } => Boolean(entry))

    if (retryEntries.length === 0) {
      localLogger.error({
        event: 'dispatcher.sqs.batch.retry_skipped',
        batchIndex: context.batchIndex,
        batchCount: context.batchCount,
        reTriableCount: reTriable.length,
      })
      return
    }

    localLogger.info({
      event: 'dispatcher.sqs.batch.retry',
      batchIndex: context.batchIndex,
      batchCount: context.batchCount,
      messageCount: retryEntries.length,
    })

    const retryResponse = await params.sqs.send(new SendMessageBatchCommand({
      QueueUrl: queueUrl,
      Entries: retryEntries,
    }))

    const retryFailed = retryResponse.Failed ?? []
    if (retryFailed.length > 0) {
      localLogger.error({
        event: 'dispatcher.sqs.batch.retry_failed',
        batchIndex: context.batchIndex,
        batchCount: context.batchCount,
        failedCount: retryFailed.length,
        failedIds: retryFailed.map(item => item.Id),
      })
      throw new Error(`Failed to send ${retryFailed.length} SQS messages after retry`)
    }

    localLogger.info({
      event: 'dispatcher.sqs.batch.retry_sent',
      batchIndex: context.batchIndex,
      batchCount: context.batchCount,
      messageCount: retryEntries.length,
    })
  }

  //

  return async () => {
    const runId = runIdFactory()
    const startedAt = Date.now()
    const localLogger = baseLogger.child({ runId })

    localLogger.info({ event: 'dispatcher.start', indexerBatchSize, queueUrl })

    try {
      localLogger.info({ event: 'dispatcher.fetch.start' })
      const items = await params.fetcher.getCdpIds(false)

      const ids = items.map(item => item.non_fungible_id)

      localLogger.info({ event: 'dispatcher.fetch.complete', cdpCount: ids.length, durationMs: Date.now() - startedAt })

      const chunks: string[][] = []
      for (let i = 0; i < ids.length; i += indexerBatchSize) {
        chunks.push(ids.slice(i, i + indexerBatchSize))
      }

      localLogger.info({ event: 'dispatcher.batch.split', chunkCount: chunks.length, chunkSize: indexerBatchSize })

      const SQS_BATCH_LIMIT = 10
      for (let i = 0; i < chunks.length; i += SQS_BATCH_LIMIT) {
        const batchOfChunks = chunks.slice(i, i + SQS_BATCH_LIMIT)
        const chunkCount = chunks.length

        const entries = batchOfChunks.map((chunk, index) => ({
          Id: `${i + index}`,
          MessageBody: JSON.stringify({
            runId,
            chunkIndex: i + index + 1,
            chunkCount,
            cdpIds: chunk,
          }),
        }))

        const batchIndex = Math.floor(i / SQS_BATCH_LIMIT) + 1
        const batchCount = Math.ceil(chunks.length / SQS_BATCH_LIMIT)
        await sendBatch(entries, localLogger, { batchIndex, batchCount })
      }

      localLogger.info({ event: 'dispatcher.complete', cdpCount: ids.length, totalChunks: chunks.length, durationMs: Date.now() - startedAt })
      return { statusCode: 200, body: `Dispatched ${ids.length} CDPs` }
    }
    catch (error) {
      localLogger.error({ event: 'dispatcher.error', err: error })
      throw error
    }
  }
};

let cachedDefaultHandler: (() => Promise<{ statusCode: number, body: string }>) | undefined

function getDefaultHandler() {
  if (cachedDefaultHandler)
    return cachedDefaultHandler

  const sqs = new SQSClient({})

  const gatewayApi = GatewayApiClient.initialize({
    basePath: requireEnv('RADIX_GATEWAY_URL'),
    applicationName: 'Weft Indexer Dispatcher',
  })

  const fetcher = WeftLedgerSateFetcher.setInstance(gatewayApi)

  cachedDefaultHandler = createDispatcherHandler({
    sqs,
    fetcher,
    indexerQueueUrl: requireEnv('INDEXER_QUEUE_URL'),
    indexerBatchSize: Number.parseInt(requireEnv('INDEXER_BATCH_SIZE'), 10),
  })

  return cachedDefaultHandler
}

export const handler = async () => getDefaultHandler()()
