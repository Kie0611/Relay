import express from "express";
import type { Request, Response, Router } from "express";

export type ReadinessCheck = () => Promise<boolean>;

export function createHealthRouter(
  checkReadiness: ReadinessCheck,
): Router {
  const healthRouter = express.Router();

  healthRouter.get("/health", (_req: Request, res: Response) => {
    return res.status(200).json({
      status: "ok",
    });
  });

  healthRouter.get("/ready", async (_req: Request, res: Response) => {
    const ready = await checkReadiness();

    if (!ready) {
      return res.status(503).json({
        status: "not_ready",
        database: "unavailable",
      });
    }

    return res.status(200).json({
      status: "ready",
      database: "available",
    });
  });

  return healthRouter;
}