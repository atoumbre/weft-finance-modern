import { walletLogger } from '../../src'
import { radixEngineClient } from '../config'

export function exec(address: string) {
  walletLogger.debug(radixEngineClient.gatewayClient.networkConfig)

  radixEngineClient.gatewayClient
    .getState([address])
    .map((res: any) => walletLogger.debug(res))
    .mapErr((err: any) => walletLogger.error(JSON.stringify(err, null, 2)))
}

exec(process.argv[2])
