import type { DeliveryRunStatus } from "./delivery-service";

export type StoredDeliverySummary = {
  deliveryId: string;
  eventId: string;
  eventType: string;
  endpointId: string;
  endpointUrl: string;
  endpointActive: boolean;
  runId: string;
  runNumber: number;
  status: DeliveryRunStatus;
  attemptCount: number;
  nextAttemptAt: Date | null;
  deliveredAt: Date | null;
  updatedAt: Date;
};

export type PublicDeliverySummary = Omit<
  StoredDeliverySummary,
  "nextAttemptAt" | "deliveredAt" | "updatedAt"
> & {
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  updatedAt: string;
};

export type DeliveryDashboardQueries = {
  findProjectById(
    projectId: string,
  ): Promise<{ id: string } | null>;

  listDeliverySummaries(
    projectId: string,
  ): Promise<StoredDeliverySummary[]>;
};

export type ListDeliveriesResult =
  | {
      kind: "listed";
      deliveries: PublicDeliverySummary[];
    }
  | {
      kind: "project_not_found";
    };

function toPublicDeliverySummary(
  delivery: StoredDeliverySummary,
): PublicDeliverySummary {
  return {
    deliveryId: delivery.deliveryId,
    eventId: delivery.eventId,
    eventType: delivery.eventType,
    endpointId: delivery.endpointId,
    endpointUrl: delivery.endpointUrl,
    endpointActive: delivery.endpointActive,
    runId: delivery.runId,
    runNumber: delivery.runNumber,
    status: delivery.status,
    attemptCount: delivery.attemptCount,
    nextAttemptAt: delivery.nextAttemptAt?.toISOString() ?? null,
    deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
    updatedAt: delivery.updatedAt.toISOString(),
  };
}

export type DeliveryDashboardService = {
  listDeliveries(projectId: string): Promise<ListDeliveriesResult>;
};

export function createDeliveryDashboardService(
  queries: DeliveryDashboardQueries,
): DeliveryDashboardService {
  return {
    async listDeliveries(
      projectId: string,
    ): Promise<ListDeliveriesResult> {
      const project = await queries.findProjectById(projectId);

      if (!project) {
        return {
          kind: "project_not_found",
        };
      }

      const deliveries = await queries.listDeliverySummaries(projectId);

      return {
        kind: "listed",
        deliveries: deliveries.map(toPublicDeliverySummary),
      };
    },
  };
}
