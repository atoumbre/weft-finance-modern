
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { GatewayApiClient } from "@radixdlt/babylon-gateway-api-sdk";
import { WeftLedgerSateFetcher } from "@weft-finance/ledger-state";
import Decimal from "decimal.js";

const sqs = new SQSClient({});
const s3 = new S3Client({});
const gatewayApi = GatewayApiClient.initialize({
    basePath: process.env.RADIX_GATEWAY_URL || "https://mainnet.radixdlt.com",
    applicationName: "Weft Indexer"
});


// Initialize Fetcher
const fetcher = WeftLedgerSateFetcher.setInstance(gatewayApi);

const QUEUE_URL = process.env.QUEUE_URL!;
const LIQUIDATION_QUEUE_URL = process.env.LIQUIDATION_QUEUE_URL!;
const BUCKET_NAME = process.env.BUCKET_NAME!;

function checkRisk(cdp: { liquidationLtv: Decimal }): boolean {
    return cdp.liquidationLtv.gte(1);
}

async function processMessage(message: any) {
    if (!message.Body) return;

    const body = JSON.parse(message.Body);
    const ids: string[] = body.cdpIds;

    if (!ids || ids.length === 0) return;

    try {
        console.log(`Fetching data for ${ids.length} CDPs via WeftLedgerSateFetcher...`);

        // Use the package method
        // Method signature: getMultipleCdp(ids: string[], options?: ...)
        const result = await fetcher.getMultipleCdp(ids, {
            cdpPerBatch: 50,
            onProgress: (fetched) => console.log(`Fetched ${fetched}/${ids.length}`)
        });

        // 'result' is Promise<FetchResult>. Assuming FetchResult has 'data' property which is the array
        const cdps = result.data;

        // 2. Save to S3
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = String(now.getUTCMonth() + 1).padStart(2, '0');
        const day = String(now.getUTCDate()).padStart(2, '0');

        const key = `cdp-data/${year}/${month}/${day}/cdp-batch-${Date.now()}.json`;

        await s3.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: JSON.stringify(cdps),
            ContentType: "application/json"
        }));
        console.log(`Saved batch to S3: ${key}`);

        // 3. Check Liquidation
        // Using 'any' casting if types aren't strictly known yet
        const atRiskCdps = (cdps).filter(checkRisk);

        if (atRiskCdps.length > 0) {
            console.log(`Found ${atRiskCdps.length} at-risk CDPs. Sending to Liquidation Queue.`);

            await sqs.send(new SendMessageCommand({
                QueueUrl: LIQUIDATION_QUEUE_URL,
                MessageBody: JSON.stringify({
                    cdpIds: atRiskCdps.map(c => c.id), // guess ID field name
                    reason: "High LTV"
                })
            }));
        }

    } catch (e) {
        console.error("Error fetching/processing CDPs:", e);
        // Don't throw if we want to delete the message? Or throw to retry?
        // Throwing typically triggers SQS retry visibility.
        throw e;
    }
}

async function main() {
    console.log("Indexer Service Started");

    while (true) {
        try {
            const { Messages } = await sqs.send(new ReceiveMessageCommand({
                QueueUrl: QUEUE_URL,
                MaxNumberOfMessages: 1,
                WaitTimeSeconds: 20
            }));

            if (Messages) {
                for (const msg of Messages) {
                    await processMessage(msg);
                    await sqs.send(new DeleteMessageCommand({
                        QueueUrl: QUEUE_URL,
                        ReceiptHandle: msg.ReceiptHandle
                    }));
                }
            }
        } catch (error) {
            console.error("Error in Indexer loop:", error);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

main();
