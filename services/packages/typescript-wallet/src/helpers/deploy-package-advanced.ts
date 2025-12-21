import { ResultAsync } from 'neverthrow'
import { bufferToUnit8Array, hash, loadBinaryFromPath } from '.'
import { radixEngineClient } from '../../examples/config'

export function deployPackageAdvanced({
  packagePath,
  ownerBadge,
  lockFee,
}: {
  packagePath: string
  ownerBadge: string
  lockFee: number
}) {
  return ResultAsync.combine([
    loadBinaryFromPath(`${packagePath}.wasm`),
    loadBinaryFromPath(`${packagePath}.rpd`),
  ])
    .andThen(([wasmBuffer, rpdBuffer]) =>
      radixEngineClient
        .getManifestBuilder()
        .andThen(engineToolkit =>
          radixEngineClient.decodeSbor(bufferToUnit8Array(rpdBuffer)).map(rpdDecoded => ({
            wasmBuffer,
            rpdBuffer,
            rpdDecoded,
            ...engineToolkit,
          })),
        )
        .andThen(({
          wasmBuffer,
          rpdDecoded,
          convertStringManifest,
          submitTransaction,
          wellKnownAddresses,
        }) => {
          const wasmHash = hash(wasmBuffer).toString('hex')

          return convertStringManifest(`
                      CALL_METHOD
                        Address("${wellKnownAddresses.accountAddress}")
                        "lock_fee"
                        Decimal("${lockFee}")
                      ;

                      PUBLISH_PACKAGE_ADVANCED
                        Enum<2u8>(
                            Enum<2u8>(
                                Enum<0u8>(
                                    Enum<0u8>(
                                        Enum<1u8>(
                                            Address("${ownerBadge}")
                                        )
                                    )
                                )
                            )
                        )
                        ${rpdDecoded}
                        Blob("${wasmHash}") 
                        Map<String, Tuple>() 
                        Enum<0u8>()
                      ;
                      
                      CALL_METHOD
                        Address("${wellKnownAddresses.accountAddress}")
                        "deposit_batch"
                        Expression("ENTIRE_WORKTOP")
                      ;   
            `)
            .andThen(({ instructions }) =>
              submitTransaction({
                instructions,
                blobs: [bufferToUnit8Array(wasmBuffer)],
              }),
            )
            .andThen(({ txId }) =>
              radixEngineClient.gatewayClient
                .pollTransactionStatus(txId)
                .map(() => txId),
            )
            .andThen(txId =>
              radixEngineClient.gatewayClient
                .getCommittedDetails(txId)
                .map(res => ({
                  packageAddress: res.createdEntities[0].entity_address,
                })),
            )
        }))
}
