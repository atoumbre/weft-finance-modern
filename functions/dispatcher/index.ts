//
//

import { randomUUID } from "crypto";
import { SQSClient, SendMessageBatchCommand } from "@aws-sdk/client-sqs";
import { GatewayApiClient } from "@radixdlt/babylon-gateway-api-sdk";
import { WeftLedgerSateFetcher } from "@weft-finance/ledger-state";

type Logger = Pick<Console, "log" | "error">;
export type Fetcher = Pick<WeftLedgerSateFetcher, "getCdpIds">;

type LogLevel = "info" | "error";

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required env var: ${name}`);
    return value;
}

function toErrorFields(error: unknown) {
    if (error instanceof Error) {
        return {
            errorName: error.name,
            errorMessage: error.message,
            errorStack: error.stack
        };
    }

    return { errorMessage: String(error) };
}

function logEvent(logger: Logger, level: LogLevel, event: string, fields: Record<string, unknown>) {
    const payload = {
        level,
        service: "dispatcher",
        event,
        timestamp: new Date().toISOString(),
        ...fields
    };

    const line = JSON.stringify(payload);
    if (level === "error") {
        logger.error(line);
        return;
    }
    logger.log(line);
}




export function createDispatcherHandler(params: {
    sqs: Pick<SQSClient, "send">;
    fetcher: Fetcher;
    indexerQueueUrl: string;
    indexerBatchSize: number;
    logger?: Logger;
    runIdFactory?: () => string;
}) {
    const logger: Logger = params.logger ?? console;
    const indexerBatchSize = params.indexerBatchSize;
    const queueUrl = params.indexerQueueUrl;
    const runIdFactory = params.runIdFactory ?? (() => randomUUID());

    if (!queueUrl) throw new Error("Missing indexerQueueUrl");
    if (!Number.isInteger(indexerBatchSize) || indexerBatchSize <= 0) {
        throw new Error(`Invalid indexerBatchSize: ${indexerBatchSize}`);
    }

    async function sendBatch(entries: { Id: string; MessageBody: string }[], context: { runId: string; batchIndex: number; batchCount: number }) {
        logEvent(logger, "info", "dispatcher.sqs.batch.send", {
            runId: context.runId,
            batchIndex: context.batchIndex,
            batchCount: context.batchCount,
            messageCount: entries.length
        });

        const response = await params.sqs.send(new SendMessageBatchCommand({
            QueueUrl: queueUrl,
            Entries: entries
        }));

        const failed = response.Failed ?? [];
        if (failed.length === 0) {
            logEvent(logger, "info", "dispatcher.sqs.batch.sent", {
                runId: context.runId,
                batchIndex: context.batchIndex,
                batchCount: context.batchCount,
                messageCount: entries.length
            });
            return;
        }

        const entryById = new Map(entries.map(entry => [entry.Id, entry]));
        const senderFaults = failed.filter(item => item.SenderFault);
        if (senderFaults.length > 0) {
            logEvent(logger, "error", "dispatcher.sqs.batch.sender_faults", {
                runId: context.runId,
                batchIndex: context.batchIndex,
                batchCount: context.batchCount,
                senderFaultCount: senderFaults.length,
                senderFaultIds: senderFaults.map(item => item.Id)
            });
        }

        const reTriable = failed.filter(item => !item.SenderFault);
        if (reTriable.length === 0) return;

        const retryEntries = reTriable
            .map(item => entryById.get(item.Id!))
            .filter((entry): entry is { Id: string; MessageBody: string } => Boolean(entry));

        if (retryEntries.length === 0) {
            logEvent(logger, "error", "dispatcher.sqs.batch.retry_skipped", {
                runId: context.runId,
                batchIndex: context.batchIndex,
                batchCount: context.batchCount,
                reTriableCount: reTriable.length
            });
            return;
        }

        logEvent(logger, "info", "dispatcher.sqs.batch.retry", {
            runId: context.runId,
            batchIndex: context.batchIndex,
            batchCount: context.batchCount,
            messageCount: retryEntries.length
        });

        const retryResponse = await params.sqs.send(new SendMessageBatchCommand({
            QueueUrl: queueUrl,
            Entries: retryEntries
        }));

        const retryFailed = retryResponse.Failed ?? [];
        if (retryFailed.length > 0) {
            logEvent(logger, "error", "dispatcher.sqs.batch.retry_failed", {
                runId: context.runId,
                batchIndex: context.batchIndex,
                batchCount: context.batchCount,
                failedCount: retryFailed.length,
                failedIds: retryFailed.map(item => item.Id)
            });
            throw new Error(`Failed to send ${retryFailed.length} SQS messages after retry`);
        }

        logEvent(logger, "info", "dispatcher.sqs.batch.retry_sent", {
            runId: context.runId,
            batchIndex: context.batchIndex,
            batchCount: context.batchCount,
            messageCount: retryEntries.length
        });
    }


    //

    return async () => {
        const runId = runIdFactory();
        const startedAt = Date.now();

        logEvent(logger, "info", "dispatcher.start", {
            runId,
            indexerBatchSize,
            queueUrl
        });

        try {
            logEvent(logger, "info", "dispatcher.fetch.start", { runId });
            const items = await params.fetcher.getCdpIds(false);

            const ids = items.map(item => item.non_fungible_id);

            logEvent(logger, "info", "dispatcher.fetch.complete", {
                runId,
                cdpCount: ids.length,
                durationMs: Date.now() - startedAt
            });

            const chunks: string[][] = [];
            for (let i = 0; i < ids.length; i += indexerBatchSize) {
                chunks.push(ids.slice(i, i + indexerBatchSize));
            }

            logEvent(logger, "info", "dispatcher.batch.split", {
                runId,
                chunkCount: chunks.length,
                chunkSize: indexerBatchSize
            });

            const SQS_BATCH_LIMIT = 10;
            for (let i = 0; i < chunks.length; i += SQS_BATCH_LIMIT) {
                const batchOfChunks = chunks.slice(i, i + SQS_BATCH_LIMIT);
                const chunkCount = chunks.length;

                const entries = batchOfChunks.map((chunk, index) => ({
                    Id: `${i + index}`,
                    MessageBody: JSON.stringify({
                        runId,
                        chunkIndex: i + index + 1,
                        chunkCount,
                        cdpIds: chunk
                    })
                }));

                const batchIndex = Math.floor(i / SQS_BATCH_LIMIT) + 1;
                const batchCount = Math.ceil(chunks.length / SQS_BATCH_LIMIT);
                await sendBatch(entries, { runId, batchIndex, batchCount });
            }

            logEvent(logger, "info", "dispatcher.complete", {
                runId,
                cdpCount: ids.length,
                totalChunks: chunks.length,
                durationMs: Date.now() - startedAt
            });
            return { statusCode: 200, body: `Dispatched ${ids.length} CDPs` };

        } catch (error) {
            logEvent(logger, "error", "dispatcher.error", { runId, ...toErrorFields(error) });
            throw error;
        }
    };
};

let cachedDefaultHandler: (() => Promise<{ statusCode: number; body: string }>) | undefined;

function getDefaultHandler() {
    if (cachedDefaultHandler) return cachedDefaultHandler;

    const sqs = new SQSClient({});

    const gatewayApi = GatewayApiClient.initialize({
        basePath: requireEnv("RADIX_GATEWAY_URL"),
        applicationName: "Weft Dispatcher"
    });

    const fetcher = WeftLedgerSateFetcher.setInstance(gatewayApi);

    cachedDefaultHandler = createDispatcherHandler({
        sqs,
        fetcher,
        indexerQueueUrl: requireEnv("INDEXER_QUEUE_URL"),
        indexerBatchSize: Number.parseInt(requireEnv("INDEXER_BATCH_SIZE"), 10)
    });

    return cachedDefaultHandler;
}

export const handler = async () => getDefaultHandler()();
