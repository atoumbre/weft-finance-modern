
import { SQSClient, SendMessageBatchCommand } from "@aws-sdk/client-sqs";
import { GatewayApiClient } from "@radixdlt/babylon-gateway-api-sdk";
import { WeftLedgerSateFetcher } from "@weft-finance/ledger-state";

type Logger = Pick<Console, "log" | "error">;
export type Fetcher = Pick<WeftLedgerSateFetcher, "getCdpIds">;

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required env var: ${name}`);
    return value;
}

export function createDispatcherHandler(params: {
    sqs: Pick<SQSClient, "send">;
    fetcher: Fetcher;
    indexerQueueUrl: string;
    indexerBatchSize: number;
    logger?: Logger;
}) {
    const logger: Logger = params.logger ?? console;
    const indexerBatchSize = params.indexerBatchSize;
    const queueUrl = params.indexerQueueUrl;

    if (!queueUrl) throw new Error("Missing indexerQueueUrl");
    if (!Number.isInteger(indexerBatchSize) || indexerBatchSize <= 0) {
        throw new Error(`Invalid indexerBatchSize: ${indexerBatchSize}`);
    }

    async function sendBatch(entries: { Id: string; MessageBody: string }[]) {
        const response = await params.sqs.send(new SendMessageBatchCommand({
            QueueUrl: queueUrl,
            Entries: entries
        }));

        const failed = response.Failed ?? [];
        if (failed.length === 0) return;

        const entryById = new Map(entries.map(entry => [entry.Id, entry]));
        const senderFaults = failed.filter(item => item.SenderFault);
        if (senderFaults.length > 0) {
            logger.error(`SQS batch had ${senderFaults.length} sender faults.`, senderFaults);
        }

        const retriable = failed.filter(item => !item.SenderFault);
        if (retriable.length === 0) return;

        const retryEntries = retriable
            .map(item => entryById.get(item.Id!))
            .filter((entry): entry is { Id: string; MessageBody: string } => Boolean(entry));

        if (retryEntries.length === 0) {
            logger.error("SQS batch retry skipped; retryable entries not found.");
            return;
        }

        const retryResponse = await params.sqs.send(new SendMessageBatchCommand({
            QueueUrl: queueUrl,
            Entries: retryEntries
        }));

        const retryFailed = retryResponse.Failed ?? [];
        if (retryFailed.length > 0) {
            logger.error(`SQS batch retry failed for ${retryFailed.length} entries.`, retryFailed);
            throw new Error(`Failed to send ${retryFailed.length} SQS messages after retry`);
        }
    }

    return async () => {
        logger.log("Dispatcher started");

        try {
            logger.log("Fetching CDP IDs ...");
            const items = await params.fetcher.getCdpIds(false);

            const ids = items.map(item => item.non_fungible_id);

            logger.log(`Found ${ids.length} active CDPs. Dispatching to SQS...`);

            const chunks: string[][] = [];
            for (let i = 0; i < ids.length; i += indexerBatchSize) {
                chunks.push(ids.slice(i, i + indexerBatchSize));
            }

            logger.log(`Split into ${chunks.length} processing batches (Batch Size: ${indexerBatchSize})`);

            const SQS_BATCH_LIMIT = 10;
            for (let i = 0; i < chunks.length; i += SQS_BATCH_LIMIT) {
                const batchOfChunks = chunks.slice(i, i + SQS_BATCH_LIMIT);

                const entries = batchOfChunks.map((chunk, index) => ({
                    Id: `${i + index}`,
                    MessageBody: JSON.stringify({ cdpIds: chunk })
                }));

                await sendBatch(entries);

                logger.log(`Dispatched SQS batch ${i / SQS_BATCH_LIMIT + 1}/${Math.ceil(chunks.length / SQS_BATCH_LIMIT)}`);
            }

            logger.log("Dispatch complete.");
            return { statusCode: 200, body: `Dispatched ${ids.length} CDPs` };

        } catch (error) {
            logger.error("Error in dispatcher:", error);
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
