import type { SQSHandler, SQSRecord } from 'aws-lambda'
import { liquidateCdp } from '@local-packages/cdp-liquidator'
import { createLogger } from '@local-packages/common-utils'

// Initialize logger outside the handler to reuse it across warm invocations
const logger = createLogger({ service: 'liquidator-lambda' })

/**
 * Business logic to process ONE SQS message (which may contain multiple CDP IDs).
 * throws an error if any CDP in this message fails, triggering a retry for this message.
 */
async function processRecord(record: SQSRecord, baseLogger: typeof logger) {
  const messageId = record.messageId
  if (!record.body)
    return

  let body: any
  try {
    body = JSON.parse(record.body)
  }
  catch (e) {
    // If JSON is invalid, we log error but DO NOT throw.
    // We cannot "fix" bad JSON by retrying, so we let it succeed (consume the message) to remove it from the queue.
    baseLogger.error({
      event: 'liquidator.message.invalid_json',
      messageId,
      bodyLength: record.body.length,
      err: e,
    })
    return
  }

  const runId = typeof body.runId === 'string' ? body.runId : undefined
  const rawIds = Array.isArray(body.cdpIds) ? body.cdpIds : (body.cdpId ? [body.cdpId] : [])
  const ids = rawIds.filter((id: any): id is string => typeof id === 'string' && id.length > 0)

 
  if (ids.length === 0)
    return
  
 // Contextual logger for this specific message
  const localLogger = baseLogger.child({ runId, messageId })

  if (ids.length !== rawIds.length) {
    localLogger.warn({
      event: 'liquidator.message.invalid_cdp_ids',
      invalidCount: rawIds.length - ids.length,
    })
  }

  localLogger.info({ event: 'liquidator.message.received', cdpCount: ids.length })

  const failures: string[] = []

  // Execute liquidations sequentially (or parallel if safe) for this message
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

  // If ANY CDP in this message failed, we throw.
  // This tells the Handler to mark this specific SQS Message as "Failed".
  if (failures.length > 0) {
    throw new Error(`Failed to liquidate ${failures.length} CDPs: ${failures.join(', ')}`)
  }

  localLogger.info({ event: 'liquidator.message.completed', cdpCount: ids.length })
}

export const handler: SQSHandler = async (event) => {
  const batchItemFailures: { itemIdentifier: string }[] = []

  // Process all records in the batch (Lambda batch size is usually 10)
  const promises = event.Records.map(async (record) => {
    try {
      await processRecord(record, logger)
    }
    catch (error) {
      // If processing failed (e.g. network error, logic error),
      // mark this SPECIFIC message ID as failed.
      logger.error({
        event: 'liquidator.handler.record_failed',
        messageId: record.messageId,
        err: error,
      })
      batchItemFailures.push({ itemIdentifier: record.messageId })
    }
  })

  // Wait for all processing to finish
  await Promise.all(promises)

  // Return list of failed messages to SQS so it only retries those
  return { batchItemFailures }
}
