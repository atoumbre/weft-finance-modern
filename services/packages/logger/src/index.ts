import pino, { stdSerializers } from 'pino'
import { Logger as TSLogger } from 'tslog'

export interface ILogger {
  debug: (message: any, ...args: any[]) => void
  info: (message: any, ...args: any[]) => void
  warn: (message: any, ...args: any[]) => void
  error: (message: any, ...args: any[]) => void
  fatal?: (message: any, ...args: any[]) => void
  child: (bindings: Record<string, any>) => ILogger
}

export interface LoggerOptions {
  service: string
  level?: string
}

export function createLogger(options: LoggerOptions): ILogger {
  const isProduction = process.env.NODE_ENV === 'production'
  const level = options.level || process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug')

  if (isProduction) {
    const pinoLogger = pino({
      level,
      base: {
        service: options.service,
        env: process.env.NODE_ENV,
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      serializers: {
        err: stdSerializers.err,
        error: stdSerializers.err,
      },
      redact: {
        paths: [
          '*.secret',
          '*.password',
          '*.key',
          '*.phrase',
          '*.apiKey',
          '*.token',
          'secret',
          'password',
          'key',
          'phrase',
          'apiKey',
          'token',
        ],
        censor: '***',
      },
    })

    const wrapPino = (p: pino.Logger): ILogger => ({
      debug: (msg, ...args) => p.debug(msg, ...args),
      info: (msg, ...args) => p.info(msg, ...args),
      warn: (msg, ...args) => p.warn(msg, ...args),
      error: (msg, ...args) => p.error(msg, ...args),
      fatal: (msg, ...args) => p.fatal(msg, ...args),
      child: bindings => wrapPino(p.child(bindings)),
    })

    return wrapPino(pinoLogger)
  }
  else {
    const tsLogger = new TSLogger({
      name: options.service,
      minLevel: levelToNumber(level),
      prettyLogTemplate: '{{hh}}:{{MM}}:{{ss}}:{{ms}}\t{{logLevelName}}\t[{{name}}]\t',
    })

    const wrapTS = (t: TSLogger<any>): ILogger => ({
      debug: (msg, ...args) => t.debug(msg, ...args),
      info: (msg, ...args) => t.info(msg, ...args),
      warn: (msg, ...args) => t.warn(msg, ...args),
      error: (msg, ...args) => t.error(msg, ...args),
      fatal: (msg, ...args) => t.fatal(msg, ...args),
      child: bindings => wrapTS(t.getSubLogger({ name: `${t.settings.name}:${JSON.stringify(bindings)}` })),
    })

    return wrapTS(tsLogger)
  }
}

function levelToNumber(level: string): number {
  switch (level.toLowerCase()) {
    case 'silly': return 0
    case 'trace': return 1
    case 'debug': return 2
    case 'info': return 3
    case 'warn': return 4
    case 'error': return 5
    case 'fatal': return 6
    default: return 3
  }
}

// Default logger for simple use cases
export const logger = createLogger({ service: 'default' })
