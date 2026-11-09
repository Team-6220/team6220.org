import type { Match } from "@goldsim/core";

export interface ClockState {
  /** Robots-enabled time left in the match (scoring-only gaps excluded), seconds. */
  timeLeft: number;
  /** True during a scoring-only gap (robots disabled, pieces still assessed). */
  scoring: boolean;
  label: string;
}

/**
 * Match clock as drivers see it: counts only phases with robots enabled (e.g. 2:40 for REBUILT),
 * so a scoring-only gap between periods shows as a "scoring" state instead of extra time.
 */
export function matchClock(m: Match): ClockState {
  if (m.inPostMatch) return { timeLeft: 0, scoring: !m.isOver, label: m.isOver ? "Final" : "Scoring" };
  const idx = m.phases.indexOf(m.phase);
  let left = m.phase.robotsEnabled ? m.phaseTimeLeft : 0;
  for (let i = idx + 1; i < m.phases.length; i++) if (m.phases[i]!.robotsEnabled) left += m.phases[i]!.duration;
  const scoring = !m.phase.robotsEnabled;
  return { timeLeft: left, scoring, label: scoring ? `${m.phase.label} · scoring` : m.phase.label };
}

/** Total robots-enabled match length in seconds. */
export function enabledLength(m: Match): number {
  return m.phases.filter((p) => p.robotsEnabled).reduce((s, p) => s + p.duration, 0);
}
