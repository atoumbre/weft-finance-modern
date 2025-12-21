import { walletLogger } from '../../src'
import { radixEngineClient } from '../config'
import 'dotenv/config'

export function exec() {
  radixEngineClient.gatewayClient
    .wellKnownAddresses()
    .map(res => walletLogger.debug(res))
    .mapErr(err => walletLogger.error(JSON.stringify(err, null, 2)))
}

exec()
