
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";
import { GatewayApiClient } from "@radixdlt/babylon-gateway-api-sdk";
import { LENDING_MARKET_COMPONENT } from "@weft-finance/ledger-state";

const sqs = new SQSClient({});
const gatewayApi = GatewayApiClient.initialize({
    basePath: process.env.RADIX_GATEWAY_URL,
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

    let body: unknown;
    try {
        body = JSON.parse(message.Body);
    } catch (e) {
        console.error("Invalid message body JSON; skipping message.", e);
        return;
    }

    const rawIds = Array.isArray((body as { cdpIds?: unknown }).cdpIds)
        ? (body as { cdpIds: unknown[] }).cdpIds
        : [(body as { cdpId?: unknown }).cdpId];
    const ids = rawIds.filter((id): id is string => typeof id === "string" && id.length > 0);

    if (ids.length === 0) return;
    if (ids.length !== rawIds.length) {
        console.error("Message contains invalid cdpIds entries; continuing with valid IDs only.");
    }

    const failures: string[] = [];
    for (const id of ids) {
        try {
            await liquidateCdp(id);
        } catch (e) {
            failures.push(id);
            console.error(`Failed to liquidate ${id} `, e);
        }
    }

    if (failures.length > 0) {
        throw new Error(`Failed to liquidate ${failures.length} CDPs`);
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
                    try {
                        await processMessage(msg);
                        // Only delete if successful
                        await sqs.send(new DeleteMessageCommand({
                            QueueUrl: QUEUE_URL,
                            ReceiptHandle: msg.ReceiptHandle
                        }));
                        console.log(`Processed and deleted message: ${msg.MessageId}`);
                    } catch (e) {
                        console.error(`Failed to process message ${msg.MessageId}. Letting it timeout back to queue. Error:`, e);
                    }
                }
            }
        } catch (error) {
            console.error("Error in Liquidator loop:", error);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

main();
