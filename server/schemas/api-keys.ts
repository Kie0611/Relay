import { z } from "zod";

export const createApiKeyRequestSchema = z.object({
  projectId: z.uuid(),
  body: z
    .object({
      name: z.string().trim().min(1).max(120),
    })
    .strict(),
});
