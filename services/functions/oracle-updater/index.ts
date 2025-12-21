import { randomUUID } from "crypto";
import pino from "pino";

type LogLevel = "info" | "error";

type AssetConfig = {
    symbol: string;
    resourceAddress: string;
    fixedPriceXrd?: string;
    pythPriceIdEnv?: string;
    coingeckoId?: string;
};

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

const ASSETS: AssetConfig[] = [
    {
        symbol: "XRD",
        resourceAddress: "resource_rdx1tknxxxxxxxxxradxrdxxxxxxxxx009923554798xxxxxxxxxradxrd",
        fixedPriceXrd: "1"
    },
    {
        symbol: "xUSDT",
        resourceAddress: "resource_rdx1thrvr3xfs2tarm2dl9emvs26vjqxu6mqvfgvqjne940jv0lnrrg7rw",
        pythPriceIdEnv: "PYTH_PRICE_ID_XUSDT",
        coingeckoId: "tether"
    },
    {
        symbol: "xUSDC",
        resourceAddress: "resource_rdx1t4upr78guuapv5ept7d7ptekk9mqhy605zgms33mcszen8l9fac8vf",
        pythPriceIdEnv: "PYTH_PRICE_ID_XUSDC",
        coingeckoId: "usd-coin"
    },
    {
        symbol: "xETH",
        resourceAddress: "resource_rdx1th88qcj5syl9ghka2g9l7tw497vy5x6zaatyvgfkwcfe8n9jt2npww",
        pythPriceIdEnv: "PYTH_PRICE_ID_ETH",
        coingeckoId: "ethereum"
    },
    {
        symbol: "xwBTC",
        resourceAddress: "resource_rdx1t580qxc7upat7lww4l2c4jckacafjeudxj5wpjrrct0p3e82sq4y75",
        pythPriceIdEnv: "PYTH_PRICE_ID_XWBTC",
        coingeckoId: "bitcoin"
    },
    {
        symbol: "hUSDT",
        resourceAddress: "resource_rdx1th4v03gezwgzkuma6p38lnum8ww8t4ds9nvcrkr2p9ft6kxx3kxvhe",
        pythPriceIdEnv: "PYTH_PRICE_ID_HUSDT",
        coingeckoId: "tether"
    },
    {
        symbol: "hUSDC",
        resourceAddress: "resource_rdx1thxj9m87sn5cc9ehgp9qxp6vzeqxtce90xm5cp33373tclyp4et4gv",
        pythPriceIdEnv: "PYTH_PRICE_ID_HUSDC",
        coingeckoId: "usd-coin"
    },
    {
        symbol: "hETH",
        resourceAddress: "resource_rdx1th09yvv7tgsrv708ffsgqjjf2mhy84mscmj5jwu4g670fh3e5zgef0",
        pythPriceIdEnv: "PYTH_PRICE_ID_ETH",
        coingeckoId: "ethereum"
    },
    {
        symbol: "hWBTC",
        resourceAddress: "resource_rdx1t58kkcqdz0mavfz98m98qh9m4jexyl9tacsvlhns6yxs4r6hrm5re5",
        pythPriceIdEnv: "PYTH_PRICE_ID_HWBTC",
        coingeckoId: "bitcoin"
    },
    {
        symbol: "hSOL",
        resourceAddress: "resource_rdx1t5ljlq97xfcewcdjxsqld89443fchqg96xv8a8k8gdftdycy9haxpx",
        pythPriceIdEnv: "PYTH_PRICE_ID_HSOL",
        coingeckoId: "solana"
    }
];

type FetchOptions = {
    pythBaseUrl: string;
    coingeckoBaseUrl: string;
    timeoutMs: number;
    maxPriceAgeSec?: number;
};

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required env var: ${name}`);
    return value;
}

function optionalEnv(name: string): string | undefined {
    const value = process.env[name];
    return value && value.trim().length > 0 ? value : undefined;
}

function toErrorFields(error: unknown) {
    if (error instanceof Error) {
        return {
            errorName: error.name,
            errorMessage: error.message,
            errorStack: error.stack
        };
    }
    return { errorMessage: String(error) };
}

const logger = pino({
    level: process.env.LOG_LEVEL ?? "info",
    base: { service: "oracle-updater" }
});

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

async function fetchJson(url: string, timeoutMs: number) {
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
        const parsed = Array.isArray(payload?.parsed)
            ? payload.parsed
            : Array.isArray(payload)
                ? payload
                : Array.isArray(payload?.priceFeeds)
                    ? payload.priceFeeds
                    : [];

        for (const feed of parsed) {
            const feedId = typeof feed?.id === "string" ? normalizeHexId(feed.id) : undefined;
            const price = feed?.price;
            if (!feedId || !price || price.price === undefined || price.expo === undefined) {
                continue;
            }

            const publishTime = typeof price.publish_time === "number" ? price.publish_time : undefined;
            const priceValue = formatPythPrice(String(price.price), price.expo);
            map.set(feedId, { price: priceValue, publishTime });
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
        for (const id of uniqueIds) {
            const usd = payload?.[id]?.usd;
            if (usd === undefined || usd === null) continue;
            map.set(id, { price: typeof usd === "number" ? usd.toString() : String(usd) });
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

async function resolveUsdPrice(
    asset: AssetConfig,
    options: FetchOptions,
    runId: string,
    pythMap: Map<string, PythEntry>,
    pythBatchError?: unknown,
    coingeckoMap?: Map<string, CoinGeckoEntry>,
    coingeckoError?: unknown
): Promise<PriceQuote> {
    if (asset.pythPriceIdEnv) {
        const priceId = optionalEnv(asset.pythPriceIdEnv);
        if (!priceId) {
            logEvent("error", "oracle.price.pyth_missing_id", {
                runId,
                symbol: asset.symbol,
                resourceAddress: asset.resourceAddress,
                env: asset.pythPriceIdEnv
            });
        } else if (pythBatchError) {
            logEvent("error", "oracle.price.pyth_failed", {
                runId,
                symbol: asset.symbol,
                resourceAddress: asset.resourceAddress,
                ...toErrorFields(pythBatchError)
            });
        } else {
            const entry = getPythEntry(priceId, pythMap, options, runId, {
                symbol: asset.symbol,
                resourceAddress: asset.resourceAddress
            });
            if (entry) {
                logEvent("info", "oracle.price.pyth", {
                    runId,
                    symbol: asset.symbol,
                    resourceAddress: asset.resourceAddress,
                    price: entry.price,
                    publishTime: entry.publishTime
                });
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

    if (!asset.coingeckoId) {
        throw new Error(`Missing CoinGecko id for ${asset.symbol}`);
    }

    if (coingeckoError) {
        logEvent("error", "oracle.price.coingecko_failed", {
            runId,
            symbol: asset.symbol,
            resourceAddress: asset.resourceAddress,
            ...toErrorFields(coingeckoError)
        });
    }

    const entry = coingeckoMap?.get(asset.coingeckoId);
    if (!entry) {
        throw new Error(`CoinGecko price missing for ${asset.symbol}`);
    }

    logEvent("info", "oracle.price.coingecko", {
        runId,
        symbol: asset.symbol,
        resourceAddress: asset.resourceAddress,
        price: entry.price
    });

    return {
        symbol: asset.symbol,
        resourceAddress: asset.resourceAddress,
        usdPrice: entry.price,
        source: "coingecko"
    };
}

async function fetchXrdUsdPrice(
    options: FetchOptions,
    runId: string,
    pythMap: Map<string, PythEntry>,
    pythBatchError?: unknown,
    coingeckoMap?: Map<string, CoinGeckoEntry>,
    coingeckoError?: unknown
): Promise<{ price: string; source: "pyth" | "coingecko" }> {
    const asset: AssetConfig = {
        symbol: "XRD/USD",
        resourceAddress: "xrd-usd",
        pythPriceIdEnv: "PYTH_PRICE_ID_XRD_USD"
    };

    const priceId = optionalEnv("PYTH_PRICE_ID_XRD_USD");
    if (!priceId) {
        logEvent("error", "oracle.price.xrd.pyth_missing_id", { runId });
    } else if (pythBatchError) {
        logEvent("error", "oracle.price.xrd.pyth_failed", {
            runId,
            ...toErrorFields(pythBatchError)
        });
    } else {
        const entry = getPythEntry(priceId, pythMap, options, runId, {
            symbol: asset.symbol,
            resourceAddress: asset.resourceAddress
        });
        if (entry) {
            logEvent("info", "oracle.price.pyth", {
                runId,
                symbol: asset.symbol,
                resourceAddress: asset.resourceAddress,
                price: entry.price,
                publishTime: entry.publishTime
            });
            return { price: entry.price, source: "pyth" };
        }
    }

    if (coingeckoError) {
        logEvent("error", "oracle.price.xrd.coingecko_failed", {
            runId,
            ...toErrorFields(coingeckoError)
        });
    }

    const entry = coingeckoMap?.get("radix");
    if (!entry) {
        throw new Error("CoinGecko response missing radix.usd price");
    }

    logEvent("info", "oracle.price.coingecko", {
        runId,
        symbol: asset.symbol,
        price: entry.price
    });

    return { price: entry.price, source: "coingecko" };
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
    const timeoutMs = Number(optionalEnv("PRICE_FETCH_TIMEOUT_MS") ?? "8000");
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
        const xrdPythId = optionalEnv("PYTH_PRICE_ID_XRD_USD");
        if (xrdPythId) {
            pythIds.add(xrdPythId);
        }
        for (const asset of ASSETS) {
            if (!asset.pythPriceIdEnv) continue;
            const id = optionalEnv(asset.pythPriceIdEnv);
            if (id) {
                pythIds.add(id);
            } else {
                logEvent("error", "oracle.price.pyth_missing_id", {
                    runId,
                    symbol: asset.symbol,
                    resourceAddress: asset.resourceAddress,
                    env: asset.pythPriceIdEnv
                });
            }
        }

        const { map: pythMap, error: pythError } = await fetchPythBatch(Array.from(pythIds), options, runId);
        const fallbackCoinGeckoIds = new Set<string>();
        if (!xrdPythId || pythError || (xrdPythId && !isPythEntryUsable(xrdPythId, pythMap, options))) {
            fallbackCoinGeckoIds.add("radix");
        }

        for (const asset of ASSETS) {
            if (!asset.coingeckoId) {
                continue;
            }
            if (!asset.pythPriceIdEnv) {
                fallbackCoinGeckoIds.add(asset.coingeckoId);
                continue;
            }

            const priceId = optionalEnv(asset.pythPriceIdEnv);
            if (!priceId || pythError || !isPythEntryUsable(priceId, pythMap, options)) {
                fallbackCoinGeckoIds.add(asset.coingeckoId);
            }
        }

        const { map: coingeckoMap, error: coingeckoError } = await fetchCoinGeckoBatch(
            Array.from(fallbackCoinGeckoIds),
            options,
            runId
        );

        const xrdQuote = await fetchXrdUsdPrice(options, runId, pythMap, pythError, coingeckoMap, coingeckoError);
        const xrdUsdPrice = xrdQuote.price;
        logEvent("info", "oracle.price.xrd_usd", {
            runId,
            price: xrdUsdPrice,
            source: xrdQuote.source
        });

        for (const asset of ASSETS) {
            if (asset.fixedPriceXrd) {
                logEvent("info", "oracle.price.fixed", {
                    runId,
                    symbol: asset.symbol,
                    resourceAddress: asset.resourceAddress,
                    price: asset.fixedPriceXrd
                });
                prices.push({
                    symbol: asset.symbol,
                    resourceAddress: asset.resourceAddress,
                    price: asset.fixedPriceXrd,
                    source: "fixed"
                });
                continue;
            }

            const quote = await resolveUsdPrice(asset, options, runId, pythMap, pythError, coingeckoMap, coingeckoError);
            const normalized = normalizeUsdToXrd(quote.usdPrice, xrdUsdPrice, NORMALIZED_SCALE);
            logEvent("info", "oracle.price.normalized", {
                runId,
                symbol: asset.symbol,
                resourceAddress: asset.resourceAddress,
                usdPrice: quote.usdPrice,
                xrdUsdPrice,
                price: normalized,
                source: quote.source
            });
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
