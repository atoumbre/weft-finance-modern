import type { ILogger } from 'comon-utils'
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import { LENDING_MARKET_COMPONENT } from '@weft-finance/ledger-state'
import { createLogger } from 'comon-utils'

const logger = createLogger({ service: 'liquidator' })

const sqs = new SQSClient({})

const QUEUE_URL = process.env.LIQUIDATION_QUEUE_URL!

async function liquidateCdp(cdpId: string, localLogger: ILogger) {
  localLogger.info({ event: 'liquidator.cdp.start', cdpId })

  const manifest = `
        CALL_METHOD Address("${LENDING_MARKET_COMPONENT}") "liquidate" NonFungibleLocalId("${cdpId}");
`

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

async function processMessage(message: any) {
  const messageId = typeof message?.MessageId === 'string' ? message.MessageId : undefined
  if (!message.Body)
    return

  let body: any
  try {
    body = JSON.parse(message.Body)
  }
  catch (e) {
    logger.error({
      event: 'liquidator.message.invalid_json',
      messageId,
      bodyLength: typeof message.Body === 'string' ? message.Body.length : undefined,
      err: e,
    })
    return
  }

  const runId = typeof body.runId === 'string' ? body.runId : undefined
  const rawIds = Array.isArray(body.cdpIds) ? body.cdpIds : (body.cdpId ? [body.cdpId] : [])
  const ids = rawIds.filter((id: any): id is string => typeof id === 'string' && id.length > 0)

  // Create a child logger for this request context
  const localLogger = logger.child({ runId, messageId })

  if (ids.length === 0)
    return
  if (ids.length !== rawIds.length) {
    localLogger.warn({
      event: 'liquidator.message.invalid_cdp_ids',
      invalidCount: rawIds.length - ids.length,
    })
  }

  localLogger.info({ event: 'liquidator.message.received', cdpCount: ids.length })

  const failures: string[] = []
  for (const id of ids) {
    try {
      await liquidateCdp(id, localLogger)
    }
    catch (e) {
      failures.push(id)
      localLogger.error({
        event: 'liquidator.cdp.failed',
        cdpId: id,
        err: e,
      })
    }
  }

  if (failures.length > 0) {
    throw new Error(`Failed to liquidate ${failures.length} CDPs`)
  }

  localLogger.info({ event: 'liquidator.message.completed', cdpCount: ids.length })
}

async function main() {
  logger.info({ event: 'liquidator.start', queueUrl: QUEUE_URL })

  while (true) {
    try {
      const { Messages } = await sqs.send(new ReceiveMessageCommand({
        QueueUrl: QUEUE_URL,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 20,
      }))

      if (Messages) {
        for (const msg of Messages) {
          try {
            await processMessage(msg)
            // Only delete if successful
            await sqs.send(new DeleteMessageCommand({
              QueueUrl: QUEUE_URL,
              ReceiptHandle: msg.ReceiptHandle,
            }))
            logger.info({ event: 'liquidator.message.deleted', messageId: msg.MessageId })
          }
          catch (e) {
            logger.error({ event: 'liquidator.message.failed', messageId: msg.MessageId, err: e })
          }
        }
      }
    }
    catch (error) {
      logger.error({ event: 'liquidator.loop.error', err: error })
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
  }
}

main()
