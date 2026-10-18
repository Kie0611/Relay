import { randomBytes } from "node:crypto";

export type CreateEndpointInput = {
  projectId: string;
  url: string;
};

export type RotateEndpointSecretInput = {
  projectId: string;
  endpointId: string;
};

export type SetEndpointActiveInput = {
  projectId: string;
  endpointId: string;
  active: boolean;
};

export type StoredEndpoint = {
  id: string;
  projectId: string;
  url: string;
  signingSecret: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type PublicEndpoint = Omit<
  StoredEndpoint,
  "signingSecret" | "createdAt" | "updatedAt"
> & {
  createdAt: string;
  updatedAt: string;
};

export type EndpointWithSecret = PublicEndpoint & {
  signingSecret: string;
};

export type EndpointQueries = {
  findProjectById(
    projectId: string,
  ): Promise<{ id: string } | null>;

  createEndpoint(input: {
    projectId: string;
    url: string;
    signingSecret: string;
  }): Promise<StoredEndpoint>;

  rotateEndpointSecret(input: {
    projectId: string;
    endpointId: string;
    signingSecret: string;
  }): Promise<StoredEndpoint | null>;

  listEndpoints(projectId: string): Promise<StoredEndpoint[]>;

  setEndpointActive(input: {
    projectId: string;
    endpointId: string;
    active: boolean;
  }): Promise<StoredEndpoint | null>;
};

export type CreateEndpointResult =
  | {
      kind: "created";
      endpoint: EndpointWithSecret;
    }
  | {
      kind: "project_not_found";
    };

export type RotateEndpointSecretResult =
  | {
      kind: "rotated";
      endpoint: EndpointWithSecret;
    }
  | {
      kind: "endpoint_not_found";
    };

export type ListEndpointsResult =
  | {
      kind: "listed";
      endpoints: PublicEndpoint[];
    }
  | {
      kind: "project_not_found";
    };

export type SetEndpointActiveResult =
  | {
      kind: "updated";
      endpoint: PublicEndpoint;
    }
  | {
      kind: "endpoint_not_found";
    };

export type EndpointManagementService = {
  createEndpoint(
    input: CreateEndpointInput,
  ): Promise<CreateEndpointResult>;

  rotateEndpointSecret(
    input: RotateEndpointSecretInput,
  ): Promise<RotateEndpointSecretResult>;

  listEndpoints(
    projectId: string,
  ): Promise<ListEndpointsResult>;

  setEndpointActive(
    input: SetEndpointActiveInput,
  ): Promise<SetEndpointActiveResult>;
};

export type SigningSecretGenerator = () => string;

export function generateSigningSecret(): string {
  return randomBytes(32).toString("hex");
}

function toPublicEndpoint(
  endpoint: StoredEndpoint,
): PublicEndpoint {
  return {
    id: endpoint.id,
    projectId: endpoint.projectId,
    url: endpoint.url,
    active: endpoint.active,
    createdAt: endpoint.createdAt.toISOString(),
    updatedAt: endpoint.updatedAt.toISOString(),
  };
}

function toEndpointWithSecret(
  endpoint: StoredEndpoint,
): EndpointWithSecret {
  return {
    ...toPublicEndpoint(endpoint),
    signingSecret: endpoint.signingSecret,
  };
}

export function createEndpointService(
  queries: EndpointQueries,
  generateSecret: SigningSecretGenerator = generateSigningSecret,
): EndpointManagementService {
  return {
    async createEndpoint(
      input: CreateEndpointInput,
    ): Promise<CreateEndpointResult> {
      const project = await queries.findProjectById(
        input.projectId,
      );

      if (!project) {
        return {
          kind: "project_not_found",
        };
      }

      const endpoint = await queries.createEndpoint({
        projectId: input.projectId,
        url: input.url,
        signingSecret: generateSecret(),
      });

      return {
        kind: "created",
        endpoint: toEndpointWithSecret(endpoint),
      };
    },

    async rotateEndpointSecret(
      input: RotateEndpointSecretInput,
    ): Promise<RotateEndpointSecretResult> {
      const endpoint = await queries.rotateEndpointSecret({
        projectId: input.projectId,
        endpointId: input.endpointId,
        signingSecret: generateSecret(),
      });

      if (!endpoint) {
        return {
          kind: "endpoint_not_found",
        };
      }

      return {
        kind: "rotated",
        endpoint: toEndpointWithSecret(endpoint),
      };
    },

    async listEndpoints(
      projectId: string,
    ): Promise<ListEndpointsResult> {
      const project = await queries.findProjectById(projectId);

      if (!project) {
        return {
          kind: "project_not_found",
        };
      }

      const endpoints = await queries.listEndpoints(projectId);

      return {
        kind: "listed",
        endpoints: endpoints.map(toPublicEndpoint),
      };
    },

    async setEndpointActive(
      input: SetEndpointActiveInput,
    ): Promise<SetEndpointActiveResult> {
      const endpoint = await queries.setEndpointActive(input);

      if (!endpoint) {
        return {
          kind: "endpoint_not_found",
        };
      }

      return {
        kind: "updated",
        endpoint: toPublicEndpoint(endpoint),
      };
    },
  };
}
