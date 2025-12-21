import { generateMnemonic, walletLogger } from '../src'

walletLogger.debug({ a: generateMnemonic() })
