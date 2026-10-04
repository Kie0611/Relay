import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createHealthRouter } from "../../../server/routes/health";

function createTestApp(readinessCheck: () => Promise<boolean>) {
  const app = express();

  app.use(createHealthRouter(readinessCheck));

  return app;
}

describe("health routes", () => {
  it("returns 200 when the server is alive", async () => {
    const readinessCheck = vi.fn(async () => true);
    const app = createTestApp(readinessCheck);

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
    });
    expect(readinessCheck).not.toHaveBeenCalled();
  });

  it("returns 200 when the database is ready", async () => {
    const readinessCheck = vi.fn(async () => true);
    const app = createTestApp(readinessCheck);

    const response = await request(app).get("/ready");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ready",
      database: "available",
    });
    expect(readinessCheck).toHaveBeenCalledOnce();
  });

  it("returns 503 when the database is unavailable", async () => {
    const readinessCheck = vi.fn(async () => false);
    const app = createTestApp(readinessCheck);

    const response = await request(app).get("/ready");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: "not_ready",
      database: "unavailable",
    });
    expect(readinessCheck).toHaveBeenCalledOnce();
  });
});
