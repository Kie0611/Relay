import type { ProjectData } from "./types";

export const demoProjectId = "00000000-0000-4000-8000-000000000001";
export const demoProjectName = "Acme Commerce";

const endpointPrimary = "demo-endpoint-primary";
const endpointBackup = "demo-endpoint-backup";
const eventCreated = "demo-event-created";
const eventInvoice = "demo-event-invoice";
const eventDeleted = "demo-event-deleted";
const deliveryCreated = "demo-delivery-created";
const deliveryInvoice = "demo-delivery-invoice";
const deliveryDeleted = "demo-delivery-deleted";

export const demoData: ProjectData = {
  endpoints: [
    {
      id: endpointPrimary,
      projectId: demoProjectId,
      url: "https://api.acme.test/webhooks/relay",
      active: true,
      createdAt: "2026-10-17T08:30:00.000Z",
      updatedAt: "2026-10-18T08:15:00.000Z",
    },
    {
      id: endpointBackup,
      projectId: demoProjectId,
      url: "https://backup.acme.test/events",
      active: false,
      createdAt: "2026-10-12T11:20:00.000Z",
      updatedAt: "2026-10-17T16:40:00.000Z",
    },
  ],
  deliveries: [
    {
      deliveryId: deliveryCreated,
      eventId: eventCreated,
      eventType: "user.created",
      endpointId: endpointPrimary,
      endpointUrl: "https://api.acme.test/webhooks/relay",
      endpointActive: true,
      runId: "demo-run-created",
      runNumber: 1,
      runType: "initial",
      status: "delivered",
      attemptCount: 1,
      nextAttemptAt: null,
      deliveredAt: "2026-10-18T08:18:00.000Z",
      updatedAt: "2026-10-18T08:18:00.000Z",
      lastResponseStatus: 200,
    },
    {
      deliveryId: deliveryInvoice,
      eventId: eventInvoice,
      eventType: "invoice.updated",
      endpointId: endpointPrimary,
      endpointUrl: "https://api.acme.test/webhooks/relay",
      endpointActive: true,
      runId: "demo-run-invoice",
      runNumber: 1,
      runType: "initial",
      status: "retrying",
      attemptCount: 2,
      nextAttemptAt: "2026-10-18T08:25:00.000Z",
      deliveredAt: null,
      updatedAt: "2026-10-18T08:20:00.000Z",
      lastResponseStatus: 503,
    },
    {
      deliveryId: deliveryDeleted,
      eventId: eventDeleted,
      eventType: "user.deleted",
      endpointId: endpointBackup,
      endpointUrl: "https://backup.acme.test/events",
      endpointActive: false,
      runId: "demo-run-deleted",
      runNumber: 1,
      runType: "initial",
      status: "failed",
      attemptCount: 1,
      nextAttemptAt: null,
      deliveredAt: null,
      updatedAt: "2026-10-18T07:52:00.000Z",
      lastResponseStatus: 400,
    },
  ],
  events: [
    {
      id: eventCreated,
      type: "user.created",
      payload: { userId: "usr_019", plan: "pro", region: "eu-west" },
      createdAt: "2026-10-18T08:17:42.000Z",
      deliveryCount: 1,
      source: "preview",
    },
    {
      id: eventInvoice,
      type: "invoice.updated",
      payload: { invoiceId: "inv_204", status: "past_due", amount: 8400 },
      createdAt: "2026-10-18T08:19:11.000Z",
      deliveryCount: 1,
      source: "preview",
    },
    {
      id: eventDeleted,
      type: "user.deleted",
      payload: { userId: "usr_014", reason: "request" },
      createdAt: "2026-10-18T07:51:08.000Z",
      deliveryCount: 1,
      source: "preview",
    },
  ],
  attempts: [
    {
      id: "demo-attempt-created-1",
      deliveryId: deliveryCreated,
      attemptNumber: 1,
      responseStatus: 200,
      errorCode: null,
      startedAt: "2026-10-18T08:17:58.000Z",
      completedAt: "2026-10-18T08:18:00.000Z",
      durationMs: 184,
    },
    {
      id: "demo-attempt-invoice-1",
      deliveryId: deliveryInvoice,
      attemptNumber: 1,
      responseStatus: 503,
      errorCode: "UPSTREAM_UNAVAILABLE",
      startedAt: "2026-10-18T08:19:20.000Z",
      completedAt: "2026-10-18T08:19:21.000Z",
      durationMs: 1009,
    },
    {
      id: "demo-attempt-invoice-2",
      deliveryId: deliveryInvoice,
      attemptNumber: 2,
      responseStatus: 503,
      errorCode: "UPSTREAM_UNAVAILABLE",
      startedAt: "2026-10-18T08:20:00.000Z",
      completedAt: "2026-10-18T08:20:02.000Z",
      durationMs: 2097,
    },
    {
      id: "demo-attempt-deleted-1",
      deliveryId: deliveryDeleted,
      attemptNumber: 1,
      responseStatus: 400,
      errorCode: "INVALID_SIGNATURE",
      startedAt: "2026-10-18T07:51:49.000Z",
      completedAt: "2026-10-18T07:51:50.000Z",
      durationMs: 842,
    },
  ],
};

export function cloneDemoData(): ProjectData {
  return structuredClone(demoData);
}
