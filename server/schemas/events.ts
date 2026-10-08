import { z } from "zod";
import { eventTypeEnum } from "../../db/schema";

export const eventTypeSchema = z.enum(eventTypeEnum.enumValues);

export const publishEventRequestSchema = z.object({
  projectId: z.uuid(),
  idempotencyKey: z.string().trim().min(1).max(255),
  body: z
    .object({
      type: eventTypeSchema,
      payload: z.record(z.string(), z.unknown()),
    })
    .strict(),
});

export type EventType = z.infer<typeof eventTypeSchema>;
