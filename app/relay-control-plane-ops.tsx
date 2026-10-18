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
  if (status === "delivered") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "retrying" || status === "processing") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "failed" || status === "dead_lettered") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function statusDot(status: string): string {
  if (status === "delivered") return "bg-emerald-500";
  if (status === "retrying" || status === "processing") return "bg-amber-500";
  if (status === "failed" || status === "dead_lettered") return "bg-rose-500";
  return "bg-slate-400";
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-sm font-black text-white shadow-sm shadow-blue-600/25">R</span>
      <span className="text-sm font-bold tracking-[0.24em] text-slate-950">RELAY</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusClass(status)}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${statusDot(status)}`} />
      {status.replaceAll("_", " ")}
    </span>
  );
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">{eyebrow}</p>
      <h1 className="mt-2 font-sans text-4xl font-semibold tracking-[-0.055em] text-slate-950 sm:text-5xl">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}

export default function RelayControlPlaneOps() {
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

  const activeCount = useMemo(() => endpoints.filter((endpoint) => endpoint.active).length, [endpoints]);
  const deliveredCount = useMemo(() => deliveries.filter((delivery) => delivery.status === "delivered").length, [deliveries]);
  const retryingCount = useMemo(() => deliveries.filter((delivery) => delivery.status === "retrying").length, [deliveries]);
  const failedCount = useMemo(() => deliveries.filter((delivery) => ["failed", "dead_lettered"].includes(delivery.status)).length, [deliveries]);
  const attentionCount = retryingCount + failedCount;
  const successRate = deliveries.length ? Math.round((deliveredCount / deliveries.length) * 100) : 0;
  const projectLabel = projectId ? `${projectId.slice(0, 8)}...` : "No project";

  function requestHeaders(): HeadersInit {
    return apiKey ? { "X-Relay-API-Key": apiKey } : {};
  }

  async function fetchProjectData(): Promise<ProjectData> {
    const baseUrl = apiUrl.replace(/\/$/, "");
    const [endpointResponse, deliveryResponse] = await Promise.all([
      fetch(`${baseUrl}/projects/${projectId}/endpoints`, { headers: requestHeaders() }),
      fetch(`${baseUrl}/projects/${projectId}/deliveries`, { headers: requestHeaders() }),
    ]);
    const endpointBody = await readResponse<{ endpoints: Endpoint[] }>(endpointResponse);
    const deliveryBody = await readResponse<{ deliveries: Delivery[] }>(deliveryResponse);
    return { endpoints: endpointBody.endpoints, deliveries: deliveryBody.deliveries };
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
      const response = await fetch(`${apiUrl.replace(/\/$/, "")}/projects/${projectId}/endpoints`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...requestHeaders() },
        body: JSON.stringify({ url: endpointUrl }),
      });
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
      const response = await fetch(`${apiUrl.replace(/\/$/, "")}/projects/${projectId}/endpoints/${endpoint.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...requestHeaders() },
        body: JSON.stringify({ active }),
      });
      const updated = await readResponse<Endpoint>(response);
      setEndpoints((current) => current.map((item) => (item.id === updated.id ? updated : item)));
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
      const response = await fetch(`${apiUrl.replace(/\/$/, "")}/projects/${projectId}/endpoints/${endpoint.id}/rotate-secret`, {
        method: "POST",
        headers: requestHeaders(),
      });
      const rotated = await readResponse<Endpoint & { signingSecret: string }>(response);
      setEndpoints((current) => current.map((item) => item.id === rotated.id ? { ...item, active: rotated.active, updatedAt: rotated.updatedAt } : item));
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
      <main className="min-h-[100dvh] bg-[#f7f6f1] text-slate-950">
        <div className="mx-auto grid min-h-[100dvh] max-w-[1480px] lg:grid-cols-[minmax(0,1fr)_500px]">
          <section className="relative overflow-hidden px-6 py-8 sm:px-12 lg:px-20 lg:py-12">
            <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-blue-100 blur-3xl" />
            <div className="relative flex h-full flex-col justify-between">
              <Brand />
              <div className="max-w-2xl py-16 lg:py-24">
                <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/80 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-blue-700 shadow-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-600" /> Webhook operations
                </div>
                <h1 className="mt-7 max-w-2xl font-sans text-5xl font-semibold leading-[0.98] tracking-[-0.07em] text-slate-950 sm:text-7xl">A calmer way to run webhook delivery.</h1>
                <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">Relay brings destinations, retries, signing secrets, and delivery history into one focused operating surface.</p>
                <div className="mt-12 grid max-w-xl grid-cols-3 border-y border-slate-300 py-4">
                  {[['01', 'Observe', 'Delivery state'], ['02', 'Control', 'Endpoint health'], ['03', 'Trust', 'Signed payloads']].map(([number, label, detail]) => <div key={number} className="pr-3"><p className="text-xs font-bold tracking-[0.18em] text-blue-600">{number}</p><p className="mt-2 text-sm font-semibold text-slate-900">{label}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>)}
                </div>
              </div>
              <p className="text-xs text-slate-500">Relay control plane · local development</p>
            </div>
          </section>

          <section className="flex items-center border-l border-slate-200 bg-white px-6 py-8 sm:px-12">
            <div className="w-full">
              <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Secure connection</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Open a project</h2></div><span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">API key access</span></div>
              <p className="mt-4 text-sm leading-6 text-slate-600">Connect to a Relay project to inspect its operational data. The key stays in memory and is cleared when you disconnect.</p>
              <form onSubmit={(event) => void connect(event)} className="mt-8 space-y-5">
                <label className="block text-sm font-medium text-slate-700">API base URL<input value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" placeholder="http://localhost:4000/api" autoComplete="url" /></label>
                <label className="block text-sm font-medium text-slate-700">Project ID<input value={projectId} onChange={(event) => setProjectId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" placeholder="Project UUID" required autoComplete="off" /></label>
                <label className="block text-sm font-medium text-slate-700">Project API key<input value={apiKey} onChange={(event) => setApiKey(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" placeholder="relay_pk_..." type="password" autoComplete="off" /></label>
                <button type="submit" disabled={busy} className="w-full rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Checking access..." : "Connect to project"}</button>
                <button type="button" onClick={startDemo} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700">Preview layout with sample data</button>
              </form>
              <div className="mt-7 flex gap-3 border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" /><span>Preview is visual only. It does not call Express or write to Neon.</span></div>
              {message ? <p className={`mt-4 text-sm ${isErrorMessage(message) ? "text-rose-600" : "text-slate-600"}`} role="status">{message}</p> : null}
            </div>
          </section>
        </div>
      </main>
    );
  }

  const navItems: Array<[View, string, string]> = [
    ["overview", "Overview", "Command center"],
    ["endpoints", "Endpoints", "Destinations"],
    ["deliveries", "Deliveries", "Event history"],
    ["access", "Access", "Project security"],
  ];
  const pageMeta: Record<View, { eyebrow: string; title: string; description: string }> = {
    overview: { eyebrow: "Command center", title: "Delivery operations", description: "See the current state of every destination and the work that needs attention." },
    endpoints: { eyebrow: "Destinations", title: "Endpoint management", description: "Register, pause, and rotate the signing secret for each destination." },
    deliveries: { eyebrow: "Event history", title: "Delivery activity", description: "Trace the latest run for every event-to-endpoint relationship." },
    access: { eyebrow: "Project security", title: "Access and trust", description: "Review the project connection and how Relay protects delivery credentials." },
  };
  const current = pageMeta[view];

  return (
    <main className="min-h-[100dvh] bg-[#f7f6f1] text-slate-950">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-[1480px] items-center justify-between gap-4 px-5 sm:px-8">
          <div className="flex min-w-0 items-center gap-5"><Brand /><span className="hidden h-7 w-px bg-slate-200 sm:block" /><div className="hidden min-w-0 sm:block"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Project</p><p className="mt-1 truncate text-sm font-semibold text-slate-900">{projectLabel}</p></div></div>
          <div className="flex items-center gap-3"><div className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 sm:flex sm:items-center sm:gap-2"><span className={`h-1.5 w-1.5 rounded-full ${demoMode ? "bg-amber-500" : "bg-emerald-500"}`} />{demoMode ? "Preview mode" : "Connected"}</div><button type="button" onClick={disconnect} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900">{demoMode ? "Exit preview" : "Disconnect"}</button></div>
        </div>
      </header>

      <div className="mx-auto grid min-h-[calc(100dvh-72px)] max-w-[1480px] lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="border-b border-slate-200 px-5 py-5 lg:border-b-0 lg:border-r lg:px-6 lg:py-8">
          <p className="px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Workspace</p>
          <nav className="mt-3 grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-1" aria-label="Project navigation">
            {navItems.map(([value, label, detail]) => <button key={value} type="button" onClick={() => setView(value)} className={`group rounded-xl px-3 py-3 text-left transition ${view === value ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20" : "text-slate-600 hover:bg-white hover:text-slate-950"}`}><span className="block text-sm font-semibold">{label}{value === "deliveries" && attentionCount > 0 ? <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${view === value ? "bg-white/15 text-white" : "bg-rose-50 text-rose-700"}`}>{attentionCount}</span> : null}</span><span className={`mt-1 hidden text-[11px] lg:block ${view === value ? "text-blue-100" : "text-slate-400"}`}>{detail}</span></button>)}
          </nav>
          <div className="mt-8 hidden rounded-2xl border border-slate-200 bg-white p-4 lg:block"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">API endpoint</p><p className="mt-2 truncate text-xs text-slate-600">{apiUrl}</p><div className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-600"><span className={`h-2 w-2 rounded-full ${demoMode ? "bg-amber-500" : "bg-emerald-500"}`} />{demoMode ? "Sample records" : "Live project data"}</div></div>
        </aside>

        <section className="min-w-0 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-col gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-end sm:justify-between"><SectionHeading eyebrow={current.eyebrow} title={current.title} description={current.description} /><div className="text-left sm:text-right"><p className="text-xs font-semibold text-slate-400">Project ID</p><p className="mt-1 font-mono text-xs text-slate-600">{projectLabel}</p></div></div>

            {message ? <div className={`mt-6 flex items-start justify-between gap-4 rounded-xl border px-4 py-3 text-sm ${isErrorMessage(message) ? "border-rose-200 bg-rose-50 text-rose-800" : "border-blue-200 bg-blue-50 text-blue-800"}`} role="status"><span>{message}</span><button type="button" onClick={() => setMessage("")} className="text-xs font-bold underline-offset-2 hover:underline">Dismiss</button></div> : null}
            {revealedSecret ? <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="text-sm font-semibold text-amber-950">Save this signing secret now</p><p className="mt-1 text-xs leading-5 text-amber-800">Relay will not show it again in endpoint listings.</p><code className="mt-3 block break-all rounded-lg border border-amber-200 bg-white/70 p-3 text-xs text-amber-950">{revealedSecret}</code></div><button type="button" onClick={() => setRevealedSecret(null)} className="self-start rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100">Dismiss</button></div> : null}

            {view === "overview" ? <section className="mt-8 space-y-6">
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
                  <div className="border-b border-blue-500/30 bg-blue-600 px-6 py-6 text-white sm:px-8"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-blue-100">Delivery health</p><p className="mt-2 text-sm text-blue-100">Latest known outcome across this project.</p></div><div className="rounded-2xl bg-white/10 px-4 py-3 text-left sm:text-right"><p className="font-sans text-4xl font-semibold tracking-[-0.04em] text-white">{successRate}%</p><p className="mt-1 text-xs font-medium text-blue-100">success rate</p></div></div><div className="mt-6 h-2 overflow-hidden rounded-full bg-blue-500"><div className="h-full rounded-full bg-white transition-all" style={{ width: `${successRate}%` }} /></div></div>
                  <div className="grid divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">{[["Delivered", String(deliveredCount), "bg-emerald-500"], ["Retrying", String(retryingCount), "bg-amber-500"], ["Failed", String(failedCount), "bg-rose-500"]].map(([label, value, dot]) => <div key={label} className="px-6 py-5 sm:px-8"><div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><span className={`h-2 w-2 rounded-full ${dot}`} />{label}</div><p className="mt-2 font-sans text-3xl font-semibold tracking-[-0.04em] text-slate-950">{value}</p></div>)}</div>
                </section>

                <section className="rounded-3xl border border-rose-200 bg-white p-6 shadow-sm shadow-slate-200/50"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-slate-950">Needs attention</p><p className="mt-1 text-sm leading-6 text-slate-500">Delivery states that deserve a closer look.</p></div><span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">{attentionCount}</span></div><div className="mt-6 space-y-3">{deliveries.filter((delivery) => ["retrying", "failed", "dead_lettered"].includes(delivery.status)).slice(0, 3).map((delivery) => <button key={delivery.deliveryId} type="button" onClick={() => setView("deliveries")} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-rose-200 hover:bg-rose-50/40"><div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-semibold text-slate-950">{delivery.eventType}</span><StatusBadge status={delivery.status} /></div><p className="mt-2 truncate text-xs text-slate-500">{delivery.endpointUrl}</p></button>)}{attentionCount === 0 ? <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Nothing needs attention right now.</p> : null}</div><button type="button" onClick={() => setView("deliveries")} className="mt-5 text-xs font-semibold text-blue-700 hover:text-blue-800">Open delivery activity →</button></section>
              </div>

              <section className="rounded-3xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50"><div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-6 sm:flex-row sm:items-start sm:justify-between sm:px-8"><div><p className="text-sm font-semibold text-slate-950">Recent activity</p><p className="mt-1 text-sm text-slate-500">The latest run for each event-to-endpoint relationship.</p></div><button type="button" onClick={() => setView("deliveries")} className="self-start text-xs font-semibold text-blue-600 hover:text-blue-700">View all activity →</button></div><div className="divide-y divide-slate-100">{deliveries.length === 0 ? <p className="px-6 py-10 text-center text-sm text-slate-500">No deliveries have been created yet.</p> : deliveries.map((delivery) => <div key={delivery.deliveryId} className="grid gap-4 px-6 py-5 sm:grid-cols-[minmax(150px,0.7fr)_minmax(220px,1.3fr)_auto_auto] sm:items-center sm:px-8"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-950">{delivery.eventType}</p><p className="mt-1 text-xs text-slate-500">Event {shortId(delivery.eventId)}</p></div><p className="truncate text-sm text-slate-600">{delivery.endpointUrl}</p><StatusBadge status={delivery.status} /><p className="text-xs text-slate-500 sm:text-right">{formatDate(delivery.updatedAt)}</p></div>)}</div></section>

              <div className="grid gap-6 md:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-semibold text-slate-500">Active endpoints</p><p className="mt-3 text-3xl font-semibold text-slate-950">{activeCount}</p><p className="mt-2 text-xs text-slate-500">of {endpoints.length} destinations accepting new events</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-semibold text-slate-500">Delivery records</p><p className="mt-3 text-3xl font-semibold text-slate-950">{deliveries.length}</p><p className="mt-2 text-xs text-slate-500">event-to-endpoint relationships</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-semibold text-slate-500">Project posture</p><p className="mt-3 text-lg font-semibold text-slate-950">{demoMode ? "Preview" : "Connected"}</p><p className="mt-2 text-xs text-slate-500">{demoMode ? "Sample records only" : "Session key is active"}</p></div></div>
            </section> : null}

            {view === "endpoints" ? <section className="mt-8 grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]"><section className="h-fit rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/50"><p className="text-sm font-semibold text-slate-950">Register destination</p><p className="mt-1 text-sm leading-6 text-slate-500">Create a signed webhook destination for this project.</p><form onSubmit={(event) => void createEndpoint(event)} className="mt-6 space-y-4"><label className="block text-sm font-medium text-slate-700">Destination URL<input value={endpointUrl} onChange={(event) => setEndpointUrl(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" placeholder="https://api.example.com/webhooks" type="url" required /></label><button type="submit" disabled={busy} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">Register destination</button></form><p className="mt-5 text-xs leading-5 text-slate-500">A signing secret is returned once after creation. Store it in the destination service.</p></section><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/50"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-slate-950">Your destinations</p><p className="mt-1 text-sm text-slate-500">Pause a destination to exclude it from future event fan-out.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{endpoints.length} total</span></div><div className="mt-6 space-y-3">{endpoints.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">No endpoints loaded yet.</div> : endpoints.map((endpoint) => <article key={endpoint.id} className="rounded-2xl border border-slate-200 p-5 transition hover:border-blue-200 hover:shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${endpoint.active ? "bg-emerald-500" : "bg-slate-400"}`} /><span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{endpoint.active ? "Active" : "Paused"}</span></div><p className="mt-2 truncate text-sm font-semibold text-slate-900">{endpoint.url}</p><p className="mt-1 text-xs text-slate-500">Updated {formatDate(endpoint.updatedAt)}</p></div><div className="flex shrink-0 flex-wrap gap-2"><button type="button" onClick={() => void updateEndpoint(endpoint, !endpoint.active)} disabled={busy} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50">{endpoint.active ? "Pause" : "Activate"}</button><button type="button" onClick={() => void rotateSecret(endpoint)} disabled={busy} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 disabled:opacity-50">Rotate secret</button></div></div></article>)}</div></section></section> : null}

            {view === "deliveries" ? <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/50"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-slate-950">All delivery records</p><p className="mt-1 text-sm text-slate-500">A delivery is the relationship between one event and one endpoint.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{deliveries.length} records</span></div><div className="mt-6 overflow-x-auto">{deliveries.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">No deliveries have been created for this project yet.</div> : <table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-[0.14em] text-slate-500"><tr><th className="px-3 py-3 font-semibold">Event</th><th className="px-3 py-3 font-semibold">Endpoint</th><th className="px-3 py-3 font-semibold">Status</th><th className="px-3 py-3 font-semibold">Attempts</th><th className="px-3 py-3 font-semibold">Updated</th></tr></thead><tbody className="divide-y divide-slate-100">{deliveries.map((delivery) => <tr key={delivery.deliveryId} className="hover:bg-slate-50"><td className="px-3 py-4"><div className="font-semibold text-slate-900">{delivery.eventType}</div><div className="mt-1 text-xs text-slate-500">{shortId(delivery.eventId)}</div></td><td className="max-w-[300px] truncate px-3 py-4 text-slate-600">{delivery.endpointUrl}</td><td className="px-3 py-4"><StatusBadge status={delivery.status} /></td><td className="px-3 py-4 text-slate-600">{delivery.attemptCount}</td><td className="px-3 py-4 text-slate-500">{formatDate(delivery.updatedAt)}</td></tr>)}</tbody></table>}</div></section> : null}

            {view === "access" ? <section className="mt-8 grid gap-6 lg:grid-cols-2"><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/50"><p className="text-sm font-semibold text-slate-950">Connection details</p><p className="mt-1 text-sm leading-6 text-slate-500">These values identify the project this control plane is inspecting.</p><dl className="mt-6 space-y-4"><div className="rounded-2xl bg-slate-50 p-4"><dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">API base URL</dt><dd className="mt-2 break-all text-sm font-medium text-slate-900">{apiUrl}</dd></div><div className="rounded-2xl bg-slate-50 p-4"><dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Project ID</dt><dd className="mt-2 break-all font-mono text-sm text-slate-900">{projectId}</dd></div></dl><button type="button" onClick={disconnect} className="mt-6 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700">{demoMode ? "Exit preview" : "Disconnect and clear key"}</button></section><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/50"><p className="text-sm font-semibold text-slate-950">Security model</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{demoMode ? "Preview mode is isolated" : "Scoped by project"}</h2><p className="mt-4 text-sm leading-6 text-slate-600">{demoMode ? "This screen uses sample records inside the browser. It does not authenticate, call Express, or write to Neon." : "Every dashboard request sends the project key to Express. Middleware checks for an active key belonging to this project before route logic runs."}</p><div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">{demoMode ? "Use the connection form when you want to test the real API path." : "The project API key is held in memory only and is never shown in endpoint listings."}</div></section></section> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
