import { describe, expect, it, vi } from "vitest";
import {
  createDeliveryService,
  type DeliveryQueries,
  type DeliveryRunStatus,
  type PublicDeliveryRun,
  type ReplayCandidate,
} from "../../../server/services/delivery-service";

const projectId = "11111111-1111-4111-8111-111111111111";
const deliveryId = "22222222-2222-4222-8222-222222222222";

const manualRun: PublicDeliveryRun = {
  deliveryId,
  runId: "33333333-3333-4333-8333-333333333333",
  runNumber: 2,
  runType: "manual_replay",
  status: "pending",
};

function createCandidate(status: DeliveryRunStatus): ReplayCandidate {
  return {
    deliveryId,
    latestRun: {
      runNumber: 1,
      status,
    },
  };
}

function createQueryMocks(candidate: ReplayCandidate | null) {
  const findDeliveryForReplay = vi.fn<
    DeliveryQueries["findDeliveryForReplay"]
  >(async () => candidate);
  const createManualReplayRun = vi.fn<
    DeliveryQueries["createManualReplayRun"]
  >(async () => manualRun);

  return {
    findDeliveryForReplay,
    createManualReplayRun,
  };
}

describe("delivery service", () => {
  it("returns delivery_not_found when the delivery does not exist", async () => {
    const queries = createQueryMocks(null);
    const replayDelivery = createDeliveryService(queries);

    const result = await replayDelivery({ projectId, deliveryId });

    expect(result).toEqual({ kind: "delivery_not_found" });
    expect(queries.findDeliveryForReplay).toHaveBeenCalledWith({
      projectId,
      deliveryId,
    });
    expect(queries.createManualReplayRun).not.toHaveBeenCalled();
  });

  it.each([
    "pending",
    "processing",
    "retrying",
    "delivered",
  ] as const)(
    "returns not_replayable for a %s delivery run",
    async (status) => {
      const queries = createQueryMocks(createCandidate(status));
      const replayDelivery = createDeliveryService(queries);

      const result = await replayDelivery({ projectId, deliveryId });

      expect(result).toEqual({ kind: "not_replayable" });
      expect(queries.createManualReplayRun).not.toHaveBeenCalled();
    },
  );

  it.each(["failed", "dead_lettered", "cancelled"] as const)(
    "creates a manual replay run for a %s delivery run",
    async (status) => {
      const queries = createQueryMocks(createCandidate(status));
      const replayDelivery = createDeliveryService(queries);

      const result = await replayDelivery({ projectId, deliveryId });

      expect(result).toEqual({
        kind: "created",
        run: manualRun,
      });
      expect(queries.createManualReplayRun).toHaveBeenCalledOnce();
      expect(queries.createManualReplayRun).toHaveBeenCalledWith({
        deliveryId,
      });
    },
  );
});
