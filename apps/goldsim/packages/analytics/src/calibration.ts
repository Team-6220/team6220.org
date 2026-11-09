import { parseCSV, type Table } from "./table.js";

/** One real-world measurement, with provenance (PRD §13.4). */
export interface Measurement {
  metric: string;
  value: number;
  date: string;
  source: string;
  robot?: string;
}

/** CSV template students fill in after a practice session. */
export const CALIBRATION_CSV_TEMPLATE =
  "metric,value,date,source,robot\n" +
  "cycleTime,12.5,2026-11-14,practice field stopwatch,Comp bot\n" +
  "topSpeed,4.2,2026-11-14,odometry log,Comp bot\n" +
  "ballsPerSecond,7.5,2026-11-14,video count,Comp bot\n" +
  "climbTime,3.1,2026-11-14,stopwatch,Comp bot\n";

export function parseMeasurements(text: string): { measurements: Measurement[]; errors: string[] } {
  const trimmed = text.trim();
  const errors: string[] = [];
  let raw: Record<string, unknown>[];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as unknown;
    raw = (Array.isArray(parsed) ? parsed : ((parsed as { measurements?: unknown[] }).measurements ?? [])) as Record<string, unknown>[];
  } else raw = parseCSV(trimmed);
  const measurements: Measurement[] = [];
  raw.forEach((r, i) => {
    const value = Number(r.value);
    if (!r.metric || !Number.isFinite(value)) {
      errors.push(`Row ${i + 1}: needs a metric name and a numeric value.`);
      return;
    }
    measurements.push({
      metric: String(r.metric),
      value,
      date: String(r.date ?? ""),
      source: String(r.source ?? ""),
      ...(r.robot ? { robot: String(r.robot) } : {}),
    });
  });
  return { measurements, errors };
}

export interface CalibrationRow {
  metric: string;
  robot: string;
  real: number;
  sim: number | null;
  error: number | null;
  relativeError: number | null;
  withinTolerance: boolean | null;
  date: string;
  source: string;
}

/** Compares real measurements to simulated values. Tolerance is relative (provisional ±15%, PRD §2.3). */
export function calibrationReport(
  measurements: Measurement[],
  simValues: Record<string, number>,
  tolerance = 0.15,
): { rows: CalibrationRow[]; table: Table } {
  const rows = measurements.map((m): CalibrationRow => {
    const sim = simValues[m.robot ? `${m.robot}:${m.metric}` : m.metric] ?? simValues[m.metric] ?? null;
    const error = sim === null ? null : sim - m.value;
    const relativeError = sim === null || m.value === 0 ? null : (sim - m.value) / Math.abs(m.value);
    return {
      metric: m.metric,
      robot: m.robot ?? "",
      real: m.value,
      sim,
      error,
      relativeError,
      withinTolerance: relativeError === null ? null : Math.abs(relativeError) <= tolerance,
      date: m.date,
      source: m.source,
    };
  });
  return {
    rows,
    table: {
      title: `Sim vs real (tolerance ±${Math.round(tolerance * 100)}%)`,
      columns: [
        { key: "metric", label: "Metric" },
        { key: "robot", label: "Robot" },
        { key: "real", label: "Real" },
        { key: "sim", label: "Sim" },
        { key: "error", label: "Error" },
        { key: "relativeError", label: "Relative error" },
        { key: "withinTolerance", label: "Within tolerance" },
        { key: "date", label: "Date" },
        { key: "source", label: "Source" },
      ],
      rows: rows.map((r) => ({ ...r })),
    },
  };
}
