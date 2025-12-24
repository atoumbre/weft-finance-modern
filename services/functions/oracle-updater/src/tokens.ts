// ============================================================================
// Asset Configuration
// ============================================================================

export interface AssetPriceFeed {
  plugin: string // Plugin name
  identifier?: string // Plugin-specific identifier
}

export interface AssetConfig {
  symbol: string
  resourceAddress: string
  fixedPriceXrd?: string
  priceFeeds: AssetPriceFeed[] // Ordered list (priority)
}

export const ASSETS: AssetConfig[] = [
  {
    symbol: 'XRD',
    resourceAddress: 'resource_rdx1tknxxxxxxxxxradxrdxxxxxxxxx009923554798xxxxxxxxxradxrd',
    fixedPriceXrd: '1',
    priceFeeds: [
      { plugin: 'pyth', identifier: '816c6604beb161d3ad9c3b584f06c682e6299516165d756a68c7660b073b7072' },
      { plugin: 'coingecko', identifier: 'radix' },
    ],
  },
  {
    symbol: 'xUSDT',
    resourceAddress: 'resource_rdx1thrvr3xfs2tarm2dl9emvs26vjqxu6mqvfgvqjne940jv0lnrrg7rw',
    priceFeeds: [
      { plugin: 'pyth', identifier: '2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b' },
      { plugin: 'coingecko', identifier: 'tether' },
      { plugin: 'astrolescent' },
    ],
  },
  {
    symbol: 'xUSDC',
    resourceAddress: 'resource_rdx1t4upr78guuapv5ept7d7ptekk9mqhy605zgms33mcszen8l9fac8vf',
    priceFeeds: [
      { plugin: 'pyth', identifier: 'eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a' },
      { plugin: 'coingecko', identifier: 'usd-coin' },
      { plugin: 'astrolescent' },
    ],
  },
  {
    symbol: 'xETH',
    resourceAddress: 'resource_rdx1th88qcj5syl9ghka2g9l7tw497vy5x6zaatyvgfkwcfe8n9jt2npww',
    priceFeeds: [
      { plugin: 'pyth', identifier: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace' },
      { plugin: 'coingecko', identifier: 'ethereum' },
      { plugin: 'astrolescent' },
    ],
  },
  {
    symbol: 'xwBTC',
    resourceAddress: 'resource_rdx1t580qxc7upat7lww4l2c4jckacafjeudxj5wpjrrct0p3e82sq4y75',
    priceFeeds: [
      { plugin: 'pyth', identifier: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43' },
      { plugin: 'coingecko', identifier: 'bitcoin' },
      { plugin: 'astrolescent' },
    ],
  },
  {
    symbol: 'hUSDT',
    resourceAddress: 'resource_rdx1th4v03gezwgzkuma6p38lnum8ww8t4ds9nvcrkr2p9ft6kxx3kxvhe',
    priceFeeds: [
      { plugin: 'pyth', identifier: '2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b' },
      { plugin: 'coingecko', identifier: 'tether' },
      { plugin: 'astrolescent' },
    ],
  },
  {
    symbol: 'hUSDC',
    resourceAddress: 'resource_rdx1thxj9m87sn5cc9ehgp9qxp6vzeqxtce90xm5cp33373tclyp4et4gv',
    priceFeeds: [
      { plugin: 'pyth', identifier: 'eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a' },
      { plugin: 'coingecko', identifier: 'usd-coin' },
      { plugin: 'astrolescent' },
    ],
  },
  {
    symbol: 'hETH',
    resourceAddress: 'resource_rdx1th09yvv7tgsrv708ffsgqjjf2mhy84mscmj5jwu4g670fh3e5zgef0',
    priceFeeds: [
      { plugin: 'pyth', identifier: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace' },
      { plugin: 'coingecko', identifier: 'ethereum' },
      { plugin: 'astrolescent' },
    ],
  },
  {
    symbol: 'hWBTC',
    resourceAddress: 'resource_rdx1t58kkcqdz0mavfz98m98qh9m4jexyl9tacsvlhns6yxs4r6hrm5re5',
    priceFeeds: [
      { plugin: 'pyth', identifier: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43' },
      { plugin: 'coingecko', identifier: 'bitcoin' },
      { plugin: 'astrolescent' },
    ],
  },
  {
    symbol: 'hSOL',
    resourceAddress: 'resource_rdx1t5ljlq97xfcewcdjxsqld89443fchqg96xv8a8k8gdftdycy9haxpx',
    priceFeeds: [
      { plugin: 'pyth', identifier: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d' },
      { plugin: 'coingecko', identifier: 'solana' },
      { plugin: 'astrolescent' },
    ],
  },

  // ecosystem token
  {
    symbol: 'WEFT',
    resourceAddress: 'resource_rdx1tk3fxrz75ghllrqhyq8e574rkf4lsq2x5a0vegxwlh3defv225cth3',
    priceFeeds: [
      { plugin: 'caviarnine' },
      { plugin: 'coingecko', identifier: 'weft-finance' },
      { plugin: 'astrolescent' },
    ],
  },
  {
    symbol: 'HUG',
    resourceAddress: 'resource_rdx1t5kmyj54jt85malva7fxdrnpvgfgs623yt7ywdaval25vrdlmnwe97',
    priceFeeds: [
      { plugin: 'caviarnine' },
      { plugin: 'coingecko', identifier: 'hug' },
      { plugin: 'astrolescent' },
    ],
  },
  {
    symbol: 'EARLY',
    resourceAddress: 'resource_rdx1t5xv44c0u99z096q00mv74emwmxwjw26m98lwlzq6ddlpe9f5cuc7s',
    priceFeeds: [
      { plugin: 'caviarnine' },
      { plugin: 'coingecko', identifier: 'early' },
      { plugin: 'astrolescent' },
    ],
  },
  {
    symbol: 'OCI',
    resourceAddress: 'resource_rdx1t52pvtk5wfhltchwh3rkzls2x0r98fw9cjhpyrf3vsykhkuwrf7jg8',
    priceFeeds: [
      { plugin: 'caviarnine' },
      { plugin: 'coingecko', identifier: 'ociswap' },
      { plugin: 'astrolescent' },
    ],
  },
  {
    symbol: 'ASTRL',
    resourceAddress: 'resource_rdx1t4tjx4g3qzd98nayqxm7qdpj0a0u8ns6a0jrchq49dyfevgh6u0gj3',
    priceFeeds: [
      { plugin: 'caviarnine' },
      { plugin: 'coingecko', identifier: 'astrolescent' },
      { plugin: 'astrolescent' },
    ],
  },
  {
    symbol: 'DFP2',
    resourceAddress: 'resource_rdx1t5ywq4c6nd2lxkemkv4uzt8v7x7smjcguzq5sgafwtasa6luq7fclq',
    priceFeeds: [
      { plugin: 'caviarnine' },
      { plugin: 'coingecko', identifier: 'defiplaza' },
      { plugin: 'astrolescent' },
    ],
  },
  {
    symbol: 'CAVIAR',
    resourceAddress: 'resource_rdx1tkk83magp3gjyxrpskfsqwkg4g949rmcjee4tu2xmw93ltw2cz94sq',
    priceFeeds: [
      { plugin: 'caviarnine' },
      { plugin: 'coingecko', identifier: 'caviar' },
      { plugin: 'astrolescent' },
    ],
  },
  {
    symbol: 'SRG',
    resourceAddress: 'resource_rdx1tka3kqqkjxcpddvcx0u300qt66z3tlzv7swqx9rklp60m5yqry6yzk',
    priceFeeds: [
      { plugin: 'caviarnine' },
      { plugin: 'coingecko', identifier: 'surge-2' },
      { plugin: 'astrolescent' },
    ],
  },
  {
    symbol: 'FLOOP',
    resourceAddress: 'resource_rdx1t5pyvlaas0ljxy0wytm5gvyamyv896m69njqdmm2stukr3xexc2up9',
    priceFeeds: [
      { plugin: 'caviarnine' },
      { plugin: 'coingecko', identifier: 'floop' },
      { plugin: 'astrolescent' },
    ],
  },
  {
    symbol: 'MOX',
    resourceAddress: 'resource_rdx1thmjcqjnlfm56v7k5g2szfrc44jn22x8tjh7xyczjpswmsnasjl5l9',
    priceFeeds: [
      { plugin: 'caviarnine' },
      { plugin: 'coingecko', identifier: 'mox' },
      { plugin: 'astrolescent' },
    ],
  },
]

// resource_rdx1tknxxxxxxxxxradxrdxxxxxxxxx009923554798xxxxxxxxxradxrd => XRD
// resource_rdx1thrvr3xfs2tarm2dl9emvs26vjqxu6mqvfgvqjne940jv0lnrrg7rw => xUSDT
// resource_rdx1t4upr78guuapv5ept7d7ptekk9mqhy605zgms33mcszen8l9fac8vf => xUSDC
// resource_rdx1th88qcj5syl9ghka2g9l7tw497vy5x6zaatyvgfkwcfe8n9jt2npww => xETH
// resource_rdx1t580qxc7upat7lww4l2c4jckacafjeudxj5wpjrrct0p3e82sq4y75 => xwBTC
// resource_rdx1th4v03gezwgzkuma6p38lnum8ww8t4ds9nvcrkr2p9ft6kxx3kxvhe => hUSDT
// resource_rdx1thxj9m87sn5cc9ehgp9qxp6vzeqxtce90xm5cp33373tclyp4et4gv => hUSDC
// resource_rdx1th09yvv7tgsrv708ffsgqjjf2mhy84mscmj5jwu4g670fh3e5zgef0 => hETH
// resource_rdx1t58kkcqdz0mavfz98m98qh9m4jexyl9tacsvlhns6yxs4r6hrm5re5 => hWBTC
// resource_rdx1t5ljlq97xfcewcdjxsqld89443fchqg96xv8a8k8gdftdycy9haxpx => hSOL

// resource_rdx1tk3fxrz75ghllrqhyq8e574rkf4lsq2x5a0vegxwlh3defv225cth3 => WEFT
// resource_rdx1t5kmyj54jt85malva7fxdrnpvgfgs623yt7ywdaval25vrdlmnwe97 => HUG
// resource_rdx1t5xv44c0u99z096q00mv74emwmxwjw26m98lwlzq6ddlpe9f5cuc7s => EARLY
// resource_rdx1t52pvtk5wfhltchwh3rkzls2x0r98fw9cjhpyrf3vsykhkuwrf7jg8 => OCI
// resource_rdx1t40lchq8k38eu4ztgve5svdpt0uxqmkvpy4a2ghnjcxjtdxttj9uam => STAB
// resource_rdx1t4tjx4g3qzd98nayqxm7qdpj0a0u8ns6a0jrchq49dyfevgh6u0gj3 => ASTRL
// resource_rdx1t5ywq4c6nd2lxkemkv4uzt8v7x7smjcguzq5sgafwtasa6luq7fclq => DFP2
// resource_rdx1tkk83magp3gjyxrpskfsqwkg4g949rmcjee4tu2xmw93ltw2cz94sq => CAVIAR
// resource_rdx1tka3kqqkjxcpddvcx0u300qt66z3tlzv7swqx9rklp60m5yqry6yzk => SRG
// resource_rdx1t5pyvlaas0ljxy0wytm5gvyamyv896m69njqdmm2stukr3xexc2up9 => FLOOP
// resource_rdx1t58k9jlygcw27sx7peza34jtk65qhe8y7qxmyp9l09pz5sjgadkcq3 => xLINK
// resource_rdx1t4lqx3pzazlfp0e449ued6mmmfysevc8r2tzrcj70kpnlwt9kdpgf8 => xPEPE
// resource_rdx1t5d2qch32njedqpa204yswpxmxea5wazqf7tavptcxgq5j77suuxlr => xENA
// resource_rdx1thmjcqjnlfm56v7k5g2szfrc44jn22x8tjh7xyczjpswmsnasjl5l9 => MOX
