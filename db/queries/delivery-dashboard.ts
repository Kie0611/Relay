import { and, desc, eq } from "drizzle-orm";
import { db } from "../index";
import {
  deliveries,
  deliveryRuns,
  endpoints,
  events,
  projects,
} from "../schema";
import type {
  DeliveryDashboardQueries,
  StoredDeliverySummary,
} from "../../server/services/delivery-dashboard-service";

async function findProjectById(
  projectId: string,
): Promise<{ id: string } | null> {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  return rows[0] ?? null;
}

async function listDeliverySummaries(
  projectId: string,
): Promise<StoredDeliverySummary[]> {
  const rows = await db
    .select({
      deliveryId: deliveries.id,
      eventId: events.id,
      eventType: events.type,
      endpointId: endpoints.id,
      endpointUrl: endpoints.url,
      endpointActive: endpoints.active,
      runId: deliveryRuns.id,
      runNumber: deliveryRuns.runNumber,
      status: deliveryRuns.status,
      attemptCount: deliveryRuns.attemptCount,
      nextAttemptAt: deliveryRuns.nextAttemptAt,
      deliveredAt: deliveryRuns.deliveredAt,
      updatedAt: deliveryRuns.updatedAt,
    })
    .from(deliveries)
    .innerJoin(events, eq(events.id, deliveries.eventId))
    .innerJoin(endpoints, eq(endpoints.id, deliveries.endpointId))
    .innerJoin(deliveryRuns, eq(deliveryRuns.deliveryId, deliveries.id))
    .where(and(eq(events.projectId, projectId)))
    .orderBy(desc(deliveryRuns.updatedAt), desc(deliveryRuns.runNumber));

  const seenDeliveryIds = new Set<string>();
  const summaries: StoredDeliverySummary[] = [];

  for (const row of rows) {
    if (seenDeliveryIds.has(row.deliveryId)) {
      continue;
    }

    seenDeliveryIds.add(row.deliveryId);
    summaries.push(row);
  }

  return summaries;
}

export const deliveryDashboardQueries: DeliveryDashboardQueries = {
  findProjectById,
  listDeliverySummaries,
};
