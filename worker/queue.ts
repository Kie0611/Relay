import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import {
  DELIVERY_QUEUE_NAME,
  type DeliveryJob,
} from "./contracts";

export type DeliveryQueue = {
  enqueue(job: DeliveryJob): Promise<void>;
  close(): Promise<void>;
};

export function createBullMqDeliveryQueue(
  connection: Redis,
): DeliveryQueue {
  const queue = new Queue<DeliveryJob>(DELIVERY_QUEUE_NAME, {
    connection,
  });

  return {
    async enqueue(job) {
      await queue.add("deliver", job, {
        jobId: `delivery-run:${job.deliveryRunId}`,
      });
    },
    close: () => queue.close(),
  };
}
