/// <reference types="bun-types" />

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import {
    handler,
    ASSETS,
    requireEnv,
    optionalEnv,
    isRecord,
    toErrorFields
} from "../src/index";

// Mock environment variables
const mockEnv = {
    ACCOUNT_ADDRESS: "account_rdx1234567890abcdef",
    BADGE_RESOURCE_ADDRESS: "resource_rdx1badge123",
    ORACLE_COMPONENT_ADDRESS: "component_rdx1oracle123",
    BADGE_NFT_ID: "#1#",
    PYTH_HERMES_URL: "https://hermes.pyth.network",
    COINGECKO_BASE_URL: "https://api.coingecko.com",
    PRICE_FETCH_TIMEOUT_MS: "8000",
    PYTH_MAX_AGE_SEC: "60"
};

// Mock Pyth API response
const mockPythResponse = {
    parsed: [
        {
            id: "0x816c6604beb161d3ad9c3b584f06c682e6299516165d756a68c7660b073b7072",
            price: {
                price: "45000000",
                expo: -8,
                publish_time: Math.floor(Date.now() / 1000) - 10
            }
        },
        {
            id: "0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b",
            price: {
                price: "100000000",
                expo: -8,
                publish_time: Math.floor(Date.now() / 1000) - 5
            }
        },
        {
            id: "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
            price: {
                price: "99950000",
                expo: -8,
                publish_time: Math.floor(Date.now() / 1000) - 8
            }
        },
        {
            id: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
            price: {
                price: "350000000000",
                expo: -8,
                publish_time: Math.floor(Date.now() / 1000) - 12
            }
        },
        {
            id: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
            price: {
                price: "9500000000000",
                expo: -8,
                publish_time: Math.floor(Date.now() / 1000) - 15
            }
        },
        {
            id: "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
            price: {
                price: "22000000000",
                expo: -8,
                publish_time: Math.floor(Date.now() / 1000) - 7
            }
        }
    ]
};

// Mock CoinGecko API response
const mockCoinGeckoResponse = {
    radix: { usd: 0.45 },
    tether: { usd: 1.0 },
    "usd-coin": { usd: 0.9995 },
    ethereum: { usd: 3500 },
    bitcoin: { usd: 95000 },
    solana: { usd: 220 }
};

describe("Oracle Price Updater", () => {
    let originalEnv: Record<string, string | undefined>;
    let originalFetch: typeof global.fetch;

    beforeEach(() => {
        // Save original env
        originalEnv = { ...process.env };

        // Set mock env
        Object.assign(process.env, mockEnv);

        // Save original fetch
        originalFetch = global.fetch;
    });

    afterEach(() => {
        // Restore original env
        process.env = originalEnv;

        // Restore original fetch
        global.fetch = originalFetch;
    });

    describe("Utility Functions", () => {
        it("requireEnv should return env value when set", () => {
            process.env.TEST_VAR = "test_value";
            expect(requireEnv("TEST_VAR")).toBe("test_value");
        });

        it("requireEnv should throw when env value missing", () => {
            delete process.env.TEST_VAR;
            expect(() => requireEnv("TEST_VAR")).toThrow("Missing required env var: TEST_VAR");
        });

        it("optionalEnv should return env value when set", () => {
            process.env.OPTIONAL_VAR = "optional_value";
            expect(optionalEnv("OPTIONAL_VAR")).toBe("optional_value");
        });

        it("optionalEnv should return undefined when not set", () => {
            delete process.env.OPTIONAL_VAR;
            expect(optionalEnv("OPTIONAL_VAR")).toBeUndefined();
        });

        it("optionalEnv should return undefined for empty string", () => {
            process.env.OPTIONAL_VAR = "   ";
            expect(optionalEnv("OPTIONAL_VAR")).toBeUndefined();
        });

        it("isRecord should identify objects correctly", () => {
            expect(isRecord({})).toBe(true);
            expect(isRecord({ key: "value" })).toBe(true);
            expect(isRecord(null)).toBe(false);
            expect(isRecord(undefined)).toBe(false);
            expect(isRecord("string")).toBe(false);
            expect(isRecord(123)).toBe(false);
            expect(isRecord([])).toBe(true); // Arrays are objects
        });

        it("toErrorFields should format Error objects", () => {
            const error = new Error("Test error");
            const fields = toErrorFields(error);
            expect(fields.errorName).toBe("Error");
            expect(fields.errorMessage).toBe("Test error");
            expect(fields.errorStack).toBeDefined();
        });

        it("toErrorFields should format non-Error values", () => {
            const fields = toErrorFields("string error");
            expect(fields.errorMessage).toBe("string error");
            expect(fields.errorName).toBeUndefined();
        });
    });

    describe("ASSETS Configuration", () => {
        it("should have valid asset configurations", () => {
            expect(ASSETS.length).toBeGreaterThan(0);

            ASSETS.forEach(asset => {
                expect(asset.symbol).toBeDefined();
                expect(asset.resourceAddress).toBeDefined();
                expect(asset.resourceAddress).toMatch(/^resource_rdx1/);

                // At least one price source should be defined
                const hasPriceSource =
                    asset.fixedPriceXrd ||
                    asset.pythId ||
                    asset.coingeckoId;
                expect(hasPriceSource).toBeTruthy();
            });
        });

        it("should have XRD asset with fixed price", () => {
            const xrd = ASSETS.find(a => a.symbol === "XRD");
            expect(xrd).toBeDefined();
            expect(xrd?.fixedPriceXrd).toBe("1");
        });

        it("should have unique resource addresses", () => {
            const addresses = ASSETS.map(a => a.resourceAddress);
            const uniqueAddresses = new Set(addresses);
            expect(uniqueAddresses.size).toBe(addresses.length);
        });
    });

    describe("Handler with Mocked APIs", () => {
        it("should successfully fetch prices from Pyth and CoinGecko", async () => {
            const fetchMock = mock((url: string) => {
                if (url.includes("pyth.network")) {
                    return Promise.resolve(new Response(JSON.stringify(mockPythResponse)));
                } else if (url.includes("coingecko.com")) {
                    return Promise.resolve(new Response(JSON.stringify(mockCoinGeckoResponse)));
                }
                return Promise.reject(new Error("Unknown URL"));
            });

            global.fetch = fetchMock as any;

            const result = await handler();

            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);

            expect(body.runId).toBeDefined();
            expect(body.prices).toBeDefined();
            expect(body.manifest).toBeDefined();
            expect(Array.isArray(body.prices)).toBe(true);
            expect(body.prices.length).toBeGreaterThan(0);

            expect(fetchMock).toHaveBeenCalled();
        });

        it("should handle Pyth API failure with CoinGecko fallback", async () => {
            const fetchMock = mock((url: string) => {
                if (url.includes("pyth.network")) {
                    return Promise.reject(new Error("Pyth API Error"));
                } else if (url.includes("coingecko.com")) {
                    return Promise.resolve(new Response(JSON.stringify(mockCoinGeckoResponse)));
                }
                return Promise.reject(new Error("Unknown URL"));
            });

            global.fetch = fetchMock as any;

            const result = await handler();

            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.prices).toBeDefined();

            const nonFixedPrices = body.prices.filter((p: any) => p.source !== "fixed");
            nonFixedPrices.forEach((price: any) => {
                expect(price.source).toBe("coingecko");
            });
        });

        it("should handle CoinGecko API failure when Pyth succeeds", async () => {
            const fetchMock = mock((url: string) => {
                if (url.includes("pyth.network")) {
                    return Promise.resolve(new Response(JSON.stringify(mockPythResponse)));
                } else if (url.includes("coingecko.com")) {
                    return Promise.reject(new Error("CoinGecko API Error"));
                }
                return Promise.reject(new Error("Unknown URL"));
            });

            global.fetch = fetchMock as any;

            const result = await handler();

            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.prices).toBeDefined();

            const pythPrices = body.prices.filter((p: any) => p.source === "pyth");
            expect(pythPrices.length).toBeGreaterThan(0);
        });

        it("should handle stale Pyth prices with fallback", async () => {
            const stalePythResponse = {
                parsed: [{
                    id: "0x816c6604beb161d3ad9c3b584f06c682e6299516165d756a68c7660b073b7072",
                    price: {
                        price: "45000000",
                        expo: -8,
                        publish_time: Math.floor(Date.now() / 1000) - 120 // 2 minutes old
                    }
                }]
            };

            const fetchMock = mock((url: string) => {
                if (url.includes("pyth.network")) {
                    return Promise.resolve(new Response(JSON.stringify(stalePythResponse)));
                } else if (url.includes("coingecko.com")) {
                    return Promise.resolve(new Response(JSON.stringify(mockCoinGeckoResponse)));
                }
                return Promise.reject(new Error("Unknown URL"));
            });

            global.fetch = fetchMock as any;

            const result = await handler();

            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);

            const xrdPrice = body.prices.find((p: any) => p.symbol === "XRD");
            if (xrdPrice.source !== "fixed") {
                expect(xrdPrice.source).toBe("coingecko");
            }
        });

        it("should generate valid Radix manifest", async () => {
            const fetchMock = mock((url: string) => {
                if (url.includes("pyth.network")) {
                    return Promise.resolve(new Response(JSON.stringify(mockPythResponse)));
                } else if (url.includes("coingecko.com")) {
                    return Promise.resolve(new Response(JSON.stringify(mockCoinGeckoResponse)));
                }
                return Promise.reject(new Error("Unknown URL"));
            });

            global.fetch = fetchMock as any;

            const result = await handler();
            const body = JSON.parse(result.body);

            expect(body.manifest).toContain("CALL_METHOD");
            expect(body.manifest).toContain("create_proof_of_non_fungibles");
            expect(body.manifest).toContain("update_prices");
            expect(body.manifest).toContain(mockEnv.ACCOUNT_ADDRESS);
            expect(body.manifest).toContain(mockEnv.ORACLE_COMPONENT_ADDRESS);
            expect(body.manifest).toContain(mockEnv.BADGE_RESOURCE_ADDRESS);

            body.prices.forEach((price: any) => {
                expect(body.manifest).toContain(price.resourceAddress);
                expect(body.manifest).toContain(`Decimal("${price.price}")`);
            });
        });

        it("should handle HTTP errors gracefully", async () => {
            const fetchMock = mock(() => {
                return Promise.resolve(new Response("Internal Server Error", { status: 500 }));
            });

            global.fetch = fetchMock as any;

            await expect(handler()).rejects.toThrow();
        });

        it("should handle timeout scenarios", async () => {
            let abortCalled = false;

            const fetchMock = mock((url: string, options?: any) => {
                const signal = options?.signal;

                return new Promise((resolve, reject) => {
                    if (signal) {
                        signal.addEventListener('abort', () => {
                            abortCalled = true;
                            reject(new Error('The operation was aborted'));
                        });
                    }

                    setTimeout(() => {
                        if (!abortCalled) {
                            resolve(new Response(JSON.stringify(mockPythResponse)));
                        }
                    }, 20000);
                });
            });

            global.fetch = fetchMock as any;

            await expect(handler()).rejects.toThrow();
            expect(abortCalled).toBe(true);
        }, { timeout: 15000 });

        it("should include price metadata in results", async () => {
            const fetchMock = mock((url: string) => {
                if (url.includes("pyth.network")) {
                    return Promise.resolve(new Response(JSON.stringify(mockPythResponse)));
                } else if (url.includes("coingecko.com")) {
                    return Promise.resolve(new Response(JSON.stringify(mockCoinGeckoResponse)));
                }
                return Promise.reject(new Error("Unknown URL"));
            });

            global.fetch = fetchMock as any;

            const result = await handler();
            const body = JSON.parse(result.body);

            body.prices.forEach((price: any) => {
                expect(price.symbol).toBeDefined();
                expect(price.resourceAddress).toBeDefined();
                expect(price.price).toBeDefined();
                expect(price.source).toBeDefined();
                expect(["pyth", "coingecko", "fixed"]).toContain(price.source);

                if (price.source === "pyth") {
                    expect(price.publishTime).toBeDefined();
                }

                if (price.source !== "fixed") {
                    expect(price.usdPrice).toBeDefined();
                    expect(price.xrdUsdPrice).toBeDefined();
                }
            });
        });
    });

    describe("Price Normalization", () => {
        it("should normalize USD prices to XRD correctly", async () => {
            const fetchMock = mock((url: string) => {
                if (url.includes("pyth.network")) {
                    return Promise.resolve(new Response(JSON.stringify(mockPythResponse)));
                } else if (url.includes("coingecko.com")) {
                    return Promise.resolve(new Response(JSON.stringify(mockCoinGeckoResponse)));
                }
                return Promise.reject(new Error("Unknown URL"));
            });

            global.fetch = fetchMock as any;

            const result = await handler();
            const body = JSON.parse(result.body);

            const usdtPrice = body.prices.find((p: any) => p.symbol === "xUSDT");
            if (usdtPrice && usdtPrice.source !== "fixed") {
                expect(usdtPrice.usdPrice).toBeDefined();
                expect(usdtPrice.xrdUsdPrice).toBeDefined();
                expect(usdtPrice.price).toBeDefined();

                const expectedXrdPrice = parseFloat(usdtPrice.usdPrice) / parseFloat(usdtPrice.xrdUsdPrice);
                const actualXrdPrice = parseFloat(usdtPrice.price);

                expect(Math.abs(actualXrdPrice - expectedXrdPrice)).toBeLessThan(0.0001);
            }
        });
    });

    describe("Environment Configuration", () => {
        it("should use default values when optional env vars not set", async () => {
            delete process.env.PYTH_HERMES_URL;
            delete process.env.COINGECKO_BASE_URL;
            delete process.env.BADGE_NFT_ID;

            const fetchMock = mock((url: string) => {
                if (url.includes("pyth.network") || url.includes("hermes.pyth.network")) {
                    return Promise.resolve(new Response(JSON.stringify(mockPythResponse)));
                } else if (url.includes("coingecko.com") || url.includes("api.coingecko.com")) {
                    return Promise.resolve(new Response(JSON.stringify(mockCoinGeckoResponse)));
                }
                return Promise.reject(new Error("Unknown URL"));
            });

            global.fetch = fetchMock as any;

            const result = await handler();
            expect(result.statusCode).toBe(200);
        });

        it("should throw when required env vars missing", async () => {
            delete process.env.ACCOUNT_ADDRESS;

            await expect(handler()).rejects.toThrow("Missing required env var: ACCOUNT_ADDRESS");
        });
    });

    describe("Edge Cases", () => {
        it("should handle empty Pyth response", async () => {
            const fetchMock = mock((url: string) => {
                if (url.includes("pyth.network")) {
                    return Promise.resolve(new Response(JSON.stringify({ parsed: [] })));
                } else if (url.includes("coingecko.com")) {
                    return Promise.resolve(new Response(JSON.stringify(mockCoinGeckoResponse)));
                }
                return Promise.reject(new Error("Unknown URL"));
            });

            global.fetch = fetchMock as any;

            const result = await handler();
            expect(result.statusCode).toBe(200);

            const body = JSON.parse(result.body);
            const nonFixedPrices = body.prices.filter((p: any) => p.source !== "fixed");
            expect(nonFixedPrices.every((p: any) => p.source === "coingecko")).toBe(true);
        });

        it("should handle malformed Pyth response", async () => {
            const fetchMock = mock((url: string) => {
                if (url.includes("pyth.network")) {
                    return Promise.resolve(new Response(JSON.stringify({ invalid: "structure" })));
                } else if (url.includes("coingecko.com")) {
                    return Promise.resolve(new Response(JSON.stringify(mockCoinGeckoResponse)));
                }
                return Promise.reject(new Error("Unknown URL"));
            });

            global.fetch = fetchMock as any;

            const result = await handler();
            expect(result.statusCode).toBe(200);
        });

        it("should handle zero XRD price gracefully", async () => {
            const zeroXrdResponse = {
                radix: { usd: 0 },
                tether: { usd: 1.0 }
            };

            const fetchMock = mock((url: string) => {
                if (url.includes("pyth.network")) {
                    return Promise.resolve(new Response(JSON.stringify({ parsed: [] })));
                } else if (url.includes("coingecko.com")) {
                    return Promise.resolve(new Response(JSON.stringify(zeroXrdResponse)));
                }
                return Promise.reject(new Error("Unknown URL"));
            });

            global.fetch = fetchMock as any;

            await expect(handler()).rejects.toThrow("XRD/USD price is zero");
        });
    });
});

describe("Integration Tests with Real APIs", () => {
    beforeEach(() => {
        Object.assign(process.env, mockEnv);
    });

    it("should fetch real prices from Pyth", async () => {
        const result = await handler();

        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);

        console.log("Real API Results:");
        console.log(`Total prices fetched: ${body.prices.length}`);
        console.log(`Pyth sources: ${body.prices.filter((p: any) => p.source === "pyth").length}`);
        console.log(`CoinGecko sources: ${body.prices.filter((p: any) => p.source === "coingecko").length}`);
        console.log(`Fixed sources: ${body.prices.filter((p: any) => p.source === "fixed").length}`);

        body.prices.forEach((price: any) => {
            console.log(`${price.symbol}: ${price.price} XRD (source: ${price.source})`);
        });

        expect(body.prices.length).toBeGreaterThan(0);
    }, { timeout: 30000 });
});