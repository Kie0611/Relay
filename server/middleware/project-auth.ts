import type { NextFunction, Request, Response } from "express";
import type { ApiKeyQueries } from "../services/api-key-service";
import { hashApiKey } from "../services/api-key-service";

function unauthorized(res: Response) {
  return res.status(401).json({
    error: {
      code: "INVALID_API_KEY",
      message: "A valid project API key is required",
    },
  });
}

export function createProjectAuthMiddleware(
  queries: ApiKeyQueries,
) {
  return async function projectAuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const rawProjectId = req.params.projectId;
    const projectId =
      typeof rawProjectId === "string" ? rawProjectId : undefined;
    const rawAuthorization = req.get("Authorization");
    const authorization =
      typeof rawAuthorization === "string"
        ? rawAuthorization
        : undefined;
    const rawHeaderKey = req.get("X-Relay-API-Key");
    const headerKey =
      typeof rawHeaderKey === "string" ? rawHeaderKey : undefined;
    const apiKey = headerKey ?? authorization?.replace(/^Bearer\s+/i, "");

    if (!projectId || !apiKey) {
      unauthorized(res);
      return;
    }

    try {
      const activeKey = await queries.findActiveApiKey({
        projectId,
        keyHash: hashApiKey(apiKey),
      });

      if (!activeKey) {
        unauthorized(res);
        return;
      }

      next();
    } catch {
      res.status(503).json({
        error: {
          code: "AUTHENTICATION_UNAVAILABLE",
          message: "Authentication is temporarily unavailable",
        },
      });
    }
  };
}
