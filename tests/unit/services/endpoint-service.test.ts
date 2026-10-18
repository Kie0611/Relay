import { describe, expect, it, vi } from "vitest";
import {
  createEndpointService,
  type EndpointQueries,
  type StoredEndpoint,
} from "../../../server/services/endpoint-service";

const projectId = "11111111-1111-4111-8111-111111111111";
const endpointId = "22222222-2222-4222-8222-222222222222";

function createStoredEndpoint(
  overrides: Partial<StoredEndpoint> = {},
): StoredEndpoint {
  return {
    id: endpointId,
    projectId,
    url: "https://example.com/webhooks",
    signingSecret: "stored-secret",
    active: true,
    createdAt: new Date("2026-10-18T12:00:00.000Z"),
    updatedAt: new Date("2026-10-18T12:00:00.000Z"),
    ...overrides,
  };
}

function createQueryMocks(): EndpointQueries {
  return {
    findProjectById: vi.fn<EndpointQueries["findProjectById"]>(
      async () => ({ id: projectId }),
    ),
    createEndpoint: vi.fn<EndpointQueries["createEndpoint"]>(
      async (input) =>
        createStoredEndpoint({
          projectId: input.projectId,
          url: input.url,
          signingSecret: input.signingSecret,
        }),
    ),
    rotateEndpointSecret: vi.fn<
      EndpointQueries["rotateEndpointSecret"]
    >(async (input) =>
      createStoredEndpoint({
        projectId: input.projectId,
        signingSecret: input.signingSecret,
        updatedAt: new Date("2026-10-18T12:01:00.000Z"),
      })),
    listEndpoints: vi.fn<EndpointQueries["listEndpoints"]>(
      async () => [],
    ),
    setEndpointActive: vi.fn<
      EndpointQueries["setEndpointActive"]
    >(async () => createStoredEndpoint()),
  };
}

describe("endpoint service", () => {
  it("does not generate or persist an endpoint when the project is missing", async () => {
    const queries = createQueryMocks();
    vi.mocked(queries.findProjectById).mockResolvedValue(null);
    const generateSecret = vi.fn(() => "generated-secret");
    const service = createEndpointService(queries, generateSecret);

    const result = await service.createEndpoint({
      projectId,
      url: "https://example.com/webhooks",
    });

    expect(result).toEqual({ kind: "project_not_found" });
    expect(generateSecret).not.toHaveBeenCalled();
    expect(queries.createEndpoint).not.toHaveBeenCalled();
  });

  it("generates a secret and returns it only with the created endpoint", async () => {
    const queries = createQueryMocks();
    const generateSecret = vi.fn(() => "generated-secret");
    const service = createEndpointService(queries, generateSecret);

    const result = await service.createEndpoint({
      projectId,
      url: "https://example.com/webhooks",
    });

    expect(result).toEqual({
      kind: "created",
      endpoint: {
        id: endpointId,
        projectId,
        url: "https://example.com/webhooks",
        active: true,
        signingSecret: "generated-secret",
        createdAt: "2026-10-18T12:00:00.000Z",
        updatedAt: "2026-10-18T12:00:00.000Z",
      },
    });
    expect(queries.createEndpoint).toHaveBeenCalledWith({
      projectId,
      url: "https://example.com/webhooks",
      signingSecret: "generated-secret",
    });
  });

  it("rotates the secret for an endpoint scoped to the project", async () => {
    const queries = createQueryMocks();
    const generateSecret = vi.fn(() => "rotated-secret");
    const service = createEndpointService(queries, generateSecret);

    const result = await service.rotateEndpointSecret({
      projectId,
      endpointId,
    });

    expect(result).toMatchObject({
      kind: "rotated",
      endpoint: {
        id: endpointId,
        projectId,
        signingSecret: "rotated-secret",
        updatedAt: "2026-10-18T12:01:00.000Z",
      },
    });
    expect(queries.rotateEndpointSecret).toHaveBeenCalledWith({
      projectId,
      endpointId,
      signingSecret: "rotated-secret",
    });
  });

  it("returns endpoint_not_found when rotation affects no project-scoped row", async () => {
    const queries = createQueryMocks();
    vi.mocked(queries.rotateEndpointSecret).mockResolvedValue(null);
    const service = createEndpointService(
      queries,
      () => "rotated-secret",
    );

    const result = await service.rotateEndpointSecret({
      projectId,
      endpointId,
    });

    expect(result).toEqual({ kind: "endpoint_not_found" });
  });
});
