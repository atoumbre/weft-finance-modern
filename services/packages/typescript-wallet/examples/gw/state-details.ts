import { walletLogger } from '../../src'
import { radixEngineClient } from '../config'

export function exec(address: string) {
  walletLogger.debug(radixEngineClient.gatewayClient.networkConfig)

  radixEngineClient.gatewayClient
    .getState([address])
    .map((res: any) => walletLogger.debug(res))
    .mapErr((err: any) => walletLogger.error(JSON.stringify(err, null, 2)))
}

// eslint-disable-next-line node/prefer-global/process
exec(process.argv[2])
