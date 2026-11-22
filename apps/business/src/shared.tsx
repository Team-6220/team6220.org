// Small things every Business screen uses: the colour of each status, links between pages, text you edit in place.
import { useEffect, useState, type ReactNode } from "react";
import { business, ops, type Person } from "@team6220/data";
import { Chips, Icon, Section, type StatusOption, type Tone } from "@team6220/ui";

export const businessHref = (view: string) => `/apps/business/${view}`;

const SPONSOR_TONE: Record<string, Tone> = { "0": "calm", "1": "blue", "2": "warn", "3": "blue", "4. Accepted": "ok", "4. Declined": "bad", "5": "ok" };
const toneOf = (status: string): Tone => SPONSOR_TONE[status] ?? SPONSOR_TONE[status.slice(0, 1)] ?? "calm";
export const SPONSOR_OPTIONS: StatusOption[] = business.SPONSOR_STATUSES.map((label) => ({ label, tone: toneOf(label) }));
export const GRANT_OPTIONS: StatusOption[] = business.GRANT_STATUSES.map((label) => ({ label, tone: toneOf(label) }));

/** A season's Chips: this season first, then earlier ones. */
export function SeasonChips({ seasons, value, onChange }: { seasons: string[]; value: string; onChange: (season: string) => void }) {
  if (seasons.length < 2) return null;
  return <Chips items={seasons.map((s) => ({ id: s, label: s }))} value={value} onChange={onChange} />;
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

/** "How it works": the stages, left to right. */
export function Stages({ title = "How it works", stages, notes, footer }: { title?: string; stages: readonly string[]; notes: readonly string[]; footer: ReactNode }) {
  return (
    <Section title={title}>
      <ol className="biz-stages">
        {stages.map((name, i) => (
          <li key={name}><span className="biz-stage-n">Stage {i}</span><strong>{name}</strong><span className="k-hint">{notes[i]}</span></li>
        ))}
      </ol>
      <p className="k-hint">{footer}</p>
    </Section>
  );
}

export const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
