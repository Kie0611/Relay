import express from "express";
import type { Request, Response, Router } from "express";
import { z } from "zod";
import { eventTypeEnum } from "../../db/schema";

const eventTypeSchema = z.enum(eventTypeEnum.enumValues);

const publishEventRequestSchema = z.object({
  projectId: z.uuid(),
  idempotencyKey: z.string().trim().min(1).max(255),
  body: z.object({
    type: eventTypeSchema,
    payload: z.record(z.string(), z.unknown()),
  })
    .strict(),
});

export type EventType = z.infer<typeof eventTypeSchema>;

export type PublishEventInput = {
  projectId: string;
  idempotencyKey: string;
  type: EventType;
  payload: Record<string, unknown>;
};

export type PublicEvent = {
  id: string;
  projectId: string;
  type: EventType;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  createdAt: string;
};

export type PublishEventResult =
  | { kind: "created"; event: PublicEvent }
  | { kind: "replayed"; event: PublicEvent }
  | { kind: "project_not_found" }
  | { kind: "idempotency_conflict" };

export type PublishEvent = (input : PublishEventInput) => Promise<PublishEventResult>;

function sendValidationError(res: Response, error: z.ZodError) {
  return res.status(400).json({
    error: {
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      issues: error.issues.map((issue) => ({
        path: issue.path.join(".") || "_form",
        message: issue.message,
      })),
    },
  });
}

export function createEventsRouter(publishEvent: PublishEvent): Router {
  const eventsRouter = express.Router();

  eventsRouter.post(
    "/projects/:projectId/events",
    async (req: Request, res: Response) => {
      const parsed = publishEventRequestSchema.safeParse({
        projectId: req.params.projectId,
        idempotencyKey: req.get("Idempotency-Key"),
        body: req.body,
      });

      if (!parsed.success) {
        return sendValidationError(res, parsed.error);
      }

      try {
        const result = await publishEvent({
          projectId: parsed.data.projectId,
          idempotencyKey: parsed.data.idempotencyKey,
          type: parsed.data.body.type,
          payload: parsed.data.body.payload,
        });

        switch (result.kind) {
          case "project_not_found":
            return res.status(404).json({
              error: {
                code: "PROJECT_NOT_FOUND",
                message: "Project was not found",
              },
            });

          case "idempotency_conflict":
            return res.status(409).json({
              error: {
                code: "IDEMPOTENCY_CONFLICT",
                message:
                  "This idempotency key was already used with different event data",
              },
            });

          case "created":
          case "replayed":
            return res.status(202).json(result.event);
        }
      } catch {
        return res.status(500).json({
          error: {
            code: "INTERNAL_ERROR",
            message: "Unable to publish event",
          },
        });
      }
    },
  );

  return eventsRouter;
}