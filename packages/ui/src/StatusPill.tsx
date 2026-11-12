// A small colored label for a status: <StatusPill tone="ok">Received</StatusPill>
import type { ReactNode } from "react";

export type StatusTone = "neutral" | "info" | "ok" | "warn" | "error";

export function StatusPill({ tone = "neutral", children }: { tone?: StatusTone; children: ReactNode }) {
  return <span className={`t-pill t-pill--${tone}`}>{children}</span>;
}
