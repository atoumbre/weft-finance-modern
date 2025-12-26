import type { ILogger, PluginFetchOptions, PriceCurrency, PriceFeedPlugin, PriceFeedResult } from '../plugin-interface'
import { fetchJson, isRecord } from '../utils'

export class AstrolescentPlugin implements PriceFeedPlugin {
  name = 'astrolescent'
  currency: PriceCurrency = 'XRD'

  constructor(private baseUrl: string, private apiKey?: string) { }

  async fetchBatch(
    identifiers: string[],
    options: PluginFetchOptions,
    localLogger: ILogger,
  ): Promise<Map<string, PriceFeedResult>> {
    const map = new Map<string, PriceFeedResult>()
    if (identifiers.length === 0)
      return map

    // Astrolescent returns all prices in one big JSON, so we only need one fetch
    const url = new URL(this.baseUrl)
    // The API key is already in the URL provided by the user,
    // but we'll handle it generically if baseUrl is just the base.
    // User provided: https://api.astrolescent.com/partner/R96v1uADor/prices

    try {
      const payload = await fetchJson(url.toString(), options.timeoutMs)

      if (!isRecord(payload)) {
        localLogger.error({ event: 'oracle.plugin.astrolescent.invalid_response', reason: 'payload is not a record' })
        return map
      }

      for (const identifier of identifiers) {
        const entry = payload[identifier]
        if (!isRecord(entry))
          continue

        // Use tokenPriceXRD as the primary price source
        const priceXrd = entry.tokenPriceXRD
        const updatedAt = typeof entry.updatedAt === 'string' ? entry.updatedAt : undefined
        const publishTime = updatedAt ? Math.floor(new Date(updatedAt).getTime() / 1000) : undefined

        if (typeof priceXrd === 'number' || typeof priceXrd === 'string') {
          map.set(identifier, {
            price: priceXrd.toString(),
            currency: 'XRD',
            publishTime,
            metadata: {
              symbol: entry.symbol,
              name: entry.name,
            },
          })
        }
      }

      localLogger.info({
        event: 'oracle.plugin.astrolescent.batch',
        requestedCount: identifiers.length,
        returnedCount: map.size,
      })
    }
    catch (error) {
      localLogger.error({ event: 'oracle.plugin.astrolescent.fetch_failed', err: error })
    }

    return map
  }
}
