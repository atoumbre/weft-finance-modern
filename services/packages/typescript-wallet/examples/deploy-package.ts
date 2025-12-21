import { okAsync, ResultAsync } from 'neverthrow'
import { deployPackage, loadBinaryFromPath, walletLogger } from '../src/helpers'
import { radixEngineClient } from './config'

// const instantiateSugarPriceOracle = (sugarOraclePackage: string) =>
//   radixEngineClient
//     .getManifestBuilder()
//     .andThen(
//       ({ wellKnownAddresses, convertStringManifest, submitTransaction }) =>
//         convertStringManifest(`
//         CALL_METHOD
//             Address("${wellKnownAddresses.accountAddress}")
//             "lock_fee"
//             Decimal("5000")
//         ;
//         CALL_FUNCTION
//             Address("${sugarOraclePackage}")
//             "SugarPriceOracle"
//             "instantiate_sugar_price_oracle"
//         ;
//         CALL_METHOD
//             Address("${wellKnownAddresses.accountAddress}")
//             "deposit_batch"
//             Expression("ENTIRE_WORKTOP")
//         ;
//         `)
//           .andThen(submitTransaction)
//           .andThen(({ txId }) =>
//             radixEngineClient.gatewayClient
//               .pollTransactionStatus(txId)
//               .map(() => txId)
//           )
//           .andThen((txId) =>
//             radixEngineClient.gatewayClient
//               .getCommittedDetails(txId)
//               .map((res): string => res.createdEntities[0].entity_address)
//           )
//     )

radixEngineClient.getXrdFromFaucet().then(() => {
  ResultAsync.combine([
    loadBinaryFromPath('/examples/assets/sugar_price_oracle.wasm'),
    loadBinaryFromPath('/examples/assets/sugar_price_oracle.rpd'),
  ])
    .andThen(([wasmBuffer, rpdBuffer]) =>
      deployPackage({ wasmBuffer, rpdBuffer, lockFee: 5000 }),
    )
    .andThen((result) => {
      walletLogger.info('Deployed package', result)
      // return instantiateSugarPriceOracle(result.packageAddress)
      return okAsync(result.packageAddress)
    })
    .mapErr((error) => {
      walletLogger.error(error)
    })
})
