import { and, eq } from "drizzle-orm";
import { db } from "../index";
import {
  deliveries,
  deliveryRuns,
  endpointSubscriptions,
  endpoints,
  events,
  projects,
} from "../schema";
import type {
  CreateEventAndDeliveriesInput,
  EventQueries,
  EventPayload,
  PersistEventResult,
  StoredEvent,
} from "../../server/services/event-service";

const eventSelection = {
  id: events.id,
  projectId: events.projectId,
  type: events.type,
  payload: events.payload,
  idempotencyKey: events.idempotencyKey,
  requestFingerprint: events.requestFingerprint,
  createdAt: events.createdAt,
};

function toStoredEvent(
  event: typeof events.$inferSelect,
): StoredEvent {
  return {
    id: event.id,
    projectId: event.projectId,
    type: event.type,
    payload: event.payload as EventPayload,
    idempotencyKey: event.idempotencyKey,
    requestFingerprint: event.requestFingerprint,
    createdAt: event.createdAt,
  };
}

async function findProjectById(
  projectId: string,
): Promise<{id: string} | null> {
  const result = await db
    .select({
      id: projects.id
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  return result[0] ?? null;
}

async function findEventByIdempotencyKey(
  projectId: string,
  idempotencyKey: string,
): Promise<StoredEvent | null> {
  const result = await db
    .select(eventSelection)
    .from(events)
    .where(
      and(
        eq(events.projectId, projectId),
        eq(events.idempotencyKey, idempotencyKey)
      ),
    )
    .limit(1);

  const event = result[0];

  return event ? toStoredEvent(event) : null;
}

async function createEventAndDeliveries(
  input: CreateEventAndDeliveriesInput,
): Promise<PersistEventResult> {
  return db.transaction(async (tx) => {
    const insertedEvents = await tx
      .insert(events)
      .values({
        projectId: input.projectId,
        type: input.type,
        payload: input.payload,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
      })
      .onConflictDoNothing({
        target: [events.projectId, events.idempotencyKey],
      })
      .returning(eventSelection);

    if (insertedEvents.length === 0) {
      const existingEvents = await tx
        .select(eventSelection)
        .from(events)
        .where(
          and(
            eq(events.projectId, input.projectId),
            eq(events.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);

      const existingEvent = existingEvents[0];

      if (!existingEvent) {
        throw new Error("Event conflict could not be resolved");
      }

      return {
        kind: "existing",
        event: toStoredEvent(existingEvent),
      };
    }

    const insertedEvent = insertedEvents[0];

    const subscriptions = await tx
      .select({
        endpointId: endpointSubscriptions.endpointId,
      })
      .from(endpointSubscriptions)
      .innerJoin(
        endpoints,
        eq(endpointSubscriptions.endpointId, endpoints.id),
      )
      .where(
        and(
          eq(endpoints.projectId, input.projectId),
          eq(endpoints.active, true),
          eq(endpointSubscriptions.eventType, input.type),
        ),
      );

    if (subscriptions.length > 0) {
      const insertedDeliveries = await tx.insert(deliveries).values(
        subscriptions.map((subscription) => ({
          eventId: insertedEvent.id,
          endpointId: subscription.endpointId,
        })),
      ).returning({ id: deliveries.id });

      await tx.insert(deliveryRuns).values(
        insertedDeliveries.map((delivery) => ({
          deliveryId: delivery.id,
          runNumber: 1,
          runType: "initial" as const,
          status: "pending" as const,
          attemptCount: 0,
        })),
      );
    }

    return {
      kind: "created",
      event: toStoredEvent(insertedEvent),
    };
  });
}

export const eventQueries: EventQueries = {
  findProjectById,
  findEventByIdempotencyKey,
  createEventAndDeliveries,
};
