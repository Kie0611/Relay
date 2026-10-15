import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db } from "../index";
import { deliveryDispatchOutbox } from "../schema";

export type PendingDispatch = {
  outboxId: string;
  deliveryRunId: string;
};

export type DispatchOutboxQueries = {
  findPendingDispatches(limit?: number): Promise<PendingDispatch[]>;
  markPublished(outboxId: string): Promise<void>;
};

async function findPendingDispatches(
  limit = 50,
): Promise<PendingDispatch[]> {
  const rows = await db
    .select({
      outboxId: deliveryDispatchOutbox.id,
      deliveryRunId: deliveryDispatchOutbox.deliveryRunId,
    })
    .from(deliveryDispatchOutbox)
    .where(
      and(
        eq(deliveryDispatchOutbox.status, "pending"),
        lte(deliveryDispatchOutbox.availableAt, sql`now()`),
      ),
    )
    .orderBy(asc(deliveryDispatchOutbox.createdAt))
    .limit(limit);

  return rows;
}

async function markPublished(outboxId: string): Promise<void> {
  const now = new Date();

  await db
    .update(deliveryDispatchOutbox)
    .set({
      status: "published",
      publishedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(deliveryDispatchOutbox.id, outboxId),
        eq(deliveryDispatchOutbox.status, "pending"),
      ),
    );
}

export const dispatchOutboxQueries: DispatchOutboxQueries = {
  findPendingDispatches,
  markPublished,
};
