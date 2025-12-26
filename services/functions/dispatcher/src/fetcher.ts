import type { ILogger } from '@local-packages/common-utils'
import type { WeftLedgerSateFetcher } from '@weft-finance/ledger-state'

export type CdpIdFetcher = Pick<WeftLedgerSateFetcher, 'getCdpIds'>

export interface DispatchData {
  runId: string
  chunkIndex: number
  chunkCount: number
  cdpIds: string[]
}

export async function fetchAndBatchCdpIds(params: {
  fetcher: CdpIdFetcher
  indexerBatchSize: number
  runId: string
  logger: ILogger
}): Promise<DispatchData[]> {
  const { fetcher, indexerBatchSize, runId, logger } = params
  const startedAt = Date.now()

  logger.info({ event: 'cdp_fetcher.fetch.start' })
  const items = await fetcher.getCdpIds(false)
  const ids = items.map(item => item.non_fungible_id)

  logger.info({
    event: 'cdp_fetcher.fetch.complete',
    cdpCount: ids.length,
    durationMs: Date.now() - startedAt,
  })

  if (ids.length === 0) {
    return []
  }

  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += indexerBatchSize) {
    chunks.push(ids.slice(i, i + indexerBatchSize))
  }

  const chunkCount = chunks.length
  logger.info({
    event: 'cdp_fetcher.batch.split',
    chunkCount,
    chunkSize: indexerBatchSize,
  })

  return chunks.map((cdpIds, index) => ({
    runId,
    chunkIndex: index + 1,
    chunkCount,
    cdpIds,
  }))
}
