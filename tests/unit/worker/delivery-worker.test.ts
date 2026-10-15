import { describe, expect, it, vi } from "vitest";
import {
  createDeliveryJobHandler,
  type DeliveryRunProcessor,
} from "../../../worker/delivery-worker";
import type {
  ClaimedDeliveryRun,
  DeliveryRunQueries,
} from "../../../db/queries/delivery-runs";

const deliveryRunId = "11111111-1111-4111-8111-111111111111";
const deliveryId = "22222222-2222-4222-8222-222222222222";

const claimedRun: ClaimedDeliveryRun = {
  id: deliveryRunId,
  deliveryId,
  attemptCount: 0,
  leaseOwner: "worker-1",
  leaseExpiresAt: new Date("2026-10-15T12:00:30.000Z"),
};

function createQueryMocks(
  result: ClaimedDeliveryRun | null,
): DeliveryRunQueries {
  return {
    claimDeliveryRun: vi.fn<
      DeliveryRunQueries["claimDeliveryRun"]
    >(async () => result),
  };
}

describe("delivery job handler", () => {
  it("skips a job when the run is no longer claimable", async () => {
    const queries = createQueryMocks(null);
    const processRun = vi.fn<DeliveryRunProcessor>(async () => undefined);
    const handleDeliveryJob = createDeliveryJobHandler({
      queries,
      workerId: "worker-1",
      leaseDurationMs: 30_000,
      processRun,
    });

    const result = await handleDeliveryJob({ deliveryRunId });

    expect(result).toEqual({ kind: "skipped" });
    expect(queries.claimDeliveryRun).toHaveBeenCalledWith({
      deliveryRunId,
      workerId: "worker-1",
      leaseDurationMs: 30_000,
    });
    expect(processRun).not.toHaveBeenCalled();
  });

  it("processes a job only after claiming its run", async () => {
    const queries = createQueryMocks(claimedRun);
    const processRun = vi.fn<DeliveryRunProcessor>(async () => undefined);
    const handleDeliveryJob = createDeliveryJobHandler({
      queries,
      workerId: "worker-1",
      leaseDurationMs: 30_000,
      processRun,
    });

    const result = await handleDeliveryJob({ deliveryRunId });

    expect(result).toEqual({ kind: "processed" });
    expect(processRun).toHaveBeenCalledOnce();
    expect(processRun).toHaveBeenCalledWith(claimedRun);
  });
});
