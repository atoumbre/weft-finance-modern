import type { ILogger } from '@local-packages/common-utils'
import type { WeftLedgerSateFetcher } from '@weft-finance/ledger-state'
import type Decimal from 'decimal.js'

export type CdpDetailFetcher = Pick<WeftLedgerSateFetcher, 'getMultipleCdp'>

export function checkRisk(cdp: { liquidationLtv: Decimal }): boolean {
  return cdp.liquidationLtv.gte(1)
}

export interface CdpFetchResult {
  data: any[]
  failedIds?: string[]
}

export async function fetchCdpDetails(params: {
  fetcher: CdpDetailFetcher
  cdpIds: string[]
  logger: ILogger
}): Promise<CdpFetchResult> {
  const { fetcher, cdpIds, logger } = params

  logger.info({
    event: 'cdp_indexer.fetch.start',
    cdpCount: cdpIds.length,
  })

  let totalFetched = 0

  const result = await fetcher.getMultipleCdp(cdpIds, {
    cdpPerBatch: 10,
    onProgress: (fetched: number) => {
      totalFetched += fetched
      logger.info({
        event: 'cdp_indexer.fetch.progress',
        fetchedCount: fetched,
        totalFetched,
        total: cdpIds.length,
      })
    },
  })

  return result
}
