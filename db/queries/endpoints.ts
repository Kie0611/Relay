import { and, eq, sql } from "drizzle-orm";
import { db } from "../index";
import { endpoints, projects } from "../schema";
import type {
  EndpointQueries,
  StoredEndpoint,
} from "../../server/services/endpoint-service";
import {
  decryptSigningSecret,
  encryptSigningSecret,
} from "../../server/security/secret-box";

const endpointSelection = {
  id: endpoints.id,
  projectId: endpoints.projectId,
  url: endpoints.url,
  signingSecret: endpoints.signingSecret,
  active: endpoints.active,
  createdAt: endpoints.createdAt,
  updatedAt: endpoints.updatedAt,
};

function toStoredEndpoint(
  endpoint: typeof endpoints.$inferSelect,
): StoredEndpoint {
  return {
    id: endpoint.id,
    projectId: endpoint.projectId,
    url: endpoint.url,
    signingSecret: decryptSigningSecret(endpoint.signingSecret),
    active: endpoint.active,
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
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

async function createEndpoint(input: {
  projectId: string;
  url: string;
  signingSecret: string;
}): Promise<StoredEndpoint> {
  const rows = await db
    .insert(endpoints)
    .values({
      projectId: input.projectId,
      url: input.url,
      signingSecret: encryptSigningSecret(input.signingSecret),
    })
    .returning(endpointSelection);

  const endpoint = rows[0];

  if (!endpoint) {
    throw new Error("Endpoint was not created");
  }

  return toStoredEndpoint(endpoint);
}

async function rotateEndpointSecret(input: {
  projectId: string;
  endpointId: string;
  signingSecret: string;
}): Promise<StoredEndpoint | null> {
  const rows = await db
    .update(endpoints)
    .set({
      signingSecret: encryptSigningSecret(input.signingSecret),
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(endpoints.id, input.endpointId),
        eq(endpoints.projectId, input.projectId),
      ),
    )
    .returning(endpointSelection);

  const endpoint = rows[0];

  return endpoint ? toStoredEndpoint(endpoint) : null;
}

async function listEndpoints(
  projectId: string,
): Promise<StoredEndpoint[]> {
  const rows = await db
    .select(endpointSelection)
    .from(endpoints)
    .where(eq(endpoints.projectId, projectId))
    .orderBy(endpoints.createdAt);

  return rows.map(toStoredEndpoint);
}

async function setEndpointActive(input: {
  projectId: string;
  endpointId: string;
  active: boolean;
}): Promise<StoredEndpoint | null> {
  const rows = await db
    .update(endpoints)
    .set({
      active: input.active,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(endpoints.id, input.endpointId),
        eq(endpoints.projectId, input.projectId),
      ),
    )
    .returning(endpointSelection);

  const endpoint = rows[0];

  return endpoint ? toStoredEndpoint(endpoint) : null;
}

export const endpointQueries: EndpointQueries = {
  findProjectById,
  createEndpoint,
  rotateEndpointSecret,
  listEndpoints,
  setEndpointActive,
};
