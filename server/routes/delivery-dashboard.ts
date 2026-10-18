import express from "express";
import type { Request, Response, Router } from "express";
import type { ZodError } from "zod";
import { z } from "zod";
import type { DeliveryDashboardService } from "../services/delivery-dashboard-service";

const projectParamsSchema = z.object({
  projectId: z.uuid(),
});

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

export function createDeliveryDashboardRouter(
  service: DeliveryDashboardService,
): Router {
  const router = express.Router();

  router.get(
    "/projects/:projectId/deliveries",
    async (req: Request, res: Response) => {
      const parsed = projectParamsSchema.safeParse(req.params);

      if (!parsed.success) {
        return sendValidationError(res, parsed.error);
      }

      try {
        const result = await service.listDeliveries(
          parsed.data.projectId,
        );

        if (result.kind === "project_not_found") {
          return res.status(404).json({
            error: {
              code: "PROJECT_NOT_FOUND",
              message: "Project was not found",
            },
          });
        }

        return res.status(200).json({
          deliveries: result.deliveries,
        });
      } catch {
        return res.status(500).json({
          error: {
            code: "INTERNAL_ERROR",
            message: "Unable to list deliveries",
          },
        });
      }
    },
  );

  return router;
}
