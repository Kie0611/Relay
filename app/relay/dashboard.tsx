"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Brand, Button, CopyValue, Drawer, EmptyState, MetricCard, Notice, PageHeading, Panel, SkeletonRows, StatusBadge } from "./components";
import { RelayShell } from "./shell";
import { useRelay } from "./provider";
import type { DashboardView, Delivery, RelayEvent } from "./types";

const pageMeta: Record<DashboardView, { eyebrow: string; title: string; description: string }> = {
  overview: {
    eyebrow: "Command center",
    title: "Delivery operations",
    description: "See what is healthy, what needs attention, and which destinations are active.",
  },
  events: {
    eyebrow: "Immutable input",
    title: "Event history",
    description: "Inspect the event records that fan out into one or more endpoint deliveries.",
  },
  deliveries: {
    eyebrow: "Runs and attempts",
    title: "Delivery activity",
    description: "Trace every event-to-endpoint relationship without losing the latest outcome.",
  },
  endpoints: {
    eyebrow: "Destinations",
    title: "Endpoint management",
    description: "Register destinations, pause unsafe targets, and rotate signing secrets safely.",
  },
  access: {
    eyebrow: "Project trust",
    title: "Access and security",
    description: "Understand the project connection and how Relay separates access from delivery secrets.",
  },
};

function getView(pathname: string): DashboardView {
  const value = pathname.split("/")[1] as DashboardView;
  return value in pageMeta ? value : "overview";
}

function formatDate(value: string | null, includeYear = false): string {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" as const } : {}),
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function shortId(value: string): string {
  return `${value.slice(0, 8)}…`;
}

function previewPayload(payload: Record<string, unknown> | null): string {
  return payload ? JSON.stringify(payload) : "Payload unavailable from the current API contract";
}

function EventDrawer({ event, onClose }: { event: RelayEvent; onClose: () => void }) {
  const { data } = useRelay();
  const relatedDeliveries = data.deliveries.filter((delivery) => delivery.eventId === event.id);

  return (
    <Drawer title={event.type} eyebrow="Event record" onClose={onClose}>
      <div className="space-y-6">
        {event.source === "preview" ? (
          <Notice tone="warning">Preview fixture. This event is local sample data and was not sent to Relay.</Notice>
        ) : (
          <Notice>Live event projection. The current API exposes event identity through delivery summaries, but not the original payload.</Notice>
        )}
        <dl className="detail-grid">
          <div><dt>Event ID</dt><dd><CopyValue value={event.id} /></dd></div>
          <div><dt>Created</dt><dd>{formatDate(event.createdAt, true)}</dd></div>
          <div><dt>Deliveries</dt><dd>{event.deliveryCount}</dd></div>
        </dl>
        <div>
          <div className="mb-2 flex items-center justify-between"><p className="section-label">Payload snapshot</p><span className="font-mono text-[10px] text-[var(--relay-muted)]">JSON</span></div>
          <pre className="code-block">{previewPayload(event.payload)}</pre>
        </div>
        <div>
          <p className="section-label">Related deliveries</p>
          <div className="mt-3 space-y-2">
            {relatedDeliveries.length === 0 ? <p className="text-sm text-[var(--relay-muted)]">No deliveries are currently visible.</p> : relatedDeliveries.map((delivery) => (
              <div key={delivery.deliveryId} className="rounded-[14px] border border-[var(--relay-border)] bg-[var(--relay-canvas)] p-3">
                <div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-medium">{delivery.endpointUrl}</span><StatusBadge status={delivery.status} /></div>
                <p className="mt-2 font-mono text-[10px] text-[var(--relay-muted)]">{shortId(delivery.deliveryId)} · {delivery.attemptCount} attempts</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Drawer>
  );
}

function DeliveryDrawer({ delivery, onClose }: { delivery: Delivery; onClose: () => void }) {
  const { data, mode, busy, replayDelivery } = useRelay();
  const attempts = data.attempts.filter((attempt) => attempt.deliveryId === delivery.deliveryId).sort((a, b) => a.attemptNumber - b.attemptNumber);

  return (
    <Drawer title={delivery.eventType} eyebrow="Delivery detail" onClose={onClose}>
      <div className="space-y-6">
        {mode === "preview" ? <Notice tone="warning">Preview data. Replay changes are simulated locally and are not persisted.</Notice> : null}
        <div className="flex flex-wrap items-center justify-between gap-3"><StatusBadge status={delivery.status} /><Button variant="secondary" disabled={busy} onClick={() => void replayDelivery(delivery)}>Replay delivery</Button></div>
        <dl className="detail-grid">
          <div><dt>Delivery ID</dt><dd><CopyValue value={delivery.deliveryId} /></dd></div>
          <div><dt>Event ID</dt><dd><CopyValue value={delivery.eventId} /></dd></div>
          <div><dt>Endpoint</dt><dd className="break-all">{delivery.endpointUrl}</dd></div>
          <div><dt>Run</dt><dd>#{delivery.runNumber ?? 1} · {delivery.runType === "manual_replay" ? "Manual replay" : "Initial"}</dd></div>
          <div><dt>Attempt count</dt><dd>{delivery.attemptCount}</dd></div>
          <div><dt>Last response</dt><dd className="font-mono">{delivery.lastResponseStatus ?? "—"}</dd></div>
          <div><dt>Next attempt</dt><dd>{formatDate(delivery.nextAttemptAt)}</dd></div>
          <div><dt>Delivered</dt><dd>{formatDate(delivery.deliveredAt)}</dd></div>
        </dl>
        <div>
          <div className="flex items-center justify-between"><p className="section-label">Attempt timeline</p><span className="font-mono text-[10px] text-[var(--relay-muted)]">{attempts.length || "—"} recorded</span></div>
          {attempts.length ? (
            <div className="mt-4 space-y-3">
              {attempts.map((attempt) => (
                <div key={attempt.id} className="timeline-row">
                  <span className={`timeline-dot ${attempt.responseStatus && attempt.responseStatus >= 200 && attempt.responseStatus < 300 ? "timeline-dot-good" : "timeline-dot-warn"}`} />
                  <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">Attempt {attempt.attemptNumber}</p><span className="font-mono text-xs text-[var(--relay-muted)]">HTTP {attempt.responseStatus ?? "—"}</span></div><p className="mt-1 text-xs text-[var(--relay-muted)]">{attempt.errorCode ?? "Completed successfully"} · {attempt.durationMs ?? "—"} ms</p><p className="mt-1 font-mono text-[10px] text-[var(--relay-muted)]">{formatDate(attempt.startedAt, true)}</p></div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Attempts are not exposed yet" description={mode === "preview" ? "The preview fixtures have no attempts for this record." : "This Relay API version currently exposes delivery summaries but not attempt rows."} />
          )}
        </div>
      </div>
    </Drawer>
  );
}

function SecretDrawer({ secret, onClose }: { secret: string; onClose: () => void }) {
  return (
    <Drawer title="Save this signing secret" eyebrow="One-time reveal" onClose={onClose}>
      <div className="space-y-5">
        <Notice tone="warning">Relay will not show this secret in endpoint listings again. Store it in the destination service now.</Notice>
        <div className="rounded-[16px] border border-amber-200 bg-amber-50 p-4"><code className="block break-all text-xs leading-6 text-amber-950">{secret}</code></div>
        <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(secret)}>Copy secret</Button>
      </div>
    </Drawer>
  );
}

export function ConnectionGate() {
  const router = useRouter();
  const { connectLive, startPreview, busy } = useRelay();
  const [apiUrl, setApiUrl] = useState(process.env.NEXT_PUBLIC_RELAY_API_URL ?? "http://localhost:4000/api");
  const [projectId, setProjectId] = useState("");
  const [apiKey, setApiKey] = useState("");

  async function handleConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await connectLive({ apiUrl, projectId, apiKey })) router.replace("/overview");
  }

  function handlePreview() {
    startPreview();
    router.replace("/overview");
  }

  return (
    <main className="relay-gate">
      <div className="relay-gate-grid">
        <section className="hidden max-w-xl self-center lg:block">
          <Brand href="/" />
          <p className="mt-12 text-[11px] font-bold uppercase tracking-[0.2em] text-teal-700">Webhook delivery control plane</p>
          <h1 className="mt-4 text-[clamp(3.2rem,6vw,6rem)] font-semibold leading-[0.92] tracking-[-0.08em] text-[var(--relay-ink)]">Make every delivery explain itself.</h1>
          <p className="mt-7 max-w-lg text-base leading-7 text-[var(--relay-muted)]">Inspect event fan-out, follow retry health, and manage endpoint trust from one operational surface.</p>
          <div className="mt-12 grid max-w-lg grid-cols-3 gap-3 rounded-[16px] border border-[var(--relay-border)] bg-white/60 p-4"><div><p className="text-2xl font-semibold text-[var(--relay-ink)]">01</p><p className="mt-2 text-xs leading-5 text-[var(--relay-muted)]">Observe delivery health</p></div><div><p className="text-2xl font-semibold text-[var(--relay-ink)]">02</p><p className="mt-2 text-xs leading-5 text-[var(--relay-muted)]">Control destinations</p></div><div><p className="text-2xl font-semibold text-[var(--relay-ink)]">03</p><p className="mt-2 text-xs leading-5 text-[var(--relay-muted)]">Protect signing trust</p></div></div>
        </section>
        <section className="relay-gate-card">
          <div className="flex items-start justify-between gap-4"><div><p className="relay-eyebrow">Secure connection</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[var(--relay-ink)]">Open a project</h2></div><span className="connection-pill">API key access</span></div>
          <p className="mt-4 text-sm leading-6 text-[var(--relay-muted)]">Connect to a Relay project to inspect operational data. Your key stays in memory and is removed when you disconnect.</p>
          <form onSubmit={(event) => void handleConnect(event)} className="mt-8 space-y-5">
            <label className="field-label">API base URL<input value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} className="field-input font-mono text-xs" placeholder="http://localhost:4000/api" /></label>
            <label className="field-label">Project ID<input value={projectId} onChange={(event) => setProjectId(event.target.value)} className="field-input font-mono text-xs" placeholder="Project UUID" /></label>
            <label className="field-label">Project API key<input value={apiKey} onChange={(event) => setApiKey(event.target.value)} className="field-input font-mono text-xs" placeholder="relay_pk_…" type="password" autoComplete="off" /></label>
            <Button type="submit" disabled={busy} className="w-full">{busy ? "Checking access…" : "Connect to project"}</Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={handlePreview} className="w-full">Preview with sample data</Button>
          </form>
          <div className="mt-7 flex gap-3 rounded-[14px] border border-[var(--relay-border)] bg-[var(--relay-canvas)] p-4 text-xs leading-5 text-[var(--relay-muted)]"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-teal-600" /><span>Preview mode is visual only. It does not call Express or write to Neon.</span></div>
        </section>
      </div>
    </main>
  );
}

function OverviewView() {
  const { data } = useRelay();
  const delivered = data.deliveries.filter((delivery) => delivery.status === "delivered").length;
  const retrying = data.deliveries.filter((delivery) => ["retrying", "processing"].includes(delivery.status)).length;
  const failed = data.deliveries.filter((delivery) => ["failed", "dead_lettered"].includes(delivery.status)).length;
  const pending = data.deliveries.filter((delivery) => delivery.status === "pending").length;
  const activeEndpoints = data.endpoints.filter((endpoint) => endpoint.active).length;
  const successRate = data.deliveries.length ? Math.round((delivered / data.deliveries.length) * 100) : 0;
  const attention = data.deliveries.filter((delivery) => ["retrying", "failed", "dead_lettered"].includes(delivery.status));

  return (
    <>
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4"><MetricCard label="Active endpoints" value={activeEndpoints} detail={`${data.endpoints.length} destinations registered`} /><MetricCard label="Delivery records" value={data.deliveries.length} detail="Latest run per event-to-endpoint pair" accent="green" /><MetricCard label="Success rate" value={`${successRate}%`} detail={`${delivered} delivered in the visible window`} accent="teal" /><MetricCard label="Needs attention" value={attention.length} detail={`${retrying} retrying · ${failed} failed`} accent="rose" /></div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="section-label">Delivery health</p><p className="mt-2 text-sm text-[var(--relay-muted)]">A compact view of the latest known outcome for each delivery.</p></div><div className="text-right"><p className="text-4xl font-semibold tracking-[-0.06em] text-[var(--relay-ink)]">{successRate}%</p><p className="mt-1 text-xs text-[var(--relay-muted)]">visible success rate</p></div></div>
          <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-700 transition-all" style={{ width: `${successRate}%` }} /></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-4"><HealthTile label="Delivered" value={delivered} tone="good" /><HealthTile label="Retrying" value={retrying} tone="warn" /><HealthTile label="Failed" value={failed} tone="bad" /><HealthTile label="Pending" value={pending} tone="neutral" /></div>
        </Panel>
        <Panel><div className="flex items-start justify-between gap-3"><div><p className="section-label">Needs attention</p><p className="mt-2 text-sm text-[var(--relay-muted)]">Delivery states that deserve a closer look.</p></div><span className="count-pill">{attention.length}</span></div><div className="mt-5 space-y-3">{attention.slice(0, 3).map((delivery) => <Link key={delivery.deliveryId} href="/deliveries" className="block rounded-[14px] border border-[var(--relay-border)] bg-[var(--relay-canvas)] p-3 transition hover:border-rose-200 hover:bg-rose-50/30"><div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-semibold">{delivery.eventType}</span><StatusBadge status={delivery.status} /></div><p className="mt-2 truncate text-xs text-[var(--relay-muted)]">{delivery.endpointUrl}</p></Link>)}{attention.length === 0 ? <p className="rounded-[14px] bg-[var(--relay-canvas)] p-4 text-sm text-[var(--relay-muted)]">Nothing needs attention right now.</p> : null}</div><Link href="/deliveries" className="mt-5 inline-block text-xs font-semibold text-teal-700 hover:text-teal-900">Open delivery activity →</Link></Panel>
      </div>
      <Panel className="mt-6 overflow-hidden p-0"><div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--relay-border)] px-6 py-5 sm:px-8"><div><p className="section-label">Recent activity</p><p className="mt-2 text-sm text-[var(--relay-muted)]">The latest run for each event-to-endpoint relationship.</p></div><Link href="/deliveries" className="text-xs font-semibold text-teal-700">View all activity →</Link></div><div className="divide-y divide-[var(--relay-border)]">{data.deliveries.length === 0 ? <div className="p-10"><EmptyState title="No deliveries yet" description="Publish an event to see its endpoint fan-out here." /></div> : data.deliveries.slice(0, 5).map((delivery) => <Link href="/deliveries" key={delivery.deliveryId} className="grid gap-3 px-6 py-5 transition hover:bg-[var(--relay-canvas)] sm:grid-cols-[minmax(140px,0.65fr)_minmax(220px,1.3fr)_auto_auto] sm:items-center sm:px-8"><div className="min-w-0"><p className="truncate text-sm font-semibold">{delivery.eventType}</p><p className="mt-1 font-mono text-[10px] text-[var(--relay-muted)]">Event {shortId(delivery.eventId)}</p></div><p className="truncate text-sm text-[var(--relay-muted)]">{delivery.endpointUrl}</p><StatusBadge status={delivery.status} /><p className="text-xs text-[var(--relay-muted)] sm:text-right">{formatDate(delivery.updatedAt)}</p></Link>)}</div></Panel>
    </>
  );
}

function HealthTile({ label, value, tone }: { label: string; value: number; tone: "good" | "warn" | "bad" | "neutral" }) {
  return <div className="rounded-[14px] bg-[var(--relay-canvas)] p-4"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${tone === "good" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-500" : tone === "bad" ? "bg-rose-500" : "bg-slate-400"}`} /><span className="text-xs font-semibold text-[var(--relay-muted)]">{label}</span></div><p className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{value}</p></div>;
}

function EventsView() {
  const { data, mode, busy } = useRelay();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<RelayEvent | null>(null);
  const events = data.events.filter((event) => `${event.type} ${event.id}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <Panel className="mt-8"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="section-label">Event index</p><p className="mt-2 text-sm text-[var(--relay-muted)]">Events are immutable inputs; deliveries are the relationships created from them.</p></div><input value={query} onChange={(event) => setQuery(event.target.value)} className="field-input max-w-xs" placeholder="Filter event type or ID" /></div>{mode === "live" ? <div className="mt-5"><Notice>Live mode shows the event identity projected from delivery summaries. Payloads and original creation timestamps require an events read endpoint that is not part of the current API.</Notice></div> : null}<div className="mt-6 overflow-x-auto">{busy ? <SkeletonRows count={3} /> : events.length === 0 ? <EmptyState title="No matching events" description="Try another event type or clear the filter." /> : <table className="data-table"><thead><tr><th>Event</th><th>Created</th><th>Deliveries</th><th>Source</th><th /></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td><p className="font-semibold">{event.type}</p><p className="mt-1 font-mono text-[10px] text-[var(--relay-muted)]">{event.id}</p></td><td className="text-[var(--relay-muted)]">{formatDate(event.createdAt, true)}</td><td>{event.deliveryCount}</td><td><span className="source-pill">{event.source === "preview" ? "Preview fixture" : "Delivery summary"}</span></td><td className="text-right"><Button variant="quiet" onClick={() => setSelected(event)}>Inspect →</Button></td></tr>)}</tbody></table>}</div></Panel>
      {selected ? <EventDrawer event={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}

function DeliveriesView() {
  const { data, mode, busy } = useRelay();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId
    ? data.deliveries.find((delivery) => delivery.deliveryId === selectedId) ?? null
    : null;
  const filtered = data.deliveries.filter((delivery) => {
    const matchesQuery = `${delivery.eventType} ${delivery.endpointUrl} ${delivery.eventId}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (status === "all" || delivery.status === status);
  });

  return (
    <>
      <Panel className="mt-8"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><p className="section-label">Delivery records</p><p className="mt-2 text-sm text-[var(--relay-muted)]">One delivery is the relationship between one event and one endpoint.</p></div><div className="flex flex-col gap-3 sm:flex-row"><input value={query} onChange={(event) => setQuery(event.target.value)} className="field-input sm:w-64" placeholder="Search endpoint or event" /><select value={status} onChange={(event) => setStatus(event.target.value)} className="field-input sm:w-40"><option value="all">All statuses</option><option value="pending">Pending</option><option value="retrying">Retrying</option><option value="delivered">Delivered</option><option value="failed">Failed</option><option value="dead_lettered">Dead lettered</option></select></div></div>{mode === "live" ? <div className="mt-5"><Notice>Live delivery summaries are loaded from Express. Attempt timelines are available when preview fixtures provide them; the current API does not expose attempt rows yet.</Notice></div> : null}<div className="mt-6 overflow-x-auto">{busy ? <SkeletonRows count={4} /> : filtered.length === 0 ? <EmptyState title="No matching deliveries" description="Adjust the status or search filter to inspect another record." /> : <table className="data-table"><thead><tr><th>Event</th><th>Endpoint</th><th>Status</th><th>Attempts</th><th>Next retry</th><th /></tr></thead><tbody>{filtered.map((delivery) => <tr key={delivery.deliveryId} className="cursor-pointer" onClick={() => setSelectedId(delivery.deliveryId)}><td><p className="font-semibold">{delivery.eventType}</p><p className="mt-1 font-mono text-[10px] text-[var(--relay-muted)]">{shortId(delivery.deliveryId)}</p></td><td className="max-w-[300px] truncate text-[var(--relay-muted)]">{delivery.endpointUrl}</td><td><StatusBadge status={delivery.status} /></td><td>{delivery.attemptCount}</td><td className="text-[var(--relay-muted)]">{formatDate(delivery.nextAttemptAt)}</td><td className="text-right"><Button variant="quiet" onClick={() => setSelectedId(delivery.deliveryId)}>Details →</Button></td></tr>)}</tbody></table>}</div></Panel>
      {selected ? <DeliveryDrawer delivery={selected} onClose={() => setSelectedId(null)} /> : null}
    </>
  );
}

function EndpointsView() {
  const { data, busy, mode, createEndpoint, setEndpointActive, rotateEndpointSecret } = useRelay();
  const [url, setUrl] = useState("");

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createEndpoint(url);
    setUrl("");
  }

  return (
    <div className="mt-8 grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
      <Panel className="h-fit"><p className="section-label">Register destination</p><p className="mt-2 text-sm leading-6 text-[var(--relay-muted)]">Create a signed webhook destination for this project.</p><form onSubmit={(event) => void handleCreate(event)} className="mt-6 space-y-4"><label className="field-label">Destination URL<input value={url} onChange={(event) => setUrl(event.target.value)} className="field-input font-mono text-xs" placeholder="https://api.example.com/webhooks" type="url" required /></label><Button type="submit" disabled={busy} className="w-full">{busy ? "Registering…" : "Register endpoint"}</Button></form><p className="mt-5 text-xs leading-5 text-[var(--relay-muted)]">A signing secret is returned once after creation or rotation. Store it in the destination service.</p></Panel>
      <Panel><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="section-label">Your destinations</p><p className="mt-2 text-sm text-[var(--relay-muted)]">Pause a destination to exclude it from future event fan-out.</p></div><span className="count-pill">{data.endpoints.length} total</span></div><div className="mt-6 space-y-3">{busy ? <SkeletonRows count={3} /> : data.endpoints.length === 0 ? <EmptyState title="No endpoints yet" description="Register the first destination to begin receiving event deliveries." /> : data.endpoints.map((endpoint) => <article key={endpoint.id} className="rounded-[16px] border border-[var(--relay-border)] p-5 transition hover:border-teal-300 hover:shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${endpoint.active ? "bg-teal-600" : "bg-slate-400"}`} /><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--relay-muted)]">{endpoint.active ? "Active" : "Paused"}</span></div><p className="mt-2 truncate text-sm font-semibold">{endpoint.url}</p><p className="mt-1 font-mono text-[10px] text-[var(--relay-muted)]">{shortId(endpoint.id)} · updated {formatDate(endpoint.updatedAt)}</p></div><div className="flex shrink-0 flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={() => void setEndpointActive(endpoint, !endpoint.active)}>{endpoint.active ? "Pause" : "Activate"}</Button><Button variant="quiet" disabled={busy} onClick={() => void rotateEndpointSecret(endpoint)}>Rotate secret</Button></div></div></article>)}</div>{mode === "preview" ? <p className="mt-5 text-xs text-amber-700">Preview changes remain local and are not sent to the Relay API.</p> : null}</Panel>
    </div>
  );
}

function AccessView() {
  const { apiUrl, apiKey, projectId, projectName, mode, disconnect } = useRelay();
  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <Panel><p className="section-label">Connection details</p><p className="mt-2 text-sm leading-6 text-[var(--relay-muted)]">These values identify the project this dashboard is inspecting.</p><dl className="mt-6 space-y-3"><div className="detail-block"><dt>Project name</dt><dd>{projectName}</dd></div><div className="detail-block"><dt>Project ID</dt><dd><CopyValue value={projectId} /></dd></div><div className="detail-block"><dt>API base URL</dt><dd className="break-all font-mono text-xs">{apiUrl}</dd></div><div className="detail-block"><dt>Project API key</dt><dd className="font-mono text-xs">{apiKey ? `••••••••${apiKey.slice(-4)}` : "Not supplied (local auth disabled)"}</dd></div></dl><Button variant="danger" onClick={disconnect} className="mt-6">Disconnect and clear key</Button></Panel>
      <Panel><p className="section-label">Security model</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.045em]">{mode === "preview" ? "Preview mode is isolated" : "Scoped by project"}</h2><p className="mt-4 text-sm leading-6 text-[var(--relay-muted)]">{mode === "preview" ? "This screen uses sample records inside the browser. It does not authenticate, call Express, or write to Neon." : "Dashboard requests send the project key to Express. Project authentication checks that the key belongs to this project before route logic runs."}</p><div className="mt-6 rounded-[16px] border border-teal-200 bg-teal-50 p-4 text-sm leading-6 text-teal-950"><strong>Project access</strong> identifies which project the dashboard can inspect. <strong>Endpoint signing secrets</strong> authenticate webhook payloads at their destinations and are revealed only after creation or rotation.</div></Panel>
    </div>
  );
}

export default function RelayDashboard() {
  const pathname = usePathname();
  const router = useRouter();
  const view = getView(pathname);
  const { connected, revealedSecret, dismissSecret } = useRelay();

  useEffect(() => {
    if (!connected) router.replace("/");
  }, [connected, router]);

  if (!connected) return null;

  const meta = pageMeta[view];

  return (
    <RelayShell>
      <PageHeading eyebrow={meta.eyebrow} title={meta.title} description={meta.description} action={view === "overview" ? <span className="connection-pill">Operational view</span> : undefined} />
      {view === "overview" ? <OverviewView /> : null}
      {view === "events" ? <EventsView /> : null}
      {view === "deliveries" ? <DeliveriesView /> : null}
      {view === "endpoints" ? <EndpointsView /> : null}
      {view === "access" ? <AccessView /> : null}
      {revealedSecret ? <SecretDrawer secret={revealedSecret} onClose={dismissSecret} /> : null}
    </RelayShell>
  );
}
