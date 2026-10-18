import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../../db";
import { endpoints, projects } from "../../../db/schema";
import { endpointQueries } from "../../../db/queries/endpoints";

const createdProjectIds: string[] = [];

async function createProject() {
  const [project] = await db
    .insert(projects)
    .values({ name: `endpoint-test-${randomUUID()}` })
    .returning({ id: projects.id });

  createdProjectIds.push(project.id);

  return project.id;
}

afterEach(async () => {
  const projectIds = createdProjectIds.splice(0);

  for (const projectId of projectIds) {
    await db
      .delete(endpoints)
      .where(eq(endpoints.projectId, projectId));
    await db.delete(projects).where(eq(projects.id, projectId));
  }
});

describe("endpoint queries", () => {
  it("creates an endpoint for an existing project", async () => {
    const projectId = await createProject();

    const endpoint = await endpointQueries.createEndpoint({
      projectId,
      url: "https://example.com/webhooks",
      signingSecret: "initial-secret",
    });

    expect(endpoint).toMatchObject({
      projectId,
      url: "https://example.com/webhooks",
      signingSecret: "initial-secret",
      active: true,
    });
  });

  it("rotates a secret only inside the requested project", async () => {
    const projectId = await createProject();
    const otherProjectId = await createProject();
    const endpoint = await endpointQueries.createEndpoint({
      projectId,
      url: "https://example.com/webhooks",
      signingSecret: "initial-secret",
    });

    const rotated = await endpointQueries.rotateEndpointSecret({
      projectId,
      endpointId: endpoint.id,
      signingSecret: "rotated-secret",
    });
    const crossProjectRotation =
      await endpointQueries.rotateEndpointSecret({
        projectId: otherProjectId,
        endpointId: endpoint.id,
        signingSecret: "should-not-apply",
      });

    expect(rotated).toMatchObject({
      id: endpoint.id,
      projectId,
      signingSecret: "rotated-secret",
    });
    expect(crossProjectRotation).toBeNull();
  });
});
