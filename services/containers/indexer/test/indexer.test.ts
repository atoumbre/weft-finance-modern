import type { CollateralizeDebtPositionData } from '@weft-finance/ledger-state'
import type { Fetcher } from '../src/index'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand } from '@aws-sdk/client-sqs'
/// <reference types="bun-types" />
import { expect, test } from 'bun:test'
import Decimal from 'decimal.js'
import { checkRisk, createIndexerWorker, createMessageProcessor } from '../src/index'

const silentLogger = {
  info: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
  child: () => silentLogger,
}

//

test('checkRisk returns true when liquidationLtv >= 1', () => {
  expect(checkRisk({ liquidationLtv: new Decimal(1) })).toBe(true)
  expect(checkRisk({ liquidationLtv: new Decimal('1.0001') })).toBe(true)
  expect(checkRisk({ liquidationLtv: new Decimal('0.9999') })).toBe(false)
})

test('message processor ignores messages with missing Body', async () => {
  const sqsCalls: unknown[] = []
  const s3Calls: unknown[] = []
  const fetcherCalls: unknown[] = []

  const fetcher: Fetcher = {
    getMultipleCdp: async (ids: string[], options?: unknown) => {
      fetcherCalls.push([ids, options])
      return { data: [], failedIds: [] }
    },
  }

  const processMessage = createMessageProcessor({
    sqs: { send: async (cmd: unknown) => (sqsCalls.push(cmd)) },
    s3: { send: async (cmd: unknown) => (s3Calls.push(cmd)) },
    fetcher,
    liquidationQueueUrl: 'liq-queue',
    bucketName: 'bucket',
    logger: silentLogger,
  })

  await processMessage({})

  expect(fetcherCalls.length).toBe(0)
  expect(s3Calls.length).toBe(0)
  expect(sqsCalls.length).toBe(0)
})

test('message processor ignores messages with empty cdpIds', async () => {
  const fetcherCalls: unknown[] = []

  const fetcher: Fetcher = {
    getMultipleCdp: async (ids: string[], options?: unknown) => {
      fetcherCalls.push([ids, options])
      return { data: [], failedIds: [] }
    },
  }

  const processMessage = createMessageProcessor({
    sqs: { send: async () => ({}) },
    s3: { send: async () => ({}) },
    fetcher,
    liquidationQueueUrl: 'liq-queue',
    bucketName: 'bucket',
    logger: silentLogger,
  })

  await processMessage({ Body: JSON.stringify({ cdpIds: [] }) })
  expect(fetcherCalls.length).toBe(0)
})

test('message processor saves CDPs to S3 and does not enqueue liquidation when none are at-risk', async () => {
  const sqsCalls: unknown[] = []
  const s3Calls: unknown[] = []

  const cdps = [
    { id: 'a', liquidationLtv: new Decimal('0.5') },
    { id: 'b', liquidationLtv: new Decimal('0.99') },
  ] as CollateralizeDebtPositionData[]

  const processMessage = createMessageProcessor({
    sqs: { send: async (cmd: unknown) => (sqsCalls.push(cmd)) },
    s3: { send: async (cmd: unknown) => (s3Calls.push(cmd)) },
    fetcher: { getMultipleCdp: async () => ({ data: cdps, failedIds: [] }) },
    liquidationQueueUrl: 'liq-queue',
    bucketName: 'bucket',
    logger: silentLogger,
    now: () => new Date(Date.UTC(2025, 0, 2, 3, 4, 5)),
  })

  await processMessage({ Body: JSON.stringify({ cdpIds: ['x', 'y'] }) })

  expect(s3Calls.length).toBe(1)
  const putCmd = s3Calls[0] as PutObjectCommand
  expect(putCmd).toBeInstanceOf(PutObjectCommand)
  expect(putCmd.input.Bucket).toBe('bucket')
  expect(putCmd.input.Key).toBe(`cdp-data/2025/01/02/cdp-batch-${Date.UTC(2025, 0, 2, 3, 4, 5)}.json`)
  expect(putCmd.input.ContentType).toBe('application/json')
  expect(putCmd.input.Body).toBe(JSON.stringify(cdps))

  const sendMessageCalls = sqsCalls.filter((c): c is SendMessageCommand => c instanceof SendMessageCommand)
  expect(sendMessageCalls.length).toBe(0)
})

test('message processor enqueues liquidation when there are at-risk CDPs', async () => {
  const sqsCalls: unknown[] = []
  const s3Calls: unknown[] = []

  const cdps = [
    { id: 'safe', liquidationLtv: new Decimal('0.75') },
    { id: 'risk', liquidationLtv: new Decimal('1.0') },
    { id: 'risk2', liquidationLtv: new Decimal('1.5') },
  ] as CollateralizeDebtPositionData[]

  const processMessage = createMessageProcessor({
    sqs: { send: async (cmd: unknown) => (sqsCalls.push(cmd)) },
    s3: { send: async (cmd: unknown) => (s3Calls.push(cmd)) },
    fetcher: { getMultipleCdp: async () => ({ data: cdps, failedIds: [] }) },
    liquidationQueueUrl: 'liq-queue',
    bucketName: 'bucket',
    logger: silentLogger,
    now: () => new Date(Date.UTC(2025, 5, 1, 0, 0, 0)),
  })

  await processMessage({ Body: JSON.stringify({ cdpIds: ['id1'] }) })

  expect(s3Calls.length).toBe(1)
  const sendMessageCalls = sqsCalls.filter((c): c is SendMessageCommand => c instanceof SendMessageCommand)
  expect(sendMessageCalls.length).toBe(1)
  expect(sendMessageCalls[0].input.QueueUrl).toBe('liq-queue')

  const payload = JSON.parse(sendMessageCalls[0].input.MessageBody!)
  expect(payload.reason).toBe('High LTV')
  expect(payload.cdpIds).toEqual(['risk', 'risk2'])
})

test('indexer worker runOnce deletes messages after processing', async () => {
  const sqsCalls: unknown[] = []
  const s3Calls: unknown[] = []
  const fetcherCalls: unknown[] = []

  const fetcher: Fetcher = {
    getMultipleCdp: async (ids: string[], options?: unknown) => {
      fetcherCalls.push([ids, options])
      return { data: [], failedIds: [] }
    },
  }

  const worker = createIndexerWorker({
    sqs: {
      send: async (cmd: unknown) => {
        sqsCalls.push(cmd)
        if (cmd instanceof ReceiveMessageCommand) {
          return { Messages: [{ Body: JSON.stringify({ cdpIds: ['a'] }), ReceiptHandle: 'rh-1' }] }
        }
        return {}
      },
    },
    s3: { send: async (cmd: unknown) => (s3Calls.push(cmd)) },
    fetcher,
    queueUrl: 'work-queue',
    liquidationQueueUrl: 'liq-queue',
    bucketName: 'bucket',
    logger: silentLogger,
    now: () => new Date(Date.UTC(2025, 0, 1, 0, 0, 0)),
  })

  await worker.runOnce()

  expect(sqsCalls.some(c => c instanceof ReceiveMessageCommand)).toBe(true)
  expect(sqsCalls.some(c => c instanceof DeleteMessageCommand)).toBe(true)
  const deleteCmd = sqsCalls.find((c): c is DeleteMessageCommand => c instanceof DeleteMessageCommand)
  expect(deleteCmd?.input.QueueUrl).toBe('work-queue')
  expect(deleteCmd?.input.ReceiptHandle).toBe('rh-1')

  expect(fetcherCalls.length).toBe(1)
  expect(s3Calls.length).toBe(1)
})
