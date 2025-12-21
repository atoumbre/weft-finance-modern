/* cSpell:disable */

export type AssetConfig = {
    symbol: string;
    resourceAddress: string;
    fixedPriceXrd?: string;
    pythPriceIdEnv?: string;
    coingeckoId?: string;
};

export const ASSETS: AssetConfig[] = [
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
