// Small things every Business screen uses: the colour of each status, links between pages, text you edit in place.
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { business, ops, type Person } from "@team6220/data";
import { Chips, Icon, Note, Section, frame, type StatusOption, type Tone } from "@team6220/ui";

export const businessHref = (view: string) => `/apps/business/${view}`;

const SPONSOR_TONE: Record<string, Tone> = { "0": "calm", "1": "blue", "2": "warn", "3": "blue", "4. Accepted": "ok", "4. Declined": "bad", "5": "ok" };
const toneOf = (status: string): Tone => SPONSOR_TONE[status] ?? SPONSOR_TONE[status.slice(0, 1)] ?? "calm";
export const SPONSOR_OPTIONS: StatusOption[] = business.SPONSOR_STATUSES.map((label) => ({ label, tone: toneOf(label) }));
export const GRANT_OPTIONS: StatusOption[] = business.GRANT_STATUSES.map((label) => ({ label, tone: toneOf(label) }));

const SEASON_KEY = "team6220.business.season";

/** The season picked last time (kept in this browser), so it follows you from screen to screen. "" means this season. */
export function savedSeason(): string | undefined {
  try { return localStorage.getItem(SEASON_KEY) || undefined; } catch { return undefined; }
}

/**
 * The season picker: at the top of the left menu, as in the design (the frame draws it). On a phone, where there is
 * no left menu, it is a row of buttons on the page instead.
 */
export function SeasonPicker({ seasons, value, onChange }: { seasons: string[]; value: string; onChange: (season: string) => void }) {
  const pick = (season: string) => {
    try { localStorage.setItem(SEASON_KEY, season); } catch { /* the choice still applies on this screen */ }
    onChange(season);
  };
  useEffect(() => {
    const api = frame();
    api.setContext?.({ label: `Season ${value}`, options: seasons.map((s) => ({ label: s, current: s === value })), onPick: pick });
    return () => api.setContext?.(null);
  }, [seasons.join("|"), value]);
  const phone = typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
  if (!phone || seasons.length < 2) return null;
  return <Chips items={seasons.map((s) => ({ id: s, label: s }))} value={value} onChange={pick} />;
}

/** Text you click to change. It saves when you leave the box (or press Enter in a one-line box) and only if it changed. */
export function EditText({ value, label, onSave, multiline, type = "text", list, placeholder }: { value: string; label: string; onSave: (v: string) => void; multiline?: boolean; type?: string; list?: string; placeholder?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => text !== value && onSave(text);
  return multiline ? (
    <textarea className="k-input biz-edit biz-edit--text" aria-label={label} value={text} placeholder={placeholder} rows={1} onChange={(e) => setText(e.target.value)} onBlur={commit} />
  ) : (
    <input className="k-input biz-edit" aria-label={label} type={type} value={text} list={list} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
  );
}

/** An amount: the $ sits outside the box (like BOM) when it is a number, and is left off when it is words ("Laser cut parts"). */
export function EditMoney({ value, label, onSave }: { value: string; label: string; onSave: (v: string) => void }) {
  const numeric = value === "" || /^\d/.test(value);
  return (
    <span className="biz-money">
      <span aria-hidden="true">{numeric ? "$" : ""}</span>
      <EditText value={value} label={label} multiline onSave={onSave} />
    </span>
  );
}

/** A section you open and close: "+ Add a company". */
export function Fold({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <details className="biz-fold">
      <summary><Icon name={icon} inline />{title}</summary>
      <div className="biz-fold-body">{children}</div>
    </details>
  );
}

/** A choose-from-a-set cell, with an empty choice. */
export function EditChoice({ value, label, options, onSave }: { value: string; label: string; options: readonly string[]; onSave: (v: string) => void }) {
  return (
    <select className="k-input biz-edit" aria-label={label} value={value} onChange={(e) => onSave(e.target.value)}>
      <option value=""></option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

/** The team's names, so a student-contact or writer box can autocomplete (any text is still fine). */
export function PeopleList({ id }: { id: string }) {
  const [people, setPeople] = useState<Person[]>([]);
  useEffect(() => void ops.listPeople().then(setPeople, () => setPeople([])), []);
  return <datalist id={id}>{people.map((p) => <option key={p.memberId} value={p.name} />)}</datalist>;
}

const STAGE_COLORS = ["#8a8a96", "#4054e4", "#ffa300", "#4054e4", "#7fb38a", "#7fb38a"];

/** "How it works": the stages left to right, each in its own colour, with arrows between them. */
export function Stages({ title = "How it works", stages, notes, footer }: { title?: string; stages: readonly string[]; notes: readonly string[]; footer: ReactNode }) {
  return (
    <Section title={title}>
      <div className="biz-stages">
        {stages.map((name, i) => (
          <Fragment key={name}>
            {i > 0 && <span className="biz-arrow" aria-hidden="true">→</span>}
            <div className="biz-stage" style={{ borderColor: STAGE_COLORS[i] }}>
              <span className="biz-stage-n" style={{ color: STAGE_COLORS[i] }}>STAGE {i}</span>
              <strong>{name}</strong>
              <span className="k-hint">{notes[i]}</span>
            </div>
          </Fragment>
        ))}
      </div>
      <Note>{footer}</Note>
    </Section>
  );
}

/** The note that says who sees what: amber, with a lock, because some of it is private. */
export function PrivateNote({ children }: { children: ReactNode }) {
  return <p className="biz-lock"><Icon name="lock" inline /> {children}</p>;
}

/** "Export ▾": downloads what is on the screen as a CSV file. */
export function ExportMenu({ filename, rows }: { filename: string; rows: () => string[][] }) {
  const download = () => {
    const url = URL.createObjectURL(new Blob([ops.toCsv(rows())], { type: "text/csv" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: filename });
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <details className="biz-export">
      <summary className="k-btn k-btn--quiet">Export ▾</summary>
      <div className="k-menu" role="menu"><button type="button" role="menuitem" onClick={download}>Download as CSV</button></div>
    </details>
  );
}

export const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
