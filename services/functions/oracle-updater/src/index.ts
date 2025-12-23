import type { ILogger } from 'common-utils'
import type { PluginFetchOptions, PriceCurrency, PriceFeedResult } from './plugin-interface'
import type { AssetConfig } from './tokens'
import { randomUUID } from 'node:crypto'
import { createLogger } from 'common-utils'
import { PluginRegistry } from './plugin-interface'
import { AstrolescentPlugin } from './plugins/astrolescent'
import { CaviarNinePlugin } from './plugins/caviarnine'
import { CoinGeckoPlugin } from './plugins/coingecko'
import { PythPlugin } from './plugins/pyth'
import { ASSETS } from './tokens'
import { optionalEnv, requireEnv } from './utils'

const logger = createLogger({ service: 'oracle-updater' })

/* cSpell:disable */

interface PriceQuote {
  symbol: string
  resourceAddress: string
  price: string // Already in target currency (XRD or USD)
  currency: PriceCurrency
  source: string
  publishTime?: number
}

interface PriceResult {
  symbol: string
  resourceAddress: string
  price: string // Final price in XRD
  source: string
  publishTime?: number
  usdPrice?: string
  xrdUsdPrice?: string
}

async function resolveAssetPrice(
  asset: AssetConfig,
  registry: PluginRegistry,
  options: PluginFetchOptions,
  localLogger: ILogger,
  pluginCaches: Map<string, Map<string, PriceFeedResult>>,
): Promise<PriceQuote | null> {
  // Try each price feed in order
  for (const feed of asset.priceFeeds) {
    const plugin = registry.get(feed.plugin)
    if (!plugin) {
      localLogger.error({ event: 'oracle.plugin.not_found', symbol: asset.symbol, pluginName: feed.plugin })
      continue
    }

    // Get or create cache for this plugin
    let cache = pluginCaches.get(feed.plugin)
    if (!cache) {
      cache = new Map()
      pluginCaches.set(feed.plugin, cache)
    }

    // Check cache
    const cached = cache.get(feed.identifier ?? asset.resourceAddress)
    if (cached) {
      // Validate if plugin has validation logic
      const isValid = plugin.isResultValid
        ? plugin.isResultValid(cached, options)
        : true

      if (isValid) {
        localLogger.info({ event: 'oracle.price.resolved', symbol: asset.symbol, source: feed.plugin, currency: cached.currency, fromCache: true })

        return {
          symbol: asset.symbol,
          resourceAddress: asset.resourceAddress,
          price: cached.price,
          currency: cached.currency,
          source: feed.plugin,
          publishTime: cached.publishTime,
        }
      }
      else {
        localLogger.info({ event: 'oracle.price.stale', symbol: asset.symbol, source: feed.plugin })
      }
    }
  }

  // No valid price found
  localLogger.error({ event: 'oracle.price.failed', symbol: asset.symbol, resourceAddress: asset.resourceAddress, triedSources: asset.priceFeeds.map(f => f.plugin) })

  return null
}

function findXrdUsdPrice(
  pluginCaches: Map<string, Map<string, PriceFeedResult>>,
  localLogger: ILogger,
): { price: string, source: string } | null {
  // Find first USD price in the caches
  for (const [pluginName, cache] of pluginCaches.entries()) {
    for (const [identifier, result] of cache.entries()) {
      if (result.currency === 'USD') {
        localLogger.info({ event: 'oracle.price.xrd_usd.found_in_cache', source: pluginName, identifier, price: result.price })
        return { price: result.price, source: pluginName }
      }
    }
  }

  return null
}

const PLUGIN_PRIORITY = ['pyth', 'caviarnine', 'coingecko', 'astrolescent']
// const PLUGIN_PRIORITY = ['pyth', 'astrolescent']

async function prefetchAllPluginData(
  assets: AssetConfig[],
  registry: PluginRegistry,
  options: PluginFetchOptions,
  localLogger: ILogger,
): Promise<Map<string, Map<string, PriceFeedResult>>> {
  const pluginCaches = new Map<string, Map<string, PriceFeedResult>>()
  const resolvedAssetAddresses = new Set<string>()

  for (const pluginName of PLUGIN_PRIORITY) {
    const plugin = registry.get(pluginName)
    if (!plugin)
      continue

    // Find assets that need fetching from this plugin
    const identifierToAssets = new Map<string, Set<string>>() // identifier -> Set of resourceAddresses

    for (const asset of assets) {
      // If already resolved by a higher priority plugin, skip
      if (resolvedAssetAddresses.has(asset.resourceAddress))
        continue

      const feed = asset.priceFeeds.find(f => f.plugin === pluginName)
      if (feed) {
        const normalizedId = feed.identifier ?? asset.resourceAddress

        let assetSet = identifierToAssets.get(normalizedId)
        if (!assetSet) {
          assetSet = new Set()
          identifierToAssets.set(normalizedId, assetSet)
        }
        assetSet.add(asset.resourceAddress)
      }
    }

    if (identifierToAssets.size === 0)
      continue

    localLogger.info({ event: 'oracle.fetch.batch.start', plugin: pluginName, count: identifierToAssets.size })

    try {
      const results = await plugin.fetchBatch(
        Array.from(identifierToAssets.keys()),
        options,
        localLogger,
      )

      // Get or create cache for this plugin
      let cache = pluginCaches.get(pluginName)
      if (!cache) {
        cache = new Map()
        pluginCaches.set(pluginName, cache)
      }

      // Process results and mark assets as resolved if valid
      for (const [identifier, result] of results.entries()) {
        cache.set(identifier, result)

        const assetAddresses = identifierToAssets.get(identifier)
        if (assetAddresses) {
          const isValid = plugin.isResultValid
            ? plugin.isResultValid(result, options)
            : true

          if (isValid) {
            for (const address of assetAddresses) {
              resolvedAssetAddresses.add(address)
            }
          }
        }
      }

      localLogger.info({ event: 'oracle.fetch.batch.success', plugin: pluginName, fetchedCount: results.size, resolvedCount: Array.from(identifierToAssets.values()).reduce((acc, set) => acc + set.size, 0) })
    }
    catch (error) {
      localLogger.error({ event: 'oracle.fetch.batch.failed', plugin: pluginName, err: error })
    }
  }

  return pluginCaches
}

const NORMALIZED_SCALE = 18

function trimTrailingZeros(value: string): string {
  if (!value.includes('.'))
    return value
  const trimmed = value.replace(/0+$/, '').replace(/\.$/, '')
  return trimmed.length === 0 ? '0' : trimmed
}

function parseDecimalToBigInt(value: string, scale: number): bigint {
  const raw = value.trim()
  const negative = raw.startsWith('-')
  const [whole = '0', fraction = ''] = (negative ? raw.slice(1) : raw).split('.')
  const normalizedWhole = whole.length === 0 ? '0' : whole
  const normalizedFraction = fraction.replace(/\D/g, '')

  if (!/^\d+$/.test(normalizedWhole) || (normalizedFraction && !/^\d+$/.test(normalizedFraction))) {
    throw new Error(`Invalid decimal value: ${value}`)
  }

  const fractionPadded = (normalizedFraction + '0'.repeat(scale)).slice(0, scale)
  const combined = normalizedWhole + fractionPadded
  const bigintValue = BigInt(combined || '0')
  return negative ? -bigintValue : bigintValue
}

function formatBigIntToDecimal(value: bigint, scale: number): string {
  const negative = value < 0n
  const raw = (negative ? -value : value).toString()
  if (scale === 0)
    return `${negative ? '-' : ''}${raw}`

  const padded = raw.padStart(scale + 1, '0')
  const whole = padded.slice(0, -scale)
  const fraction = padded.slice(-scale)
  return `${negative ? '-' : ''}${whole}.${fraction}`
}

function normalizeUsdToXrd(usdPrice: string, xrdUsdPrice: string, scale: number): string {
  const numerator = parseDecimalToBigInt(usdPrice, scale)
  const denominator = parseDecimalToBigInt(xrdUsdPrice, scale)
  if (denominator === 0n) {
    throw new Error('XRD/USD price is zero')
  }

  const scaleFactor = 10n ** BigInt(scale)
  const normalized = (numerator * scaleFactor) / denominator
  return trimTrailingZeros(formatBigIntToDecimal(normalized, scale))
}

function buildManifest(params: {
  accountAddress: string
  badgeResourceAddress: string
  badgeId: string
  oracleComponentAddress: string
  prices: PriceResult[]
}) {
  const entries = params.prices.map(price => (
    `    Address("${price.resourceAddress}") => Decimal("${price.price}")`
  ))

  return [
    'CALL_METHOD',
    `    Address("${params.accountAddress}")`,
    '    "create_proof_of_non_fungibles"',
    `    Address("${params.badgeResourceAddress}")`,
    '    Array<NonFungibleLocalId>(',
    `        NonFungibleLocalId("${params.badgeId}")`,
    '    )',
    ';',
    '',
    'CALL_METHOD',
    `  Address("${params.oracleComponentAddress}")`,
    '  "update_prices"',
    '  Map<Address, Decimal>(',
    entries.join(',\n'),
    '  )',
    ';',
  ].join('\n')
}

export async function handler() {
  const runId = randomUUID()
  const startedAt = Date.now()

  const accountAddress = requireEnv('ACCOUNT_ADDRESS')
  const badgeResourceAddress = requireEnv('BADGE_RESOURCE_ADDRESS')
  const oracleComponentAddress = requireEnv('ORACLE_COMPONENT_ADDRESS')
  const badgeId = optionalEnv('BADGE_NFT_ID') ?? '#1#'

  const pythBaseUrl = optionalEnv('PYTH_HERMES_URL') ?? 'https://hermes.pyth.network'
  const coingeckoBaseUrl = optionalEnv('COINGECKO_BASE_URL') ?? 'https://api.coingecko.com'
  const caviarnineBaseUrl = optionalEnv('CAVIARNINE_BASE_URL') ?? 'https://api.caviarnine.com'
  const astrolescentBaseUrl = optionalEnv('ASTROLESCENT_BASE_URL') ?? 'https://api.astrolescent.com/partner/R96v1uADor/prices'
  const timeoutMs = Number(optionalEnv('PRICE_FETCH_TIMEOUT_MS') ?? '5000')
  const maxPriceAgeSec = optionalEnv('PYTH_MAX_AGE_SEC')

  const options: PluginFetchOptions = {
    timeoutMs,
    maxPriceAgeSec: maxPriceAgeSec ? Number(maxPriceAgeSec) : undefined,
  }

  // Initialize plugin registry
  const registry = new PluginRegistry()
  registry.register(new PythPlugin(pythBaseUrl))
  registry.register(new CoinGeckoPlugin(coingeckoBaseUrl))
  registry.register(new CaviarNinePlugin(caviarnineBaseUrl))
  registry.register(new AstrolescentPlugin(astrolescentBaseUrl))

  const localLogger = logger.child({ runId })

  localLogger.info({ event: 'oracle.start', assetCount: ASSETS.length, registeredPlugins: ['pyth', 'coingecko', 'caviarnine', 'astrolescent'] })

  try {
    // Prefetch all plugin data in parallel
    const pluginCaches = await prefetchAllPluginData(ASSETS, registry, options, localLogger)

    // Find XRD/USD price from first available USD price in cache
    const xrdUsdResult = findXrdUsdPrice(pluginCaches, localLogger)
    if (!xrdUsdResult) {
      throw new Error('No USD prices found in cache to use as XRD/USD reference')
    }

    const xrdUsdPrice = xrdUsdResult.price
    localLogger.info({ event: 'oracle.price.xrd_usd', price: xrdUsdPrice, source: xrdUsdResult.source })

    // Process all assets
    const prices: PriceResult[] = []

    for (const asset of ASSETS) {
      // Handle fixed price assets
      if (asset.fixedPriceXrd) {
        prices.push({
          symbol: asset.symbol,
          resourceAddress: asset.resourceAddress,
          price: asset.fixedPriceXrd,
          source: 'fixed',
        })
        continue
      }

      // Get price with fallback
      const quote = await resolveAssetPrice(asset, registry, options, localLogger, pluginCaches)
      if (!quote)
        continue

      // If price is already in XRD, use it directly
      if (quote.currency === 'XRD') {
        prices.push({
          symbol: asset.symbol,
          resourceAddress: asset.resourceAddress,
          price: quote.price,
          source: quote.source,
          publishTime: quote.publishTime,
        })
        continue
      }

      // If price is in USD, normalize to XRD
      const normalized = normalizeUsdToXrd(quote.price, xrdUsdPrice, NORMALIZED_SCALE)

      prices.push({
        symbol: asset.symbol,
        resourceAddress: asset.resourceAddress,
        price: normalized,
        source: quote.source,
        publishTime: quote.publishTime,
        usdPrice: quote.price,
        xrdUsdPrice,
      })
    }

    if (prices.length === 0) {
      throw new Error('No prices were successfully fetched')
    }

    const manifest = buildManifest({
      accountAddress,
      badgeResourceAddress,
      badgeId,
      oracleComponentAddress,
      prices,
    })

    const sourceBreakdown = prices.reduce((acc, p) => {
      acc[p.source] = (acc[p.source] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    localLogger.info({ event: 'oracle.manifest.ready', priceCount: prices.length, successfulAssets: prices.map(p => p.symbol), sourceBreakdown, durationMs: Date.now() - startedAt, manifestLength: manifest.length })

    return {
      statusCode: 200,
      body: JSON.stringify({
        runId,
        prices,
        manifest,
      }),
    }
  }
  catch (error) {
    localLogger.error({ event: 'oracle.failed', err: error })
    throw error
  }
}
