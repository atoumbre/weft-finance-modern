import type { ILogger, PluginFetchOptions, PriceCurrency, PriceFeedPlugin, PriceFeedResult } from '../plugin-interface'

import { fetchJson, isRecord } from '../utils'

export class PythPlugin implements PriceFeedPlugin {
  name = 'pyth'
  currency: PriceCurrency = 'USD'

  constructor(private baseUrl: string) { }

  async fetchBatch(
    identifiers: string[],
    options: PluginFetchOptions,
    localLogger: ILogger,
  ): Promise<Map<string, PriceFeedResult>> {
    const map = new Map<string, PriceFeedResult>()
    if (identifiers.length === 0)
      return map

    const url = new URL('/v2/updates/price/latest', this.baseUrl)
    identifiers.forEach(id => url.searchParams.append('ids[]', id))

    try {
      const payload = await fetchJson(url.toString(), options.timeoutMs)
      const parsed = Array.isArray(payload)
        ? payload
        : isRecord(payload) && Array.isArray(payload.parsed)
          ? payload.parsed
          : isRecord(payload) && Array.isArray(payload.priceFeeds)
            ? payload.priceFeeds
            : []

      for (const feed of parsed) {
        if (!isRecord(feed))
          continue
        const feedId = typeof feed.id === 'string' ? feed.id.replace(/^0x/, '') : undefined
        const price = isRecord(feed.price) ? feed.price : undefined
        const priceValue = price?.price
        const priceExpo = price?.expo

        if (
          !feedId
          || (typeof priceValue !== 'number' && typeof priceValue !== 'string')
          || typeof priceExpo !== 'number'
        ) {
          continue
        }

        const publishTime = typeof price?.publish_time === 'number' ? price.publish_time : undefined
        const formattedPrice = formatPythPrice(String(priceValue), priceExpo)

        map.set(feedId, {
          price: formattedPrice,
          currency: this.currency,
          publishTime,
          metadata: { expo: priceExpo },
        })
      }

      localLogger.info({ event: 'oracle.plugin.pyth.batch', requestedCount: identifiers.length, returnedCount: map.size })
    }
    catch (error) {
      localLogger.error({ event: 'oracle.plugin.pyth.batch_failed', err: error })
    }

    return map
  }

  isResultValid(result: PriceFeedResult, options: PluginFetchOptions): boolean {
    if (!options.maxPriceAgeSec || !result.publishTime)
      return true
    const ageSec = Math.floor(Date.now() / 1000) - result.publishTime
    return ageSec <= options.maxPriceAgeSec
  }
}

function formatPythPrice(price: string | number, expo: number): string {
  const decimals = expo < 0 ? Math.abs(expo) : -expo
  return formatScaledValue(price, decimals)
}

function formatScaledValue(value: string | number, decimals: number): string {
  const raw = typeof value === 'number' ? String(value) : value
  const isNegative = raw.startsWith('-')
  const digits = isNegative ? raw.slice(1) : raw
  const normalizedDecimals = Number(decimals)

  if (!Number.isFinite(normalizedDecimals)) {
    throw new TypeError(`Invalid decimals value: ${decimals}`)
  }

  if (!/^\d+$/.test(digits)) {
    throw new Error(`Invalid integer price value: ${raw}`)
  }

  if (normalizedDecimals <= 0) {
    return `${isNegative ? '-' : ''}${digits}${'0'.repeat(Math.abs(normalizedDecimals))}`
  }

  if (digits.length > normalizedDecimals) {
    const splitIndex = digits.length - normalizedDecimals
    return `${isNegative ? '-' : ''}${digits.slice(0, splitIndex)}.${digits.slice(splitIndex)}`
  }

  return `${isNegative ? '-' : ''}0.${'0'.repeat(normalizedDecimals - digits.length)}${digits}`
}
