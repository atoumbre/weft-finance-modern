import bip39 from 'bip39'
import { derivePath, getPublicKey } from 'ed25519-hd-key'
import { ok } from 'neverthrow'
import { secureRandom } from './secure-random'

export const generateMnemonic = () => bip39.entropyToMnemonic(secureRandom(32))

function mnemonicToSeed(mnemonic: string) {
  return ok(bip39.mnemonicToSeedSync(mnemonic).toString('hex'))
}

function deriveChildKey(derivationPath: string, seedHex: string) {
  return ok(derivePath(derivationPath, seedHex))
}

export function mnemonicToKeyPair(mnemonic: string, derivationPath: string) {
  return mnemonicToSeed(mnemonic)
    .andThen((seedHex: string) => deriveChildKey(derivationPath, seedHex))
    .map(({ key }) => ({
      privateKey: key.toString('hex'),
      publicKey: getPublicKey(key, false).toString('hex'),
    }))
}
