import { createHmac } from "node:crypto";
import type { ClaimedDeliveryRun } from "../db/queries/delivery-runs";
import type {
  DeliveryProcessingContext,
  DeliveryProcessingQueries,
  DeliveryRunOutcomeStatus,
} from "../db/queries/delivery-processing";

export type WebhookRequest = {
  url: string;
  body: string;
  headers: Record<string, string>;
};

export type WebhookResponse = {
  status: number;
};

export type WebhookSender = (
  request: WebhookRequest,
) => Promise<WebhookResponse>;

export type DeliveryRetryPolicy = {
  /**
   * Maximum total attempts, including the current attempt.
   */
  maxAttempts: number;

  /**
   * Returns the delay before the next retry.
   */
  getDelayMs: (attemptNumber: number) => number;
};

export type DeliveryProcessorDependencies = {
  queries: DeliveryProcessingQueries;
  sendWebhook: WebhookSender;
  retryPolicy: DeliveryRetryPolicy;
  now?: () => number;
};

export type DeliveryProcessor = (
  run: ClaimedDeliveryRun,
) => Promise<void>;

type DeliveryOutcome = {
  responseStatus: number | null;
  errorCode: string | null;
  status: DeliveryRunOutcomeStatus;
  retryDelayMs: number | null;
};

const defaultClock = () => Date.now();

export function createWebhookSignature(
  body: string,
  signingSecret: string,
): string {
  return createHmac("sha256", signingSecret)
    .update(body, "utf8")
    .digest("hex");
}

export function buildWebhookRequest(
  context: DeliveryProcessingContext,
): WebhookRequest {
  const body = JSON.stringify({
    eventId: context.eventId,
    type: context.eventType,
    payload: context.payload,
    createdAt: context.createdAt.toISOString(),
  });

  if (body === undefined) {
    throw new Error("Unable to serialize webhook body");
  }

  const signature = createWebhookSignature(
    body,
    context.signingSecret,
  );

  return {
    url: context.endpointUrl,
    body,
    headers: {
      "content-type": "application/json",
      "x-relay-event-id": context.eventId,
      "x-relay-event-type": context.eventType,
      "x-relay-signature": `sha256=${signature}`,
    },
  };
}

function retryOrDeadLetter(
  attemptNumber: number,
  responseStatus: number | null,
  errorCode: string,
  retryPolicy: DeliveryRetryPolicy,
): DeliveryOutcome {
  if (attemptNumber >= retryPolicy.maxAttempts) {
    return {
      responseStatus,
      errorCode,
      status: "dead_lettered",
      retryDelayMs: null,
    };
  }

  return {
    responseStatus,
    errorCode,
    status: "retrying",
    retryDelayMs: retryPolicy.getDelayMs(attemptNumber),
  };
}

export function classifyHttpStatus(
  status: number,
  attemptNumber: number,
  retryPolicy: DeliveryRetryPolicy,
): DeliveryOutcome {
  if (status >= 200 && status < 300) {
    return {
      responseStatus: status,
      errorCode: null,
      status: "delivered",
      retryDelayMs: null,
    };
  }

  const isRetryable =
    status === 408 ||
    status === 429 ||
    (status >= 500 && status <= 599);

  if (isRetryable) {
    return retryOrDeadLetter(
      attemptNumber,
      status,
      `HTTP_${status}`,
      retryPolicy,
    );
  }

  return {
    responseStatus: status,
    errorCode: `HTTP_${status}`,
    status: "failed",
    retryDelayMs: null,
  };
}

function classifyNetworkError(
  attemptNumber: number,
  retryPolicy: DeliveryRetryPolicy,
): DeliveryOutcome {
  return retryOrDeadLetter(
    attemptNumber,
    null,
    "NETWORK_ERROR",
    retryPolicy,
  );
}

async function executeDeliveryAttempt(input: {
  context: DeliveryProcessingContext;
  attemptNumber: number;
  sendWebhook: WebhookSender;
  retryPolicy: DeliveryRetryPolicy;
}): Promise<DeliveryOutcome> {
  if (!input.context.endpointActive) {
    return {
      responseStatus: null,
      errorCode: "ENDPOINT_INACTIVE",
      status: "failed",
      retryDelayMs: null,
    };
  }

  let request: WebhookRequest;

  try {
    request = buildWebhookRequest(input.context);
  } catch {
    return {
      responseStatus: null,
      errorCode: "REQUEST_BUILD_ERROR",
      status: "failed",
      retryDelayMs: null,
    };
  }

  try {
    const response = await input.sendWebhook(request);

    return classifyHttpStatus(
      response.status,
      input.attemptNumber,
      input.retryPolicy,
    );
  } catch {
    return classifyNetworkError(
      input.attemptNumber,
      input.retryPolicy,
    );
  }
}

export function createDeliveryProcessor(
  input: DeliveryProcessorDependencies,
): DeliveryProcessor {
  const now = input.now ?? defaultClock;

  return async (run) => {
    const context =
      await input.queries.findDeliveryContext(run.id);

    if (!context) {
      throw new Error("Delivery context was not found");
    }

    const attempt =
      await input.queries.startDeliveryAttempt({
        deliveryRunId: run.id,
        leaseOwner: run.leaseOwner,
      });

    const startedAtMs = now();

    const outcome = await executeDeliveryAttempt({
      context,
      attemptNumber: attempt.attemptNumber,
      sendWebhook: input.sendWebhook,
      retryPolicy: input.retryPolicy,
    });

    const durationMs = Math.max(
      0,
      Math.round(now() - startedAtMs),
    );

    await input.queries.completeDeliveryAttempt({
      attemptId: attempt.id,
      deliveryRunId: run.id,
      leaseOwner: run.leaseOwner,
      responseStatus: outcome.responseStatus,
      errorCode: outcome.errorCode,
      durationMs,
      status: outcome.status,
      retryDelayMs: outcome.retryDelayMs,
    });
  };
}