import type { DispatchOutboxQueries } from "../db/queries/outbox";
import type { DeliveryQueue } from "./queue";

export type DispatchSummary = {
  examined: number;
  published: number;
  failed: number;
};

export function createDispatcher(input: {
  queries: DispatchOutboxQueries;
  queue: DeliveryQueue;
}) {
  return async function dispatchPendingRuns(
    limit = 50,
  ): Promise<DispatchSummary> {
    const pendingDispatches =
      await input.queries.findPendingDispatches(limit);
    let published = 0;
    let failed = 0;

    for (const dispatch of pendingDispatches) {
      try {
        await input.queue.enqueue({
          deliveryRunId: dispatch.deliveryRunId,
        });
        await input.queries.markPublished(dispatch.outboxId);
        published += 1;
      } catch {
        failed += 1;
      }
    }

    return {
      examined: pendingDispatches.length,
      published,
      failed,
    };
  };
}
