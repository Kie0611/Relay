import { timingSafeEqual } from "node:crypto";
import express from "express";
import type { Request, Response, Router } from "express";
import type { ZodError } from "zod";
import { createApiKeyRequestSchema } from "../schemas/api-keys";
import type { ApiKeyService } from "../services/api-key-service";

function sendValidationError(res: Response, error: ZodError) {
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

function matchesSecret(
  provided: string | undefined,
  expected: string | undefined,
): boolean {
  if (!provided || !expected) {
    return false;
  }

  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

export function createApiKeysRouter(
  service: ApiKeyService,
  adminKey: string | undefined,
): Router {
  const apiKeysRouter = express.Router();

  apiKeysRouter.post(
    "/projects/:projectId/api-keys",
    async (req: Request, res: Response) => {
      if (!matchesSecret(req.get("X-Relay-Admin-Key"), adminKey)) {
        return res.status(401).json({
          error: {
            code: "ADMIN_AUTHENTICATION_REQUIRED",
            message: "A valid admin key is required",
          },
        });
      }

      const parsed = createApiKeyRequestSchema.safeParse({
        projectId: req.params.projectId,
        body: req.body,
      });

      if (!parsed.success) {
        return sendValidationError(res, parsed.error);
      }

      try {
        const result = await service.createApiKey({
          projectId: parsed.data.projectId,
          name: parsed.data.body.name,
        });

        if (result.kind === "project_not_found") {
          return res.status(404).json({
            error: {
              code: "PROJECT_NOT_FOUND",
              message: "Project was not found",
            },
          });
        }

        return res.status(201).json(result.apiKey);
      } catch {
        return res.status(500).json({
          error: {
            code: "INTERNAL_ERROR",
            message: "Unable to create API key",
          },
        });
      }
    },
  );

  return apiKeysRouter;
}
