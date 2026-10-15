import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../../db";
import { deliveryQueries } from "../../../db/queries/deliveries";
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
import {
  createRequestFingerprint,
  type CreateEventAndDeliveriesInput,
} from "../../../server/services/event-service";

const createdProjectIds: string[] = [];

async function createProject(): Promise<string> {
  const [project] = await db
    .insert(projects)
    .values({ name: `delivery-query-${randomUUID()}` })
    .returning({ id: projects.id });

  if (!project) {
    throw new Error("Test project was not created");
  }

  createdProjectIds.push(project.id);
  return project.id;
}

async function createEndpoint(projectId: string): Promise<string> {
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

  return endpoint.id;
}

async function createDeliveryFixture(): Promise<{
  projectId: string;
  deliveryId: string;
  runId: string;
}> {
  const projectId = await createProject();
  const endpointId = await createEndpoint(projectId);
  const type = "user.created" as const;
  const payload = { userId: randomUUID() };
  const input: CreateEventAndDeliveriesInput = {
    projectId,
    idempotencyKey: `delivery-fixture-${randomUUID()}`,
    type,
    payload,
    requestFingerprint: createRequestFingerprint(type, payload),
  };

  const result = await eventQueries.createEventAndDeliveries(input);

  if (result.kind !== "created") {
    throw new Error("Test event was not created");
  }

  const [delivery] = await db
    .select({ id: deliveries.id })
    .from(deliveries)
    .where(
      and(
        eq(deliveries.eventId, result.event.id),
        eq(deliveries.endpointId, endpointId),
      ),
    );

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

  return {
    projectId,
    deliveryId: delivery.id,
    runId: run.id,
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

describe("delivery queries", () => {
  it("finds the latest run only for the delivery's project", async () => {
    const fixture = await createDeliveryFixture();
    const otherProjectId = await createProject();

    await expect(
      deliveryQueries.findDeliveryForReplay({
        projectId: fixture.projectId,
        deliveryId: fixture.deliveryId,
      }),
    ).resolves.toEqual({
      deliveryId: fixture.deliveryId,
      latestRun: {
        runNumber: 1,
        status: "pending",
      },
    });

    await expect(
      deliveryQueries.findDeliveryForReplay({
        projectId: otherProjectId,
        deliveryId: fixture.deliveryId,
      }),
    ).resolves.toBeNull();
  });

  it("creates the next pending manual replay run atomically", async () => {
    const fixture = await createDeliveryFixture();

    await db
      .update(deliveryRuns)
      .set({
        status: "failed",
        updatedAt: new Date(),
      })
      .where(eq(deliveryRuns.id, fixture.runId));

    const replayRun = await deliveryQueries.createManualReplayRun({
      deliveryId: fixture.deliveryId,
    });

    expect(replayRun).toMatchObject({
      deliveryId: fixture.deliveryId,
      runNumber: 2,
      runType: "manual_replay",
      status: "pending",
    });
    expect(replayRun.runId).not.toBe(fixture.runId);

    await expect(
      deliveryQueries.findDeliveryForReplay({
        projectId: fixture.projectId,
        deliveryId: fixture.deliveryId,
      }),
    ).resolves.toMatchObject({
      deliveryId: fixture.deliveryId,
      latestRun: {
        runNumber: 2,
        status: "pending",
      },
    });
  });
});
