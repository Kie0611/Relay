"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Brand, navItems } from "./components";
import { useRelay } from "./provider";
import type { DashboardView } from "./types";

function viewFromPath(pathname: string): DashboardView {
  const value = pathname.split("/")[1] as DashboardView;
  return navItems.some((item) => item.view === value) ? value : "overview";
}

export function RelayShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeView = viewFromPath(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { projectId, projectName, mode, apiUrl, disconnect, data } = useRelay();
  const attentionCount = data.deliveries.filter((delivery) =>
    ["retrying", "failed", "dead_lettered"].includes(delivery.status),
  ).length;
  const projectLabel = projectId ? `${projectId.slice(0, 8)}…` : "No project";

  return (
    <div className="min-h-screen bg-[var(--relay-canvas)] text-[var(--relay-ink)]">
      <aside className="relay-sidebar hidden lg:flex">
        <Brand />
        <div className="mt-10 rounded-[18px] border border-[var(--relay-border)] bg-white p-4">
          <p className="relay-eyebrow">Connected project</p>
          <p className="mt-3 truncate text-sm font-semibold text-[var(--relay-ink)]">{projectName}</p>
          <p className="mt-1 font-mono text-[11px] text-[var(--relay-muted)]">{projectLabel}</p>
          <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-teal-700">
            <span className={`h-2 w-2 rounded-full ${mode === "preview" ? "bg-amber-500" : "bg-teal-600"}`} />
            {mode === "preview" ? "Preview data" : "Live connection"}
          </div>
        </div>

        <nav className="mt-8 flex flex-1 flex-col gap-1" aria-label="Project navigation">
          {navItems.map((item) => (
            <Link
              key={item.view}
              href={`/${item.view}`}
              className={`relay-nav-link ${activeView === item.view ? "relay-nav-link-active" : ""}`}
            >
              <span>{item.label}</span>
              {item.view === "deliveries" && attentionCount > 0 ? (
                <span className="relay-nav-count">{attentionCount}</span>
              ) : null}
              <small>{item.detail}</small>
            </Link>
          ))}
        </nav>

        <div className="pt-5">
          <p className="text-xs leading-5 text-[var(--relay-muted)]">Session-only access. Keys are never persisted by this dashboard.</p>
          <button type="button" onClick={disconnect} className="relay-button relay-button-danger mt-4 w-full justify-start text-left">
            Disconnect project
          </button>
        </div>
      </aside>

      <header className="relay-mobile-header lg:hidden">
        <Brand />
        <button type="button" onClick={() => setMobileOpen((value) => !value)} className="icon-button" aria-label="Toggle navigation">
          {mobileOpen ? "×" : "☰"}
        </button>
      </header>

      {mobileOpen ? (
        <div className="relay-mobile-menu lg:hidden">
          <div className="mb-4 rounded-[16px] border border-[var(--relay-border)] bg-white p-4">
            <p className="relay-eyebrow">Connected project</p>
            <p className="mt-2 text-sm font-semibold">{projectName}</p>
            <p className="mt-1 font-mono text-[11px] text-[var(--relay-muted)]">{projectLabel}</p>
          </div>
          {navItems.map((item) => (
            <Link
              key={item.view}
              href={`/${item.view}`}
              onClick={() => setMobileOpen(false)}
              className={`relay-nav-link ${activeView === item.view ? "relay-nav-link-active" : ""}`}
            >
              <span>{item.label}</span>
              {item.view === "deliveries" && attentionCount > 0 ? <span className="relay-nav-count">{attentionCount}</span> : null}
              <small>{item.detail}</small>
            </Link>
          ))}
          <button type="button" onClick={disconnect} className="relay-button relay-button-danger mt-4 w-full justify-start text-left">
            Disconnect project
          </button>
        </div>
      ) : null}

      <main className="lg:pl-[272px]">
        <div className="mx-auto max-w-[1480px] px-5 py-5 sm:px-8 lg:px-10 lg:py-8">
          <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--relay-border)] pb-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--relay-muted)]">Relay project</p>
                <p className="mt-1 truncate text-sm font-semibold text-[var(--relay-ink)]">{projectName} <span className="font-mono text-xs font-normal text-[var(--relay-muted)]">{projectLabel}</span></p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="connection-pill">
                <span className={`h-1.5 w-1.5 rounded-full ${mode === "preview" ? "bg-amber-500" : "bg-teal-600"}`} />
                {mode === "preview" ? "Preview mode" : "Connected"}
              </span>
              <span className="hidden max-w-[260px] truncate font-mono text-[10px] text-[var(--relay-muted)] sm:block">{apiUrl}</span>
            </div>
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
