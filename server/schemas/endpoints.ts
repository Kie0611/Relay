import { z } from "zod";

const endpointUrlSchema = z
  .string()
  .trim()
  .url()
  .refine(
    (value) => {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    },
    {
      message: "Endpoint URL must use http or https",
    },
  );

export const createEndpointRequestSchema = z.object({
  projectId: z.uuid(),
  body: z
    .object({
      url: endpointUrlSchema,
    })
    .strict(),
});

export const rotateEndpointSecretParamsSchema = z.object({
  projectId: z.uuid(),
  endpointId: z.uuid(),
});

export const endpointParamsSchema = z.object({
  projectId: z.uuid(),
  endpointId: z.uuid(),
});

export const projectParamsSchema = z.object({
  projectId: z.uuid(),
});

export const setEndpointActiveBodySchema = z
  .object({
    active: z.boolean(),
  })
  .strict();
