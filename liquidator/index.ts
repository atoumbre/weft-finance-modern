
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";
import { GatewayApiClient } from "@radixdlt/babylon-gateway-api-sdk";

// --- MOCKS ---
const LENDING_MARKET_COMPONENT = "component_rdx1cpy6putj5p7937clqgcgutza7k53zpha039n9u5hkk0ahh4stdmq4w";
const createBaseTransactionParams = () => ({
    start_epoch: 100,
    end_epoch: 110,
    nonce: Math.floor(Math.random() * 100000),
    signer_public_keys: [],
    flags: { use_free_storage: true } as any
});
// -------------

const sqs = new SQSClient({});
const gatewayApi = GatewayApiClient.initialize({
    basePath: "https://mainnet.radixdlt.com",
    applicationName: "Weft Liquidator"
});

const QUEUE_URL = process.env.LIQUIDATION_QUEUE_URL!;

async function liquidateCdp(cdpId: string) {
    console.log(`Attempting to liquidate CDP: ${cdpId} `);

    const manifest = `
        CALL_METHOD Address("${LENDING_MARKET_COMPONENT}") "liquidate" NonFungibleLocalId("${cdpId}");
`;

    // In a real implementation:
    // 1. Convert manifest to Intent
    // 2. Sign Intent with Private Key (from SEED_PHRASE)
    // 3. Submit Transaction

    // Here we just preview it to verify it *would* work or just log it.
    // For the sake of the infrastructure demo, we'll assume success.

    console.log("Transaction Manifest prepared:", manifest);
    console.log("Liquidation transaction submitted (MOCKED).");

    return true;
}

async function processMessage(message: any) {
    if (!message.Body) return;

    const body = JSON.parse(message.Body);
    const ids: string[] = body.cdpIds || [body.cdpId]; // Handle batch or single

    if (!ids || ids.length === 0) return;

    for (const id of ids) {
        try {
            await liquidateCdp(id);
        } catch (e) {
            console.error(`Failed to liquidate ${id} `, e);
        }
    }
}

async function main() {
    console.log("Liquidator Service Started");

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
            console.error("Error in Liquidator loop:", error);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

main();
