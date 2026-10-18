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

function statusClass(status: string): string {
  if (status === "delivered") {
    return "border-emerald-300/20 bg-emerald-300/10 text-emerald-200";
  }

  if (status === "retrying" || status === "processing") {
    return "border-amber-300/20 bg-amber-300/10 text-amber-200";
  }

  if (status === "failed" || status === "dead_lettered") {
    return "border-rose-300/20 bg-rose-300/10 text-rose-200";
  }

  return "border-slate-700 bg-slate-800/80 text-slate-300";
}

function headingFor(view: View): { eyebrow: string; title: string } {
  switch (view) {
    case "endpoints":
      return { eyebrow: "Destinations", title: "Endpoint management" };
    case "deliveries":
      return { eyebrow: "Operations", title: "Delivery activity" };
    case "access":
      return { eyebrow: "Security", title: "Project access" };
    default:
      return {
        eyebrow: "Project overview",
        title: "Keep every webhook accountable",
      };
  }
}

function Brand() {
  return (
    <div className="flex items-center gap-3 text-sm font-semibold tracking-[0.18em] text-amber-200">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-200 text-sm font-black text-[#0b111a]">
        R
      </span>
      RELAY
    </div>
  );
}

export default function RelayControlPlane() {
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

    const endpointBody = await readResponse<{ endpoints: Endpoint[] }>(
      endpointResponse,
    );
    const deliveryBody = await readResponse<{ deliveries: Delivery[] }>(
      deliveryResponse,
    );

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
      setView("overview");
      setMessage("Project connected. The access key stays in memory for this session.");
    } catch (error) {
      setConnected(false);
      setMessage(
        error instanceof Error ? error.message : "Unable to connect to this project.",
      );
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
      const endpoint = await readResponse<Endpoint & { signingSecret: string }>(
        response,
      );
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
      const rotated = await readResponse<Endpoint & { signingSecret: string }>(
        response,
      );
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
      <main className="min-h-[100dvh] bg-[#0b111a] px-5 py-6 text-slate-100 sm:px-8 lg:px-12">
        <div className="mx-auto grid min-h-[calc(100dvh-3rem)] max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="max-w-xl">
            <Brand />
            <h1 className="mt-10 max-w-lg text-5xl font-semibold leading-[1.02] tracking-[-0.045em] text-white sm:text-6xl">
              Every event deserves a clear delivery story.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-slate-400">
              Inspect destinations, follow delivery health, and manage signing secrets from one operational surface.
            </p>
            <div className="mt-10 grid max-w-lg gap-3 sm:grid-cols-3">
              {[
                ["01", "Observe", "See the latest delivery state."],
                ["02", "Control", "Pause unsafe destinations."],
                ["03", "Trust", "Rotate secrets without exposure."],
              ].map(([number, label, description]) => (
                <div key={number} className="border-t border-slate-800 pt-4">
                  <div className="text-xs font-semibold tracking-[0.18em] text-amber-200">{number}</div>
                  <div className="mt-2 font-medium text-slate-200">{label}</div>
                  <div className="mt-1 text-sm leading-5 text-slate-500">{description}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-[#111a26] p-6 shadow-2xl shadow-black/25 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Secure connection</div>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">Open a project</h2>
              </div>
              <div className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-200">API key access</div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-400">
              Relay authenticates project access with an API key. In local development, the key can be empty while authentication is disabled.
            </p>
            <form onSubmit={(event) => void connect(event)} className="mt-7 space-y-5">
              <label className="block text-sm text-slate-300">API base URL<input value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-[#0b111a] px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-amber-200/70 focus:ring-2 focus:ring-amber-200/15" placeholder="http://localhost:4000/api" autoComplete="url" /></label>
              <label className="block text-sm text-slate-300">Project ID<input value={projectId} onChange={(event) => setProjectId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-[#0b111a] px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-amber-200/70 focus:ring-2 focus:ring-amber-200/15" placeholder="Project UUID" required autoComplete="off" /></label>
              <label className="block text-sm text-slate-300">Project API key<input value={apiKey} onChange={(event) => setApiKey(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-[#0b111a] px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-amber-200/70 focus:ring-2 focus:ring-amber-200/15" placeholder="relay_pk_..." type="password" autoComplete="off" /></label>
              <button type="submit" disabled={busy} className="w-full rounded-xl bg-amber-200 px-4 py-3.5 text-sm font-semibold text-[#0b111a] transition hover:bg-amber-100 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Checking access..." : "Connect to project"}</button>
              <button type="button" onClick={startDemo} className="w-full rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-amber-200/50 hover:text-amber-100">Preview dashboard without connecting</button>
            </form>
            <div className="mt-6 flex gap-3 border-t border-slate-800 pt-5 text-xs leading-5 text-slate-500"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-200" />The key is kept in memory only and is removed when you disconnect or close the page.</div>
            {message ? <p className="mt-4 text-sm text-rose-200" role="status">{message}</p> : null}
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
    <main className="min-h-[100dvh] bg-[#0b111a] text-slate-100">
      <div className="mx-auto flex min-h-[100dvh] max-w-[1500px]">
        <aside className="hidden w-64 shrink-0 border-r border-slate-800/80 bg-[#0e1621] px-5 py-6 md:flex md:flex-col">
          <Brand />
          <div className="mt-10 rounded-2xl border border-slate-800 bg-[#111a26] p-4"><div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Connected project</div><div className="mt-3 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-300" /><span className="text-sm font-medium text-slate-200">{projectLabel}</span></div><div className="mt-2 truncate text-xs text-slate-500">{apiUrl}</div></div>
          <nav className="mt-8 space-y-1" aria-label="Project navigation">
            {navItems.map(([value, label]) => <button key={value} type="button" onClick={() => setView(value)} className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm transition active:translate-y-px ${view === value ? "bg-amber-200 text-[#0b111a]" : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"}`}><span>{label}</span>{value === "deliveries" && attentionCount > 0 ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${view === value ? "bg-[#0b111a] text-amber-200" : "bg-rose-300/15 text-rose-200"}`}>{attentionCount}</span> : null}</button>)}
          </nav>
          <div className="mt-auto border-t border-slate-800 pt-5"><button type="button" onClick={disconnect} className="w-full rounded-xl border border-slate-700 px-3 py-2.5 text-sm text-slate-400 transition hover:border-slate-500 hover:text-slate-200">Disconnect project</button></div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="border-b border-slate-800/80 bg-[#0e1621]/90 px-5 py-5 backdrop-blur sm:px-8"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4"><div><div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{heading.eyebrow}</div><h1 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">{heading.title}</h1></div><div className="flex items-center gap-3"><div className="hidden text-right sm:block"><div className={`text-xs font-medium ${demoMode ? "text-amber-200" : "text-emerald-200"}`}>{demoMode ? "Preview mode" : "Project key connected"}</div><div className="mt-1 text-[11px] text-slate-500">{demoMode ? "No API calls" : "Session-only credential"}</div></div><span className={`h-2.5 w-2.5 rounded-full ${demoMode ? "bg-amber-200" : "bg-emerald-300"}`} aria-label={demoMode ? "Preview mode" : "Connected"} /></div></div><div className="mx-auto mt-5 flex max-w-6xl gap-2 overflow-x-auto md:hidden">{navItems.map(([value, label]) => <button key={value} type="button" onClick={() => setView(value)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium ${view === value ? "bg-amber-200 text-[#0b111a]" : "bg-slate-800/70 text-slate-400"}`}>{label}</button>)}</div></header>

          <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
            {revealedSecret ? <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="text-sm font-semibold text-amber-100">Save this signing secret now</div><div className="mt-1 text-xs leading-5 text-amber-200/70">Relay will not show it again in endpoint listings.</div><code className="mt-3 block break-all rounded-lg bg-[#0b111a]/70 p-3 text-xs text-amber-100">{revealedSecret}</code></div><button type="button" onClick={() => setRevealedSecret(null)} className="shrink-0 self-start rounded-lg border border-amber-200/30 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-200/10">Dismiss</button></div> : null}

            {view === "overview" ? <section className="space-y-8"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Active endpoints", String(activeCount), "destinations accepting new events"], ["Delivery records", String(deliveries.length), "event-to-endpoint relationships"], ["Delivered", String(deliveredCount), "latest observed success states"], ["Needs attention", String(attentionCount), "retrying or permanently failed"]].map(([label, value, detail]) => <div key={label} className="rounded-2xl border border-slate-800 bg-[#111a26] p-5"><div className="text-xs font-medium text-slate-500">{label}</div><div className="mt-4 text-3xl font-semibold tracking-tight text-white">{value}</div><div className="mt-2 text-xs leading-5 text-slate-500">{detail}</div></div>)}</div><div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]"><section className="rounded-2xl border border-slate-800 bg-[#111a26] p-6"><div className="flex items-start justify-between gap-4"><div><div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Latest signal</div><h2 className="mt-2 text-lg font-semibold text-white">Delivery health at a glance</h2></div><button type="button" onClick={() => setView("deliveries")} className="text-xs font-semibold text-amber-200 hover:text-amber-100">View activity</button></div><div className="mt-6 space-y-3">{deliveries.slice(0, 5).map((delivery) => <div key={delivery.deliveryId} className="flex items-center justify-between gap-4 border-t border-slate-800 pt-3 first:border-t-0 first:pt-0"><div className="min-w-0"><div className="truncate text-sm font-medium text-slate-200">{delivery.eventType}</div><div className="mt-1 truncate text-xs text-slate-500">{delivery.endpointUrl}</div></div><div className="shrink-0 text-right"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusClass(delivery.status)}`}>{delivery.status}</span><div className="mt-1 text-[11px] text-slate-600">{formatDate(delivery.updatedAt)}</div></div></div>)}{deliveries.length === 0 ? <p className="rounded-xl border border-dashed border-slate-700 p-6 text-sm text-slate-500">No delivery activity yet. Publish an event to create the first record.</p> : null}</div></section><section className="rounded-2xl border border-slate-800 bg-[#111a26] p-6"><div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Operator actions</div><h2 className="mt-2 text-lg font-semibold text-white">Keep the project safe</h2><div className="mt-6 space-y-3"><button type="button" onClick={() => setView("endpoints")} className="flex w-full items-center justify-between rounded-xl border border-slate-700 px-4 py-3 text-left text-sm text-slate-300 transition hover:border-amber-200/40 hover:bg-amber-200/5 hover:text-white"><span>Review destinations</span><span className="text-amber-200">{endpoints.length}</span></button><button type="button" onClick={() => setView("deliveries")} className="flex w-full items-center justify-between rounded-xl border border-slate-700 px-4 py-3 text-left text-sm text-slate-300 transition hover:border-amber-200/40 hover:bg-amber-200/5 hover:text-white"><span>Inspect failed delivery</span><span className="text-amber-200">{attentionCount}</span></button><button type="button" onClick={() => setView("access")} className="flex w-full items-center justify-between rounded-xl border border-slate-700 px-4 py-3 text-left text-sm text-slate-300 transition hover:border-amber-200/40 hover:bg-amber-200/5 hover:text-white"><span>Review access model</span><span className="text-amber-200">API key</span></button></div></section></div></section> : null}

            {view === "endpoints" ? <section className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]"><section className="rounded-2xl border border-slate-800 bg-[#111a26] p-6"><div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">New destination</div><h2 className="mt-2 text-lg font-semibold text-white">Register an endpoint</h2><p className="mt-2 text-sm leading-6 text-slate-500">Relay will create a signing secret for this destination and return it once.</p><form onSubmit={(event) => void createEndpoint(event)} className="mt-6 space-y-4"><label className="block text-sm text-slate-300">Destination URL<input value={endpointUrl} onChange={(event) => setEndpointUrl(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-[#0b111a] px-3 py-3 text-sm text-white outline-none focus:border-amber-200/70" placeholder="https://api.example.com/webhooks" type="url" required /></label><button type="submit" disabled={busy} className="w-full rounded-xl bg-amber-200 px-4 py-3 text-sm font-semibold text-[#0b111a] hover:bg-amber-100 active:translate-y-px disabled:opacity-50">{busy ? "Registering..." : "Register endpoint"}</button></form></section><section className="rounded-2xl border border-slate-800 bg-[#111a26] p-6"><div className="flex items-start justify-between gap-4"><div><div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Destinations</div><h2 className="mt-2 text-lg font-semibold text-white">Where Relay sends events</h2></div><span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">{endpoints.length} total</span></div><div className="mt-6 space-y-3">{endpoints.map((endpoint) => <article key={endpoint.id} className="rounded-xl border border-slate-800 bg-[#0b111a] p-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${endpoint.active ? "bg-emerald-300" : "bg-slate-600"}`} /><span className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">{endpoint.active ? "Active" : "Paused"}</span></div><p className="mt-2 truncate text-sm font-medium text-slate-200">{endpoint.url}</p><p className="mt-1 text-xs text-slate-600">Updated {formatDate(endpoint.updatedAt)}</p></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => void updateEndpoint(endpoint, !endpoint.active)} disabled={busy} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-amber-200/50 hover:text-amber-100 disabled:opacity-50">{endpoint.active ? "Pause" : "Activate"}</button><button type="button" onClick={() => void rotateSecret(endpoint)} disabled={busy} className="rounded-lg border border-amber-200/30 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-200/10 disabled:opacity-50">Rotate secret</button></div></div></article>)}{endpoints.length === 0 ? <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">No endpoints yet. Register the first destination from the panel beside this list.</div> : null}</div></section></section> : null}

            {view === "deliveries" ? <section className="rounded-2xl border border-slate-800 bg-[#111a26] p-6"><div className="flex items-start justify-between gap-4"><div><div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Delivery ledger</div><h2 className="mt-2 text-lg font-semibold text-white">Recent event-to-endpoint activity</h2></div><span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">{deliveries.length} records</span></div><div className="mt-6 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-slate-800 text-xs uppercase tracking-[0.15em] text-slate-600"><tr><th className="px-3 py-3 font-medium">Event</th><th className="px-3 py-3 font-medium">Endpoint</th><th className="px-3 py-3 font-medium">Status</th><th className="px-3 py-3 font-medium">Attempts</th><th className="px-3 py-3 font-medium">Updated</th></tr></thead><tbody className="divide-y divide-slate-800/70">{deliveries.map((delivery) => <tr key={delivery.deliveryId}><td className="px-3 py-4 text-slate-200"><div className="font-medium">{delivery.eventType}</div><div className="mt-1 text-xs text-slate-600">{delivery.eventId.slice(0, 8)}...</div></td><td className="max-w-[280px] truncate px-3 py-4 text-slate-400">{delivery.endpointUrl}</td><td className="px-3 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusClass(delivery.status)}`}>{delivery.status}</span></td><td className="px-3 py-4 text-slate-400">{delivery.attemptCount}</td><td className="px-3 py-4 text-slate-500">{formatDate(delivery.updatedAt)}</td></tr>)}</tbody></table>{deliveries.length === 0 ? <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center text-sm text-slate-500">No delivery records are available for this project.</div> : null}</div></section> : null}

            {view === "access" ? <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]"><section className="rounded-2xl border border-slate-800 bg-[#111a26] p-6"><div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Current session</div><h2 className="mt-2 text-lg font-semibold text-white">{demoMode ? "Preview data is loaded" : "Project access is connected"}</h2><div className="mt-6 space-y-4"><div className="flex items-center justify-between border-t border-slate-800 pt-4 text-sm"><span className="text-slate-500">Credential type</span><span className="font-medium text-slate-200">{demoMode ? "Local preview" : "Project API key"}</span></div><div className="flex items-center justify-between border-t border-slate-800 pt-4 text-sm"><span className="text-slate-500">Project scope</span><span className="font-medium text-slate-200">{projectLabel}</span></div><div className="flex items-center justify-between border-t border-slate-800 pt-4 text-sm"><span className="text-slate-500">Storage</span><span className="font-medium text-emerald-200">{demoMode ? "In-memory sample" : "Memory only"}</span></div></div><button type="button" onClick={disconnect} className="mt-8 rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-300 hover:border-rose-300/40 hover:text-rose-200">{demoMode ? "Exit preview" : "Disconnect and clear key"}</button></section><section className="rounded-2xl border border-slate-800 bg-[#111a26] p-6"><div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Security model</div><h2 className="mt-2 text-lg font-semibold text-white">{demoMode ? "Preview mode is isolated" : "Scoped by project"}</h2><p className="mt-4 text-sm leading-6 text-slate-400">{demoMode ? "This screen uses sample records inside the browser. It does not authenticate, call Express, or write to Neon." : "Every dashboard request sends the project key to Express. The middleware hashes it, looks for an active key belonging to this project, and rejects invalid access before a route reaches application logic."}</p><div className="mt-6 rounded-xl border border-amber-200/20 bg-amber-200/5 p-4 text-sm leading-6 text-amber-100">{demoMode ? "Use the connection form later when you want to test the real API path." : "API-key provisioning remains an admin operation for now. The admin key is never entered into this dashboard."}</div></section></section> : null}

            {message ? <p className="mt-6 text-sm text-slate-500" role="status">{message}</p> : null}
          </div>
        </div>
      </div>
    </main>
  );
}
