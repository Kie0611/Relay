"use client";

import RelayControlPlane from "./relay-control-plane-ops";
import { useMemo, useState } from "react";

type Endpoint = {
  id: string;
  projectId: string;
  url: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type Delivery = {
  deliveryId: string;
  eventId: string;
  eventType: string;
  endpointUrl: string;
  status: string;
  attemptCount: number;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  updatedAt: string;
};

type ApiError = {
  error?: {
    message?: string;
  };
};

const defaultApiUrl =
  process.env.NEXT_PUBLIC_RELAY_API_URL ?? "http://localhost:4000/api";

async function readResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T | ApiError;

  if (!response.ok) {
    const message = (body as ApiError).error?.message;
    throw new Error(message ?? "The Relay API request failed");
  }

  return body as T;
}
function LegacyHome() {
  const [apiUrl, setApiUrl] = useState(defaultApiUrl);
  const [projectId, setProjectId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(
    null,
  );
  const [message, setMessage] = useState(
    "Connect a project to inspect its webhook endpoints.",
  );
  const [busy, setBusy] = useState(false);

  const activeCount = useMemo(
    () => endpoints.filter((endpoint) => endpoint.active).length,
    [endpoints],
  );

  function requestHeaders(): HeadersInit {
    return apiKey
      ? {
          "X-Relay-API-Key": apiKey,
        }
      : {};
  }

  function saveConnection(): void {
    window.localStorage.setItem("relay.apiUrl", apiUrl);
    window.localStorage.setItem("relay.projectId", projectId);
    window.localStorage.setItem("relay.apiKey", apiKey);
  }

  async function loadEndpoints(): Promise<void> {
    if (!projectId.trim()) {
      setMessage("Enter a project ID first.");
      return;
    }

    setBusy(true);
    setMessage("Loading endpoints...");
    saveConnection();

    try {
      const [endpointResponse, deliveryResponse] = await Promise.all([
        fetch(
          `${apiUrl.replace(/\/$/, "")}/projects/${projectId}/endpoints`,
          { headers: requestHeaders() },
        ),
        fetch(
          `${apiUrl.replace(/\/$/, "")}/projects/${projectId}/deliveries`,
          { headers: requestHeaders() },
        ),
      ]);
      const body = await readResponse<{ endpoints: Endpoint[] }>(
        endpointResponse,
      );
      const deliveryBody = await readResponse<{ deliveries: Delivery[] }>(
        deliveryResponse,
      );
      setEndpoints(body.endpoints);
      setDeliveries(deliveryBody.deliveries);
      setMessage(
        `Loaded ${body.endpoints.length} endpoint(s) and ${deliveryBody.deliveries.length} delivery record(s).`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load endpoints.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createEndpoint(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (!projectId.trim() || !endpointUrl.trim()) {
      setMessage("Project ID and endpoint URL are required.");
      return;
    }

    setBusy(true);
    setRevealedSecret(null);

    try {
      const response = await fetch(
        `${apiUrl.replace(/\/$/, "")}/projects/${projectId}/endpoints`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...requestHeaders(),
          },
          body: JSON.stringify({ url: endpointUrl }),
        },
      );
      const endpoint = await readResponse<Endpoint & { signingSecret: string }>(
        response,
      );
      setEndpoints((current) => [endpoint, ...current]);
      setEndpointUrl("");
      setRevealedSecret(endpoint.signingSecret);
      setMessage(
        "Endpoint created. Save the signing secret now; it is only returned on creation or rotation.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create endpoint.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateEndpoint(
    endpoint: Endpoint,
    active: boolean,
  ): Promise<void> {
    setBusy(true);

    try {
      const response = await fetch(
        `${apiUrl.replace(/\/$/, "")}/projects/${projectId}/endpoints/${endpoint.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...requestHeaders(),
          },
          body: JSON.stringify({ active }),
        },
      );
      const updated = await readResponse<Endpoint>(response);
      setEndpoints((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setMessage(
        `${updated.url} is now ${updated.active ? "active" : "inactive"}.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update endpoint.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function rotateSecret(endpoint: Endpoint): Promise<void> {
    setBusy(true);

    try {
      const response = await fetch(
        `${apiUrl.replace(/\/$/, "")}/projects/${projectId}/endpoints/${endpoint.id}/rotate-secret`,
        {
          method: "POST",
          headers: requestHeaders(),
        },
      );
      const rotated = await readResponse<Endpoint & { signingSecret: string }>(
        response,
      );
      setEndpoints((current) =>
        current.map((item) => ({
          ...item,
          ...(item.id === rotated.id
            ? {
                active: rotated.active,
                updatedAt: rotated.updatedAt,
              }
            : {}),
        })),
      );
      setRevealedSecret(rotated.signingSecret);
      setMessage(
        "Secret rotated. Save the new secret now; the old secret is no longer valid.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to rotate secret.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#08111f] px-6 py-10 text-slate-100 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10 flex flex-col gap-4 border-b border-slate-800 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">
              Relay control plane
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-white">
              Webhook delivery, made observable.
            </h1>
            <p className="mt-3 max-w-2xl text-slate-400">
              Register destinations, pause delivery safely, and rotate signing
              secrets without exposing them in endpoint listings.
            </p>
          </div>
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
            <div className="font-semibold">{activeCount} active endpoints</div>
            <div className="mt-1 text-cyan-200/70">
              {endpoints.length} total in this project
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20">
              <h2 className="text-lg font-semibold text-white">Connection</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                The API key is kept in this browser only. In production, use a
                secret manager and a server-side session instead.
              </p>
              <div className="mt-5 space-y-4">
                <label className="block text-sm text-slate-300">
                  API base URL
                  <input
                    value={apiUrl}
                    onChange={(event) => setApiUrl(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none ring-cyan-300/40 focus:ring-2"
                    placeholder="http://localhost:4000/api"
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  Project ID
                  <input
                    value={projectId}
                    onChange={(event) => setProjectId(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none ring-cyan-300/40 focus:ring-2"
                    placeholder="Project UUID"
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  Project API key
                  <input
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none ring-cyan-300/40 focus:ring-2"
                    placeholder="Optional while auth is disabled"
                    type="password"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void loadEndpoints()}
                  disabled={busy}
                  className="w-full rounded-xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Working…" : "Load project"}
                </button>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-lg font-semibold text-white">
                Register endpoint
              </h2>
              <form
                onSubmit={(event) => void createEndpoint(event)}
                className="mt-5 space-y-4"
              >
                <label className="block text-sm text-slate-300">
                  Destination URL
                  <input
                    value={endpointUrl}
                    onChange={(event) => setEndpointUrl(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none ring-cyan-300/40 focus:ring-2"
                    placeholder="https://api.example.com/webhooks"
                    type="url"
                    required
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl border border-cyan-300/40 px-4 py-3 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Register destination
                </button>
              </form>
              {revealedSecret ? (
                <div className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
                  <div className="font-semibold">Save this signing secret</div>
                  <code className="mt-2 block break-all text-xs text-amber-200">
                    {revealedSecret}
                  </code>
                </div>
              ) : null}
            </section>
          </div>

          <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Endpoints</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Paused endpoints are excluded from future event fan-out.
                </p>
              </div>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                {endpoints.length} destinations
              </span>
            </div>

            <div className="mt-6 space-y-3">
              {endpoints.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">
                  No endpoints loaded yet.
                </div>
              ) : (
                endpoints.map((endpoint) => (
                  <article
                    key={endpoint.id}
                    className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${endpoint.active ? "bg-emerald-300" : "bg-slate-600"}`}
                          />
                          <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                            {endpoint.active ? "Active" : "Paused"}
                          </span>
                        </div>
                        <p className="mt-2 truncate text-sm font-medium text-slate-200">
                          {endpoint.url}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Updated {new Date(endpoint.updatedAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void updateEndpoint(endpoint, !endpoint.active)
                          }
                          disabled={busy}
                          className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-cyan-300/50 hover:text-cyan-200 disabled:opacity-50"
                        >
                          {endpoint.active ? "Pause" : "Activate"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void rotateSecret(endpoint)}
                          disabled={busy}
                          className="rounded-lg border border-amber-300/30 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-300/10 disabled:opacity-50"
                        >
                          Rotate secret
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 lg:col-span-2">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Recent deliveries
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  The latest run for each event-to-endpoint delivery.
                </p>
              </div>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                {deliveries.length} records
              </span>
            </div>
            <div className="mt-6 overflow-x-auto">
              {deliveries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">
                  No deliveries have been created for this project yet.
                </div>
              ) : (
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-slate-800 text-xs uppercase tracking-[0.15em] text-slate-500">
                    <tr>
                      <th className="px-3 py-3 font-medium">Event</th>
                      <th className="px-3 py-3 font-medium">Endpoint</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-3 py-3 font-medium">Attempts</th>
                      <th className="px-3 py-3 font-medium">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {deliveries.map((delivery) => (
                      <tr key={delivery.deliveryId}>
                        <td className="px-3 py-4 text-slate-200">
                          <div className="font-medium">{delivery.eventType}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {delivery.eventId.slice(0, 8)}…
                          </div>
                        </td>
                        <td className="max-w-[260px] truncate px-3 py-4 text-slate-400">
                          {delivery.endpointUrl}
                        </td>
                        <td className="px-3 py-4">
                          <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-medium text-cyan-200">
                            {delivery.status}
                          </span>
                        </td>
                        <td className="px-3 py-4 text-slate-400">
                          {delivery.attemptCount}
                        </td>
                        <td className="px-3 py-4 text-slate-500">
                          {new Date(delivery.updatedAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </section>

        <p className="mt-6 text-sm text-slate-500" role="status">
          {message}
        </p>
      </div>
    </main>
  );
}

export default RelayControlPlane;
