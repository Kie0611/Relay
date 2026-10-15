import { Worker } from "bullmq";
import type { Redis } from "ioredis";
import type {
  ClaimedDeliveryRun,
  DeliveryRunQueries,
} from "../db/queries/delivery-runs";
import {
  DELIVERY_QUEUE_NAME,
  type DeliveryJob,
} from "./contracts";

export type DeliveryRunProcessor = (
  run: ClaimedDeliveryRun,
) => Promise<void>;

export type DeliveryJobResult =
  | { kind: "processed" }
  | { kind: "skipped" };

export function createDeliveryJobHandler(input: {
  queries: DeliveryRunQueries;
  workerId: string;
  leaseDurationMs: number;
  processRun: DeliveryRunProcessor;
}) {
  return async function handleDeliveryJob(
    job: DeliveryJob,
  ): Promise<DeliveryJobResult> {
    const claimedRun = await input.queries.claimDeliveryRun({
      deliveryRunId: job.deliveryRunId,
      workerId: input.workerId,
      leaseDurationMs: input.leaseDurationMs,
    });

    if (!claimedRun) {
      return { kind: "skipped" };
    }

    await input.processRun(claimedRun);

    return { kind: "processed" };
  };
}

export function createDeliveryWorker(input: {
  connection: Redis;
  queries: DeliveryRunQueries;
  workerId: string;
  leaseDurationMs: number;
  processRun: DeliveryRunProcessor;
}): Worker<DeliveryJob> {
  const handleDeliveryJob = createDeliveryJobHandler(input);

  return new Worker<DeliveryJob>(
    DELIVERY_QUEUE_NAME,
    async (job) => {
      await handleDeliveryJob(job.data);
    },
    {
      connection: input.connection,
    },
  );
}
