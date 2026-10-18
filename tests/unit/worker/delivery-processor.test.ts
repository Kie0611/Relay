import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ClaimedDeliveryRun } from "../../../db/queries/delivery-runs";
import type {
  DeliveryProcessingContext,
  DeliveryProcessingQueries,
  StartedDeliveryAttempt,
} from "../../../db/queries/delivery-processing";
import {
  buildWebhookRequest,
  createDeliveryProcessor,
  type DeliveryRetryPolicy,
  type WebhookSender,
} from "../../../worker/delivery-processor";

const deliveryRunId = "11111111-1111-4111-8111-111111111111";
const deliveryId = "22222222-2222-4222-8222-222222222222";
const eventId = "33333333-3333-4333-8333-333333333333";
const endpointId = "44444444-4444-4444-8444-444444444444";
const attemptId = "55555555-5555-4555-8555-555555555555";

const claimedRun: ClaimedDeliveryRun = {
  id: deliveryRunId,
  deliveryId,
  attemptCount: 0,
  leaseOwner: "worker-1",
  leaseExpiresAt: new Date("2026-10-18T12:00:30.000Z"),
};

const deliveryContext: DeliveryProcessingContext = {
  deliveryRunId,
  deliveryId,
  attemptCount: 0,
  eventId,
  createdAt: new Date("2026-10-18T12:00:00.000Z"),
  eventType: "user.created",
  payload: {
    userId: "user-1",
  },
  endpointId,
  endpointUrl: "https://example.com/webhooks",
  signingSecret: "test-signing-secret",
  endpointActive: true,
};

function createQueryMocks(input?: {
  context?: DeliveryProcessingContext | null;
  attemptNumber?: number;
}) {
  const startedAttempt: StartedDeliveryAttempt = {
    id: attemptId,
    attemptNumber: input?.attemptNumber ?? 1,
    startedAt: new Date("2026-10-18T12:00:01.000Z"),
  };

  const findDeliveryContext = vi.fn<
    DeliveryProcessingQueries["findDeliveryContext"]
  >(async () => input?.context === undefined
    ? deliveryContext
    : input.context);

  const startDeliveryAttempt = vi.fn<
    DeliveryProcessingQueries["startDeliveryAttempt"]
  >(async () => startedAttempt);

  const completeDeliveryAttempt = vi.fn<
    DeliveryProcessingQueries["completeDeliveryAttempt"]
  >(async () => undefined);

  const queries: DeliveryProcessingQueries = {
    findDeliveryContext,
    startDeliveryAttempt,
    completeDeliveryAttempt,
  };

  return {
    queries,
    findDeliveryContext,
    startDeliveryAttempt,
    completeDeliveryAttempt,
  };
}

function createRetryPolicy() {
  const getDelayMs = vi.fn<(attemptNumber: number) => number>(
    () => 5_000,
  );

  const retryPolicy: DeliveryRetryPolicy = {
    maxAttempts: 3,
    getDelayMs,
  };

  return { retryPolicy, getDelayMs };
}

function createProcessorHarness(input?: {
  context?: DeliveryProcessingContext | null;
  attemptNumber?: number;
}) {
  const queryMocks = createQueryMocks(input);
  const sendWebhook = vi.fn<WebhookSender>(async () => ({
    status: 204,
  }));
  const { retryPolicy, getDelayMs } = createRetryPolicy();
  const now = vi
    .fn<() => number>()
    .mockReturnValueOnce(1_000)
    .mockReturnValueOnce(1_250);

  const processDeliveryRun = createDeliveryProcessor({
    queries: queryMocks.queries,
    sendWebhook,
    retryPolicy,
    now,
  });

  return {
    ...queryMocks,
    sendWebhook,
    getDelayMs,
    processDeliveryRun,
  };
}

describe("delivery processor", () => {
  it("builds an envelope and signs the exact request body", () => {
    const request = buildWebhookRequest(deliveryContext);
    const expectedSignature = createHmac(
      "sha256",
      deliveryContext.signingSecret,
    )
      .update(request.body, "utf8")
      .digest("hex");

    expect(JSON.parse(request.body)).toEqual({
      eventId,
      type: "user.created",
      payload: {
        userId: "user-1",
      },
      createdAt: "2026-10-18T12:00:00.000Z",
    });
    expect(request.headers["x-relay-signature"]).toBe(
      `sha256=${expectedSignature}`,
    );
  });

  it("marks a successful HTTP response as delivered", async () => {
    const harness = createProcessorHarness();
    harness.sendWebhook.mockResolvedValue({ status: 204 });

    await harness.processDeliveryRun(claimedRun);

    expect(harness.sendWebhook).toHaveBeenCalledOnce();
    expect(harness.completeDeliveryAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId,
        deliveryRunId,
        leaseOwner: "worker-1",
        responseStatus: 204,
        errorCode: null,
        durationMs: 250,
        status: "delivered",
        retryDelayMs: null,
      }),
    );
  });

  it("marks a permanent client error as failed without retrying", async () => {
    const harness = createProcessorHarness();
    harness.sendWebhook.mockResolvedValue({ status: 400 });

    await harness.processDeliveryRun(claimedRun);

    expect(harness.completeDeliveryAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        responseStatus: 400,
        errorCode: "HTTP_400",
        status: "failed",
        retryDelayMs: null,
      }),
    );
    expect(harness.getDelayMs).not.toHaveBeenCalled();
  });

  it("schedules a retry for a temporary server error", async () => {
    const harness = createProcessorHarness();
    harness.sendWebhook.mockResolvedValue({ status: 500 });

    await harness.processDeliveryRun(claimedRun);

    expect(harness.completeDeliveryAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        responseStatus: 500,
        errorCode: "HTTP_500",
        status: "retrying",
        retryDelayMs: 5_000,
      }),
    );
    expect(harness.getDelayMs).toHaveBeenCalledWith(1);
  });

  it("dead-letters a temporary error at the retry limit", async () => {
    const harness = createProcessorHarness({ attemptNumber: 3 });
    harness.sendWebhook.mockResolvedValue({ status: 503 });

    await harness.processDeliveryRun(claimedRun);

    expect(harness.completeDeliveryAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        responseStatus: 503,
        errorCode: "HTTP_503",
        status: "dead_lettered",
        retryDelayMs: null,
      }),
    );
    expect(harness.getDelayMs).not.toHaveBeenCalled();
  });

  it("retries a network failure without exposing the thrown error", async () => {
    const harness = createProcessorHarness();
    harness.sendWebhook.mockRejectedValue(
      new Error("private endpoint details"),
    );

    await harness.processDeliveryRun(claimedRun);

    expect(harness.completeDeliveryAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        responseStatus: null,
        errorCode: "NETWORK_ERROR",
        status: "retrying",
        retryDelayMs: 5_000,
      }),
    );
    expect(
      JSON.stringify(harness.completeDeliveryAttempt.mock.calls),
    ).not.toContain("private endpoint details");
  });

  it("does not send to an inactive endpoint", async () => {
    const harness = createProcessorHarness({
      context: {
        ...deliveryContext,
        endpointActive: false,
      },
    });

    await harness.processDeliveryRun(claimedRun);

    expect(harness.sendWebhook).not.toHaveBeenCalled();
    expect(harness.completeDeliveryAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        responseStatus: null,
        errorCode: "ENDPOINT_INACTIVE",
        status: "failed",
        retryDelayMs: null,
      }),
    );
  });

  it("throws before starting an attempt when the context is missing", async () => {
    const harness = createProcessorHarness({ context: null });

    await expect(
      harness.processDeliveryRun(claimedRun),
    ).rejects.toThrow("Delivery context was not found");

    expect(harness.startDeliveryAttempt).not.toHaveBeenCalled();
    expect(harness.sendWebhook).not.toHaveBeenCalled();
  });
});
