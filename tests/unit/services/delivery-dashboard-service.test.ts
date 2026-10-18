import { describe, expect, it, vi } from "vitest";
import {
  createDeliveryDashboardService,
  type DeliveryDashboardQueries,
} from "../../../server/services/delivery-dashboard-service";

const projectId = "11111111-1111-4111-8111-111111111111";

describe("delivery dashboard service", () => {
  it("maps stored timestamps into a safe public summary", async () => {
    const queries: DeliveryDashboardQueries = {
      findProjectById: vi.fn(async () => ({ id: projectId })),
      listDeliverySummaries: vi.fn(async () => [
        {
          deliveryId: "delivery-id",
          eventId: "event-id",
          eventType: "user.created",
          endpointId: "endpoint-id",
          endpointUrl: "https://example.com/webhooks",
          endpointActive: true,
          runId: "run-id",
          runNumber: 1,
          status: "delivered" as const,
          attemptCount: 1,
          nextAttemptAt: null,
          deliveredAt: new Date("2026-10-18T12:01:00.000Z"),
          updatedAt: new Date("2026-10-18T12:01:00.000Z"),
        },
      ]),
    };
    const service = createDeliveryDashboardService(queries);

    const result = await service.listDeliveries(projectId);

    expect(result).toEqual({
      kind: "listed",
      deliveries: [
        expect.objectContaining({
          deliveryId: "delivery-id",
          status: "delivered",
          deliveredAt: "2026-10-18T12:01:00.000Z",
          nextAttemptAt: null,
          updatedAt: "2026-10-18T12:01:00.000Z",
        }),
      ],
    });
  });
});
