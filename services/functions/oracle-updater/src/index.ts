import { randomUUID } from "crypto";
import pino from "pino";

/* cSpell:disable */

export type AssetConfig = {
    symbol: string;
    resourceAddress: string;
    fixedPriceXrd?: string;
    pythId?: string;
    coingeckoId?: string;
};

export const ASSETS: AssetConfig[] = [
    {
        symbol: "XRD",
        resourceAddress: "resource_rdx1tknxxxxxxxxxradxrdxxxxxxxxx009923554798xxxxxxxxxradxrd",
        fixedPriceXrd: "1",
        pythId: "0x816c6604beb161d3ad9c3b584f06c682e6299516165d756a68c7660b073b7072",
        coingeckoId: "radix"
    },
    {
        symbol: "xUSDT",
        resourceAddress: "resource_rdx1thrvr3xfs2tarm2dl9emvs26vjqxu6mqvfgvqjne940jv0lnrrg7rw",
        pythId: "0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b",
        coingeckoId: "tether"
    },
    {
        symbol: "xUSDC",
        resourceAddress: "resource_rdx1t4upr78guuapv5ept7d7ptekk9mqhy605zgms33mcszen8l9fac8vf",
        pythId: "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
        coingeckoId: "usd-coin"
    },
    {
        symbol: "xETH",
        resourceAddress: "resource_rdx1th88qcj5syl9ghka2g9l7tw497vy5x6zaatyvgfkwcfe8n9jt2npww",
        pythId: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
        coingeckoId: "ethereum"
    },
    {
        symbol: "xwBTC",
        resourceAddress: "resource_rdx1t580qxc7upat7lww4l2c4jckacafjeudxj5wpjrrct0p3e82sq4y75",
        pythId: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
        coingeckoId: "bitcoin"
    },
    {
        symbol: "hUSDT",
        resourceAddress: "resource_rdx1th4v03gezwgzkuma6p38lnum8ww8t4ds9nvcrkr2p9ft6kxx3kxvhe",
        pythId: "0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b",
        coingeckoId: "tether"
    },
    {
        symbol: "hUSDC",
        resourceAddress: "resource_rdx1thxj9m87sn5cc9ehgp9qxp6vzeqxtce90xm5cp33373tclyp4et4gv",
        pythId: "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
        coingeckoId: "usd-coin"
    },
    {
        symbol: "hETH",
        resourceAddress: "resource_rdx1th09yvv7tgsrv708ffsgqjjf2mhy84mscmj5jwu4g670fh3e5zgef0",
        pythId: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
        coingeckoId: "ethereum"
    },
    {
        symbol: "hWBTC",
        resourceAddress: "resource_rdx1t58kkcqdz0mavfz98m98qh9m4jexyl9tacsvlhns6yxs4r6hrm5re5",
        pythId: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
        coingeckoId: "bitcoin"
    },
    {
        symbol: "hSOL",
        resourceAddress: "resource_rdx1t5ljlq97xfcewcdjxsqld89443fchqg96xv8a8k8gdftdycy9haxpx",
        pythId: "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
        coingeckoId: "solana"
    }
];

type LogLevel = "info" | "error";

type PriceSource = "fixed" | "pyth" | "coingecko";

type PriceQuote = {
    symbol: string;
    resourceAddress: string;
    usdPrice: string;
    source: PriceSource;
    publishTime?: number;
};

type PriceResult = {
    symbol: string;
    resourceAddress: string;
    price: string;
    source: PriceSource;
    publishTime?: number;
    usdPrice?: string;
    xrdUsdPrice?: string;
};

const NORMALIZED_SCALE = 18;

type FetchOptions = {
    pythBaseUrl: string;
    coingeckoBaseUrl: string;
    timeoutMs: number;
    maxPriceAgeSec?: number;
};

function logEvent(level: LogLevel, event: string, fields: Record<string, unknown>) {
    const payload = {
        event,
        timestamp: new Date().toISOString(),
        ...fields
    };

    if (level === "error") {
        logger.error(payload, event);
        return;
    }
    logger.info(payload, event);
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} fetching ${url}`);
        }
        return await response.json();
    } finally {
        clearTimeout(timeout);
    }
}

function formatScaledValue(value: string | number, decimals: number): string {
    const raw = typeof value === "number" ? String(value) : value;
    const isNegative = raw.startsWith("-");
    const digits = isNegative ? raw.slice(1) : raw;
    const normalizedDecimals = Number(decimals);

    if (!Number.isFinite(normalizedDecimals)) {
        throw new Error(`Invalid decimals value: ${decimals}`);
    }

    if (!/^\d+$/.test(digits)) {
        throw new Error(`Invalid integer price value: ${raw}`);
    }

    if (normalizedDecimals <= 0) {
        return `${isNegative ? "-" : ""}${digits}${"0".repeat(Math.abs(normalizedDecimals))}`;
    }

    if (digits.length > normalizedDecimals) {
        const splitIndex = digits.length - normalizedDecimals;
        return `${isNegative ? "-" : ""}${digits.slice(0, splitIndex)}.${digits.slice(splitIndex)}`;
    }

    return `${isNegative ? "-" : ""}0.${"0".repeat(normalizedDecimals - digits.length)}${digits}`;
}

function formatPythPrice(price: string | number, expo: number): string {
    const decimals = expo < 0 ? Math.abs(expo) : -expo;
    return formatScaledValue(price, decimals);
}

function trimTrailingZeros(value: string): string {
    if (!value.includes(".")) return value;
    const trimmed = value.replace(/0+$/, "").replace(/\.$/, "");
    return trimmed.length === 0 ? "0" : trimmed;
}

function parseDecimalToBigInt(value: string, scale: number): bigint {
    const raw = value.trim();
    const negative = raw.startsWith("-");
    const [whole = "0", fraction = ""] = (negative ? raw.slice(1) : raw).split(".");
    const normalizedWhole = whole.length === 0 ? "0" : whole;
    const normalizedFraction = fraction.replace(/[^0-9]/g, "");

    if (!/^\d+$/.test(normalizedWhole) || (normalizedFraction && !/^\d+$/.test(normalizedFraction))) {
        throw new Error(`Invalid decimal value: ${value}`);
    }

    const fractionPadded = (normalizedFraction + "0".repeat(scale)).slice(0, scale);
    const combined = normalizedWhole + fractionPadded;
    const bigintValue = BigInt(combined || "0");
    return negative ? -bigintValue : bigintValue;
}

function formatBigIntToDecimal(value: bigint, scale: number): string {
    const negative = value < 0n;
    const raw = (negative ? -value : value).toString();
    if (scale === 0) return `${negative ? "-" : ""}${raw}`;

    const padded = raw.padStart(scale + 1, "0");
    const whole = padded.slice(0, -scale);
    const fraction = padded.slice(-scale);
    return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function normalizeUsdToXrd(usdPrice: string, xrdUsdPrice: string, scale: number): string {
    const numerator = parseDecimalToBigInt(usdPrice, scale);
    const denominator = parseDecimalToBigInt(xrdUsdPrice, scale);
    if (denominator === 0n) {
        throw new Error("XRD/USD price is zero");
    }

    const scaleFactor = 10n ** BigInt(scale);
    const normalized = (numerator * scaleFactor) / denominator;
    return trimTrailingZeros(formatBigIntToDecimal(normalized, scale));
}

function normalizeHexId(value: string) {
    const trimmed = value.trim();
    return trimmed.startsWith("0x") ? trimmed.slice(2).toLowerCase() : trimmed.toLowerCase();
}

type PythEntry = {
    price: string;
    publishTime?: number;
};

async function fetchPythBatch(ids: string[], options: FetchOptions, runId: string) {
    const map = new Map<string, PythEntry>();
    if (ids.length === 0) {
        return { map };
    }

    const url = new URL("/v2/updates/price/latest", options.pythBaseUrl);
    ids.forEach(id => url.searchParams.append("ids[]", id));

    try {
        const payload = await fetchJson(url.toString(), options.timeoutMs);
        const parsed = Array.isArray(payload)
            ? payload
            : isRecord(payload) && Array.isArray(payload.parsed)
                ? payload.parsed
                : isRecord(payload) && Array.isArray(payload.priceFeeds)
                    ? payload.priceFeeds
                    : [];

        for (const feed of parsed) {
            if (!isRecord(feed)) continue;
            const feedId = typeof feed.id === "string" ? normalizeHexId(feed.id) : undefined;
            const price = isRecord(feed.price) ? feed.price : undefined;
            const priceValue = price?.price;
            const priceExpo = price?.expo;
            if (
                !feedId ||
                (typeof priceValue !== "number" && typeof priceValue !== "string") ||
                typeof priceExpo !== "number"
            ) {
                continue;
            }

            const publishTime = typeof price?.publish_time === "number" ? price.publish_time : undefined;
            const formattedPrice = formatPythPrice(String(priceValue), priceExpo);
            map.set(feedId, { price: formattedPrice, publishTime });
        }

        logEvent("info", "oracle.price.pyth.batch", {
            runId,
            requestedCount: ids.length,
            returnedCount: map.size
        });
        return { map };
    } catch (error) {
        logEvent("error", "oracle.price.pyth.batch_failed", {
            runId,
            ...toErrorFields(error)
        });
        return { map, error };
    }
}

function getPythEntry(
    priceId: string,
    map: Map<string, PythEntry>,
    options: FetchOptions,
    runId: string,
    context: { symbol: string; resourceAddress: string }
): PythEntry | null {
    const normalizedId = normalizeHexId(priceId);
    const entry = map.get(normalizedId);
    if (!entry) {
        logEvent("error", "oracle.price.pyth_missing", {
            runId,
            symbol: context.symbol,
            resourceAddress: context.resourceAddress,
            priceId
        });
        return null;
    }

    if (options.maxPriceAgeSec && entry.publishTime) {
        const ageSec = Math.floor(Date.now() / 1000) - entry.publishTime;
        if (ageSec > options.maxPriceAgeSec) {
            logEvent("error", "oracle.price.pyth_stale", {
                runId,
                symbol: context.symbol,
                resourceAddress: context.resourceAddress,
                priceId,
                ageSec
            });
            return null;
        }
    }

    return entry;
}

function isPythEntryUsable(priceId: string, map: Map<string, PythEntry>, options: FetchOptions): boolean {
    const entry = map.get(normalizeHexId(priceId));
    if (!entry) return false;
    if (options.maxPriceAgeSec && entry.publishTime) {
        const ageSec = Math.floor(Date.now() / 1000) - entry.publishTime;
        if (ageSec > options.maxPriceAgeSec) {
            return false;
        }
    }
    return true;
}

type CoinGeckoEntry = {
    price: string;
};

async function fetchCoinGeckoBatch(ids: string[], options: FetchOptions, runId: string) {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    const map = new Map<string, CoinGeckoEntry>();

    if (uniqueIds.length === 0) {
        return { map };
    }

    const url = new URL("/api/v3/simple/price", options.coingeckoBaseUrl);
    url.searchParams.append("ids", uniqueIds.join(","));
    url.searchParams.append("vs_currencies", "usd");

    try {
        const payload = await fetchJson(url.toString(), options.timeoutMs);
        const payloadRecord = isRecord(payload) ? payload : {};
        for (const id of uniqueIds) {
            const entry = payloadRecord[id];
            const usd = isRecord(entry) ? entry.usd : undefined;
            if (usd === undefined || usd === null) continue;
            if (typeof usd !== "number" && typeof usd !== "string") continue;
            map.set(id, { price: typeof usd === "number" ? usd.toString() : usd });
        }

        logEvent("info", "oracle.price.coingecko.batch", {
            runId,
            requestedCount: uniqueIds.length,
            returnedCount: map.size
        });
        return { map };
    } catch (error) {
        logEvent("error", "oracle.price.coingecko.batch_failed", {
            runId,
            ...toErrorFields(error)
        });
        return { map, error };
    }
}

function resolveUsdPrice(
    asset: AssetConfig,
    pythMap: Map<string, PythEntry>,
    coingeckoMap: Map<string, CoinGeckoEntry>,
    options: FetchOptions
): PriceQuote | null {
    // Try Pyth first
    if (asset.pythId) {
        const normalizedId = normalizeHexId(asset.pythId);
        const entry = pythMap.get(normalizedId);

        if (entry) {
            // Check staleness if maxPriceAgeSec is set
            if (options.maxPriceAgeSec && entry.publishTime) {
                const ageSec = Math.floor(Date.now() / 1000) - entry.publishTime;
                if (ageSec <= options.maxPriceAgeSec) {
                    return {
                        symbol: asset.symbol,
                        resourceAddress: asset.resourceAddress,
                        usdPrice: entry.price,
                        source: "pyth",
                        publishTime: entry.publishTime
                    };
                }
            } else if (!options.maxPriceAgeSec) {
                return {
                    symbol: asset.symbol,
                    resourceAddress: asset.resourceAddress,
                    usdPrice: entry.price,
                    source: "pyth",
                    publishTime: entry.publishTime
                };
            }
        }
    }

    // Fallback to CoinGecko
    if (asset.coingeckoId) {
        const entry = coingeckoMap.get(asset.coingeckoId);
        if (entry) {
            return {
                symbol: asset.symbol,
                resourceAddress: asset.resourceAddress,
                usdPrice: entry.price,
                source: "coingecko"
            };
        }
    }

    return null;
}

function getXrdUsdPrice(
    pythMap: Map<string, PythEntry>,
    coingeckoMap: Map<string, CoinGeckoEntry>,
    options: FetchOptions
): { price: string; source: "pyth" | "coingecko" } {
    const xrdAsset = ASSETS.find(a => a.symbol === "XRD");
    if (!xrdAsset) {
        throw new Error("XRD asset not found in ASSETS");
    }

    // Try Pyth first
    if (xrdAsset.pythId) {
        const normalizedId = normalizeHexId(xrdAsset.pythId);
        const entry = pythMap.get(normalizedId);

        if (entry) {
            const isValid = !options.maxPriceAgeSec ||
                !entry.publishTime ||
                (Math.floor(Date.now() / 1000) - entry.publishTime) <= options.maxPriceAgeSec;

            if (isValid) {
                return { price: entry.price, source: "pyth" };
            }
        }
    }

    // Fallback to CoinGecko
    if (xrdAsset.coingeckoId) {
        const entry = coingeckoMap.get(xrdAsset.coingeckoId);
        if (entry) {
            return { price: entry.price, source: "coingecko" };
        }
    }

    throw new Error("Failed to fetch XRD/USD price from both Pyth and CoinGecko");
}

function buildManifest(params: {
    accountAddress: string;
    badgeResourceAddress: string;
    badgeId: string;
    oracleComponentAddress: string;
    prices: PriceResult[];
}) {
    const entries = params.prices.map(price => (
        `    Address("${price.resourceAddress}") => Decimal("${price.price}")`
    ));

    return [
        "CALL_METHOD",
        `    Address("${params.accountAddress}")`,
        '    "create_proof_of_non_fungibles"',
        `    Address("${params.badgeResourceAddress}")`,
        "    Array<NonFungibleLocalId>(",
        `        NonFungibleLocalId("${params.badgeId}")`,
        "    )",
        ";",
        "",
        "CALL_METHOD",
        `  Address("${params.oracleComponentAddress}")`,
        '  "update_prices"',
        "  Map<Address, Decimal>(",
        entries.join(",\n"),
        "  )",
        ";"
    ].join("\n");
}

export const handler = async () => {
    const runId = randomUUID();
    const startedAt = Date.now();

    const accountAddress = requireEnv("ACCOUNT_ADDRESS");
    const badgeResourceAddress = requireEnv("BADGE_RESOURCE_ADDRESS");
    const oracleComponentAddress = requireEnv("ORACLE_COMPONENT_ADDRESS");
    const badgeId = optionalEnv("BADGE_NFT_ID") ?? "#1#";

    const pythBaseUrl = optionalEnv("PYTH_HERMES_URL") ?? "https://hermes.pyth.network";
    const coingeckoBaseUrl = optionalEnv("COINGECKO_BASE_URL") ?? "https://api.coingecko.com";
    const timeoutMs = Number(optionalEnv("PRICE_FETCH_TIMEOUT_MS") ?? "5000");
    const maxPriceAgeSec = optionalEnv("PYTH_MAX_AGE_SEC");

    const options: FetchOptions = {
        pythBaseUrl,
        coingeckoBaseUrl,
        timeoutMs,
        maxPriceAgeSec: maxPriceAgeSec ? Number(maxPriceAgeSec) : undefined
    };

    logEvent("info", "oracle.start", {
        runId,
        assetCount: ASSETS.length,
        pythBaseUrl,
        coingeckoBaseUrl
    });

    try {
        const prices: PriceResult[] = [];
        const pythIds = new Set<string>();
        const fallbackCoinGeckoIds = new Set<string>();

        // Collect all Pyth IDs and CoinGecko IDs upfront
        const allCoinGeckoIds = new Set<string>();

        for (const asset of ASSETS) {
            if (asset.pythId) {
                pythIds.add(asset.pythId);
            }
            // Always collect CoinGecko IDs for potential fallback
            if (asset.coingeckoId) {
                allCoinGeckoIds.add(asset.coingeckoId);
            }
        }

        // Fetch both Pyth and CoinGecko in parallel
        const [pythResult, coingeckoResult] = await Promise.all([
            fetchPythBatch(Array.from(pythIds), options, runId),
            fetchCoinGeckoBatch(Array.from(allCoinGeckoIds), options, runId)
        ]);

        const pythMap = pythResult.map;
        const coingeckoMap = coingeckoResult.map;

        // Get XRD/USD price
        const xrdQuote = getXrdUsdPrice(pythMap, coingeckoMap, options);
        const xrdUsdPrice = xrdQuote.price;

        logEvent("info", "oracle.price.xrd_usd", {
            runId,
            price: xrdUsdPrice,
            source: xrdQuote.source
        });

        // Process each asset
        for (const asset of ASSETS) {
            // Handle fixed price assets
            if (asset.fixedPriceXrd) {
                prices.push({
                    symbol: asset.symbol,
                    resourceAddress: asset.resourceAddress,
                    price: asset.fixedPriceXrd,
                    source: "fixed"
                });
                continue;
            }

            // Get USD price (with fallback logic)
            const quote = resolveUsdPrice(asset, pythMap, coingeckoMap, options);

            if (!quote) {
                logEvent("error", "oracle.price.failed", {
                    runId,
                    symbol: asset.symbol,
                    resourceAddress: asset.resourceAddress
                });
                continue;
            }

            // Normalize to XRD
            const normalized = normalizeUsdToXrd(quote.usdPrice, xrdUsdPrice, NORMALIZED_SCALE);

            prices.push({
                symbol: asset.symbol,
                resourceAddress: asset.resourceAddress,
                price: normalized,
                source: quote.source,
                publishTime: quote.publishTime,
                usdPrice: quote.usdPrice,
                xrdUsdPrice
            });
        }

        if (prices.length === 0) {
            throw new Error("No prices were successfully fetched");
        }

        const manifest = buildManifest({
            accountAddress,
            badgeResourceAddress,
            badgeId,
            oracleComponentAddress,
            prices
        });

        logEvent("info", "oracle.manifest.ready", {
            runId,
            priceCount: prices.length,
            successfulAssets: prices.map(p => p.symbol),
            pythCount: prices.filter(p => p.source === "pyth").length,
            coingeckoCount: prices.filter(p => p.source === "coingecko").length,
            fixedCount: prices.filter(p => p.source === "fixed").length,
            durationMs: Date.now() - startedAt,
            manifestLength: manifest.length
        });

        return {
            statusCode: 200,
            body: JSON.stringify({
                runId,
                prices,
                manifest
            })
        };
    } catch (error) {
        logEvent("error", "oracle.failed", {
            runId,
            ...toErrorFields(error)
        });
        throw error;
    }
};

export function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required env var: ${name}`);
    return value;
}

export function optionalEnv(name: string): string | undefined {
    const value = process.env[name];
    return value && value.trim().length > 0 ? value : undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

export function toErrorFields(error: unknown) {
    if (error instanceof Error) {
        return {
            errorName: error.name,
            errorMessage: error.message,
            errorStack: error.stack
        };
    }
    return { errorMessage: String(error) };
}

export const logger = pino({
    level: process.env.LOG_LEVEL ?? "info",
    base: { service: "oracle-updater" }
});