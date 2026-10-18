import type { Redis } from "ioredis";
import { deliveryProcessingQueries } from "../db/queries/delivery-processing";
import { deliveryRunQueries } from "../db/queries/delivery-runs";
import {
  createDeliveryProcessor,
  type DeliveryRetryPolicy,
} from "./delivery-processor";
import { createDeliveryWorker } from "./delivery-worker";
import { createWebhookSender } from "./webhook-sender";

export type DeliveryWorkerRuntimeOptions = {
  connection: Redis;
  workerId: string;
  leaseDurationMs: number;
  webhookTimeoutMs: number;
  retryPolicy: DeliveryRetryPolicy;
};

export function createDeliveryWorkerRuntime(
  input: DeliveryWorkerRuntimeOptions,
) {
  const processRun = createDeliveryProcessor({
    queries: deliveryProcessingQueries,
    sendWebhook: createWebhookSender({
      timeoutMs: input.webhookTimeoutMs,
    }),
    retryPolicy: input.retryPolicy,
  });

  return createDeliveryWorker({
    connection: input.connection,
    queries: deliveryRunQueries,
    workerId: input.workerId,
    leaseDurationMs: input.leaseDurationMs,
    processRun,
  });
}
