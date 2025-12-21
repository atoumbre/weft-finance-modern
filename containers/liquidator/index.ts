
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";
import { GatewayApiClient } from "@radixdlt/babylon-gateway-api-sdk";
import { LENDING_MARKET_COMPONENT } from "@weft-finance/ledger-state";

const sqs = new SQSClient({});
const gatewayApi = GatewayApiClient.initialize({
    basePath: process.env.RADIX_GATEWAY_URL,
    applicationName: "Weft Liquidator"
});

//

const QUEUE_URL = process.env.LIQUIDATION_QUEUE_URL!;

type LogLevel = "info" | "error";

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

function logEvent(level: LogLevel, event: string, fields: Record<string, unknown>) {
    const payload = {
        level,
        service: "liquidator",
        event,
        timestamp: new Date().toISOString(),
        ...fields
    };

    const line = JSON.stringify(payload);
    if (level === "error") {
        console.error(line);
        return;
    }
    console.log(line);
}



async function liquidateCdp(cdpId: string, context: { runId?: string; messageId?: string }) {
    logEvent("info", "liquidator.cdp.start", {
        ...context,
        cdpId
    });

    const manifest = `
        CALL_METHOD Address("${LENDING_MARKET_COMPONENT}") "liquidate" NonFungibleLocalId("${cdpId}");
`;

    // In a real implementation:
    // 1. Convert manifest to Intent
    // 2. Sign Intent with Private Key (from SEED_PHRASE)
    // 3. Submit Transaction

    // Here we just preview it to verify it *would* work or just log it.
    // For the sake of the infrastructure demo, we'll assume success.

    logEvent("info", "liquidator.cdp.mock_prepared", {
        ...context,
        cdpId,
        manifestLength: manifest.length
    });
    logEvent("info", "liquidator.cdp.mock_submitted", {
        ...context,
        cdpId
    });

    return true;
}

async function processMessage(message: any) {
    if (!message.Body) return;

    let body: unknown;
    try {
        body = JSON.parse(message.Body);
    } catch (e) {
        logEvent("error", "liquidator.message.invalid_json", {
            messageId: message?.MessageId,
            bodyLength: typeof message.Body === "string" ? message.Body.length : undefined,
            ...toErrorFields(e)
        });
        return;
    }

    const rawRunId = (body as { runId?: unknown }).runId;
    const runId = typeof rawRunId === "string" ? rawRunId : undefined;
    const messageId = typeof message?.MessageId === "string" ? message.MessageId : undefined;
    const rawIds = Array.isArray((body as { cdpIds?: unknown }).cdpIds)
        ? (body as { cdpIds: unknown[] }).cdpIds
        : [(body as { cdpId?: unknown }).cdpId];
    const ids = rawIds.filter((id): id is string => typeof id === "string" && id.length > 0);

    if (ids.length === 0) return;
    if (ids.length !== rawIds.length) {
        logEvent("error", "liquidator.message.invalid_cdp_ids", {
            messageId,
            runId,
            invalidCount: rawIds.length - ids.length
        });
    }

    logEvent("info", "liquidator.message.received", {
        messageId,
        runId,
        cdpCount: ids.length
    });

    const failures: string[] = [];
    for (const id of ids) {
        try {
            await liquidateCdp(id, { runId, messageId });
        } catch (e) {
            failures.push(id);
            logEvent("error", "liquidator.cdp.failed", {
                messageId,
                runId,
                cdpId: id,
                ...toErrorFields(e)
            });
        }
    }

    if (failures.length > 0) {
        throw new Error(`Failed to liquidate ${failures.length} CDPs`);
    }

    logEvent("info", "liquidator.message.completed", {
        messageId,
        runId,
        cdpCount: ids.length
    });
}

async function main() {
    logEvent("info", "liquidator.start", { queueUrl: QUEUE_URL });

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
                        logEvent("info", "liquidator.message.deleted", {
                            messageId: msg.MessageId
                        });
                    } catch (e) {
                        logEvent("error", "liquidator.message.failed", {
                            messageId: msg.MessageId,
                            ...toErrorFields(e)
                        });
                    }
                }
            }
        } catch (error) {
            logEvent("error", "liquidator.loop.error", toErrorFields(error));
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

main();
