import { z } from "zod";

export const replayDeliveryParamsSchema = z.object({
  projectId: z.uuid(),
  deliveryId: z.uuid(),
});