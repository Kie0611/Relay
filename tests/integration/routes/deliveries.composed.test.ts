import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../../db";
import { eventQueries } from "../../../db/queries/events";
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
import {
  createRequestFingerprint,
  type CreateEventAndDeliveriesInput,
} from "../../../server/services/event-service";

const createdProjectIds: string[] = [];

async function createProject(): Promise<string> {
  const [project] = await db
    .insert(projects)
    .values({ name: `deliveries-composed-${randomUUID()}` })
    .returning({ id: projects.id });

  if (!project) {
    throw new Error("Test project was not created");
  }

  createdProjectIds.push(project.id);
  return project.id;
}

async function createFailedDelivery(): Promise<{
  projectId: string;
  deliveryId: string;
  initialRunId: string;
}> {
  const projectId = await createProject();
  const [endpoint] = await db
    .insert(endpoints)
    .values({
      projectId,
      url: `https://example.test/${randomUUID()}`,
      signingSecret: `test-secret-${randomUUID()}`,
    })
    .returning({ id: endpoints.id });

  if (!endpoint) {
    throw new Error("Test endpoint was not created");
  }

  await db.insert(endpointSubscriptions).values({
    endpointId: endpoint.id,
    eventType: "user.created",
  });

  const type = "user.created" as const;
  const payload = { userId: randomUUID() };
  const input: CreateEventAndDeliveriesInput = {
    projectId,
    idempotencyKey: `failed-delivery-${randomUUID()}`,
    type,
    payload,
    requestFingerprint: createRequestFingerprint(type, payload),
  };
  const eventResult = await eventQueries.createEventAndDeliveries(input);

  if (eventResult.kind !== "created") {
    throw new Error("Test event was not created");
  }

  const [delivery] = await db
    .select({ id: deliveries.id })
    .from(deliveries)
    .where(eq(deliveries.eventId, eventResult.event.id));

  if (!delivery) {
    throw new Error("Test delivery was not created");
  }

  const [run] = await db
    .select({ id: deliveryRuns.id })
    .from(deliveryRuns)
    .where(eq(deliveryRuns.deliveryId, delivery.id));

  if (!run) {
    throw new Error("Test delivery run was not created");
  }

  await db
    .update(deliveryRuns)
    .set({
      status: "failed",
      updatedAt: new Date(),
    })
    .where(eq(deliveryRuns.id, run.id));

  return {
    projectId,
    deliveryId: delivery.id,
    initialRunId: run.id,
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

  const endpointRows = await db
    .select({ id: endpoints.id })
    .from(endpoints)
    .where(eq(endpoints.projectId, projectId));
  const endpointIds = endpointRows.map((endpoint) => endpoint.id);

  if (endpointIds.length > 0) {
    await db
      .delete(endpointSubscriptions)
      .where(inArray(endpointSubscriptions.endpointId, endpointIds));
    await db.delete(endpoints).where(inArray(endpoints.id, endpointIds));
  }

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

describe("composed delivery replay", () => {
  it("replays a failed delivery through the real app and database", async () => {
    const fixture = await createFailedDelivery();

    const response = await request(app).post(
      `/api/projects/${fixture.projectId}/deliveries/${fixture.deliveryId}/replay`,
    );

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      deliveryId: fixture.deliveryId,
      runNumber: 2,
      runType: "manual_replay",
      status: "pending",
    });
    expect(response.body.runId).not.toBe(fixture.initialRunId);

    const runRows = await db
      .select({
        runNumber: deliveryRuns.runNumber,
        runType: deliveryRuns.runType,
        status: deliveryRuns.status,
      })
      .from(deliveryRuns)
      .where(eq(deliveryRuns.deliveryId, fixture.deliveryId))
      .orderBy(deliveryRuns.runNumber);

    expect(runRows).toEqual([
      {
        runNumber: 1,
        runType: "initial",
        status: "failed",
      },
      {
        runNumber: 2,
        runType: "manual_replay",
        status: "pending",
      },
    ]);
  });

  it("returns 409 when the latest run is already delivered", async () => {
    const fixture = await createFailedDelivery();

    await db
      .update(deliveryRuns)
      .set({
        status: "delivered",
        updatedAt: new Date(),
      })
      .where(eq(deliveryRuns.id, fixture.initialRunId));

    const response = await request(app).post(
      `/api/projects/${fixture.projectId}/deliveries/${fixture.deliveryId}/replay`,
    );

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: "DELIVERY_NOT_REPLAYABLE",
        message: "Delivery cannot be replayed in its current state",
      },
    });

    const runRows = await db
      .select({ id: deliveryRuns.id })
      .from(deliveryRuns)
      .where(eq(deliveryRuns.deliveryId, fixture.deliveryId));

    expect(runRows).toHaveLength(1);
  });

  it("returns 404 when the delivery belongs to another project", async () => {
    const fixture = await createFailedDelivery();
    const otherProjectId = await createProject();

    const response = await request(app).post(
      `/api/projects/${otherProjectId}/deliveries/${fixture.deliveryId}/replay`,
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: "DELIVERY_NOT_FOUND",
        message: "Delivery was not found",
      },
    });
  });
});
