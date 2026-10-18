import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../../db";
import { endpoints, projects } from "../../../db/schema";
import { app } from "../../../server/app";

const createdProjectIds: string[] = [];

async function createProject() {
  const [project] = await db
    .insert(projects)
    .values({ name: `composed-endpoint-${randomUUID()}` })
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

describe("composed endpoint management", () => {
  it("registers an endpoint and rotates its secret through the real app", async () => {
    const projectId = await createProject();

    const createResponse = await request(app)
      .post(`/api/projects/${projectId}/endpoints`)
      .send({
        url: "https://example.com/webhooks",
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      projectId,
      url: "https://example.com/webhooks",
      active: true,
      id: expect.any(String),
      signingSecret: expect.stringMatching(/^[a-f0-9]{64}$/),
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const firstSecret = createResponse.body.signingSecret;
    const endpointId = createResponse.body.id;

    const rotateResponse = await request(app).post(
      `/api/projects/${projectId}/endpoints/${endpointId}/rotate-secret`,
    );

    expect(rotateResponse.status).toBe(200);
    expect(rotateResponse.body).toMatchObject({
      id: endpointId,
      projectId,
      signingSecret: expect.stringMatching(/^[a-f0-9]{64}$/),
      updatedAt: expect.any(String),
    });
    expect(rotateResponse.body.signingSecret).not.toBe(firstSecret);
  });

  it("does not rotate an endpoint through another project", async () => {
    const firstProjectId = await createProject();
    const secondProjectId = await createProject();

    const createResponse = await request(app)
      .post(`/api/projects/${firstProjectId}/endpoints`)
      .send({
        url: "https://example.com/webhooks",
      });

    const rotateResponse = await request(app).post(
      `/api/projects/${secondProjectId}/endpoints/${createResponse.body.id}/rotate-secret`,
    );

    expect(rotateResponse.status).toBe(404);
    expect(rotateResponse.body).toEqual({
      error: {
        code: "ENDPOINT_NOT_FOUND",
        message: "Endpoint was not found",
      },
    });
  });
});
