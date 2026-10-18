import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createProjectAuthMiddleware } from "../../../server/middleware/project-auth";
import {
  hashApiKey,
  type ApiKeyQueries,
} from "../../../server/services/api-key-service";

const projectId = "11111111-1111-4111-8111-111111111111";

function createTestApp(queries: ApiKeyQueries) {
  const app = express();
  app.use(
    "/projects/:projectId",
    createProjectAuthMiddleware(queries),
  );
  app.get("/projects/:projectId/resource", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

function createQueries() {
  return {
    findProjectById: vi.fn(async () => ({ id: projectId })),
    createApiKey: vi.fn(),
    findActiveApiKey: vi.fn<ApiKeyQueries["findActiveApiKey"]>(
      async () => ({ id: "key-id" }),
    ),
  } satisfies ApiKeyQueries;
}

describe("project API-key middleware", () => {
  it("rejects a request without a key", async () => {
    const queries = createQueries();
    const response = await request(createTestApp(queries)).get(
      `/projects/${projectId}/resource`,
    );

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_API_KEY");
    expect(queries.findActiveApiKey).not.toHaveBeenCalled();
  });

  it("authorizes a project-scoped bearer key", async () => {
    const queries = createQueries();
    const response = await request(createTestApp(queries))
      .get(`/projects/${projectId}/resource`)
      .set("Authorization", "Bearer relay_pk_test-secret");

    expect(response.status).toBe(200);
    expect(queries.findActiveApiKey).toHaveBeenCalledWith({
      projectId,
      keyHash: hashApiKey("relay_pk_test-secret"),
    });
  });
});
