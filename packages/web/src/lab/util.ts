import { toCSV, toJSON, type Cell, type Table } from "@goldsim/analytics";
import type { BatchResultsFile } from "@goldsim/batch";
import { h } from "../ui/dom.js";
import { help } from "./help.js";

/** Runs finished (or imported) this session. Nothing is saved until team workspaces arrive in Phase 2. */
export const labState = {
  runs: [] as BatchResultsFile[],
  selectedRun: -1,
};

/** Hooks set by the screens, so shared panels can reach them without circular imports. */
export const labHooks: { duplicateSettings?: (file: BatchResultsFile) => void; testArchetype?: (designNames: string[]) => void } = {};

export function renameRun(file: BatchResultsFile, name: string): void {
  file.name = name.trim() || file.name;
}

export function deleteRun(file: BatchResultsFile): void {
  const i = labState.runs.indexOf(file);
  if (i < 0) return;
  labState.runs.splice(i, 1);
  labState.selectedRun = Math.min(labState.selectedRun, labState.runs.length - 1);
}

/** "Oct 25" style date for default run names. */
export function shortDate(d = new Date()): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function addRun(file: BatchResultsFile): number {
  labState.runs.push(file);
  labState.selectedRun = labState.runs.length - 1;
  return labState.selectedRun;
}

export function downloadText(name: string, text: string, type = "application/json"): void {
  const blob = new Blob([text], { type });
  const a = h("a", { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}

export function safeName(s: string): string {
  return s.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "goldsim";
}

/** Reads user-chosen files as text. Contents are untrusted; callers validate. */
export async function readFiles(files: FileList | File[], maxBytes = 5_000_000): Promise<{ name: string; text: string }[]> {
  const out: { name: string; text: string }[] = [];
  for (const f of Array.from(files)) {
    if (f.size > maxBytes) throw new Error(`${f.name} is too large (${(f.size / 1e6).toFixed(1)} MB; limit ${(maxBytes / 1e6).toFixed(0)} MB).`);
    out.push({ name: f.name, text: await f.text() });
  }
  return out;
}

/** Opens a file picker. */
export function pickFiles(accept: string, multiple: boolean, onFiles: (files: FileList) => void): void {
  const input = h("input", { type: "file", accept, multiple, style: "display:none" });
  input.addEventListener("change", () => {
    if (input.files?.length) onFiles(input.files);
    input.remove();
  });
  document.body.appendChild(input);
  input.click();
}

/** Makes an element accept dropped files. */
export function dropZone(el: HTMLElement, onFiles: (files: FileList) => void): void {
  el.addEventListener("dragover", (e) => {
    e.preventDefault();
    el.classList.add("drag");
  });
  el.addEventListener("dragleave", () => el.classList.remove("drag"));
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    el.classList.remove("drag");
    if (e.dataTransfer?.files.length) onFiles(e.dataTransfer.files);
  });
}

export function fmt(v: Cell | undefined, digits = 2): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "—";
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(Math.abs(v) >= 100 ? 0 : digits);
  }
  if (typeof v === "boolean") return v ? "yes" : "no";
  return v;
}

export function fmtDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** Renders an analytics Table with CSV and JSON export buttons. `hide` drops columns from the view (not the export). */
export function tableView(t: Table, opts: { hide?: (key: string) => boolean; cell?: (key: string, v: Cell, row: Table["rows"][number]) => Node | string | null } = {}): HTMLElement {
  const cols = t.columns.filter((c) => !opts.hide?.(c.key));
  const base = safeName(t.title.toLowerCase());
  return h(
    "div",
    { class: "panel lab-table" },
    h(
      "div",
      { class: "row center" },
      h("h3", { class: "grow" }, t.title),
      h("button", { class: "btn small", title: "Download to your computer (the safest way to keep results)", onclick: () => downloadText(`${base}.csv`, toCSV(t), "text/csv") }, "CSV"),
      h("button", { class: "btn small", title: "Download to your computer (the safest way to keep results)", onclick: () => downloadText(`${base}.json`, toJSON(t)) }, "JSON"),
    ),
    t.rows.length
      ? h(
          "div",
          { class: "lab-scroll" },
          h(
            "table",
            null,
            h("thead", null, h("tr", null, cols.map((c) => h("th", { class: isNumCol(t, c.key) ? "num" : "" }, c.unit ? `${c.label} (${c.unit})` : c.label)))),
            h(
              "tbody",
              null,
              t.rows.map((r) =>
                h(
                  "tr",
                  null,
                  cols.map((c) => h("td", { class: typeof r[c.key] === "number" ? "num" : "" }, opts.cell?.(c.key, r[c.key] ?? null, r) ?? fmt(r[c.key]))),
                ),
              ),
            ),
          ),
        )
      : h("p", { class: "muted small" }, "No rows."),
  );
}

function isNumCol(t: Table, key: string): boolean {
  return t.rows.some((r) => typeof r[key] === "number");
}

/** Mean ± CI cell: "12.3 [10.1, 14.5]". */
export function ciText(mean: Cell | undefined, lo: Cell | undefined, hi: Cell | undefined): string {
  if (typeof mean !== "number" || !Number.isFinite(mean)) return "—";
  if (typeof lo !== "number" || typeof hi !== "number" || lo === hi) return fmt(mean);
  return `${fmt(mean)} [${fmt(lo)}, ${fmt(hi)}]`;
}

/** A form field with a label, an optional hint line, and an optional "?" explanation. */
export function labeled(label: string, control: Node, hint?: string, helpText?: string): HTMLElement {
  return h(
    "label",
    { class: "lab-field" },
    h("span", { class: "small muted row center", style: "gap:6px" }, label, helpText ? help(helpText) : null),
    control,
    hint ? h("span", { class: "small muted" }, hint) : null,
  );
}

export function numberInput(value: number, onChange: (v: number) => void, attrs: Record<string, unknown> = {}): HTMLInputElement {
  return h("input", {
    type: "number",
    value: String(value),
    ...attrs,
    onchange: (e: Event) => {
      const v = Number((e.target as HTMLInputElement).value);
      if (Number.isFinite(v)) onChange(v);
    },
  });
}

/** Appends several children, skipping null/false. */
export function put(parent: Node, ...children: (Node | null | undefined | false)[]): void {
  for (const c of children) if (c) parent.appendChild(c);
}
