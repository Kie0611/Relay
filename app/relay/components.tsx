"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, type ReactNode } from "react";
import type { DashboardView, DeliveryStatus } from "./types";

export const navItems: Array<{ view: DashboardView; label: string; detail: string }> = [
  { view: "overview", label: "Overview", detail: "Command center" },
  { view: "events", label: "Events", detail: "Immutable input" },
  { view: "deliveries", label: "Deliveries", detail: "Runs and attempts" },
  { view: "endpoints", label: "Endpoints", detail: "Destinations" },
  { view: "access", label: "Access & security", detail: "Project trust" },
];

export function Brand({ href = "/overview" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-3" aria-label="Relay overview">
      <Image
        src="/relay-mark.svg"
        alt=""
        width={36}
        height={36}
        priority
        className="h-9 w-9 rounded-[12px] shadow-sm shadow-teal-800/20"
      />
      <span className="text-[13px] font-bold tracking-[0.3em] text-[var(--relay-ink)]">
        RELAY
      </span>
    </Link>
  );
}

export function StatusBadge({ status }: { status: DeliveryStatus | string }) {
  const normalized = status.toLowerCase();
  const label = normalized.replaceAll("_", " ");
  const tone = normalized === "delivered"
    ? "status-delivered"
    : ["retrying", "processing"].includes(normalized)
      ? "status-retrying"
      : ["failed", "dead_lettered"].includes(normalized)
        ? "status-failed"
        : normalized === "cancelled"
          ? "status-cancelled"
          : "status-pending";

  return (
    <span className={`status-badge ${tone}`}>
      <span className="status-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`relay-panel ${className}`}>{children}</section>;
}

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 border-b border-[var(--relay-border)] pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-teal-700">{eyebrow}</p>
        <h1 className="mt-2 text-[clamp(2rem,4vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.06em] text-[var(--relay-ink)]">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--relay-muted)]">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function MetricCard({ label, value, detail, accent = "teal" }: {
  label: string;
  value: string | number;
  detail: string;
  accent?: "teal" | "green" | "amber" | "rose";
}) {
  return (
    <div className="relay-metric-card">
      <div className="flex items-center gap-2">
        <span className={`metric-dot metric-dot-${accent}`} aria-hidden="true" />
        <p className="text-xs font-semibold text-[var(--relay-muted)]">{label}</p>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[var(--relay-ink)]">{value}</p>
      <p className="mt-2 text-xs leading-5 text-[var(--relay-muted)]">{detail}</p>
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="rounded-[18px] border border-dashed border-[var(--relay-border)] bg-[var(--relay-canvas)] px-5 py-10 text-center">
      <p className="text-sm font-semibold text-[var(--relay-ink)]">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--relay-muted)]">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-label="Loading records" role="status">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="relay-skeleton-row">
          <span className="relay-skeleton h-3 w-1/4" />
          <span className="relay-skeleton h-3 w-2/5" />
          <span className="relay-skeleton h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

export function Drawer({
  title,
  eyebrow,
  onClose,
  children,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 h-full w-full cursor-default bg-slate-950/30 backdrop-blur-[2px]" onClick={onClose} aria-label="Close drawer" />
      <aside className="relay-drawer relative ml-auto flex h-full w-full max-w-xl flex-col bg-white shadow-2xl shadow-slate-950/20">
        <header className="flex items-start justify-between gap-5 border-b border-[var(--relay-border)] px-6 py-6 sm:px-8">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-700">{eyebrow}</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.045em] text-[var(--relay-ink)]">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="icon-button" aria-label="Close drawer">
            ×
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">{children}</div>
      </aside>
    </div>
  );
}

export function Button({
  children,
  type = "button",
  onClick,
  disabled = false,
  variant = "primary",
  className = "",
}: {
  children: ReactNode;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`relay-button relay-button-${variant} ${className}`}
    >
      {children}
    </button>
  );
}

export function Notice({ children, tone = "info", onDismiss }: { children: ReactNode; tone?: "info" | "error" | "warning"; onDismiss?: () => void }) {
  return (
    <div className={`relay-notice relay-notice-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <span>{children}</span>
      {onDismiss ? <button type="button" onClick={onDismiss} className="text-xs font-semibold underline-offset-4 hover:underline">Dismiss</button> : null}
    </div>
  );
}

export function CopyValue({ value }: { value: string }) {
  return (
    <button
      type="button"
      className="copy-value"
      onClick={() => void navigator.clipboard?.writeText(value)}
      title="Copy value"
    >
      <code>{value}</code>
      <span aria-hidden="true">copy</span>
    </button>
  );
}
