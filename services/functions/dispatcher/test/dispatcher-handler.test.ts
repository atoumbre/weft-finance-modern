/// <reference types="bun-types" />
import { expect, test } from "bun:test";
import { createDispatcherHandler, Fetcher } from "../index";

function makeIds(count: number) {
  return Array.from({ length: count }, (_, i) => `cdp-${i}`);
}

//

test("dispatches IDs in chunk-sized messages", async () => {
  const sent: any[] = [];
  const sqs = {
    send: async (command: any) => {
      sent.push(command);
      return {};
    },
  };

  const ids = makeIds(25);
  const fetcher = {
    getCdpIds: async () => ids.map((non_fungible_id) => ({ non_fungible_id })),
  } as Fetcher;

  const handler = createDispatcherHandler({
    sqs,
    fetcher,
    indexerQueueUrl: "https://example.com/indexer-queue",
    indexerBatchSize: 10,
    logger: { info: () => { }, error: () => { } },
    runIdFactory: () => "run-123",
  });

  const result = await handler();
  expect(result.statusCode).toBe(200);
  expect(result.body).toBe("Dispatched 25 CDPs");

  expect(sent.length).toBe(1);
  const cmd = sent[0];
  expect(cmd.input.QueueUrl).toBe("https://example.com/indexer-queue");
  expect(cmd.input.Entries.length).toBe(3);

  const bodies = cmd.input.Entries.map((e: any) => JSON.parse(e.MessageBody));
  expect(bodies[0].cdpIds).toEqual(ids.slice(0, 10));
  expect(bodies[1].cdpIds).toEqual(ids.slice(10, 20));
  expect(bodies[2].cdpIds).toEqual(ids.slice(20, 25));
  expect(bodies.every((body: any) => body.runId === "run-123")).toBe(true);

  expect(cmd.input.Entries.map((e: any) => e.Id)).toEqual(["0", "1", "2"]);
});

test("sends multiple SQS batches when there are >10 chunks", async () => {
  const sent: any[] = [];
  const sqs = {
    send: async (command: any) => {
      sent.push(command);
      return {};
    },
  };

  const ids = makeIds(105); // 21 chunks of 5
  const fetcher = {
    getCdpIds: async () => ids.map((non_fungible_id) => ({ non_fungible_id })),
  } as Fetcher;

  const handler = createDispatcherHandler({
    sqs,
    fetcher,
    indexerQueueUrl: "https://example.com/indexer-queue",
    indexerBatchSize: 5,
    logger: { info: () => { }, error: () => { } },
  });

  await handler();

  expect(sent.length).toBe(3);
  expect(sent[0].input.Entries.length).toBe(10);
  expect(sent[1].input.Entries.length).toBe(10);
  expect(sent[2].input.Entries.length).toBe(1);

  expect(sent[0].input.Entries.map((e: any) => e.Id)).toEqual([
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
  ]);
  expect(sent[1].input.Entries.map((e: any) => e.Id)).toEqual([
    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
    "16",
    "17",
    "18",
    "19",
  ]);
  expect(sent[2].input.Entries.map((e: any) => e.Id)).toEqual(["20"]);
});

test("rejects invalid batch sizes", () => {
  expect(() =>
    createDispatcherHandler({
      sqs: { send: async () => ({}) },
      fetcher: { getCdpIds: async () => [] },
      indexerQueueUrl: "https://example.com/indexer-queue",
      indexerBatchSize: 0,
    })
  ).toThrow(/Invalid indexerBatchSize/);
});

test("propagates fetcher failures", async () => {
  const sqs = { send: async () => ({}) };
  const fetcher = {
    getCdpIds: async () => {
      throw new Error("boom");
    },
  };

  const handler = createDispatcherHandler({
    sqs,
    fetcher,
    indexerQueueUrl: "https://example.com/indexer-queue",
    indexerBatchSize: 10,
    logger: { info: () => { }, error: () => { } },
  });

  await expect(handler()).rejects.toThrow("boom");
});
