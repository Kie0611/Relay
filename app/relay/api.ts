import type { ApiError, Delivery, Endpoint } from "./types";

export type RelayApi = {
  listEndpoints(projectId: string): Promise<Endpoint[]>;
  listDeliveries(projectId: string): Promise<Delivery[]>;
  createEndpoint(projectId: string, url: string): Promise<Endpoint & { signingSecret: string }>;
  setEndpointActive(projectId: string, endpointId: string, active: boolean): Promise<Endpoint>;
  rotateEndpointSecret(projectId: string, endpointId: string): Promise<Endpoint & { signingSecret: string }>;
  replayDelivery(projectId: string, deliveryId: string): Promise<unknown>;
};

function getErrorMessage(body: unknown, status: number): string {
  const error = body as ApiError | null;
  return error?.error?.message ?? `Relay returned HTTP ${status}`;
}

async function readResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let body: unknown = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(body, response.status));
  }

  return body as T;
}

export function createRelayApi(apiUrl: string, apiKey: string): RelayApi {
  const baseUrl = apiUrl.replace(/\/$/, "");
  const headers: Record<string, string> = apiKey
    ? { "X-Relay-API-Key": apiKey }
    : {};

  return {
    async listEndpoints(projectId) {
      const response = await fetch(`${baseUrl}/projects/${projectId}/endpoints`, {
        headers,
      });
      const body = await readResponse<{ endpoints: Endpoint[] }>(response);
      return body.endpoints;
    },

    async listDeliveries(projectId) {
      const response = await fetch(`${baseUrl}/projects/${projectId}/deliveries`, {
        headers,
      });
      const body = await readResponse<{ deliveries: Delivery[] }>(response);
      return body.deliveries;
    },

    async createEndpoint(projectId, url) {
      const response = await fetch(`${baseUrl}/projects/${projectId}/endpoints`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ url }),
      });
      return readResponse<Endpoint & { signingSecret: string }>(response);
    },

    async setEndpointActive(projectId, endpointId, active) {
      const response = await fetch(
        `${baseUrl}/projects/${projectId}/endpoints/${endpointId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ active }),
        },
      );
      return readResponse<Endpoint>(response);
    },

    async rotateEndpointSecret(projectId, endpointId) {
      const response = await fetch(
        `${baseUrl}/projects/${projectId}/endpoints/${endpointId}/rotate-secret`,
        { method: "POST", headers },
      );
      return readResponse<Endpoint & { signingSecret: string }>(response);
    },

    async replayDelivery(projectId, deliveryId) {
      const response = await fetch(
        `${baseUrl}/projects/${projectId}/deliveries/${deliveryId}/replay`,
        { method: "POST", headers },
      );
      return readResponse(response);
    },
  };
}
