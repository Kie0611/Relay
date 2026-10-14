import express from "express";
import type { Request, Response, Router } from "express";
import { replayDeliveryParamsSchema } from "../schemas/deliveries";
import type { ReplayDelivery } from "../services/delivery-service";


export function createDeliveriesRouter(
  replayDelivery: ReplayDelivery,
): Router {
  const deliveriesRouter = express.Router();

  deliveriesRouter.post(
    "/projects/:projectId/deliveries/:deliveryId/replay",
    async(req: Request, res: Response) => {
      const parsed = replayDeliveryParamsSchema.safeParse(req.params);

      if(!parsed.success) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Request validation failed",
            issues: parsed.error.issues.map((issue) => ({
              path: issue.path.join(".") || "_form",
              message: issue.message,
            })),
          },
        });
      }

      try {
        const result = await replayDelivery(parsed.data);

          switch (result.kind) {

          case "created":
            return res.status(202).json(result.run);

          case "delivery_not_found":
            return res.status(404).json({
              error: {
                code: "DELIVERY_NOT_FOUND",
                message: "Delivery was not found",
              },
            });

          case "not_replayable":
            return res.status(409).json({
              error: {
                code: "DELIVERY_NOT_REPLAYABLE",
                message: "Delivery cannot be replayed in its current state",
              },
            });
        }
      } catch {
        return res.status(500).json({
          error: {
            code: "INTERNAL_ERROR",
            message: "Unable to replay delivery",
          },
        });
      }
    },
  );

  return deliveriesRouter;
}
