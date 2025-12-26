import type { ILogger, PluginFetchOptions, PriceCurrency, PriceFeedPlugin, PriceFeedResult } from '../plugin-interface'

import { fetchJson, isRecord } from '../utils'

export class CoinGeckoPlugin implements PriceFeedPlugin {
  name = 'coingecko'
  currency: PriceCurrency = 'USD'

  constructor(private baseUrl: string) { }

  async fetchBatch(
    identifiers: string[],
    options: PluginFetchOptions,
    localLogger: ILogger,
  ): Promise<Map<string, PriceFeedResult>> {
    const uniqueIds = Array.from(new Set(identifiers.filter(Boolean)))
    const map = new Map<string, PriceFeedResult>()

    if (uniqueIds.length === 0)
      return map

    const url = new URL('/api/v3/simple/price', this.baseUrl)
    url.searchParams.append('ids', uniqueIds.join(','))
    url.searchParams.append('vs_currencies', 'usd')

    try {
      const payload = await fetchJson(url.toString(), options.timeoutMs)
      const payloadRecord = isRecord(payload) ? payload : {}

      for (const id of uniqueIds) {
        const entry = payloadRecord[id]
        const usd = isRecord(entry) ? entry.usd : undefined
        if (usd === undefined || usd === null)
          continue
        if (typeof usd !== 'number' && typeof usd !== 'string')
          continue

        map.set(id, {
          price: typeof usd === 'number' ? usd.toString() : usd,
          currency: this.currency,
        })
      }

      localLogger.info({ event: 'oracle.plugin.coingecko.batch', requestedCount: uniqueIds.length, returnedCount: map.size })
    }
    catch (error) {
      localLogger.error({ event: 'oracle.plugin.coingecko.batch_failed', err: error })
    }

    return map
  }
}
