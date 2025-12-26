import type { ILogger } from '@local-packages/common-utils'
import { LENDING_MARKET_COMPONENT } from '@weft-finance/ledger-state'

export async function liquidateCdp(cdpId: string, localLogger: ILogger) {
  localLogger.info({ event: 'liquidator.cdp.start', cdpId })

  const manifest = `
        CALL_METHOD Address("${LENDING_MARKET_COMPONENT}") "liquidate" NonFungibleLocalId("${cdpId}");
`

  //
  // In a real implementation:
  // 1. Convert manifest to Intent
  // 2. Sign Intent with Private Key (from SEED_PHRASE)
  // 3. Submit Transaction

  // Here we just preview it to verify it *would* work or just log it.
  // For the sake of the infrastructure demo, we'll assume success.

  localLogger.info({ event: 'liquidator.cdp.mock_prepared', cdpId, manifestLength: manifest.length })
  localLogger.info({ event: 'liquidator.cdp.mock_submitted', cdpId })

  return true
}
