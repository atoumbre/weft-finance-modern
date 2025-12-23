import type { ILogger, PluginFetchOptions, PriceCurrency, PriceFeedPlugin, PriceFeedResult } from '../plugin-interface'
import { createLogger } from 'comon-utils'
import { fetchJson, isRecord } from '../utils'

const globalLogger = createLogger({ service: 'oracle-updater' })

export class CaviarNinePlugin implements PriceFeedPlugin {
  name = 'caviarnine'
  currency: PriceCurrency = 'XRD'

  private readonly XRD_RESOURCE_ADDRESS = 'resource_rdx1tknxxxxxxxxxradxrdxxxxxxxxx009923554798xxxxxxxxxradxrd'
  private readonly SOLVE_AMOUNT = 100

  constructor(private baseUrl: string) { }

  async fetchBatch(
    identifiers: string[],
    options: PluginFetchOptions,
    localLogger: ILogger,
  ): Promise<Map<string, PriceFeedResult>> {
    const map = new Map<string, PriceFeedResult>()
    if (identifiers.length === 0)
      return map

    // Process each identifier (resource address) individually
    const fetchPromises = identifiers.map(async (identifier) => {
      try {
        const price = await this.fetchPrice(identifier, options.timeoutMs, localLogger)
        if (price) {
          map.set(identifier, price)
        }
      }
      catch (error) {
        localLogger.error({ event: 'oracle.plugin.caviarnine.fetch_failed', identifier, err: error })
      }
    })

    await Promise.all(fetchPromises)

    localLogger.info({ event: 'oracle.plugin.caviarnine.batch', requestedCount: identifiers.length, returnedCount: map.size })

    return map
  }

  private async fetchPrice(
    buyResourceAddress: string,
    timeoutMs: number,
    localLogger: ILogger,
  ): Promise<PriceFeedResult | null> {
    const url = new URL('/v1.0/aggregator/solve', this.baseUrl)
    url.searchParams.append('sell_resource_amount', this.SOLVE_AMOUNT.toString())
    url.searchParams.append('sell_resource_address', this.XRD_RESOURCE_ADDRESS)
    url.searchParams.append('buy_resource_address', buyResourceAddress)

    globalLogger.debug(url.toString())

    try {
      const payload = await fetchJson(url.toString(), timeoutMs)

      if (!isRecord(payload)) {
        localLogger.error({ event: 'oracle.plugin.caviarnine.invalid_response', buyResourceAddress, reason: 'payload is not a record' })
        return null
      }

      // Extract result from response
      const result = isRecord(payload.result) ? payload.result : null
      if (!result) {
        localLogger.error({ event: 'oracle.plugin.caviarnine.no_result', buyResourceAddress })
        return null
      }

      // Check if the solution succeeded
      const status = result.status
      if (status !== 'Succeeded') {
        localLogger.error({ event: 'oracle.plugin.caviarnine.solution_failed', buyResourceAddress, status, errorMessage: result.error_message })
        return null
      }

      // Extract balance changes
      const price = (result.details as any).mid_price_buy_to_sell

      // Extract timestamp from header
      const header = isRecord(result.header) ? result.header : null
      const publishTime = typeof header?.unix_timestamp_ms === 'number'
        ? Math.floor(header.unix_timestamp_ms / 1000)
        : undefined

      localLogger.info({ event: 'oracle.plugin.caviarnine.price_fetched', buyResourceAddress, price, publishTime })

      return {
        price,
        currency: this.currency,
        publishTime,
        metadata: {},
      }
    }
    catch (error) {
      localLogger.error({ event: 'oracle.plugin.caviarnine.fetch_error', buyResourceAddress, err: error })
      return null
    }
  }
}
