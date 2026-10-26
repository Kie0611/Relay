"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createRelayApi } from "./api";
import { cloneDemoData, demoProjectId, demoProjectName } from "./fixtures";
import { ToastViewport, type ToastItem, type ToastTone } from "./toast";
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
  data: ProjectData;
  revealedSecret: string | null;
  toasts: ToastItem[];
  connectLive(input: {
    apiUrl: string;
    projectId: string;
    apiKey: string;
  }): Promise<boolean>;
  startPreview(): void;
  disconnect(): void;
  dismissToast(id: number): void;
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

function getActionError(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message) return fallback;

  const unsafeMessage = /database|postgres|sql|connection string|neon/i.test(error.message);
  return unsafeMessage ? fallback : error.message;
}

export function RelayProvider({ children }: { children: ReactNode }) {
  const [apiUrl, setApiUrl] = useState(defaultApiUrl);
  const [projectId, setProjectId] = useState("");
  const [projectName, setProjectName] = useState("Connected project");
  const [apiKey, setApiKey] = useState("");
  const [mode, setMode] = useState<ConnectionMode | null>(null);
  const [data, setData] = useState<ProjectData>(emptyData);
  const [busy, setBusy] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSequence = useRef(0);

  const connected = mode !== null;

  const pushToast = useCallback((message: string, tone: ToastTone = "info") => {
    const id = Date.now() * 1000 + toastSequence.current;
    toastSequence.current += 1;
    setToasts((current) => [...current.slice(-3), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const connectLive = useCallback(async (input: {
    apiUrl: string;
    projectId: string;
    apiKey: string;
  }): Promise<boolean> => {
    if (!input.projectId.trim()) {
      pushToast("Enter a project ID before connecting.", "error");
      return false;
    }

    setBusy(true);

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
      pushToast("Connected. Live project data is loaded from the Relay API.", "success");
      return true;
    } catch (error) {
      pushToast(getActionError(error, "Unable to connect to this project."), "error");
      return false;
    } finally {
      setBusy(false);
    }
  }, [pushToast]);

  const startPreview = useCallback(() => {
    setApiUrl(defaultApiUrl);
    setProjectId(demoProjectId);
    setProjectName(demoProjectName);
    setApiKey("");
    setData(cloneDemoData());
    setMode("preview");
    setRevealedSecret(null);
    pushToast("Preview mode is active. Changes stay in this browser and are not persisted.", "info");
  }, [pushToast]);

  const disconnect = useCallback(() => {
    setMode(null);
    setProjectId("");
    setProjectName("Connected project");
    setApiKey("");
    setData(emptyData);
    setRevealedSecret(null);
    pushToast("Disconnected. The project key was removed from memory.", "success");
  }, [pushToast]);
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
        pushToast("Preview endpoint created. The signing secret is shown once for this demo.", "success");
        return;
      }

      const endpoint = await createRelayApi(apiUrl, apiKey).createEndpoint(projectId, url.trim());
      setData((current) => ({
        ...current,
        endpoints: [endpoint, ...current.endpoints],
      }));
      setRevealedSecret(endpoint.signingSecret);
      pushToast("Endpoint created. Save the signing secret now; it is only returned once.", "success");
    } catch (error) {
      pushToast(getActionError(error, "Unable to create endpoint."), "error");
    } finally {
      setBusy(false);
    }
  }, [apiKey, apiUrl, mode, projectId, pushToast]);

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
      pushToast(`${updated.url} is now ${updated.active ? "active" : "paused"}.`, "success");
    } catch (error) {
      pushToast(getActionError(error, "Unable to update endpoint."), "error");
    } finally {
      setBusy(false);
    }
  }, [apiKey, apiUrl, mode, projectId, pushToast]);

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
      pushToast("Secret rotated. Save the new secret now; the old secret is no longer valid.", "success");
    } catch (error) {
      pushToast(getActionError(error, "Unable to rotate secret."), "error");
    } finally {
      setBusy(false);
    }
  }, [apiKey, apiUrl, mode, projectId, pushToast]);

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
        pushToast("Preview replay queued. No external delivery was made.", "info");
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
      pushToast("Replay queued. The delivery worker will process it asynchronously.", "success");
    } catch (error) {
      pushToast(getActionError(error, "Unable to replay delivery."), "error");
    } finally {
      setBusy(false);
    }
  }, [apiKey, apiUrl, mode, projectId, pushToast]);

  const value = useMemo<RelayContextValue>(() => ({
    apiUrl,
    projectId,
    projectName,
    apiKey,
    mode,
    connected,
    busy,
    data,
    revealedSecret,
    toasts,
    connectLive,
    startPreview,
    disconnect,
    dismissToast,
    dismissSecret,
    createEndpoint,
    setEndpointActive,
    rotateEndpointSecret,
    replayDelivery,
  }), [
    apiKey,
    apiUrl,
    busy,
    connectLive,
    connected,
    createEndpoint,
    data,
    dismissToast,
    disconnect,
    dismissSecret,
    mode,
    projectId,
    projectName,
    replayDelivery,
    revealedSecret,
    rotateEndpointSecret,
    setEndpointActive,
    startPreview,
    toasts,
  ]);

  return (
    <RelayContext.Provider value={value}>
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      {children}
    </RelayContext.Provider>
  );
}

export function useRelay(): RelayContextValue {
  const context = useContext(RelayContext);

  if (!context) {
    throw new Error("useRelay must be used inside RelayProvider");
  }

  return context;
}
