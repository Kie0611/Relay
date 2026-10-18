import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  DeliveryProcessingContext,
  DeliveryProcessingQueries,
} from "../../db/queries/delivery-processing";
import {
  createDeliveryProcessor,
  createWebhookSignature,
} from "../../worker/delivery-processor";
import { createDeliveryJobHandler } from "../../worker/delivery-worker";
import { createWebhookSender } from "../../worker/webhook-sender";

let server: Server | undefined;

afterEach(async () => {
  if (!server) {
    return;
  }

  await new Promise<void>((resolve) => {
    server?.close(() => resolve());
  });
  server = undefined;
});

async function startControllableEndpoint(
  onRequest: (input: {
    body: string;
    headers: Record<string, string | string[] | undefined>;
  }) => void,
): Promise<string> {
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    request.on("end", () => {
      onRequest({
        body: Buffer.concat(chunks).toString("utf8"),
        headers: request.headers,
      });
      response.writeHead(204).end();
    });
  });

  await new Promise<void>((resolve) => {
    server?.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}/webhook`;
}

describe("delivery smoke path", () => {
  it("claims a run, sends a signed webhook, and records delivery success", async () => {
    const received = vi.fn();
    const endpointUrl = await startControllableEndpoint(received);
    const signingSecret = "smoke-test-secret";
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const context: DeliveryProcessingContext = {
      deliveryRunId: randomUUID(),
      deliveryId: randomUUID(),
      attemptCount: 0,
      eventId: randomUUID(),
      createdAt,
      eventType: "user.created",
      payload: { userId: "smoke-user" },
      endpointId: randomUUID(),
      endpointUrl,
      signingSecret,
      endpointActive: true,
    };
    const attempt = {
      id: randomUUID(),
      attemptNumber: 1,
      startedAt: new Date("2026-01-01T00:00:01.000Z"),
    };
    const completeDeliveryAttempt = vi.fn<
      DeliveryProcessingQueries["completeDeliveryAttempt"]
    >(async () => undefined);
    const processingQueries: DeliveryProcessingQueries = {
      findDeliveryContext: vi.fn(async () => context),
      startDeliveryAttempt: vi.fn(async () => attempt),
      completeDeliveryAttempt,
    };
    const processRun = createDeliveryProcessor({
      queries: processingQueries,
      sendWebhook: createWebhookSender({ timeoutMs: 2_000 }),
      retryPolicy: {
        maxAttempts: 3,
        getDelayMs: () => 1_000,
      },
      now: () => 1_000,
    });
    const claimedRun = {
      id: context.deliveryRunId,
      deliveryId: context.deliveryId,
      attemptCount: 0,
      leaseOwner: "smoke-worker",
      leaseExpiresAt: new Date("2026-01-01T00:01:00.000Z"),
    };
    const claimDeliveryRun = vi.fn(async () => claimedRun);
    const handleDeliveryJob = createDeliveryJobHandler({
      queries: { claimDeliveryRun },
      workerId: "smoke-worker",
      leaseDurationMs: 30_000,
      processRun,
    });

    const result = await handleDeliveryJob({
      deliveryRunId: context.deliveryRunId,
    });

    const receivedRequest = received.mock.calls[0]?.[0];
    const expectedSignature = createWebhookSignature(
      receivedRequest.body,
      signingSecret,
    );

    expect(result).toEqual({ kind: "processed" });
    expect(claimDeliveryRun).toHaveBeenCalledOnce();
    expect(receivedRequest.body).toContain(context.eventId);
    expect(receivedRequest.headers["x-relay-signature"]).toBe(
      `sha256=${expectedSignature}`,
    );
    expect(completeDeliveryAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: attempt.id,
        deliveryRunId: context.deliveryRunId,
        status: "delivered",
        responseStatus: 204,
        errorCode: null,
      }),
    );
  });
});
