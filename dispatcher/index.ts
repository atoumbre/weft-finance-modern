
import { SQSClient, SendMessageBatchCommand } from "@aws-sdk/client-sqs";
import { GatewayApiClient } from "@radixdlt/babylon-gateway-api-sdk";
import { WeftLedgerSateFetcher } from "@weft-finance/ledger-state";


// --- MOCKS FOR MISSING DEPENDENCIES or CONFIG ---
// Assuming WeftLedgerSateFetcher internalizes the resource logic or we pass it
// For the purpose of getting IDs, the fetcher likely knows the resource or configured via constructor
// If not, we might need to pass it, but the interface 'getCdpIds(returnBurntTokens)' takes no resource arg.
// -------------------------------------

const sqs = new SQSClient({});
const INDEXER_QUEUE_URL = process.env.INDEXER_QUEUE_URL!;

// Initialize Gateway API
const gatewayApi = GatewayApiClient.initialize({
    basePath: "https://mainnet.radixdlt.com",
    applicationName: "Weft Dispatcher"
});

// Initialize Fetcher
const fetcher = WeftLedgerSateFetcher.setInstance(gatewayApi);

export const handler = async (event: any) => {
    console.log("Dispatcher started");

    try {
        console.log("Fetching CDP IDs via WeftLedgerSateFetcher...");
        // Fetch items using the package
        const items = await fetcher.getCdpIds(false);

        // Extract just the IDs
        const ids = items.map(item => item.non_fungible_id);

        console.log(`Found ${ids.length} active CDPs. Dispatching to SQS...`);

        const INDEXER_BATCH_SIZE = parseInt(process.env.INDEXER_BATCH_SIZE || "1000"); // User change preserved

        // Chunk the IDs
        const chunks = [];
        for (let i = 0; i < ids.length; i += INDEXER_BATCH_SIZE) {
            chunks.push(ids.slice(i, i + INDEXER_BATCH_SIZE));
        }

        console.log(`Split into ${chunks.length} processing batches (Batch Size: ${INDEXER_BATCH_SIZE})`);

        // Send to SQS in batches of 10 SQS messages to optimize API calls
        const SQS_BATCH_LIMIT = 10;
        for (let i = 0; i < chunks.length; i += SQS_BATCH_LIMIT) {
            const batchOfChunks = chunks.slice(i, i + SQS_BATCH_LIMIT);

            const entries = batchOfChunks.map((chunk, index) => ({
                Id: `${i + index}`,
                MessageBody: JSON.stringify({ cdpIds: chunk })
            }));

            await sqs.send(new SendMessageBatchCommand({
                QueueUrl: INDEXER_QUEUE_URL,
                Entries: entries
            }));

            console.log(`Dispatched SQS batch ${i / SQS_BATCH_LIMIT + 1}/${Math.ceil(chunks.length / SQS_BATCH_LIMIT)}`);
        }

        console.log("Dispatch complete.");
        return { statusCode: 200, body: `Dispatched ${ids.length} CDPs` };

    } catch (error) {
        console.error("Error in dispatcher:", error);
        throw error;
    }
};
