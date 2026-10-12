import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../../db";
import {
  deliveryAttempts,
  deliveries,
  deliveryRuns,
  endpointSubscriptions,
  endpoints,
  events,
  projects,
} from "../../../db/schema";
import { app } from "../../../server/app";

const createdProjectIds: string[] = [];

async function createProject() {
  const [project] = await db
    .insert(projects)
    .values({
      name: `composed-test-${randomUUID()}`,
    })
    .returning({ id: projects.id });

  createdProjectIds.push(project.id);

  return project.id;
}

async function createSubscribedEndpoint(projectId: string) {
  const [endpoint] = await db
    .insert(endpoints)
    .values({
      projectId,
      url: `https://example.test/${randomUUID()}`,
      signingSecret: `test-secret-${randomUUID()}`,
    })
    .returning({ id: endpoints.id });

  await db.insert(endpointSubscriptions).values({
    endpointId: endpoint.id,
    eventType: "user.created",
  });

  return endpoint.id;
}

async function cleanupProject(projectId: string) {
  const projectEvents = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.projectId, projectId));
  const eventIds = projectEvents.map((event) => event.id);

  if (eventIds.length > 0) {
    const deliveryRows = await db
      .select({ id: deliveries.id })
      .from(deliveries)
      .where(inArray(deliveries.eventId, eventIds));
    const deliveryIds = deliveryRows.map((delivery) => delivery.id);

    if (deliveryIds.length > 0) {
      const runRows = await db
        .select({ id: deliveryRuns.id })
        .from(deliveryRuns)
        .where(inArray(deliveryRuns.deliveryId, deliveryIds));
      const runIds = runRows.map((run) => run.id);

      if (runIds.length > 0) {
        await db
          .delete(deliveryAttempts)
          .where(inArray(deliveryAttempts.deliveryRunId, runIds));
      }

      await db
        .delete(deliveryRuns)
        .where(inArray(deliveryRuns.deliveryId, deliveryIds));
    }

    await db.delete(deliveries).where(inArray(deliveries.eventId, eventIds));
    await db.delete(events).where(inArray(events.id, eventIds));
  }

  const projectEndpoints = await db
    .select({ id: endpoints.id })
    .from(endpoints)
    .where(eq(endpoints.projectId, projectId));
  const endpointIds = projectEndpoints.map((endpoint) => endpoint.id);

  if (endpointIds.length > 0) {
    await db
      .delete(endpointSubscriptions)
      .where(inArray(endpointSubscriptions.endpointId, endpointIds));
    await db.delete(endpoints).where(inArray(endpoints.id, endpointIds));
  }

  await db.delete(projects).where(eq(projects.id, projectId));
}

afterEach(async () => {
  const projectIds = createdProjectIds.splice(0);

  for (const projectId of projectIds) {
    await cleanupProject(projectId);
  }
});

describe("composed event publishing", () => {
  it("persists an event and replays it through the real app", async () => {
    const projectId = await createProject();
    const endpointId = await createSubscribedEndpoint(projectId);
    const idempotencyKey = `composed-event-${randomUUID()}`;
    const payload = { userId: `user-${randomUUID()}` };

    const firstResponse = await request(app)
      .post(`/api/projects/${projectId}/events`)
      .set("Idempotency-Key", idempotencyKey)
      .send({
        type: "user.created",
        payload,
      });

    expect(firstResponse.status).toBe(202);
    expect(firstResponse.body).toMatchObject({
      projectId,
      type: "user.created",
      payload,
      idempotencyKey,
      id: expect.any(String),
      createdAt: expect.any(String),
    });

    const storedEvents = await db
      .select({
        id: events.id,
        projectId: events.projectId,
        idempotencyKey: events.idempotencyKey,
      })
      .from(events)
      .where(
        and(
          eq(events.projectId, projectId),
          eq(events.idempotencyKey, idempotencyKey),
        ),
      );

    expect(storedEvents).toHaveLength(1);
    expect(storedEvents[0].id).toBe(firstResponse.body.id);

    const storedDeliveries = await db
      .select({
        endpointId: deliveries.endpointId,
      })
      .from(deliveries)
      .where(eq(deliveries.eventId, firstResponse.body.id));

    expect(storedDeliveries).toEqual([
      {
        endpointId,
      },
    ]);

    const storedRuns = await db
      .select({
        runNumber: deliveryRuns.runNumber,
        runType: deliveryRuns.runType,
        status: deliveryRuns.status,
        attemptCount: deliveryRuns.attemptCount,
      })
      .from(deliveryRuns)
      .innerJoin(deliveries, eq(deliveryRuns.deliveryId, deliveries.id))
      .where(eq(deliveries.eventId, firstResponse.body.id));

    expect(storedRuns).toEqual([
      {
        runNumber: 1,
        runType: "initial",
        status: "pending",
        attemptCount: 0,
      },
    ]);

    const replayResponse = await request(app)
      .post(`/api/projects/${projectId}/events`)
      .set("Idempotency-Key", idempotencyKey)
      .send({
        type: "user.created",
        payload,
      });

    expect(replayResponse.status).toBe(202);
    expect(replayResponse.body).toEqual(firstResponse.body);

    const eventsAfterReplay = await db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.projectId, projectId),
          eq(events.idempotencyKey, idempotencyKey),
        ),
      );
    const deliveriesAfterReplay = await db
      .select({ id: deliveries.id })
      .from(deliveries)
      .where(eq(deliveries.eventId, firstResponse.body.id));

    expect(eventsAfterReplay).toHaveLength(1);
    expect(deliveriesAfterReplay).toHaveLength(1);
  });

  it("returns 409 when the same key is reused with different event data", async () => {
    const projectId = await createProject();
    const endpointId = await createSubscribedEndpoint(projectId);
    const idempotencyKey = `composed-conflict-${randomUUID()}`;

    const firstResponse = await request(app)
      .post(`/api/projects/${projectId}/events`)
      .set("Idempotency-Key", idempotencyKey)
      .send({
        type: "user.created",
        payload: { userId: "user-1" },
      });

    expect(firstResponse.status).toBe(202);

    const conflictResponse = await request(app)
      .post(`/api/projects/${projectId}/events`)
      .set("Idempotency-Key", idempotencyKey)
      .send({
        type: "user.created",
        payload: { userId: "user-2" },
      });

    expect(conflictResponse.status).toBe(409);
    expect(conflictResponse.body).toEqual({
      error: {
        code: "IDEMPOTENCY_CONFLICT",
        message:
          "This idempotency key was already used with different event data",
      },
    });

    const storedEvents = await db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.projectId, projectId),
          eq(events.idempotencyKey, idempotencyKey),
        ),
      );
    const storedDeliveries = await db
      .select({ id: deliveries.id, endpointId: deliveries.endpointId })
      .from(deliveries)
      .where(eq(deliveries.eventId, firstResponse.body.id));

    expect(storedEvents).toHaveLength(1);
    expect(storedDeliveries).toEqual([
      {
        id: expect.any(String),
        endpointId,
      },
    ]);
  });
});
