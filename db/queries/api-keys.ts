import { and, eq, isNull } from "drizzle-orm";
import { db } from "../index";
import { projectApiKeys, projects } from "../schema";
import type {
  ApiKeyQueries,
  StoredApiKey,
} from "../../server/services/api-key-service";

function toStoredApiKey(
  apiKey: typeof projectApiKeys.$inferSelect,
): StoredApiKey {
  return {
    id: apiKey.id,
    projectId: apiKey.projectId,
    name: apiKey.name,
    keyPrefix: apiKey.keyPrefix,
    createdAt: apiKey.createdAt,
    revokedAt: apiKey.revokedAt,
  };
}

async function findProjectById(
  projectId: string,
): Promise<{ id: string } | null> {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  return rows[0] ?? null;
}

async function createApiKey(input: {
  projectId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
}): Promise<StoredApiKey> {
  const rows = await db
    .insert(projectApiKeys)
    .values(input)
    .returning();
  const apiKey = rows[0];

  if (!apiKey) {
    throw new Error("API key was not created");
  }

  return toStoredApiKey(apiKey);
}

async function findActiveApiKey(input: {
  projectId: string;
  keyHash: string;
}): Promise<{ id: string } | null> {
  const rows = await db
    .select({ id: projectApiKeys.id })
    .from(projectApiKeys)
    .where(
      and(
        eq(projectApiKeys.projectId, input.projectId),
        eq(projectApiKeys.keyHash, input.keyHash),
        isNull(projectApiKeys.revokedAt),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export const apiKeyQueries: ApiKeyQueries = {
  findProjectById,
  createApiKey,
  findActiveApiKey,
};
