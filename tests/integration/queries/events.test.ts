import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../../db";
import { eventQueries } from "../../../db/queries/events";
import {
  deliveryAttempts,
  deliveries,
  endpointSubscriptions,
  endpoints,
  events,
  projects,
} from "../../../db/schema";
import {
  createRequestFingerprint,
  type CreateEventAndDeliveriesInput,
} from "../../../server/services/event-service";

const createdProjectIds: string[] = [];

async function createProject(): Promise<string> {
  const insertedProjects = await db
    .insert(projects)
    .values({ name: `events-integration-${randomUUID()}` })
    .returning({ id: projects.id });

  const project = insertedProjects[0];

  if (!project) {
    throw new Error("Test project was not created");
  }

  createdProjectIds.push(project.id);
  return project.id;
}

async function createEndpoint(
  projectId: string,
  active: boolean,
): Promise<string> {
  const insertedEndpoints = await db
    .insert(endpoints)
    .values({
      projectId,
      url: `https://example.test/${randomUUID()}`,
      signingSecret: `test-secret-${randomUUID()}`,
      active,
    })
    .returning({ id: endpoints.id });

  const endpoint = insertedEndpoints[0];

  if (!endpoint) {
    throw new Error("Test endpoint was not created");
  }

  return endpoint.id;
}

async function subscribe(endpointId: string, eventType: "user.created" | "user.deleted") {
  await db.insert(endpointSubscriptions).values({
    endpointId,
    eventType,
  });
}

function createInput(projectId: string): CreateEventAndDeliveriesInput {
  const type = "user.created" as const;
  const payload = { userId: "user-1" };

  return {
    projectId,
    idempotencyKey: `event-${randomUUID()}`,
    type,
    payload,
    requestFingerprint: createRequestFingerprint(type, payload),
  };
}

async function cleanupProject(projectId: string): Promise<void> {
  const eventRows = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.projectId, projectId));
  const eventIds = eventRows.map((event) => event.id);

  if (eventIds.length > 0) {
    const deliveryRows = await db
      .select({ id: deliveries.id })
      .from(deliveries)
      .where(inArray(deliveries.eventId, eventIds));
    const deliveryIds = deliveryRows.map((delivery) => delivery.id);

    if (deliveryIds.length > 0) {
      await db
        .delete(deliveryAttempts)
        .where(inArray(deliveryAttempts.deliveryId, deliveryIds));
    }

    await db.delete(deliveries).where(inArray(deliveries.eventId, eventIds));
    await db.delete(events).where(inArray(events.id, eventIds));
  }

  const endpointRows = await db
    .select({ id: endpoints.id })
    .from(endpoints)
    .where(eq(endpoints.projectId, projectId));
  const endpointIds = endpointRows.map((endpoint) => endpoint.id);

  if (endpointIds.length > 0) {
    await db
      .delete(endpointSubscriptions)
      .where(inArray(endpointSubscriptions.endpointId, endpointIds));
  }

  await db.delete(endpoints).where(eq(endpoints.projectId, projectId));
  await db.delete(projects).where(eq(projects.id, projectId));
}

afterEach(async () => {
  while (createdProjectIds.length > 0) {
    const projectId = createdProjectIds.pop();

    if (projectId) {
      await cleanupProject(projectId);
    }
  }
});

describe("event queries", () => {
  it("persists an event and creates deliveries only for active matching subscriptions", async () => {
    const projectId = await createProject();
    const matchingEndpointId = await createEndpoint(projectId, true);
    const inactiveEndpointId = await createEndpoint(projectId, false);
    const differentTypeEndpointId = await createEndpoint(projectId, true);

    await subscribe(matchingEndpointId, "user.created");
    await subscribe(inactiveEndpointId, "user.created");
    await subscribe(differentTypeEndpointId, "user.deleted");

    const input = createInput(projectId);
    const result = await eventQueries.createEventAndDeliveries(input);

    expect(result.kind).toBe("created");

    if (result.kind !== "created") {
      throw new Error("Expected the event to be created");
    }

    expect(result.event).toMatchObject({
      projectId,
      type: input.type,
      payload: input.payload,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
    });

    await expect(eventQueries.findProjectById(projectId)).resolves.toEqual({
      id: projectId,
    });

    await expect(
      eventQueries.findEventByIdempotencyKey(
        projectId,
        input.idempotencyKey,
      ),
    ).resolves.toMatchObject({
      id: result.event.id,
      projectId,
      idempotencyKey: input.idempotencyKey,
    });

    const deliveryRows = await db
      .select({
        endpointId: deliveries.endpointId,
        status: deliveries.status,
        attemptCount: deliveries.attemptCount,
      })
      .from(deliveries)
      .where(eq(deliveries.eventId, result.event.id));

    expect(deliveryRows).toEqual([
      {
        endpointId: matchingEndpointId,
        status: "pending",
        attemptCount: 0,
      },
    ]);
  });

  it("returns the existing event and does not duplicate its delivery", async () => {
    const projectId = await createProject();
    const endpointId = await createEndpoint(projectId, true);
    await subscribe(endpointId, "user.created");

    const input = createInput(projectId);
    const firstResult = await eventQueries.createEventAndDeliveries(input);

    expect(firstResult.kind).toBe("created");

    if (firstResult.kind !== "created") {
      throw new Error("Expected the first event to be created");
    }

    const secondResult = await eventQueries.createEventAndDeliveries(input);

    expect(secondResult).toMatchObject({
      kind: "existing",
      event: {
        id: firstResult.event.id,
        projectId,
        idempotencyKey: input.idempotencyKey,
      },
    });

    const eventRows = await db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.projectId, projectId),
          eq(events.idempotencyKey, input.idempotencyKey),
        ),
      );
    const deliveryRows = await db
      .select({ id: deliveries.id })
      .from(deliveries)
      .where(eq(deliveries.eventId, firstResult.event.id));

    expect(eventRows).toHaveLength(1);
    expect(deliveryRows).toHaveLength(1);
  });
});
