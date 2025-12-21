import { walletLogger } from '../../src'
import { radixEngineClient } from '../config'

export function exec() {
  radixEngineClient.gatewayClient
    .getStatus()
    .map((res: any) => walletLogger.debug(res))
    .mapErr((err: any) => walletLogger.error(JSON.stringify(err, null, 2)))
}

exec()
