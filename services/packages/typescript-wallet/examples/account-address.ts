import { walletLogger } from '../src'
import { radixEngineClient } from './config'

radixEngineClient
  .getAccountAddress()
  .map(address =>
    walletLogger.debug({
      address,
      url: `${radixEngineClient.gatewayClient.networkConfig.dashboardUrl}/account/${address}`,
    }),
  )
  .mapErr(err => walletLogger.error(err))
