import express from "express";
import type { Request, Response, Router } from "express";
import type { ZodError } from "zod";
import {
  createEndpointRequestSchema,
  endpointParamsSchema,
  projectParamsSchema,
  rotateEndpointSecretParamsSchema,
  setEndpointActiveBodySchema,
} from "../schemas/endpoints";
import type { EndpointManagementService } from "../services/endpoint-service";

function sendValidationError(
  res: Response,
  error: ZodError,
) {
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

export function createEndpointsRouter(
  service: EndpointManagementService,
): Router {
  const endpointsRouter = express.Router();

  endpointsRouter.post(
    "/projects/:projectId/endpoints",
    async (req: Request, res: Response) => {
      const parsed = createEndpointRequestSchema.safeParse({
        projectId: req.params.projectId,
        body: req.body,
      });

      if (!parsed.success) {
        return sendValidationError(res, parsed.error);
      }

      try {
        const result = await service.createEndpoint({
          projectId: parsed.data.projectId,
          url: parsed.data.body.url,
        });

        if (result.kind === "project_not_found") {
          return res.status(404).json({
            error: {
              code: "PROJECT_NOT_FOUND",
              message: "Project was not found",
            },
          });
        }

        return res.status(201).json(result.endpoint);
      } catch {
        return res.status(500).json({
          error: {
            code: "INTERNAL_ERROR",
            message: "Unable to create endpoint",
          },
        });
      }
    },
  );

  endpointsRouter.get(
    "/projects/:projectId/endpoints",
    async (req: Request, res: Response) => {
      const parsed = projectParamsSchema.safeParse(req.params);

      if (!parsed.success) {
        return sendValidationError(res, parsed.error);
      }

      try {
        const result = await service.listEndpoints(
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
          endpoints: result.endpoints,
        });
      } catch {
        return res.status(500).json({
          error: {
            code: "INTERNAL_ERROR",
            message: "Unable to list endpoints",
          },
        });
      }
    },
  );

  endpointsRouter.patch(
    "/projects/:projectId/endpoints/:endpointId",
    async (req: Request, res: Response) => {
      const parsedParams = endpointParamsSchema.safeParse(req.params);
      const parsedBody = setEndpointActiveBodySchema.safeParse(
        req.body,
      );

      if (!parsedParams.success) {
        return sendValidationError(res, parsedParams.error);
      }

      if (!parsedBody.success) {
        return sendValidationError(res, parsedBody.error);
      }

      try {
        const result = await service.setEndpointActive({
          ...parsedParams.data,
          active: parsedBody.data.active,
        });

        if (result.kind === "endpoint_not_found") {
          return res.status(404).json({
            error: {
              code: "ENDPOINT_NOT_FOUND",
              message: "Endpoint was not found",
            },
          });
        }

        return res.status(200).json(result.endpoint);
      } catch {
        return res.status(500).json({
          error: {
            code: "INTERNAL_ERROR",
            message: "Unable to update endpoint",
          },
        });
      }
    },
  );

  endpointsRouter.post(
    "/projects/:projectId/endpoints/:endpointId/rotate-secret",
    async (req: Request, res: Response) => {
      const parsed = rotateEndpointSecretParamsSchema.safeParse(
        req.params,
      );

      if (!parsed.success) {
        return sendValidationError(res, parsed.error);
      }

      try {
        const result = await service.rotateEndpointSecret({
          projectId: parsed.data.projectId,
          endpointId: parsed.data.endpointId,
        });

        if (result.kind === "endpoint_not_found") {
          return res.status(404).json({
            error: {
              code: "ENDPOINT_NOT_FOUND",
              message: "Endpoint was not found",
            },
          });
        }

        return res.status(200).json(result.endpoint);
      } catch {
        return res.status(500).json({
          error: {
            code: "INTERNAL_ERROR",
            message: "Unable to rotate endpoint secret",
          },
        });
      }
    },
  );

  return endpointsRouter;
}
