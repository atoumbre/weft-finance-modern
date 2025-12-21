/* cSpell:disable */

/// <reference types="bun-types" />
import { expect, test, beforeEach, afterEach } from "bun:test";
import { handler } from "../src/index";

const originalEnv = { ...process.env };

function setEnv(name: string, value: string) {
    process.env[name] = value;
}

beforeEach(() => {
    process.env = { ...originalEnv };
    setEnv("ACCOUNT_ADDRESS", "account_rdx_test");
    setEnv("BADGE_RESOURCE_ADDRESS", "resource_rdx_badge_test");
    setEnv("ORACLE_COMPONENT_ADDRESS", "component_rdx_oracle_test");
    setEnv("BADGE_NFT_ID", "#1#");
    setEnv("PYTH_HERMES_URL", "https://hermes.pyth.network");

    setEnv("PYTH_PRICE_ID_XRD_USD", "0x816c6604beb161d3ad9c3b584f06c682e6299516165d756a68c7660b073b7072");
    setEnv("PYTH_PRICE_ID_XUSDT", "0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b");
    setEnv("PYTH_PRICE_ID_HUSDT", "0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b");
    setEnv("PYTH_PRICE_ID_XUSDC", "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a");
    setEnv("PYTH_PRICE_ID_HUSDC", "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a");
    setEnv("PYTH_PRICE_ID_ETH", "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace");
    setEnv("PYTH_PRICE_ID_XWBTC", "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43");
    setEnv("PYTH_PRICE_ID_HWBTC", "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43");
    setEnv("PYTH_PRICE_ID_HSOL", "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d");
});

afterEach(() => {
    process.env = { ...originalEnv };
});

test("logs generated manifest for review", async () => {
    const result = await handler();
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.manifest).toContain("update_prices");

    console.log("\n--- Oracle Update Manifest ---\n");
    console.log(body.manifest);
    console.log("\n------------------------------\n");
});

test("falls back to CoinGecko when XRD Pyth price fails", async () => {
    const originalFetch = globalThis.fetch;
    const xrdPriceId = "xrd-usd-id";
    const assetPrice = { price: "100000000", expo: -8 };

    setEnv("PYTH_PRICE_ID_XRD_USD", xrdPriceId);
    setEnv("COINGECKO_BASE_URL", "https://api.coingecko.com");

    setEnv("PYTH_PRICE_ID_XUSDT", "id-xusdt");
    setEnv("PYTH_PRICE_ID_HUSDT", "id-husdt");
    setEnv("PYTH_PRICE_ID_XUSDC", "id-xusdc");
    setEnv("PYTH_PRICE_ID_HUSDC", "id-husdc");
    setEnv("PYTH_PRICE_ID_ETH", "id-eth");
    setEnv("PYTH_PRICE_ID_XWBTC", "id-xwbtc");
    setEnv("PYTH_PRICE_ID_HWBTC", "id-hwbtc");
    setEnv("PYTH_PRICE_ID_HSOL", "id-hsol");

    const assetPrices = new Map<string, { price: string; expo: number }>([
        ["id-husdt", assetPrice],
        ["id-xusdc", assetPrice],
        ["id-husdc", assetPrice],
        ["id-eth", assetPrice],
        ["id-xwbtc", assetPrice],
        ["id-hwbtc", assetPrice],
        ["id-hsol", assetPrice]
    ]);

    globalThis.fetch = async (input) => {
        const url = typeof input === "string" ? input : input.url;
        if (url.includes("/v2/updates/price/latest")) {
            const parsed = new URL(url);
            const ids = parsed.searchParams.getAll("ids[]");
            const entries = ids
                .filter(id => id !== xrdPriceId && id !== "id-xusdt")
                .map(id => {
                    const priceData = assetPrices.get(id) ?? assetPrice;
                    return {
                        id,
                        price: {
                            price: priceData.price,
                            expo: priceData.expo,
                            publish_time: 1700000000
                        }
                    };
                });
            const body = JSON.stringify({ parsed: entries });
            return new Response(body, {
                status: 200,
                headers: { "content-type": "application/json" }
            });
        }
        if (url.includes("/api/v3/simple/price")) {
            const body = JSON.stringify({ radix: { usd: 0.1 }, tether: { usd: 1.0 } });
            return new Response(body, {
                status: 200,
                headers: { "content-type": "application/json" }
            });
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
    };

    try {
        const result = await handler();
        const body = JSON.parse(result.body);
        const xusdt = body.prices.find((entry: any) => entry.symbol === "xUSDT");

        expect(xusdt).toBeTruthy();
        expect(xusdt.price).toBe("10");
        expect(xusdt.xrdUsdPrice).toBe("0.1");
        expect(xusdt.source).toBe("coingecko");
    } finally {
        globalThis.fetch = originalFetch;
    }
});
