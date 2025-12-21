import { radixEngineClient } from '../../examples/config'
import { walletLogger } from './logger'

export function sendTransactionManifest(txManifest: string, lock_fee = 100) {
  return radixEngineClient
    .getManifestBuilder()
    .andThen(({ wellKnownAddresses, convertStringManifest }) => {
      walletLogger.debug(txManifest)
      return convertStringManifest(`
          CALL_METHOD
              Address("${wellKnownAddresses.accountAddress}")
              "lock_fee"
              Decimal("${lock_fee}")
          ;
          
          ${txManifest}
    `)
        .andThen(radixEngineClient.submitTransaction)
        .andThen(({ txId }) =>
          radixEngineClient.gatewayClient
            .pollTransactionStatus(txId)
            .map(() => txId),
        )
    })
}
