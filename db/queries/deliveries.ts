import { and, desc, eq, max } from "drizzle-orm";
import { db } from "../index";
import {
  deliveries,
  deliveryRuns,
  events,
} from "../schema";
import type {
  DeliveryQueries,
  PublicDeliveryRun,
  ReplayCandidate,
  ReplayDeliveryInput,
} from "../../server/services/delivery-service";

async function findDeliveryForReplay(
  input: ReplayDeliveryInput,
): Promise<ReplayCandidate | null> {
  const rows = await db
    .select({
      deliveryId: deliveries.id,
      runNumber: deliveryRuns.runNumber,
      status: deliveryRuns.status,
    })
    .from(deliveries)
    .innerJoin(events, eq(events.id, deliveries.eventId))
    .innerJoin(
      deliveryRuns,
      eq(deliveryRuns.deliveryId, deliveries.id),
    )
    .where(
      and(
        eq(deliveries.id, input.deliveryId),
        eq(events.projectId, input.projectId),
      ),
    )
    .orderBy(desc(deliveryRuns.runNumber))
    .limit(1);

  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    deliveryId: row.deliveryId,
    latestRun: {
      runNumber: row.runNumber,
      status: row.status,
    },
  };
}

async function createManualReplayRun(input: {
  deliveryId: string;
}): Promise<PublicDeliveryRun> {
  return db.transaction(async (tx) => {
    const deliveryRows = await tx
      .select({
        id: deliveries.id,
      })
      .from(deliveries)
      .where(eq(deliveries.id, input.deliveryId))
      .for("update");

    if (!deliveryRows[0]) {
      throw new Error("Delivery does not exist");
    }

    const latestRunRows = await tx
      .select({
        runNumber: max(deliveryRuns.runNumber),
      })
      .from(deliveryRuns)
      .where(eq(deliveryRuns.deliveryId, input.deliveryId));

    const latestRunNumber = latestRunRows[0]?.runNumber;

    if (latestRunNumber === null || latestRunNumber === undefined) {
      throw new Error("Delivery has no existing run");
    }

    const insertedRuns = await tx
      .insert(deliveryRuns)
      .values({
        deliveryId: input.deliveryId,
        runNumber: latestRunNumber + 1,
        runType: "manual_replay",
        status: "pending",
        attemptCount: 0,
      })
      .returning({
        runId: deliveryRuns.id,
        deliveryId: deliveryRuns.deliveryId,
        runNumber: deliveryRuns.runNumber,
      });

    const insertedRun = insertedRuns[0];

    if (!insertedRun) {
      throw new Error("Manual replay run was not created");
    }

    return {
      deliveryId: insertedRun.deliveryId,
      runId: insertedRun.runId,
      runNumber: insertedRun.runNumber,
      runType: "manual_replay",
      status: "pending",
    };
  });
}

export const deliveryQueries: DeliveryQueries = {
  findDeliveryForReplay,
  createManualReplayRun,
};
