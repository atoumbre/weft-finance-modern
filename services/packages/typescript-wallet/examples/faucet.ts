import { walletLogger } from '../src'
import { radixEngineClient } from './config'

radixEngineClient
  .getXrdFromFaucet()
  .map((res: any) => walletLogger.debug(res))
  .mapErr((err: any) => walletLogger.error(err))
