import { describe, expect, it, vi } from "vitest";
import {
  createApiKeyService,
  hashApiKey,
  type ApiKeyQueries,
} from "../../../server/services/api-key-service";

const projectId = "11111111-1111-4111-8111-111111111111";

describe("api key service", () => {
  it("stores only a hash and returns the raw key once", async () => {
    const queries: ApiKeyQueries = {
      findProjectById: vi.fn(async () => ({ id: projectId })),
      createApiKey: vi.fn(async (input) => ({
        id: "key-id",
        projectId: input.projectId,
        name: input.name,
        keyPrefix: input.keyPrefix,
        createdAt: new Date("2026-10-18T12:00:00.000Z"),
        revokedAt: null,
      })),
      findActiveApiKey: vi.fn(async () => ({ id: "key-id" })),
    };
    const service = createApiKeyService(
      queries,
      () => "relay_pk_test-secret",
    );

    const result = await service.createApiKey({
      projectId,
      name: "Dashboard",
    });

    expect(result).toEqual({
      kind: "created",
      apiKey: {
        id: "key-id",
        projectId,
        name: "Dashboard",
        keyPrefix: "relay_pk_test-se",
        createdAt: "2026-10-18T12:00:00.000Z",
        key: "relay_pk_test-secret",
      },
    });
    expect(queries.createApiKey).toHaveBeenCalledWith({
      projectId,
      name: "Dashboard",
      keyPrefix: "relay_pk_test-se",
      keyHash: hashApiKey("relay_pk_test-secret"),
    });
  });
});
