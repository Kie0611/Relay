import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createEventsRouter } from "../../../server/routes/events";
import type {
  PublicEvent,
  PublishEvent,
} from "../../../server/services/event-service";

const projectId = "11111111-1111-4111-8111-111111111111";

const sampleEvent: PublicEvent = {
  id: "22222222-2222-4222-8222-222222222222",
  projectId,
  type: "user.created",
  payload: { userId: "user-1" },
  idempotencyKey: "event-1",
  createdAt: "2026-10-10T00:00:00.000Z",
};

function createTestApp(publishEvent: PublishEvent) {
  const app = express();

  app.use(express.json());
  app.use("/api", createEventsRouter(publishEvent));

  return app;
}

describe("event routes", () => {
  it("returns 202 for a valid event", async () => {
    const publishEvent = vi.fn<PublishEvent>(async () => ({
      kind: "created",
      event: sampleEvent,
    }));
    const app = createTestApp(publishEvent);

    const response = await request(app)
      .post(`/api/projects/${projectId}/events`)
      .set("Idempotency-Key", "event-1")
      .send({
        type: "user.created",
        payload: { userId: "user-1" },
      });

    expect(response.status).toBe(202);
    expect(response.body).toEqual(sampleEvent);
    expect(publishEvent).toHaveBeenCalledOnce();
    expect(publishEvent).toHaveBeenCalledWith({
      projectId,
      idempotencyKey: "event-1",
      type: "user.created",
      payload: { userId: "user-1" },
    });
  });

  it("returns 400 and does not call the service when the idempotency key is missing", async () => {
    const publishEvent = vi.fn<PublishEvent>(async () => ({
      kind: "created",
      event: sampleEvent,
    }));
    const app = createTestApp(publishEvent);

    const response = await request(app)
      .post(`/api/projects/${projectId}/events`)
      .send({
        type: "user.created",
        payload: { userId: "user-1" },
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
    });
    expect(response.body.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "idempotencyKey",
        }),
      ]),
    );
    expect(publishEvent).not.toHaveBeenCalled();
  });

  it("returns 404 when the project does not exist", async () => {
    const publishEvent = vi.fn<PublishEvent>(async () => ({
      kind: "project_not_found",
    }));
    const app = createTestApp(publishEvent);

    const response = await request(app)
      .post(`/api/projects/${projectId}/events`)
      .set("Idempotency-Key", "event-1")
      .send({
        type: "user.created",
        payload: { userId: "user-1" },
      });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: "PROJECT_NOT_FOUND",
        message: "Project was not found",
      },
    });
    expect(publishEvent).toHaveBeenCalledOnce();
    expect(publishEvent).toHaveBeenCalledWith({
      projectId,
      idempotencyKey: "event-1",
      type: "user.created",
      payload: { userId: "user-1" },
    });
  });

  it("returns 409 when the idempotency key conflicts with existing event data", async () => {
    const publishEvent = vi.fn<PublishEvent>(async () => ({
      kind: "idempotency_conflict",
    }));
    const app = createTestApp(publishEvent);

    const response = await request(app)
      .post(`/api/projects/${projectId}/events`)
      .set("Idempotency-Key", "event-1")
      .send({
        type: "user.created",
        payload: { userId: "user-1" },
      });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: "IDEMPOTENCY_CONFLICT",
        message:
          "This idempotency key was already used with different event data",
      },
    });
    expect(publishEvent).toHaveBeenCalledOnce();
    expect(publishEvent).toHaveBeenCalledWith({
      projectId,
      idempotencyKey: "event-1",
      type: "user.created",
      payload: { userId: "user-1" },
    });
  });

  it("returns 202 with the existing event when the request is replayed", async () => {
    const publishEvent = vi.fn<PublishEvent>(async () => ({
      kind: "replayed",
      event: sampleEvent,
    }));
    const app = createTestApp(publishEvent);

    const response = await request(app)
      .post(`/api/projects/${projectId}/events`)
      .set("Idempotency-Key", "event-1")
      .send({
        type: "user.created",
        payload: { userId: "user-1" },
      });

    expect(response.status).toBe(202);
    expect(response.body).toEqual(sampleEvent);
    expect(publishEvent).toHaveBeenCalledOnce();
    expect(publishEvent).toHaveBeenCalledWith({
      projectId,
      idempotencyKey: "event-1",
      type: "user.created",
      payload: { userId: "user-1" },
    });
  });

  it("returns 500 with a stable error when the service fails unexpectedly", async () => {
    const publishEvent = vi.fn<PublishEvent>(async () => {
      throw new Error("database connection details must not leak");
    });
    const app = createTestApp(publishEvent);

    const response = await request(app)
      .post(`/api/projects/${projectId}/events`)
      .set("Idempotency-Key", "event-1")
      .send({
        type: "user.created",
        payload: { userId: "user-1" },
      });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to publish event",
      },
    });
    expect(JSON.stringify(response.body)).not.toContain(
      "database connection details",
    );
    expect(publishEvent).toHaveBeenCalledOnce();
  });
});
