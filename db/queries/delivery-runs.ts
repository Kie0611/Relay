import { and, eq, lte, lt, or, sql } from "drizzle-orm";
import { db } from "../index";
import { deliveryRuns } from "../schema";

export type ClaimedDeliveryRun = {
  id: string;
  deliveryId: string;
  attemptCount: number;
  leaseOwner: string;
  leaseExpiresAt: Date;
};

export type DeliveryRunQueries = {
  claimDeliveryRun(input: {
    deliveryRunId: string;
    workerId: string;
    leaseDurationMs: number;
  }): Promise<ClaimedDeliveryRun | null>;
};

async function claimDeliveryRun(input: {
  deliveryRunId: string;
  workerId: string;
  leaseDurationMs: number;
}): Promise<ClaimedDeliveryRun | null> {
  const databaseNow = sql`now()`;
  const databaseLeaseExpiry = sql`now() + ${input.leaseDurationMs} * interval '1 millisecond'`;

  const claimedRuns = await db
    .update(deliveryRuns)
    .set({
      status: "processing",
      leaseOwner: input.workerId,
      leaseExpiresAt: databaseLeaseExpiry,
      updatedAt: databaseNow,
    })
    .where(
      and(
        eq(deliveryRuns.id, input.deliveryRunId),
        or(
          eq(deliveryRuns.status, "pending"),
          and(
            eq(deliveryRuns.status, "retrying"),
            lte(deliveryRuns.nextAttemptAt, databaseNow),
          ),
          and(
            eq(deliveryRuns.status, "processing"),
            lt(deliveryRuns.leaseExpiresAt, databaseNow),
          ),
        ),
      ),
    )
    .returning({
      id: deliveryRuns.id,
      deliveryId: deliveryRuns.deliveryId,
      attemptCount: deliveryRuns.attemptCount,
      leaseOwner: deliveryRuns.leaseOwner,
      leaseExpiresAt: deliveryRuns.leaseExpiresAt,
    });

  const claimedRun = claimedRuns[0];

  if (
    !claimedRun ||
    claimedRun.leaseOwner === null ||
    claimedRun.leaseExpiresAt === null
  ) {
    return null;
  }

  return {
    id: claimedRun.id,
    deliveryId: claimedRun.deliveryId,
    attemptCount: claimedRun.attemptCount,
    leaseOwner: claimedRun.leaseOwner,
    leaseExpiresAt: claimedRun.leaseExpiresAt,
  };
}

export const deliveryRunQueries: DeliveryRunQueries = {
  claimDeliveryRun,
};
