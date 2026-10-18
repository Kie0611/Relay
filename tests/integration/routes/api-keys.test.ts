import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApiKeysRouter } from "../../../server/routes/api-keys";
import type { ApiKeyService } from "../../../server/services/api-key-service";
import { createApp } from "../../../server/app";

const projectId = "11111111-1111-4111-8111-111111111111";

function createTestApp(
  service: ApiKeyService,
  adminKey = "admin-secret",
) {
  const app = express();
  app.use(express.json());
  app.use("/api", createApiKeysRouter(service, adminKey));
  return app;
}

describe("API-key route", () => {
  it("returns a project key only when the admin key is valid", async () => {
    const service: ApiKeyService = {
      createApiKey: vi.fn<ApiKeyService["createApiKey"]>(async () => ({
        kind: "created",
        apiKey: {
          id: "key-id",
          projectId,
          name: "Dashboard",
          keyPrefix: "relay_pk_test-se",
          createdAt: "2026-10-18T12:00:00.000Z",
          key: "relay_pk_test-secret",
        },
      })),
    };

    const response = await request(createTestApp(service))
      .post(`/api/projects/${projectId}/api-keys`)
      .set("X-Relay-Admin-Key", "admin-secret")
      .send({ name: "Dashboard" });

    expect(response.status).toBe(201);
    expect(response.body.key).toBe("relay_pk_test-secret");
    expect(service.createApiKey).toHaveBeenCalledWith({
      projectId,
      name: "Dashboard",
    });
  });

  it("rejects a request with an invalid admin key", async () => {
    const service: ApiKeyService = {
      createApiKey: vi.fn<ApiKeyService["createApiKey"]>(),
    };

    const response = await request(createTestApp(service))
      .post(`/api/projects/${projectId}/api-keys`)
      .set("X-Relay-Admin-Key", "wrong")
      .send({ name: "Dashboard" });

    expect(response.status).toBe(401);
    expect(service.createApiKey).not.toHaveBeenCalled();
  });

  it("enforces project authentication when the app enables auth", async () => {
    const response = await request(
      createApp({ requireAuth: true, adminKey: "admin-secret" }),
    ).get(`/api/projects/${projectId}/endpoints`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_API_KEY");
  });
});
