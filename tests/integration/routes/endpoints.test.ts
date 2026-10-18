import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createEndpointsRouter } from "../../../server/routes/endpoints";
import type {
  EndpointManagementService,
  EndpointWithSecret,
} from "../../../server/services/endpoint-service";

const projectId = "11111111-1111-4111-8111-111111111111";
const endpointId = "22222222-2222-4222-8222-222222222222";

const sampleEndpoint: EndpointWithSecret = {
  id: endpointId,
  projectId,
  url: "https://example.com/webhooks",
  signingSecret: "generated-secret",
  active: true,
  createdAt: "2026-10-18T12:00:00.000Z",
  updatedAt: "2026-10-18T12:00:00.000Z",
};

function createTestApp(service: EndpointManagementService) {
  const app = express();

  app.use(express.json());
  app.use("/api", createEndpointsRouter(service));

  return app;
}

function serviceDefaults() {
  return {
    listEndpoints: vi.fn<
      EndpointManagementService["listEndpoints"]
    >(),
    setEndpointActive: vi.fn<
      EndpointManagementService["setEndpointActive"]
    >(),
  };
}

describe("endpoint routes", () => {
  it("returns 201 for a valid endpoint registration", async () => {
    const service: EndpointManagementService = {
      ...serviceDefaults(),
      createEndpoint: vi.fn<
        EndpointManagementService["createEndpoint"]
      >(async () => ({
        kind: "created",
        endpoint: sampleEndpoint,
      })),
      rotateEndpointSecret: vi.fn<
        EndpointManagementService["rotateEndpointSecret"]
      >(),
    };
    const app = createTestApp(service);

    const response = await request(app)
      .post(`/api/projects/${projectId}/endpoints`)
      .send({ url: sampleEndpoint.url });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(sampleEndpoint);
    expect(service.createEndpoint).toHaveBeenCalledWith({
      projectId,
      url: sampleEndpoint.url,
    });
  });

  it("returns 400 and does not call the service for an invalid URL", async () => {
    const service: EndpointManagementService = {
      ...serviceDefaults(),
      createEndpoint: vi.fn<
        EndpointManagementService["createEndpoint"]
      >(),
      rotateEndpointSecret: vi.fn<
        EndpointManagementService["rotateEndpointSecret"]
      >(),
    };
    const app = createTestApp(service);

    const response = await request(app)
      .post(`/api/projects/${projectId}/endpoints`)
      .send({ url: "ftp://example.com/webhooks" });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
    });
    expect(service.createEndpoint).not.toHaveBeenCalled();
  });

  it("returns 404 when the project does not exist", async () => {
    const service: EndpointManagementService = {
      ...serviceDefaults(),
      createEndpoint: vi.fn<
        EndpointManagementService["createEndpoint"]
      >(async () => ({
        kind: "project_not_found",
      })),
      rotateEndpointSecret: vi.fn<
        EndpointManagementService["rotateEndpointSecret"]
      >(),
    };
    const app = createTestApp(service);

    const response = await request(app)
      .post(`/api/projects/${projectId}/endpoints`)
      .send({ url: sampleEndpoint.url });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: "PROJECT_NOT_FOUND",
        message: "Project was not found",
      },
    });
  });

  it("returns 200 with the new secret when rotation succeeds", async () => {
    const rotatedEndpoint = {
      ...sampleEndpoint,
      signingSecret: "rotated-secret",
      updatedAt: "2026-10-18T12:01:00.000Z",
    };
    const service: EndpointManagementService = {
      ...serviceDefaults(),
      createEndpoint: vi.fn<
        EndpointManagementService["createEndpoint"]
      >(),
      rotateEndpointSecret: vi.fn<
        EndpointManagementService["rotateEndpointSecret"]
      >(async () => ({
        kind: "rotated",
        endpoint: rotatedEndpoint,
      })),
    };
    const app = createTestApp(service);

    const response = await request(app).post(
      `/api/projects/${projectId}/endpoints/${endpointId}/rotate-secret`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual(rotatedEndpoint);
    expect(service.rotateEndpointSecret).toHaveBeenCalledWith({
      projectId,
      endpointId,
    });
  });

  it("returns 404 when the endpoint is not in the project", async () => {
    const service: EndpointManagementService = {
      ...serviceDefaults(),
      createEndpoint: vi.fn<
        EndpointManagementService["createEndpoint"]
      >(),
      rotateEndpointSecret: vi.fn<
        EndpointManagementService["rotateEndpointSecret"]
      >(async () => ({
        kind: "endpoint_not_found",
      })),
    };
    const app = createTestApp(service);

    const response = await request(app).post(
      `/api/projects/${projectId}/endpoints/${endpointId}/rotate-secret`,
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: "ENDPOINT_NOT_FOUND",
        message: "Endpoint was not found",
      },
    });
  });

  it("returns a stable error without exposing an internal failure", async () => {
    const service: EndpointManagementService = {
      ...serviceDefaults(),
      createEndpoint: vi.fn<
        EndpointManagementService["createEndpoint"]
      >(async () => {
        throw new Error("secret storage details must not leak");
      }),
      rotateEndpointSecret: vi.fn<
        EndpointManagementService["rotateEndpointSecret"]
      >(),
    };
    const app = createTestApp(service);

    const response = await request(app)
      .post(`/api/projects/${projectId}/endpoints`)
      .send({ url: sampleEndpoint.url });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to create endpoint",
      },
    });
    expect(JSON.stringify(response.body)).not.toContain(
      "secret storage details",
    );
  });

  it("lists project endpoints without returning signing secrets", async () => {
    const publicEndpoint = {
      id: endpointId,
      projectId,
      url: sampleEndpoint.url,
      active: true,
      createdAt: sampleEndpoint.createdAt,
      updatedAt: sampleEndpoint.updatedAt,
    };
    const service: EndpointManagementService = {
      ...serviceDefaults(),
      createEndpoint: vi.fn<
        EndpointManagementService["createEndpoint"]
      >(),
      rotateEndpointSecret: vi.fn<
        EndpointManagementService["rotateEndpointSecret"]
      >(),
      listEndpoints: vi.fn<
        EndpointManagementService["listEndpoints"]
      >(async () => ({
        kind: "listed",
        endpoints: [publicEndpoint],
      })),
    };
    const app = createTestApp(service);

    const response = await request(app).get(
      `/api/projects/${projectId}/endpoints`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      endpoints: [publicEndpoint],
    });
    expect(response.body.endpoints[0].signingSecret).toBeUndefined();
  });

  it("updates endpoint activation state", async () => {
    const updatedEndpoint = {
      id: endpointId,
      projectId,
      url: sampleEndpoint.url,
      active: false,
      createdAt: sampleEndpoint.createdAt,
      updatedAt: "2026-10-18T12:02:00.000Z",
    };
    const service: EndpointManagementService = {
      ...serviceDefaults(),
      createEndpoint: vi.fn<
        EndpointManagementService["createEndpoint"]
      >(),
      rotateEndpointSecret: vi.fn<
        EndpointManagementService["rotateEndpointSecret"]
      >(),
      setEndpointActive: vi.fn<
        EndpointManagementService["setEndpointActive"]
      >(async () => ({
        kind: "updated",
        endpoint: updatedEndpoint,
      })),
    };
    const app = createTestApp(service);

    const response = await request(app)
      .patch(`/api/projects/${projectId}/endpoints/${endpointId}`)
      .send({ active: false });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(updatedEndpoint);
    expect(service.setEndpointActive).toHaveBeenCalledWith({
      projectId,
      endpointId,
      active: false,
    });
  });
});
