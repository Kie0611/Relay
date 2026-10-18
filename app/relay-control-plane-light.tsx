"use client";

import { useMemo, useState, type FormEvent } from "react";

type View = "overview" | "endpoints" | "deliveries" | "access";

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

type ApiError = { error?: { message?: string } };
type ProjectData = { endpoints: Endpoint[]; deliveries: Delivery[] };

const defaultApiUrl =
  process.env.NEXT_PUBLIC_RELAY_API_URL ?? "http://localhost:4000/api";

const demoProjectId = "00000000-0000-4000-8000-000000000001";

const demoData: ProjectData = {
  endpoints: [
    {
      id: "demo-endpoint-primary",
      projectId: demoProjectId,
      url: "https://api.acme.test/webhooks/relay",
      active: true,
      createdAt: "2026-10-17T08:30:00.000Z",
      updatedAt: "2026-10-18T08:15:00.000Z",
    },
    {
      id: "demo-endpoint-backup",
      projectId: demoProjectId,
      url: "https://backup.acme.test/events",
      active: false,
      createdAt: "2026-10-12T11:20:00.000Z",
      updatedAt: "2026-10-17T16:40:00.000Z",
    },
  ],
  deliveries: [
    {
      deliveryId: "demo-delivery-1",
      eventId: "demo-event-1",
      eventType: "user.created",
      endpointUrl: "https://api.acme.test/webhooks/relay",
      status: "delivered",
      attemptCount: 1,
      nextAttemptAt: null,
      deliveredAt: "2026-10-18T08:18:00.000Z",
      updatedAt: "2026-10-18T08:18:00.000Z",
    },
    {
      deliveryId: "demo-delivery-2",
      eventId: "demo-event-2",
      eventType: "invoice.updated",
      endpointUrl: "https://api.acme.test/webhooks/relay",
      status: "retrying",
      attemptCount: 2,
      nextAttemptAt: "2026-10-18T08:25:00.000Z",
      deliveredAt: null,
      updatedAt: "2026-10-18T08:20:00.000Z",
    },
    {
      deliveryId: "demo-delivery-3",
      eventId: "demo-event-3",
      eventType: "user.deleted",
      endpointUrl: "https://backup.acme.test/events",
      status: "failed",
      attemptCount: 1,
      nextAttemptAt: null,
      deliveredAt: null,
      updatedAt: "2026-10-18T07:52:00.000Z",
    },
  ],
};

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
    const message = (body as ApiError | null)?.error?.message;
    throw new Error(message ?? `Relay returned HTTP ${response.status}`);
  }

  return body as T;
}

function formatDate(value: string | null): string {
  if (!value) return "Not scheduled";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function shortId(value: string): string {
  return `${value.slice(0, 8)}...`;
}

function isErrorMessage(message: string): boolean {
  return /unable|enter|required|not found|failed|error/i.test(message);
}

function statusClass(status: string): string {
  if (status === "delivered") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "retrying" || status === "processing") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (status === "failed" || status === "dead_lettered") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}

function statusDotClass(status: string): string {
  if (status === "delivered") return "bg-emerald-500";
  if (status === "retrying" || status === "processing") return "bg-amber-500";
  if (status === "failed" || status === "dead_lettered") return "bg-rose-500";
  return "bg-slate-400";
}

function headingFor(view: View): { eyebrow: string; title: string; description: string } {
  switch (view) {
    case "endpoints":
      return {
        eyebrow: "Destinations",
        title: "Endpoint management",
        description: "Control where Relay sends events and how each destination is trusted.",
      };
    case "deliveries":
      return {
        eyebrow: "Operations",
        title: "Delivery activity",
        description: "Trace recent event-to-endpoint delivery outcomes.",
      };
    case "access":
      return {
        eyebrow: "Security",
        title: "Project access",
        description: "Review the connection details and the boundaries around this session.",
      };
    default:
      return {
        eyebrow: "Project overview",
        title: "A clear view of delivery health",
        description: "See what is healthy, what needs attention, and which destinations are active.",
      };
  }
}

function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-sm font-black text-white shadow-sm shadow-blue-600/20">
        R
      </span>
      <span className="text-sm font-bold tracking-[0.22em] text-slate-900">RELAY</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusClass(status)}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(status)}`} />
      {status.replaceAll("_", " ")}
    </span>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

export default function RelayControlPlaneLight() {
  const [view, setView] = useState<View>("overview");
  const [connected, setConnected] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [apiUrl, setApiUrl] = useState(defaultApiUrl);
  const [projectId, setProjectId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const activeCount = useMemo(
    () => endpoints.filter((endpoint) => endpoint.active).length,
    [endpoints],
  );
  const deliveredCount = useMemo(
    () => deliveries.filter((delivery) => delivery.status === "delivered").length,
    [deliveries],
  );
  const attentionCount = useMemo(
    () =>
      deliveries.filter((delivery) =>
        ["retrying", "failed", "dead_lettered"].includes(delivery.status),
      ).length,
    [deliveries],
  );
  const successRate = deliveries.length
    ? Math.round((deliveredCount / deliveries.length) * 100)
    : 0;
  const projectLabel = projectId ? `${projectId.slice(0, 8)}...` : "No project";
  const heading = headingFor(view);

  function requestHeaders(): HeadersInit {
    return apiKey ? { "X-Relay-API-Key": apiKey } : {};
  }

  async function fetchProjectData(): Promise<ProjectData> {
    const baseUrl = apiUrl.replace(/\/$/, "");
    const [endpointResponse, deliveryResponse] = await Promise.all([
      fetch(`${baseUrl}/projects/${projectId}/endpoints`, {
        headers: requestHeaders(),
      }),
      fetch(`${baseUrl}/projects/${projectId}/deliveries`, {
        headers: requestHeaders(),
      }),
    ]);

    const endpointBody = await readResponse<{ endpoints: Endpoint[] }>(endpointResponse);
    const deliveryBody = await readResponse<{ deliveries: Delivery[] }>(deliveryResponse);

    return {
      endpoints: endpointBody.endpoints,
      deliveries: deliveryBody.deliveries,
    };
  }

  async function connect(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!projectId.trim()) {
      setMessage("Enter a project ID before connecting.");
      return;
    }

    setBusy(true);
    setMessage("Checking project access...");

    try {
      const data = await fetchProjectData();
      setEndpoints(data.endpoints);
      setDeliveries(data.deliveries);
      setConnected(true);
      setDemoMode(false);
      setView("overview");
      setMessage("Project connected. The access key stays in memory for this session.");
    } catch (error) {
      setConnected(false);
      setMessage(error instanceof Error ? error.message : "Unable to connect to this project.");
    } finally {
      setBusy(false);
    }
  }

  function disconnect(): void {
    setConnected(false);
    setDemoMode(false);
    setApiKey("");
    setEndpoints([]);
    setDeliveries([]);
    setRevealedSecret(null);
    setMessage("Disconnected. The project key was removed from memory.");
  }

  function startDemo(): void {
    setProjectId(demoProjectId);
    setApiKey("");
    setEndpoints(demoData.endpoints);
    setDeliveries(demoData.deliveries);
    setDemoMode(true);
    setConnected(true);
    setView("overview");
    setMessage("Preview mode is active. No API or database requests were made.");
  }

  async function createEndpoint(event: FormEvent<HTMLFormElement>): Promise<void> {
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
      const endpoint = await readResponse<Endpoint & { signingSecret: string }>(response);
      setEndpoints((current) => [endpoint, ...current]);
      setEndpointUrl("");
      setRevealedSecret(endpoint.signingSecret);
      setMessage("Endpoint created. Save the signing secret now; it is shown only once.");
      setView("endpoints");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create endpoint.");
    } finally {
      setBusy(false);
    }
  }

  async function updateEndpoint(endpoint: Endpoint, active: boolean): Promise<void> {
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
      setMessage(`${updated.url} is now ${updated.active ? "active" : "paused"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update endpoint.");
    } finally {
      setBusy(false);
    }
  }

  async function rotateSecret(endpoint: Endpoint): Promise<void> {
    setBusy(true);

    try {
      const response = await fetch(
        `${apiUrl.replace(/\/$/, "")}/projects/${projectId}/endpoints/${endpoint.id}/rotate-secret`,
        { method: "POST", headers: requestHeaders() },
      );
      const rotated = await readResponse<Endpoint & { signingSecret: string }>(response);
      setEndpoints((current) =>
        current.map((item) =>
          item.id === rotated.id
            ? { ...item, active: rotated.active, updatedAt: rotated.updatedAt }
            : item,
        ),
      );
      setRevealedSecret(rotated.signingSecret);
      setMessage("Secret rotated. Save the new secret now; the old secret is no longer valid.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to rotate secret.");
    } finally {
      setBusy(false);
    }
  }

  if (!connected) {
    return (
      <main className="min-h-[100dvh] bg-[#f4f7fb] text-slate-950">
        <div className="mx-auto grid min-h-[100dvh] max-w-7xl lg:grid-cols-[1fr_460px]">
          <section className="flex flex-col justify-between px-6 py-8 sm:px-12 lg:px-16 lg:py-12">
            <BrandMark />

            <div className="max-w-2xl py-16 lg:py-24">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">
                Webhook operations
              </p>
              <h1 className="mt-6 max-w-2xl text-5xl font-semibold leading-[1.04] tracking-[-0.055em] text-slate-950 sm:text-7xl">
                Make every delivery easy to trust.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
                Relay gives teams a calm operational view of destinations, delivery health, and signing secrets.
              </p>

              <div className="mt-12 grid max-w-xl gap-3 sm:grid-cols-3">
                {[
                  ["01", "Observe", "Trace the latest delivery state."],
                  ["02", "Control", "Pause unsafe destinations quickly."],
                  ["03", "Trust", "Rotate secrets without exposing them."],
                ].map(([number, label, description]) => (
                  <div key={number} className="border-t border-slate-300 pt-4">
                    <div className="text-xs font-bold tracking-[0.18em] text-blue-600">{number}</div>
                    <div className="mt-2 font-semibold text-slate-900">{label}</div>
                    <div className="mt-1 text-sm leading-5 text-slate-500">{description}</div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-slate-500">Relay control plane · local development</p>
          </section>

          <section className="flex items-center border-l border-slate-200 bg-white px-6 py-8 sm:px-10 lg:px-12">
            <div className="w-full">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Secure connection</p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Open a project</h2>
                </div>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  API key access
                </span>
              </div>

              <p className="mt-4 text-sm leading-6 text-slate-600">
                Connect to a Relay project to inspect its operational data. The key stays in memory and is cleared when you disconnect.
              </p>

              <form onSubmit={(event) => void connect(event)} className="mt-8 space-y-5">
                <label className="block text-sm font-medium text-slate-700">
                  API base URL
                  <input
                    value={apiUrl}
                    onChange={(event) => setApiUrl(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                    placeholder="http://localhost:4000/api"
                    autoComplete="url"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Project ID
                  <input
                    value={projectId}
                    onChange={(event) => setProjectId(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                    placeholder="Project UUID"
                    required
                    autoComplete="off"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Project API key
                  <input
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                    placeholder="relay_pk_..."
                    type="password"
                    autoComplete="off"
                  />
                </label>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Checking access..." : "Connect to project"}
                </button>
                <button
                  type="button"
                  onClick={startDemo}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                >
                  Preview dashboard without connecting
                </button>
              </form>

              <div className="mt-7 flex gap-3 border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                <span>Local preview uses sample records only. It does not call Express or write to Neon.</span>
              </div>
              {message ? <p className={`mt-4 text-sm ${isErrorMessage(message) ? "text-rose-600" : "text-slate-600"}`} role="status">{message}</p> : null}
            </div>
          </section>
        </div>
      </main>
    );
  }

  const navItems: Array<[View, string]> = [
    ["overview", "Overview"],
    ["endpoints", "Endpoints"],
    ["deliveries", "Deliveries"],
    ["access", "Access & security"],
  ];

  return (
    <main className="min-h-[100dvh] bg-[#f4f7fb] text-slate-950">
      <div className="mx-auto flex min-h-[100dvh] max-w-[1600px]">
        <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white px-5 py-6 md:flex md:flex-col">
          <BrandMark />

          <div className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Connected project</div>
            <div className="mt-3 flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${demoMode ? "bg-amber-500" : "bg-emerald-500"}`} />
              <span className="text-sm font-semibold text-slate-900">{projectLabel}</span>
            </div>
            <div className="mt-2 truncate text-xs text-slate-500">{apiUrl}</div>
          </div>

          <nav className="mt-8 space-y-1" aria-label="Project navigation">
            <p className="mb-3 px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Workspace</p>
            {navItems.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setView(value)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm font-medium transition ${
                  view === value
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                }`}
              >
                <span>{label}</span>
                {value === "deliveries" && attentionCount > 0 ? (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${view === value ? "bg-blue-100 text-blue-700" : "bg-rose-50 text-rose-700"}`}>
                    {attentionCount}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>

          <div className="mt-auto border-t border-slate-200 pt-5">
            <p className="px-1 text-xs leading-5 text-slate-500">Session-only access. Keys are never persisted by this dashboard.</p>
            <button
              type="button"
              onClick={disconnect}
              className="mt-4 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
            >
              {demoMode ? "Exit preview" : "Disconnect project"}
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="border-b border-slate-200 bg-white px-5 py-5 sm:px-8">
            <div className="mx-auto flex max-w-7xl items-start justify-between gap-5">
              <div>
                <div className="text-xs font-semibold text-slate-500">Project / {heading.eyebrow}</div>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{heading.title}</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{heading.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                <span className={`h-2 w-2 rounded-full ${demoMode ? "bg-amber-500" : "bg-emerald-500"}`} />
                <span className="hidden sm:inline">{demoMode ? "Preview mode" : "Connected"}</span>
              </div>
            </div>
            <div className="mx-auto mt-5 flex max-w-7xl gap-2 overflow-x-auto md:hidden">
              {navItems.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setView(value)}
                  className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${view === value ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </header>

          <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
            {message ? (
              <div className={`mb-6 flex items-start justify-between gap-4 rounded-xl border px-4 py-3 text-sm ${isErrorMessage(message) ? "border-rose-200 bg-rose-50 text-rose-800" : "border-blue-200 bg-blue-50 text-blue-800"}`} role="status">
                <span>{message}</span>
                <button type="button" onClick={() => setMessage("")} className={`text-xs font-bold ${isErrorMessage(message) ? "text-rose-700 hover:text-rose-900" : "text-blue-700 hover:text-blue-900"}`}>Dismiss</button>
              </div>
            ) : null}

            {revealedSecret ? (
              <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-amber-900">Save this signing secret now</div>
                  <div className="mt-1 text-xs leading-5 text-amber-800">Relay will not show it again in endpoint listings.</div>
                  <code className="mt-3 block break-all rounded-lg border border-amber-200 bg-white/70 p-3 text-xs text-amber-950">{revealedSecret}</code>
                </div>
                <button type="button" onClick={() => setRevealedSecret(null)} className="shrink-0 self-start rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100">Dismiss</button>
              </div>
            ) : null}

            {view === "overview" ? (
              <section className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric label="Active endpoints" value={String(activeCount)} detail="destinations accepting new events" />
                  <Metric label="Delivery records" value={String(deliveries.length)} detail="event-to-endpoint relationships" />
                  <Metric label="Delivered" value={String(deliveredCount)} detail={`${successRate}% of the visible records`} />
                  <Metric label="Needs attention" value={String(attentionCount)} detail="retrying or permanently failed" />
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
                  <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/40">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">Delivery health</p>
                        <p className="mt-1 text-sm text-slate-500">A compact view of the latest known outcome for each delivery.</p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-3xl font-semibold tracking-tight text-slate-950">{successRate}%</p>
                        <p className="mt-1 text-xs text-slate-500">visible success rate</p>
                      </div>
                    </div>
                    <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${successRate}%` }} />
                    </div>
                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                      {[
                        ["Delivered", deliveredCount, "bg-emerald-500"],
                        ["Retrying", deliveries.filter((delivery) => delivery.status === "retrying").length, "bg-amber-500"],
                        ["Failed", deliveries.filter((delivery) => ["failed", "dead_lettered"].includes(delivery.status)).length, "bg-rose-500"],
                      ].map(([label, value, dot]) => (
                        <div key={label} className="rounded-xl bg-slate-50 p-4">
                          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><span className={`h-2 w-2 rounded-full ${dot}`} />{label}</div>
                          <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/40">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">Destinations</p>
                        <p className="mt-1 text-sm text-slate-500">Endpoint availability at a glance.</p>
                      </div>
                      <button type="button" onClick={() => setView("endpoints")} className="text-xs font-semibold text-blue-600 hover:text-blue-700">Manage</button>
                    </div>
                    <div className="mt-5 space-y-3">
                      {endpoints.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">No endpoints registered.</p>
                      ) : endpoints.slice(0, 3).map((endpoint) => (
                        <div key={endpoint.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 p-3">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${endpoint.active ? "bg-emerald-500" : "bg-slate-400"}`} />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{endpoint.url}</span>
                          <span className="text-xs text-slate-500">{endpoint.active ? "Active" : "Paused"}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/40">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">Recent deliveries</p>
                      <p className="mt-1 text-sm text-slate-500">The latest run for each event-to-endpoint relationship.</p>
                    </div>
                    <button type="button" onClick={() => setView("deliveries")} className="text-xs font-semibold text-blue-600 hover:text-blue-700">View all</button>
                  </div>
                  <div className="mt-5 divide-y divide-slate-100">
                    {deliveries.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No deliveries have been created yet.</p> : deliveries.slice(0, 4).map((delivery) => (
                      <div key={delivery.deliveryId} className="grid gap-3 py-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-center">
                        <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{delivery.eventType}</p><p className="mt-1 text-xs text-slate-500">Event {shortId(delivery.eventId)}</p></div>
                        <p className="truncate text-sm text-slate-500">{delivery.endpointUrl}</p>
                        <StatusBadge status={delivery.status} />
                        <p className="text-xs text-slate-500">{formatDate(delivery.updatedAt)}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </section>
            ) : null}

            {view === "endpoints" ? (
              <section className="grid gap-6 xl:grid-cols-[360px_1fr]">
                <section className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/40">
                  <p className="text-sm font-semibold text-slate-950">Register destination</p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">Create a signed webhook destination for this project.</p>
                  <form onSubmit={(event) => void createEndpoint(event)} className="mt-6 space-y-4">
                    <label className="block text-sm font-medium text-slate-700">
                      Destination URL
                      <input value={endpointUrl} onChange={(event) => setEndpointUrl(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" placeholder="https://api.example.com/webhooks" type="url" required />
                    </label>
                    <button type="submit" disabled={busy} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">Register destination</button>
                  </form>
                  <p className="mt-5 text-xs leading-5 text-slate-500">A signing secret is returned once after creation. Store it in the destination service.</p>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/40">
                  <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-slate-950">Your destinations</p><p className="mt-1 text-sm text-slate-500">Paused destinations are excluded from future event fan-out.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{endpoints.length} total</span></div>
                  <div className="mt-6 space-y-3">
                    {endpoints.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">No endpoints loaded yet.</div> : endpoints.map((endpoint) => (
                      <article key={endpoint.id} className="rounded-xl border border-slate-200 p-4 transition hover:border-blue-200 hover:shadow-sm">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${endpoint.active ? "bg-emerald-500" : "bg-slate-400"}`} /><span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{endpoint.active ? "Active" : "Paused"}</span></div><p className="mt-2 truncate text-sm font-semibold text-slate-900">{endpoint.url}</p><p className="mt-1 text-xs text-slate-500">Updated {formatDate(endpoint.updatedAt)}</p></div><div className="flex shrink-0 flex-wrap gap-2"><button type="button" onClick={() => void updateEndpoint(endpoint, !endpoint.active)} disabled={busy} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50">{endpoint.active ? "Pause" : "Activate"}</button><button type="button" onClick={() => void rotateSecret(endpoint)} disabled={busy} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 disabled:opacity-50">Rotate secret</button></div></div>
                      </article>
                    ))}
                  </div>
                </section>
              </section>
            ) : null}

            {view === "deliveries" ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/40">
                <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-slate-950">All delivery records</p><p className="mt-1 text-sm text-slate-500">A delivery is the relationship between one event and one endpoint.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{deliveries.length} records</span></div>
                <div className="mt-6 overflow-x-auto">
                  {deliveries.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">No deliveries have been created for this project yet.</div> : <table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-[0.14em] text-slate-500"><tr><th className="px-3 py-3 font-semibold">Event</th><th className="px-3 py-3 font-semibold">Endpoint</th><th className="px-3 py-3 font-semibold">Status</th><th className="px-3 py-3 font-semibold">Attempts</th><th className="px-3 py-3 font-semibold">Updated</th></tr></thead><tbody className="divide-y divide-slate-100">{deliveries.map((delivery) => <tr key={delivery.deliveryId} className="hover:bg-slate-50"><td className="px-3 py-4"><div className="font-semibold text-slate-900">{delivery.eventType}</div><div className="mt-1 text-xs text-slate-500">{shortId(delivery.eventId)}</div></td><td className="max-w-[280px] truncate px-3 py-4 text-slate-600">{delivery.endpointUrl}</td><td className="px-3 py-4"><StatusBadge status={delivery.status} /></td><td className="px-3 py-4 text-slate-600">{delivery.attemptCount}</td><td className="px-3 py-4 text-slate-500">{formatDate(delivery.updatedAt)}</td></tr>)}</tbody></table>}
                </div>
              </section>
            ) : null}

            {view === "access" ? (
              <section className="grid gap-6 lg:grid-cols-2">
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/40"><p className="text-sm font-semibold text-slate-950">Connection details</p><p className="mt-1 text-sm leading-6 text-slate-500">These values identify the project that this dashboard is inspecting.</p><dl className="mt-6 space-y-4"><div className="rounded-xl bg-slate-50 p-4"><dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">API base URL</dt><dd className="mt-2 break-all text-sm font-medium text-slate-900">{apiUrl}</dd></div><div className="rounded-xl bg-slate-50 p-4"><dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Project ID</dt><dd className="mt-2 break-all font-mono text-sm text-slate-900">{projectId}</dd></div></dl><button type="button" onClick={disconnect} className="mt-6 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700">{demoMode ? "Exit preview" : "Disconnect and clear key"}</button></section>
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/40"><p className="text-sm font-semibold text-slate-950">Security model</p><h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{demoMode ? "Preview mode is isolated" : "Scoped by project"}</h2><p className="mt-4 text-sm leading-6 text-slate-600">{demoMode ? "This screen uses sample records inside the browser. It does not authenticate, call Express, or write to Neon." : "Every dashboard request sends the project key to Express. Middleware hashes it, checks for an active key belonging to this project, and rejects invalid access before route logic runs."}</p><div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">{demoMode ? "Use the connection form when you want to test the real API path." : "The project API key is held in memory only and is never shown in endpoint listings."}</div></section>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
