import type { ILogger } from 'comon-utils'

export type { ILogger }

export type PriceCurrency = 'USD' | 'XRD'

export interface PriceFeedResult {
  price: string
  currency: PriceCurrency // Currency the price is denominated in
  publishTime?: number
  metadata?: Record<string, unknown>
}

export interface PriceFeedPlugin {
  name: string
  currency: PriceCurrency // Currency this plugin returns prices in

  /**
   * Batch fetch prices for multiple identifiers
   * @returns Map of identifier -> price result
   */
  fetchBatch: (
    identifiers: string[],
    options: PluginFetchOptions,
    localLogger: ILogger,
  ) => Promise<Map<string, PriceFeedResult>>

  /**
   * Optional: Validate if a cached result is still usable
   */
  isResultValid?: (result: PriceFeedResult, options: PluginFetchOptions) => boolean
}

export interface PluginFetchOptions {
  timeoutMs: number
  maxPriceAgeSec?: number
  [key: string]: unknown // Allow plugin-specific options
}

export class PluginRegistry {
  private plugins = new Map<string, PriceFeedPlugin>()

  register(plugin: PriceFeedPlugin): void {
    this.plugins.set(plugin.name, plugin)
  }

  get(name: string): PriceFeedPlugin | undefined {
    return this.plugins.get(name)
  }

  has(name: string): boolean {
    return this.plugins.has(name)
  }
}
