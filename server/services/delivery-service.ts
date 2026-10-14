export type ReplayDeliveryInput = {
  projectId: string;
  deliveryId: string;
};

export type PublicDeliveryRun = {
  deliveryId: string;
  runId: string;
  runNumber: number;
  runType: "manual_replay";
  status: "pending";
};

export type ReplayDeliveryResult =
  | {
      kind: "created";
      run: PublicDeliveryRun;
    }
  | {
      kind: "delivery_not_found";
    }
  | {
      kind: "not_replayable";
    };

export type ReplayDelivery = (
  input: ReplayDeliveryInput,
) => Promise<ReplayDeliveryResult>;

export type DeliveryRunStatus =
  | "pending"
  | "processing"
  | "retrying"
  | "delivered"
  | "failed"
  | "dead_lettered"
  | "cancelled";

export type ReplayCandidate = {
  deliveryId: string;
  latestRun: {
    runNumber: number;
    status: DeliveryRunStatus;
  };
};

export type DeliveryQueries = {
  findDeliveryForReplay(
    input: ReplayDeliveryInput,
  ): Promise<ReplayCandidate | null>;

  createManualReplayRun(input: {
    deliveryId: string;
  }): Promise<PublicDeliveryRun>;
};

const replayableStatuses = new Set<DeliveryRunStatus>([
  "failed",
  "dead_lettered",
  "cancelled",
]);

export function createDeliveryService(
  queries: DeliveryQueries,
): ReplayDelivery {
  return async function replayDelivery(
    input: ReplayDeliveryInput,
  ): Promise<ReplayDeliveryResult> {
    const candidate = await queries.findDeliveryForReplay(input);

    if (candidate === null) {
      return {
        kind: "delivery_not_found",
      };
    }

    if (!replayableStatuses.has(candidate.latestRun.status)) {
      return {
        kind: "not_replayable",
      };
    }

    const run = await queries.createManualReplayRun({
      deliveryId: candidate.deliveryId,
    });

    return {
      kind: "created",
      run,
    };
  };
}