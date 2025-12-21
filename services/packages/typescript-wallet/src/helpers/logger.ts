import { Logger } from 'tslog'

export const walletLogger = new Logger({
  minLevel: 0,
  prettyLogTemplate: '{{hh}}:{{MM}}:{{ss}}:{{ms}}\t{{logLevelName}}\t',
})
