// Pieces the student's 1-2-3-100 screens share: a step card, a place to drop a file, a meter, and loading your things.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { business } from "@team6220/data";
import { Icon, Note, Pill, type Tone } from "@team6220/ui";

/** Loads what the student has done so far, and loads it again after each change. */
export function useMy() {
  const [my, setMy] = useState<business.My | null>(null);
  const [error, setError] = useState("");
  const reload = () => business.my().then((m) => { setMy(m); return m; }, (e) => { setError(e instanceof Error ? e.message : "We couldn't load your 1-2-3-100."); return null; });
  useEffect(() => void reload(), []);
  return { my, error, reload, setError };
}

/** Runs a change, shows its error (if any), and reloads. */
export function useAct(reload: () => Promise<unknown>, setError: (message: string) => void) {
  const [busy, setBusy] = useState(false);
  return {
    busy,
    act: async (what: () => Promise<unknown>) => {
      setBusy(true);
      setError("");
      try {
        await what();
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "That didn't work. Try again.");
      } finally {
        setBusy(false);
      }
    },
  };
}

export type StepState = "your-turn" | "waiting" | "approved" | "sent-back" | "locked" | "done";
const STATE_PILL: Record<StepState, { label: string; tone: Tone }> = {
  "your-turn": { label: "Your turn", tone: "warn" },
  waiting: { label: "Waiting for Operations", tone: "blue" },
  approved: { label: "Approved", tone: "ok" },
  "sent-back": { label: "Sent back", tone: "bad" },
  locked: { label: "Opens after approval", tone: "calm" },
  done: { label: "Done", tone: "ok" },
};

/** "Step 1 · Research and plan": an icon, a pill for where it stands, and the form. The one that is your turn has a gold edge. */
export function Step({ n, title, state, note, pill = true, children }: { n?: number; title: string; state: StepState; note?: ReactNode; pill?: boolean; children?: ReactNode }) {
  const icon = state === "locked" ? "lock" : state === "approved" || state === "done" ? "check" : "edit";
  const look = STATE_PILL[state];
  return (
    <section className={`biz-step${state === "your-turn" || state === "sent-back" ? " is-turn" : ""}${state === "locked" ? " is-locked" : ""}`}>
      <header>
        <Icon name={icon} inline />
        <h3>{n ? `Step ${n} · ` : ""}{title}</h3>
        {pill && <Pill tone={look.tone}>{look.label}</Pill>}
        {note && <span className="k-hint">{note}</span>}
      </header>
      {children}
    </section>
  );
}

/** A box you drop a file on, or click to choose. Shows the file that is there. */
export function FileDrop({ label, hint, file, disabled, onFile }: { label: string; hint: string; file: business.FileRef | null; disabled?: boolean; onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div className="biz-drop-field">
      <span className="biz-drop-label">{label}</span>
      <div
        className={`biz-drop${over ? " is-over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f && !disabled) onFile(f); }}
      >
        <button type="button" disabled={disabled} onClick={() => input.current?.click()}>
          <Icon name="upload" inline />
          {file ? <span>{file.name} <span className="k-hint">({Math.max(1, Math.round(file.size / 1024))} KB) · click to replace</span></span> : <span>{hint}</span>}
        </button>
        <input ref={input} type="file" hidden accept=".pdf,image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      </div>
    </div>
  );
}

/** "How do I make a PDF?" */
export function PdfHelp() {
  const ways: [string, string][] = [
    ["Windows or Chromebook", "Press Ctrl+P. Set Destination (or Printer) to Save as PDF. Click Save."],
    ["Mac", "Press Cmd+P. Click the PDF menu at the bottom left, then Save as PDF."],
    ["iPhone or iPad", "Tap Share, then Print. Pinch the little preview with two fingers to open it as a PDF, tap Share again, then Save to Files."],
    ["Android", "In Chrome tap the three dots, then Share, then Print. Set the printer to Save as PDF and tap the PDF button."],
  ];
  return (
    <div className="biz-pdf">
      <strong>How to save a page as a PDF</strong>
      {ways.map(([name, how], i) => (
        <details key={name} open={i === 0}><summary>{name}</summary><p className="k-hint">{how}</p></details>
      ))}
    </div>
  );
}

/** A big number, a bar, and what is left. */
export function Meter({ big, label, value, max, right, note }: { big: string; label: string; value: number; max: number; right: string; note?: string }) {
  return (
    <div className="k-box biz-meter">
      <div className="biz-meter-top"><strong>{big}</strong><span>{label}</span><span className="k-hint">{right}</span></div>
      <div className="biz-meter-bar" role="img" aria-label={`${value} of ${max}`}><span style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%` }} /></div>
      {note && <p className="k-hint">{note}</p>}
    </div>
  );
}

export const ErrorNote = ({ message }: { message: string }) => (message ? <Note tone="bad">{message}</Note> : null);

/** Where a step stands, from its approval. */
export const stateOf = (status: "draft" | "waiting" | "approved" | "sent-back"): StepState => (status === "draft" ? "your-turn" : status === "sent-back" ? "sent-back" : status);

/** Nov 3, from 2026-11-03. */
export const shortDate = (date: string) => (date ? new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
