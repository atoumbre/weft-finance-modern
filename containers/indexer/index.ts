import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { GatewayApiClient } from "@radixdlt/babylon-gateway-api-sdk";
import { WeftLedgerSateFetcher } from "@weft-finance/ledger-state";
import Decimal from "decimal.js";

type Logger = Pick<Console, "log" | "error">;
export type Fetcher = Pick<WeftLedgerSateFetcher, "getMultipleCdp">;

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required env var: ${name}`);
    return value;
}

//

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
        if (!message?.Body) return;

        let body: unknown;
        try {
            body = JSON.parse(message.Body);
        } catch (error) {
            logger.error("Invalid message body JSON; skipping message.", error);
            return;
        }

        const rawIds = (body as { cdpIds?: unknown }).cdpIds;
        if (!Array.isArray(rawIds)) {
            logger.error("Message missing cdpIds array; skipping message.");
            return;
        }

        const ids = rawIds.filter((id): id is string => typeof id === "string" && id.length > 0);
        if (ids.length === 0) return;
        if (ids.length !== rawIds.length) {
            logger.error("Message contains invalid cdpIds entries; continuing with valid IDs only.");
        }

        try {
            logger.log(`Fetching data for ${ids.length} CDPs via WeftLedgerSateFetcher...`);

            const result = await params.fetcher.getMultipleCdp(ids, {
                cdpPerBatch: 50,
                onProgress: (fetched: number) => logger.log(`Fetched ${fetched}/${ids.length}`)
            });

            if (result.failedIds?.length) {
                logger.error(`Failed to fetch ${result.failedIds.length} CDPs; retrying message.`, result.failedIds);
                throw new Error("Failed to fetch some CDPs");
            }

            const cdps = result.data;

            const timestamp = now().getTime();
            const date = new Date(timestamp);
            const year = date.getUTCFullYear();
            const month = String(date.getUTCMonth() + 1).padStart(2, "0");
            const day = String(date.getUTCDate()).padStart(2, "0");

            const key = `cdp-data/${year}/${month}/${day}/cdp-batch-${timestamp}.json`;

            await params.s3.send(new PutObjectCommand({
                Bucket: params.bucketName,
                Key: key,
                Body: JSON.stringify(cdps),
                ContentType: "application/json"
            }));
            logger.log(`Saved batch to S3: ${key}`);

            const atRiskCdps = (cdps as any[]).filter(checkRisk);

            if (atRiskCdps.length > 0) {
                logger.log(`Found ${atRiskCdps.length} at-risk CDPs. Sending to Liquidation Queue.`);

                await params.sqs.send(new SendMessageCommand({
                    QueueUrl: params.liquidationQueueUrl,
                    MessageBody: JSON.stringify({
                        cdpIds: atRiskCdps.map((c: any) => c.id),
                        reason: "High LTV"
                    })
                }));
            }

        } catch (e) {
            logger.error("Error fetching/processing CDPs:", e);
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
                }
            }
        }
    }

    async function runForever() {
        logger.log("Indexer Service Started");

        while (true) {
            try {
                await runOnce();
            } catch (error) {
                logger.error("Error in Indexer loop:", error);
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
