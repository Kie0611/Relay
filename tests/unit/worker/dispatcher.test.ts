import { describe, expect, it, vi } from "vitest";
import {
  createDispatcher,
  type DispatchSummary,
} from "../../../worker/dispatcher";
import type { DispatchOutboxQueries } from "../../../db/queries/outbox";
import type { DeliveryQueue } from "../../../worker/queue";

const firstOutboxId = "11111111-1111-4111-8111-111111111111";
const firstRunId = "22222222-2222-4222-8222-222222222222";
const secondOutboxId = "33333333-3333-4333-8333-333333333333";
const secondRunId = "44444444-4444-4444-8444-444444444444";

function createQueryMocks() {
  const findPendingDispatches = vi.fn<
    DispatchOutboxQueries["findPendingDispatches"]
  >(async () => [
    { outboxId: firstOutboxId, deliveryRunId: firstRunId },
    { outboxId: secondOutboxId, deliveryRunId: secondRunId },
  ]);
  const markPublished = vi.fn<DispatchOutboxQueries["markPublished"]>(
    async () => undefined,
  );

  return { findPendingDispatches, markPublished };
}

function createQueueMock() {
  return {
    enqueue: vi.fn<DeliveryQueue["enqueue"]>(async () => undefined),
    close: vi.fn<DeliveryQueue["close"]>(async () => undefined),
  };
}

describe("dispatch pending runs", () => {
  it("publishes each pending outbox row and marks it published", async () => {
    const queries = createQueryMocks();
    const queue = createQueueMock();
    const dispatchPendingRuns = createDispatcher({ queries, queue });

    const result = await dispatchPendingRuns(10);

    const expected: DispatchSummary = {
      examined: 2,
      published: 2,
      failed: 0,
    };

    expect(result).toEqual(expected);
    expect(queries.findPendingDispatches).toHaveBeenCalledWith(10);
    expect(queue.enqueue).toHaveBeenNthCalledWith(1, {
      deliveryRunId: firstRunId,
    });
    expect(queue.enqueue).toHaveBeenNthCalledWith(2, {
      deliveryRunId: secondRunId,
    });
    expect(queries.markPublished).toHaveBeenNthCalledWith(1, firstOutboxId);
    expect(queries.markPublished).toHaveBeenNthCalledWith(2, secondOutboxId);
  });

  it("leaves an outbox row pending when queue publishing fails", async () => {
    const queries = createQueryMocks();
    const queue = createQueueMock();
    queue.enqueue
      .mockRejectedValueOnce(new Error("Redis unavailable"))
      .mockResolvedValueOnce(undefined);
    const dispatchPendingRuns = createDispatcher({ queries, queue });

    const result = await dispatchPendingRuns();

    expect(result).toEqual({ examined: 2, published: 1, failed: 1 });
    expect(queries.markPublished).toHaveBeenCalledOnce();
    expect(queries.markPublished).toHaveBeenCalledWith(secondOutboxId);
  });
});
