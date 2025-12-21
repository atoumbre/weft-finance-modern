
import type {
  NotarizedTransaction,
  TransactionHeader,
  TransactionManifest,
} from '@radixdlt/radix-engine-toolkit'
import {
  bucket,
  decimal,
  generateRandomNonce,
  ManifestBuilder,
  ManifestSborStringRepresentation,
  PrivateKey,
  PublicKey,
  RadixEngineToolkit,
  TransactionBuilder,
} from '@radixdlt/radix-engine-toolkit'
import { err, ok, Result, ResultAsync } from 'neverthrow'
import { getNetworkConfig } from '../helpers/getNetworkConfig'
import { walletLogger } from '../helpers/logger'
import { mnemonicToKeyPair } from '../helpers/mnemonicToKeyPair'
import { typedError } from '../helpers/typed-error'
import { getGatewayClient } from './gateway-client'
import { RadixNetworkConfig } from '@radixdlt/babylon-gateway-api-sdk'

function getSignerKeys(mnemonic: string, derivationPath: string) {
  const { privateKey } = mnemonicToKeyPair(mnemonic, derivationPath).unwrapOr({
    privateKey: '',
  })

  if (!privateKey)
    return err('Unable to derive private key')

  const signerPrivateKey = new PrivateKey.Ed25519(privateKey)

  const signerPublicKey = new PublicKey.Ed25519(signerPrivateKey.publicKeyHex())

  return ok({
    signerPrivateKey,
    signerPublicKey,
    publicKeyHex: Buffer.from(signerPublicKey.publicKey).toString('hex'),
  })
}

function deriveAccountAddressFromPublicKey(publicKey: PublicKey, networkId: number) {
  return ResultAsync.fromPromise(
    RadixEngineToolkit.Derive.virtualAccountAddressFromPublicKey(
      publicKey,
      networkId,
    ),
    typedError,
  )
}

export type RadixEngineClient = ReturnType<typeof getRadixEngineClient>
export function getRadixEngineClient({
  networkName,
  mnemonic,
  derivationIndex,
}: {
  networkName: keyof typeof RadixNetworkConfig
  mnemonic: string
  derivationIndex: number
}) {
  const networkConfig = getNetworkConfig(networkName)
  const { networkId, dashboardUrl } = networkConfig

  const KEY_TYPE = {
    TRANSACTION_SIGNING: 1460,
    AUTHENTICATION_SIGNING: 1678,
    MESSAGE_ENCRYPTION: 1391,
  } as const

  const ENTITY_TYPE = {
    ACCOUNT: 525,
    IDENTITY: 618,
  } as const

  const ENTITY_INDEX = derivationIndex

  const DERIVATION_PATH = `m/44'/1022'/${networkId}'/${ENTITY_TYPE.ACCOUNT}'/${KEY_TYPE.TRANSACTION_SIGNING}'/${ENTITY_INDEX}'`

  const result = Result.combine([getSignerKeys(mnemonic, DERIVATION_PATH)])

  if (result.isErr())
    throw result.error

  const { signerPublicKey, signerPrivateKey } = result.value[0]

  const gatewayClient = getGatewayClient(networkConfig)

  const getAccountAddress = () =>
    deriveAccountAddressFromPublicKey(signerPublicKey, networkId)

  const getKnownAddresses = () =>
    ResultAsync.fromPromise(
      RadixEngineToolkit.Utils.knownAddresses(networkId),
      typedError,
    )

  const createTransactionHeader = (signerPublicKey: PublicKey) =>
    gatewayClient.getEpoch().map(
      (epoch): TransactionHeader => ({
        networkId /* The network that this transaction is destined to */,
        startEpochInclusive:
          epoch /* The start epoch (inclusive) of when this transaction becomes valid */,
        endEpochExclusive:
          epoch
          + 2 /* The end epoch (exclusive) of when this transaction is no longer valid */,
        nonce: generateRandomNonce() /* A random nonce */,
        notaryPublicKey: signerPublicKey /* The public key of the notary */,
        notaryIsSignatory:
          true /* Whether the notary signature is also considered as an intent signature */,
        tipPercentage: 0 /* The percentage of fees that goes to validators */,
      }),
    )

  const getTransactionBuilder = () =>
    ResultAsync.fromPromise(TransactionBuilder.new(), typedError)

  const compileNotarizedTransaction = (
    notarizedTransactionPromise: Promise<NotarizedTransaction>,
  ) =>
    ResultAsync.fromPromise(notarizedTransactionPromise, typedError)
      .andThen(notarizedTransaction =>
        ResultAsync.fromPromise(
          RadixEngineToolkit.NotarizedTransaction.compile(notarizedTransaction),
          typedError,
        ),
      )
      .map(byteArray => Buffer.from(byteArray).toString('hex'))

  const getTransactionIntentHash = (
    notarizedTransaction: Promise<NotarizedTransaction>,
  ) =>
    ResultAsync.fromPromise(notarizedTransaction, typedError).andThen(
      notarizedTransaction =>
        ResultAsync.fromPromise(
          RadixEngineToolkit.Intent.hash(
            notarizedTransaction.signedIntent.intent,
          ),
          typedError,
        ),
    )

  const createSignedNotarizedTransaction = (
    transactionManifest: TransactionManifest,
  ) =>
    ResultAsync.combine([
      getTransactionBuilder(),
      createTransactionHeader(signerPublicKey),
    ])
      .map(([builder, transactionHeader]) => {
        return {
          builder,
          transactionHeader,
          signerPrivateKey,
        }
      })
      .andThen(({ builder, transactionHeader, signerPrivateKey }) => {
        try {
          return ok(
            builder
              .header(transactionHeader)
              .manifest(transactionManifest)
              .notarize(signerPrivateKey),
          )
        }
        catch (error) {
          return err(error)
        }
      })

  const getAddresses = () =>
    ResultAsync.combine([getAccountAddress(), getKnownAddresses()]).map(
      ([accountAddress, knownAddresses]) => ({
        networkId,
        accountAddress,
        ...knownAddresses,
      }),
    )

  const buildTransaction = (transactionManifest: TransactionManifest) =>
    createSignedNotarizedTransaction(transactionManifest).andThen(
      notarizedTransaction =>
        ResultAsync.combine([
          compileNotarizedTransaction(notarizedTransaction),
          getTransactionIntentHash(notarizedTransaction),
        ]).map(([compiledTransactionHex, { id }]) => ({
          notarizedTransaction,
          txId: id,
          compiledTransactionHex,
        })),
    )

  function convertParsedManifest(transactionManifest: TransactionManifest): ResultAsync<TransactionManifest, Error> {
    return ResultAsync.fromPromise(
      RadixEngineToolkit.Instructions.convert(
        transactionManifest.instructions,
        networkId,
        'String',
      ),
      typedError,
    ).map(instructions => ({ instructions, blobs: [] }))
  }

  const submitTransaction = (transactionManifest: TransactionManifest) => {
    convertParsedManifest(transactionManifest).map((data) => {
      walletLogger.debug(`Submitting transaction`)
      walletLogger.debug(data.instructions.value)
      return data
    })

    return buildTransaction(transactionManifest)
      .andThen(
        ({ compiledTransactionHex: notarized_transaction_hex, txId }) => {
          walletLogger.debug(`${dashboardUrl}/transaction/${txId}`)
          return gatewayClient
            .submitNotarizedTransactionHex(notarized_transaction_hex)
            .map(response => ({ ...response, txId }))
        },
      )
      .mapErr((error) => {
        walletLogger.error(error)
        return error
      })
  }

  const decodeSbor = (rpdBuffer: Uint8Array) =>
    ResultAsync.fromPromise(
      RadixEngineToolkit.ManifestSbor.decodeToString(
        rpdBuffer,
        networkId,
        ManifestSborStringRepresentation.ManifestString,
      ),
      typedError,
    )

  const convertStringManifest = (
    stringManifest: string,
  ): ResultAsync<TransactionManifest, Error> => {
    return ResultAsync.fromPromise(
      RadixEngineToolkit.Instructions.convert(
        { kind: 'String', value: stringManifest },
        networkId,
        'Parsed',
      ),
      typedError,
    )
      .map(instructions => ({ instructions, blobs: [] }))
      .mapErr((err) => {
        walletLogger.error(err)
        return err
      })
  }

  const getManifestBuilder = () =>
    getAddresses().map(wellKnownAddresses => ({
      builder: new ManifestBuilder(),
      wellKnownAddresses,
      convertStringManifest,
      submitTransaction,
    }))

  const getXrdFromFaucet = () =>
    getManifestBuilder().andThen(
      ({ builder, wellKnownAddresses, submitTransaction }) =>
        submitTransaction(
          builder
            .callMethod(
              wellKnownAddresses.componentAddresses.faucet,
              'lock_fee',
              [decimal(10)],
            )
            .callMethod(
              wellKnownAddresses.componentAddresses.faucet,
              'free',
              [],
            )
            .takeAllFromWorktop(
              wellKnownAddresses.resourceAddresses.xrd,
              (builder, bucketId) =>
                builder.callMethod(
                  wellKnownAddresses.accountAddress,
                  'deposit',
                  [bucket(bucketId)],
                ),
            )

            .build(),
        ).andThen(({ txId }) =>
          gatewayClient.pollTransactionStatus(txId).map(() => txId),
        ),
    )

  return {
    getAccountAddress,
    getAddresses,
    buildTransaction,
    submitTransaction,
    getManifestBuilder,
    getSignerKeys,
    gatewayClient,
    decodeSbor,
    convertStringManifest,
    convertParsedManifest,
    getXrdFromFaucet,
  }
}
