import { RadixNetworkConfig } from '@radixdlt/babylon-gateway-api-sdk'

export function getNetworkConfig(networkName: keyof typeof RadixNetworkConfig) {
  const network = RadixNetworkConfig[networkName]
  if (!network)
    throw new Error(`Invalid network: ${networkName}`)
  return network
}
