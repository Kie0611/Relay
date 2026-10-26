"use client";

export type ToastTone = "info" | "success" | "warning" | "error";

export type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
};

const toneLabels: Record<ToastTone, string> = {
  info: "Information",
  success: "Success",
  warning: "Warning",
  error: "Error",
};

export function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`relay-toast relay-toast-${toast.tone}`}
          role={toast.tone === "error" ? "alert" : "status"}
        >
          <span className={`toast-dot toast-dot-${toast.tone}`} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em]">
              {toneLabels[toast.tone]}
            </p>
            <p className="mt-1 text-sm leading-5">{toast.message}</p>
          </div>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="toast-dismiss"
            aria-label={`Dismiss ${toneLabels[toast.tone].toLowerCase()} notification`}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
