import { createHash, randomBytes } from "node:crypto";

export type CreateApiKeyInput = {
  projectId: string;
  name: string;
};

export type StoredApiKey = {
  id: string;
  projectId: string;
  name: string;
  keyPrefix: string;
  createdAt: Date;
  revokedAt: Date | null;
};

export type PublicApiKey = Omit<
  StoredApiKey,
  "revokedAt" | "createdAt"
> & {
  createdAt: string;
};

export type CreatedApiKey = PublicApiKey & {
  key: string;
};

export type ApiKeyQueries = {
  findProjectById(
    projectId: string,
  ): Promise<{ id: string } | null>;

  createApiKey(input: {
    projectId: string;
    name: string;
    keyPrefix: string;
    keyHash: string;
  }): Promise<StoredApiKey>;

  findActiveApiKey(input: {
    projectId: string;
    keyHash: string;
  }): Promise<{ id: string } | null>;
};

export type CreateApiKeyResult =
  | {
      kind: "created";
      apiKey: CreatedApiKey;
    }
  | {
      kind: "project_not_found";
    };

export type ApiKeyService = {
  createApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult>;
};

const keyPrefix = "relay_pk_";

export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey, "utf8").digest("hex");
}

function toPublicApiKey(apiKey: StoredApiKey): PublicApiKey {
  return {
    id: apiKey.id,
    projectId: apiKey.projectId,
    name: apiKey.name,
    keyPrefix: apiKey.keyPrefix,
    createdAt: apiKey.createdAt.toISOString(),
  };
}

export function createApiKeyService(
  queries: ApiKeyQueries,
  generateSecret: () => string = () =>
    `${keyPrefix}${randomBytes(32).toString("base64url")}`,
): ApiKeyService {
  return {
    async createApiKey(
      input: CreateApiKeyInput,
    ): Promise<CreateApiKeyResult> {
      const project = await queries.findProjectById(input.projectId);

      if (!project) {
        return {
          kind: "project_not_found",
        };
      }

      const key = generateSecret();
      const stored = await queries.createApiKey({
        projectId: input.projectId,
        name: input.name,
        keyPrefix: key.slice(0, 16),
        keyHash: hashApiKey(key),
      });

      return {
        kind: "created",
        apiKey: {
          ...toPublicApiKey(stored),
          key,
        },
      };
    },
  };
}
