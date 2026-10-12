import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createDeliveriesRouter } from "../../../server/routes/deliveries";

const projectId = "11111111-1111-4111-8111-111111111111";
const deliveryId = "22222222-2222-4222-8222-222222222222";

type ReplayDeliveryInput = {
  projectId: string;
  deliveryId: string;
};

type PublicDeliveryRun = {
  deliveryId: string;
  runId: string;
  runNumber: number;
  runType: "manual_replay";
  status: "pending";
};

type ReplayDeliveryResult =
  | {
      kind: "created";
      run: PublicDeliveryRun;
    }
  | {
      kind: "delivery_not_found";
    }
  | {
      kind: "not_replayable";
    };

type ReplayDelivery = (
  input: ReplayDeliveryInput,
) => Promise<ReplayDeliveryResult>;

const sampleReplayRun: PublicDeliveryRun = {
  deliveryId,
  runId: "33333333-3333-4333-8333-333333333333",
  runNumber: 2,
  runType: "manual_replay",
  status: "pending",
};

function createTestApp(replayDelivery: ReplayDelivery) {
  const app = express();

  app.use(express.json());
  app.use("/api", createDeliveriesRouter(replayDelivery));

  return app;
}

describe("delivery replay routes", () => {
  it("returns 202 and creates a pending manual replay run", async () => {
    const replayDelivery = vi.fn<ReplayDelivery>(async () => ({
      kind: "created",
      run: sampleReplayRun,
    }));
    const app = createTestApp(replayDelivery);

    const response = await request(app).post(
      `/api/projects/${projectId}/deliveries/${deliveryId}/replay`,
    );

    expect(response.status).toBe(202);
    expect(response.body).toEqual(sampleReplayRun);
    expect(replayDelivery).toHaveBeenCalledOnce();
    expect(replayDelivery).toHaveBeenCalledWith({
      projectId,
      deliveryId,
    });
  });

  it("returns 400 and does not call the service for an invalid delivery ID", async () => {
    const replayDelivery = vi.fn<ReplayDelivery>(async () => ({
      kind: "created",
      run: sampleReplayRun,
    }));
    const app = createTestApp(replayDelivery);

    const response = await request(app).post(
      `/api/projects/${projectId}/deliveries/not-a-uuid/replay`,
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
    });
    expect(response.body.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "deliveryId",
        }),
      ]),
    );
    expect(replayDelivery).not.toHaveBeenCalled();
  });

  it("returns 404 when the delivery is missing or belongs to another project", async () => {
    const replayDelivery = vi.fn<ReplayDelivery>(async () => ({
      kind: "delivery_not_found",
    }));
    const app = createTestApp(replayDelivery);

    const response = await request(app).post(
      `/api/projects/${projectId}/deliveries/${deliveryId}/replay`,
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: "DELIVERY_NOT_FOUND",
        message: "Delivery was not found",
      },
    });
    expect(replayDelivery).toHaveBeenCalledOnce();
  });

  it("returns 409 when the latest run cannot be replayed", async () => {
    const replayDelivery = vi.fn<ReplayDelivery>(async () => ({
      kind: "not_replayable",
    }));
    const app = createTestApp(replayDelivery);

    const response = await request(app).post(
      `/api/projects/${projectId}/deliveries/${deliveryId}/replay`,
    );

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: "DELIVERY_NOT_REPLAYABLE",
        message: "Delivery cannot be replayed in its current state",
      },
    });
    expect(replayDelivery).toHaveBeenCalledOnce();
  });

  it("returns 500 with a stable error when the service fails unexpectedly", async () => {
    const replayDelivery = vi.fn<ReplayDelivery>(async () => {
      throw new Error("database details must not leak");
    });
    const app = createTestApp(replayDelivery);

    const response = await request(app).post(
      `/api/projects/${projectId}/deliveries/${deliveryId}/replay`,
    );

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to replay delivery",
      },
    });
    expect(JSON.stringify(response.body)).not.toContain(
      "database details must not leak",
    );
    expect(replayDelivery).toHaveBeenCalledOnce();
  });
});
