import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { GatewayApiClient } from "@radixdlt/babylon-gateway-api-sdk";
import { WeftLedgerSateFetcher } from "@weft-finance/ledger-state";
import Decimal from "decimal.js";

// rarr

type Logger = Pick<Console, "log" | "error">;
export type Fetcher = Pick<WeftLedgerSateFetcher, "getMultipleCdp">;

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
        service: "indexer",
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

export function checkRisk(cdp: { liquidationLtv: Decimal }): boolean {
    return cdp.liquidationLtv.gte(1);
}

export function createMessageProcessor(params: {
    sqs: Pick<SQSClient, "send">;
    s3: Pick<S3Client, "send">;
    fetcher: Fetcher;
    liquidationQueueUrl: string;
    bucketName: string;
    logger?: Logger;
    now?: () => Date;
}) {
    const logger: Logger = params.logger ?? console;
    const now = params.now ?? (() => new Date());

    if (!params.liquidationQueueUrl) throw new Error("Missing liquidationQueueUrl");
    if (!params.bucketName) throw new Error("Missing bucketName");

    return async function processMessage(message: any) {
        if (!message?.Body) {
            logEvent(logger, "error", "indexer.message.missing_body", {
                messageId: message?.MessageId
            });
            return;
        }

        let body: unknown;
        try {
            body = JSON.parse(message.Body);
        } catch (error) {
            logEvent(logger, "error", "indexer.message.invalid_json", {
                messageId: message?.MessageId,
                bodyLength: typeof message.Body === "string" ? message.Body.length : undefined,
                ...toErrorFields(error)
            });
            return;
        }

        const rawIds = (body as { cdpIds?: unknown }).cdpIds;
        const rawRunId = (body as { runId?: unknown }).runId;
        const rawChunkIndex = (body as { chunkIndex?: unknown }).chunkIndex;
        const rawChunkCount = (body as { chunkCount?: unknown }).chunkCount;
        const runId = typeof rawRunId === "string" ? rawRunId : undefined;
        const chunkIndex = typeof rawChunkIndex === "number" ? rawChunkIndex : undefined;
        const chunkCount = typeof rawChunkCount === "number" ? rawChunkCount : undefined;
        const messageId = typeof message?.MessageId === "string" ? message.MessageId : undefined;

        if (!Array.isArray(rawIds)) {
            logEvent(logger, "error", "indexer.message.missing_cdp_ids", {
                messageId,
                runId
            });
            return;
        }

        const ids = rawIds.filter((id): id is string => typeof id === "string" && id.length > 0);
        if (ids.length === 0) return;
        if (ids.length !== rawIds.length) {
            logEvent(logger, "error", "indexer.message.invalid_cdp_ids", {
                messageId,
                runId,
                invalidCount: rawIds.length - ids.length
            });
        }

        try {
            logEvent(logger, "info", "indexer.message.received", {
                messageId,
                runId,
                chunkIndex,
                chunkCount,
                cdpCount: ids.length
            });

            const fetchStart = Date.now();
            logEvent(logger, "info", "indexer.fetch.start", {
                messageId,
                runId,
                cdpCount: ids.length
            });

            let totalFetched = 0

            const result = await params.fetcher.getMultipleCdp(ids, {
                cdpPerBatch: 10,
                onProgress: (fetched: number) => {

                    totalFetched += fetched

                    logEvent(logger, "info", "indexer.fetch.progress", {
                        messageId,
                        runId,
                        fetchedCount: fetched,
                        totalFetched,
                        total: ids.length
                    })
                }
            });

            if (result.failedIds?.length) {
                logEvent(logger, "error", "indexer.fetch.failed", {
                    messageId,
                    runId,
                    failedCount: result.failedIds.length,
                    failedIds: result.failedIds
                });
                throw new Error("Failed to fetch some CDPs");
            }

            const cdps = result.data;
            logEvent(logger, "info", "indexer.fetch.complete", {
                messageId,
                runId,
                fetchedCount: cdps.length,
                durationMs: Date.now() - fetchStart
            });

            const timestamp = now().getTime();
            const date = new Date(timestamp);
            const year = date.getUTCFullYear();
            const month = String(date.getUTCMonth() + 1).padStart(2, "0");
            const day = String(date.getUTCDate()).padStart(2, "0");

            const key = `cdp-data/${year}/${month}/${day}/cdp-batch-${timestamp}.json`;
            const bodyString = JSON.stringify(cdps);

            await params.s3.send(new PutObjectCommand({
                Bucket: params.bucketName,
                Key: key,
                Body: bodyString,
                ContentType: "application/json"
            }));
            logEvent(logger, "info", "indexer.s3.write", {
                messageId,
                runId,
                key,
                bytes: Buffer.byteLength(bodyString)
            });

            const atRiskCdps = (cdps as any[]).filter(checkRisk);

            if (atRiskCdps.length > 0) {
                logEvent(logger, "info", "indexer.at_risk.detected", {
                    messageId,
                    runId,
                    atRiskCount: atRiskCdps.length
                });

                await params.sqs.send(new SendMessageCommand({
                    QueueUrl: params.liquidationQueueUrl,
                    MessageBody: JSON.stringify({
                        cdpIds: atRiskCdps.map((c: any) => c.id),
                        reason: "High LTV",
                        runId
                    })
                }));

                logEvent(logger, "info", "indexer.liquidation.enqueued", {
                    messageId,
                    runId,
                    atRiskCount: atRiskCdps.length
                });
            }

        } catch (e) {
            logEvent(logger, "error", "indexer.message.error", {
                messageId,
                runId,
                ...toErrorFields(e)
            });
            throw e;
        }
    };
}

export function createIndexerWorker(params: {
    sqs: Pick<SQSClient, "send">;
    s3: Pick<S3Client, "send">;
    fetcher: Fetcher;
    queueUrl: string;
    liquidationQueueUrl: string;
    bucketName: string;
    logger?: Logger;
    now?: () => Date;
}) {
    const logger: Logger = params.logger ?? console;
    if (!params.queueUrl) throw new Error("Missing queueUrl");

    const processMessage = createMessageProcessor({
        sqs: params.sqs,
        s3: params.s3,
        fetcher: params.fetcher,
        liquidationQueueUrl: params.liquidationQueueUrl,
        bucketName: params.bucketName,
        logger,
        now: params.now
    });

    async function runOnce() {
        const { Messages } = await params.sqs.send(new ReceiveMessageCommand({
            QueueUrl: params.queueUrl,
            MaxNumberOfMessages: 1,
            WaitTimeSeconds: 20
        }));

        if (Messages) {
            for (const msg of Messages) {
                await processMessage(msg);
                if (msg.ReceiptHandle) {
                    await params.sqs.send(new DeleteMessageCommand({
                        QueueUrl: params.queueUrl,
                        ReceiptHandle: msg.ReceiptHandle
                    }));
                    logEvent(logger, "info", "indexer.message.deleted", {
                        messageId: msg.MessageId
                    });
                }
            }
        }
    }

    async function runForever() {
        logEvent(logger, "info", "indexer.start", { queueUrl: params.queueUrl });

        while (true) {
            try {
                await runOnce();
            } catch (error) {
                logEvent(logger, "error", "indexer.loop.error", toErrorFields(error));
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }

    return { processMessage, runOnce, runForever };
}

let cachedDefaultWorker: ReturnType<typeof createIndexerWorker> | undefined;

function getDefaultWorker() {
    if (cachedDefaultWorker) return cachedDefaultWorker;

    const sqs = new SQSClient({});
    const s3 = new S3Client({});
    const gatewayApi = GatewayApiClient.initialize({
        basePath: requireEnv("RADIX_GATEWAY_URL"),
        applicationName: "Weft Indexer"
    });

    const fetcher = WeftLedgerSateFetcher.setInstance(gatewayApi);

    cachedDefaultWorker = createIndexerWorker({
        sqs,
        s3,
        fetcher,
        queueUrl: requireEnv("QUEUE_URL"),
        liquidationQueueUrl: requireEnv("LIQUIDATION_QUEUE_URL"),
        bucketName: requireEnv("BUCKET_NAME")
    });

    return cachedDefaultWorker;
}

async function main() {
    await getDefaultWorker().runForever();
}

const isMain = typeof require !== "undefined" && require.main === module;
if (isMain) {
    void main();
}
