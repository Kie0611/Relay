import {
  and,
  eq,
  gt,
  isNull,
  sql,
} from "drizzle-orm";
import { db } from "../index";
import {
  deliveries,
  deliveryAttempts,
  deliveryRuns,
  deliveryStatusEnum,
  endpoints,
  events,
} from "../schema";
import type { EventPayload } from "../../server/services/event-service";
import type { EventType } from "../../server/schemas/events";

export type DeliveryRunStatus =
(typeof deliveryStatusEnum.enumValues)[number];

export type DeliveryRunOutcomeStatus = Extract<
  DeliveryRunStatus,
  "delivered" | "retrying" | "failed" | "dead_lettered"
>;

export type DeliveryProcessingContext = {
  deliveryRunId: string;
  deliveryId: string;
  attemptCount: number;

  eventId: string;
  createdAt: Date;
  eventType: EventType;
  payload: EventPayload;

  endpointId: string;
  endpointUrl: string;
  signingSecret: string;
  endpointActive: boolean;
};

export type StartedDeliveryAttempt = {
  id: string;
  attemptNumber: number;
  startedAt: Date;
};

export type CompleteDeliveryAttemptInput = {
  attemptId: string;
  deliveryRunId: string;
  leaseOwner: string;

  responseStatus: number | null;
  errorCode: string | null;
  durationMs: number;

  status: DeliveryRunOutcomeStatus;
  retryDelayMs: number | null;
};

export type DeliveryProcessingQueries = {
  findDeliveryContext(
    deliveryRunId: string,
  ): Promise<DeliveryProcessingContext | null>;

  startDeliveryAttempt(input: {
    deliveryRunId: string;
    leaseOwner: string;
  }): Promise<StartedDeliveryAttempt>;

  completeDeliveryAttempt(
    input: CompleteDeliveryAttemptInput,
  ): Promise<void>;
};

async function findDeliveryContext(
  deliveryRunId: string,
): Promise<DeliveryProcessingContext | null> {
  const rows = await db
    .select({
      deliveryRunId: deliveryRuns.id,
      deliveryId: deliveries.id,
      attemptCount: deliveryRuns.attemptCount,

      eventId: events.id,
      createdAt: events.createdAt,
      eventType: events.type,
      payload: events.payload,

      endpointId: endpoints.id,
      endpointUrl: endpoints.url,
      signingSecret: endpoints.signingSecret,
      endpointActive: endpoints.active,
    })
    .from(deliveryRuns)
    .innerJoin(
      deliveries,
      eq(deliveryRuns.deliveryId, deliveries.id),
    )
    .innerJoin(
      events,
      eq(deliveries.eventId, events.id),
    )
    .innerJoin(
      endpoints,
      eq(deliveries.endpointId, endpoints.id),
    )
    .where(eq(deliveryRuns.id, deliveryRunId))
    .limit(1);

  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    deliveryRunId: row.deliveryRunId,
    deliveryId: row.deliveryId,
    attemptCount: row.attemptCount,

    eventId: row.eventId,
    createdAt: row.createdAt,
    eventType: row.eventType,
    payload: row.payload as EventPayload,

    endpointId: row.endpointId,
    endpointUrl: row.endpointUrl,
    signingSecret: row.signingSecret,
    endpointActive: row.endpointActive,
  };
}

async function startDeliveryAttempt(input: {
  deliveryRunId: string;
  leaseOwner: string;
}): Promise<StartedDeliveryAttempt> {
  return db.transaction(async (tx) => {
    const databaseNow = sql`now()`;

    const runs = await tx
      .select({
        id: deliveryRuns.id,
        attemptCount: deliveryRuns.attemptCount,
      })
      .from(deliveryRuns)
      .where(
        and(
          eq(deliveryRuns.id, input.deliveryRunId),
          eq(deliveryRuns.status, "processing"),
          eq(deliveryRuns.leaseOwner, input.leaseOwner),
          gt(deliveryRuns.leaseExpiresAt, databaseNow),
        ),
      )
      .for("update");

    const run = runs[0];

    if (!run) {
      throw new Error("Delivery run is no longer owned by this worker");
    }

    const attemptNumber = run.attemptCount + 1;

    await tx
      .update(deliveryRuns)
      .set({
        attemptCount: attemptNumber,
        updatedAt: databaseNow,
      })
      .where(eq(deliveryRuns.id, input.deliveryRunId));

    const attempts = await tx
      .insert(deliveryAttempts)
      .values({
        deliveryRunId: input.deliveryRunId,
        attemptNumber,
        startedAt: databaseNow,
      })
      .returning({
        id: deliveryAttempts.id,
        attemptNumber: deliveryAttempts.attemptNumber,
        startedAt: deliveryAttempts.startedAt,
      });

    const attempt = attempts[0];

    if (!attempt) {
      throw new Error("Delivery attempt was not created");
    }

    return attempt;
  });
}

async function completeDeliveryAttempt(
  input: CompleteDeliveryAttemptInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const databaseNow = sql`now()`;

    const updatedAttempts = await tx
      .update(deliveryAttempts)
      .set({
        responseStatus: input.responseStatus,
        errorCode: input.errorCode,
        completedAt: databaseNow,
        durationMs: input.durationMs,
      })
      .where(
        and(
          eq(deliveryAttempts.id, input.attemptId),
          eq(
            deliveryAttempts.deliveryRunId,
            input.deliveryRunId,
          ),
          isNull(deliveryAttempts.completedAt),
        ),
      )
      .returning({
        id: deliveryAttempts.id,
      });

    if (!updatedAttempts[0]) {
      throw new Error("Delivery attempt could not be completed");
    }

    const nextAttemptAt =
      input.retryDelayMs === null
        ? null
        : sql`now() + ${input.retryDelayMs} * interval '1 millisecond'`;

    const updatedRuns = await tx
      .update(deliveryRuns)
      .set({
        status: input.status,
        nextAttemptAt,
        deliveredAt:
          input.status === "delivered"
            ? databaseNow
            : null,
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: databaseNow,
      })
      .where(
        and(
          eq(deliveryRuns.id, input.deliveryRunId),
          eq(deliveryRuns.status, "processing"),
          eq(deliveryRuns.leaseOwner, input.leaseOwner),
          gt(deliveryRuns.leaseExpiresAt, databaseNow),
        ),
      )
      .returning({
        id: deliveryRuns.id,
      });

    if (!updatedRuns[0]) {
      throw new Error(
        "Delivery run could not be updated by this worker",
      );
    }
  });
}

export const deliveryProcessingQueries: DeliveryProcessingQueries = {
  findDeliveryContext,
  startDeliveryAttempt,
  completeDeliveryAttempt,
};