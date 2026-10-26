"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createRelayApi } from "./api";
import { cloneDemoData, demoProjectId, demoProjectName } from "./fixtures";
import type {
  ConnectionMode,
  Delivery,
  Endpoint,
  ProjectData,
} from "./types";

const defaultApiUrl =
  process.env.NEXT_PUBLIC_RELAY_API_URL ?? "http://localhost:4000/api";

type RelayContextValue = {
  apiUrl: string;
  projectId: string;
  projectName: string;
  apiKey: string;
  mode: ConnectionMode | null;
  connected: boolean;
  busy: boolean;
  message: string;
  data: ProjectData;
  revealedSecret: string | null;
  connectLive(input: {
    apiUrl: string;
    projectId: string;
    apiKey: string;
  }): Promise<boolean>;
  startPreview(): void;
  disconnect(): void;
  clearMessage(): void;
  dismissSecret(): void;
  createEndpoint(url: string): Promise<void>;
  setEndpointActive(endpoint: Endpoint, active: boolean): Promise<void>;
  rotateEndpointSecret(endpoint: Endpoint): Promise<void>;
  replayDelivery(delivery: Delivery): Promise<void>;
};

const emptyData: ProjectData = {
  endpoints: [],
  deliveries: [],
  events: [],
  attempts: [],
};

const RelayContext = createContext<RelayContextValue | null>(null);

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}`;
}

function makeSecret(): string {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  return "preview_secret_" + Math.random().toString(16).slice(2).padEnd(64, "0");
}

function deriveEvents(deliveries: Delivery[]): ProjectData["events"] {
  const grouped = new Map<string, Delivery>();

  for (const delivery of deliveries) {
    if (!grouped.has(delivery.eventId)) {
      grouped.set(delivery.eventId, delivery);
    }
  }

  return Array.from(grouped.values()).map((delivery) => ({
    id: delivery.eventId,
    type: delivery.eventType,
    payload: null,
    createdAt: delivery.updatedAt,
    deliveryCount: deliveries.filter((item) => item.eventId === delivery.eventId).length,
    source: "delivery-summary",
  }));
}

export function RelayProvider({ children }: { children: ReactNode }) {
  const [apiUrl, setApiUrl] = useState(defaultApiUrl);
  const [projectId, setProjectId] = useState("");
  const [projectName, setProjectName] = useState("Connected project");
  const [apiKey, setApiKey] = useState("");
  const [mode, setMode] = useState<ConnectionMode | null>(null);
  const [data, setData] = useState<ProjectData>(emptyData);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  const connected = mode !== null;

  const connectLive = useCallback(async (input: {
    apiUrl: string;
    projectId: string;
    apiKey: string;
  }): Promise<boolean> => {
    if (!input.projectId.trim()) {
      setMessage("Enter a project ID before connecting.");
      return false;
    }

    setBusy(true);
    setMessage("Checking project access…");

    try {
      const api = createRelayApi(input.apiUrl, input.apiKey);
      const [endpoints, deliveries] = await Promise.all([
        api.listEndpoints(input.projectId.trim()),
        api.listDeliveries(input.projectId.trim()),
      ]);

      setApiUrl(input.apiUrl);
      setProjectId(input.projectId.trim());
      setApiKey(input.apiKey);
      setProjectName("Connected project");
      setData({
        endpoints,
        deliveries,
        events: deriveEvents(deliveries),
        attempts: [],
      });
      setMode("live");
      setRevealedSecret(null);
      setMessage("Connected. Live project data is loaded from the Relay API.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to connect to this project.");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const startPreview = useCallback(() => {
    setApiUrl(defaultApiUrl);
    setProjectId(demoProjectId);
    setProjectName(demoProjectName);
    setApiKey("");
    setData(cloneDemoData());
    setMode("preview");
    setRevealedSecret(null);
    setMessage("Preview mode is active. Changes stay in this browser and are not persisted.");
  }, []);

  const disconnect = useCallback(() => {
    setMode(null);
    setProjectId("");
    setProjectName("Connected project");
    setApiKey("");
    setData(emptyData);
    setRevealedSecret(null);
    setMessage("Disconnected. The project key was removed from memory.");
  }, []);

  const clearMessage = useCallback(() => setMessage(""), []);
  const dismissSecret = useCallback(() => setRevealedSecret(null), []);

  const createEndpoint = useCallback(async (url: string): Promise<void> => {
    if (!projectId || !url.trim()) return;

    setBusy(true);

    try {
      if (mode === "preview") {
        const now = new Date().toISOString();
        const endpoint: Endpoint & { signingSecret: string } = {
          id: makeId("demo-endpoint"),
          projectId,
          url: url.trim(),
          active: true,
          createdAt: now,
          updatedAt: now,
          signingSecret: makeSecret(),
        };
        setData((current) => ({ ...current, endpoints: [endpoint, ...current.endpoints] }));
        setRevealedSecret(endpoint.signingSecret);
        setMessage("Preview endpoint created. The signing secret is shown once for this demo.");
        return;
      }

      const endpoint = await createRelayApi(apiUrl, apiKey).createEndpoint(projectId, url.trim());
      setData((current) => ({
        ...current,
        endpoints: [endpoint, ...current.endpoints],
      }));
      setRevealedSecret(endpoint.signingSecret);
      setMessage("Endpoint created. Save the signing secret now; it is only returned once.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create endpoint.");
    } finally {
      setBusy(false);
    }
  }, [apiKey, apiUrl, mode, projectId]);

  const setEndpointActive = useCallback(async (endpoint: Endpoint, active: boolean): Promise<void> => {
    setBusy(true);

    try {
      const updated = mode === "preview"
        ? { ...endpoint, active, updatedAt: new Date().toISOString() }
        : await createRelayApi(apiUrl, apiKey).setEndpointActive(projectId, endpoint.id, active);

      setData((current) => ({
        ...current,
        endpoints: current.endpoints.map((item) => item.id === updated.id ? updated : item),
        deliveries: current.deliveries.map((delivery) =>
          delivery.endpointId === updated.id
            ? { ...delivery, endpointActive: updated.active }
            : delivery,
        ),
      }));
      setMessage(`${updated.url} is now ${updated.active ? "active" : "paused"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update endpoint.");
    } finally {
      setBusy(false);
    }
  }, [apiKey, apiUrl, mode, projectId]);

  const rotateEndpointSecret = useCallback(async (endpoint: Endpoint): Promise<void> => {
    setBusy(true);

    try {
      const rotated = mode === "preview"
        ? { ...endpoint, updatedAt: new Date().toISOString(), signingSecret: makeSecret() }
        : await createRelayApi(apiUrl, apiKey).rotateEndpointSecret(projectId, endpoint.id);

      setData((current) => ({
        ...current,
        endpoints: current.endpoints.map((item) => item.id === rotated.id
          ? { id: rotated.id, projectId: rotated.projectId, url: rotated.url, active: rotated.active, createdAt: rotated.createdAt, updatedAt: rotated.updatedAt }
          : item),
      }));
      setRevealedSecret(rotated.signingSecret);
      setMessage("Secret rotated. Save the new secret now; the old secret is no longer valid.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to rotate secret.");
    } finally {
      setBusy(false);
    }
  }, [apiKey, apiUrl, mode, projectId]);

  const replayDelivery = useCallback(async (delivery: Delivery): Promise<void> => {
    setBusy(true);

    try {
      if (mode === "preview") {
        const now = new Date().toISOString();
        setData((current) => ({
          ...current,
          deliveries: current.deliveries.map((item) => item.deliveryId === delivery.deliveryId
            ? {
                ...item,
                status: "pending",
                attemptCount: 0,
                runNumber: (item.runNumber ?? 1) + 1,
                runType: "manual_replay",
                nextAttemptAt: now,
                deliveredAt: null,
                updatedAt: now,
              }
            : item),
        }));
        setMessage("Preview replay queued. No external delivery was made.");
        return;
      }

      await createRelayApi(apiUrl, apiKey).replayDelivery(projectId, delivery.deliveryId);
      setData((current) => ({
        ...current,
        deliveries: current.deliveries.map((item) => item.deliveryId === delivery.deliveryId
          ? {
              ...item,
              status: "pending",
              attemptCount: 0,
              runNumber: (item.runNumber ?? 1) + 1,
              runType: "manual_replay",
              nextAttemptAt: new Date().toISOString(),
              deliveredAt: null,
              updatedAt: new Date().toISOString(),
            }
          : item),
      }));
      setMessage("Replay queued. The delivery worker will process it asynchronously.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to replay delivery.");
    } finally {
      setBusy(false);
    }
  }, [apiKey, apiUrl, mode, projectId]);

  const value = useMemo<RelayContextValue>(() => ({
    apiUrl,
    projectId,
    projectName,
    apiKey,
    mode,
    connected,
    busy,
    message,
    data,
    revealedSecret,
    connectLive,
    startPreview,
    disconnect,
    clearMessage,
    dismissSecret,
    createEndpoint,
    setEndpointActive,
    rotateEndpointSecret,
    replayDelivery,
  }), [
    apiKey,
    apiUrl,
    busy,
    clearMessage,
    connectLive,
    connected,
    createEndpoint,
    data,
    disconnect,
    dismissSecret,
    message,
    mode,
    projectId,
    projectName,
    replayDelivery,
    revealedSecret,
    rotateEndpointSecret,
    setEndpointActive,
    startPreview,
  ]);

  return <RelayContext.Provider value={value}>{children}</RelayContext.Provider>;
}

export function useRelay(): RelayContextValue {
  const context = useContext(RelayContext);

  if (!context) {
    throw new Error("useRelay must be used inside RelayProvider");
  }

  return context;
}
