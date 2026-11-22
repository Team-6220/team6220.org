// The building blocks every team app's screens are made of, from the apps redesign prototype (styles: kit.css).
// Rules for when to use which: the wiki's UX-Rules page. In short:
//   - Chips filter a list; Tabs switch what a page shows; a Toggle turns a view option on or off.
//   - Every status you can change is a StatusChip (a pill-shaped dropdown in the status's colour); a status you
//     cannot change is a Pill.
//   - Every table is a DataTable: sort from the column headers, group only on choose-from-a-set columns, and drag to
//     reorder where order matters instead of sorting. On a phone it becomes a stack of cards.
import { Fragment, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "../Icon";

export type Tone = "ok" | "warn" | "bad" | "calm" | "blue" | "gold" | "white";

// ---------------------------------------------------------------- page structure
export function Screen({ children }: { children: ReactNode }) {
  return <div className="k-screen">{children}</div>;
}

export function PageHeader({ title, sub, actions, back }: { title: string; sub?: ReactNode; actions?: ReactNode; back?: { label: string; href?: string; onClick?: () => void } }) {
  return (
    <div>
      {back && (
        <a className="k-back" href={back.href} onClick={(e) => { if (back.onClick) { e.preventDefault(); back.onClick(); } }}>
          ← {back.label}
        </a>
      )}
      <div className="k-head">
        <div className="k-head-text">
          <h1>{title}</h1>
          {sub && <p>{sub}</p>}
        </div>
        {actions && <div className="k-head-actions">{actions}</div>}
      </div>
    </div>
  );
}

export function Section({ id, title, right, children }: { id?: string; title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="k-section">
      <div className="k-section-head">
        <h3 className="k-label">{title}</h3>
        {right && <span className="k-section-right">{right}</span>}
      </div>
      {children}
    </section>
  );
}

export function Split({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="k-split">
      <div className="k-stack">{left}</div>
      <div className="k-stack">{right}</div>
    </div>
  );
}

export function Box({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <div className={`k-box ${className}`} style={style}>{children}</div>;
}

export function Note({ tone, children }: { tone?: "warn" | "ok" | "bad" | "blue"; children: ReactNode }) {
  return <p className={`k-note${tone ? ` k-note--${tone}` : ""}`}>{children}</p>;
}

export function Stats({ items }: { items: { label: string; value: ReactNode; note?: ReactNode }[] }) {
  return (
    <div className="k-stats" style={{ "--k-n": items.length } as CSSProperties}>
      {items.map((s) => (
        <div className="k-box k-stat" key={s.label}>
          <p className="k-label">{s.label}</p>
          <p className="k-stat-value">{s.value}</p>
          {s.note && <p className="k-stat-note">{s.note}</p>}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- buttons
type BtnKind = "primary" | "quiet" | "dash" | "danger";
const ICON_BUTTONS: Record<string, { icon: string; label: string; cls?: string }> = {
  edit: { icon: "edit", label: "Edit" },
  copy: { icon: "copy", label: "Copy" },
  remove: { icon: "trash", label: "Remove", cls: "k-btn--danger" },
  done: { icon: "check", label: "Mark as done", cls: "k-btn--ok" },
};

/** A button. Common actions are icons with a tooltip (UX rule 1): <Btn icon="edit" />, "remove" (trash), "copy", "done". */
export function Btn({ children, kind = "quiet", small, full, icon, title, href, onClick, disabled, type = "button" }: {
  children?: ReactNode; kind?: BtnKind; small?: boolean; full?: boolean; icon?: keyof typeof ICON_BUTTONS; title?: string;
  href?: string; onClick?: () => void; disabled?: boolean; type?: "button" | "submit";
}) {
  const ib = icon ? ICON_BUTTONS[icon] : undefined;
  const cls = ["k-btn", `k-btn--${kind}`, small && "k-btn--small", full && "k-btn--full", ib && !children && "k-btn--icon", ib?.cls].filter(Boolean).join(" ");
  const label = title ?? ib?.label;
  const inner = <>{ib && <Icon name={ib.icon} />}{children}</>;
  if (href) return <a className={cls} href={href} title={label} aria-label={!children ? label : undefined}>{inner}</a>;
  return <button type={type} className={cls} title={label} aria-label={!children ? label : undefined} onClick={onClick} disabled={disabled}>{inner}</button>;
}

// ---------------------------------------------------------------- statuses
export function Pill({ tone = "calm", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`k-pill k-tone-${tone}`}>{children}</span>;
}

export interface StatusOption { label: string; tone: Tone }
/** A status you can change: a pill-shaped dropdown in the colour of the status picked. */
export function StatusChip({ value, options, onChange, label = "Status", disabled }: { value: string; options: StatusOption[]; onChange?: (v: string) => void; label?: string; disabled?: boolean }) {
  const tone = options.find((o) => o.label === value)?.tone ?? "calm";
  const list = options.some((o) => o.label === value) ? options : options.concat([{ label: value, tone: "calm" }]);
  if (disabled || !onChange) return <Pill tone={tone}>{value}</Pill>;
  return (
    <select className={`k-status k-tone-${tone}`} aria-label={label} title="Change status" value={value} onChange={(e) => onChange(e.target.value)}>
      {list.map((o) => <option key={o.label} value={o.label}>{o.label}</option>)}
    </select>
  );
}

// ---------------------------------------------------------------- chips, tabs, toggles
export function Chips<T extends string>({ items, value, onChange, multi }: { items: { id: T; label: string }[]; value: T | T[]; onChange: (v: T) => void; multi?: boolean }) {
  const on = (id: T) => (multi ? (value as T[]).includes(id) : value === id);
  return (
    <div className="k-chips" role="group">
      {items.map((c) => <button key={c.id} type="button" className="k-chip" aria-pressed={on(c.id)} onClick={() => onChange(c.id)}>{c.label}</button>)}
    </div>
  );
}

export function Tabs<T extends string>({ items, value, onChange }: { items: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="k-tabs" role="tablist">
      {items.map((t) => <button key={t.id} type="button" role="tab" className="k-tab" aria-selected={t.id === value} onClick={() => onChange(t.id)}>{t.label}</button>)}
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="k-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

// ---------------------------------------------------------------- cards
export interface CardItem {
  key?: string;
  title: ReactNode;
  icon?: string;
  pill?: { label: string; tone: Tone };
  lines?: ReactNode[];
  actions?: ReactNode;
  /** The whole card opens this (UX rule 4); inner buttons still work on their own. */
  href?: string;
  onOpen?: () => void;
  dim?: boolean;
  grip?: boolean;
}
export function Cards({ items, cols = 3 }: { items: CardItem[]; cols?: number }) {
  return (
    <div className="k-cards" style={{ "--k-cols": cols } as CSSProperties}>
      {items.map(({ key, ...c }, i) => <Card key={key ?? String(i)} {...c} />)}
    </div>
  );
}
export function Card({ title, icon, pill, lines = [], actions, href, onOpen, dim, grip }: Omit<CardItem, "key">) {
  const open = href || onOpen;
  const go = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button,a,input,select,textarea,summary")) return;
    if (onOpen) onOpen(); else if (href) location.assign(href);
  };
  return (
    <article className={`k-box k-card${open ? " k-card--open" : ""}${dim ? " k-card--dim" : ""}`} onClick={open ? go : undefined}>
      <div className="k-card-top">
        {grip && <span className="k-grip" aria-hidden="true" title="Drag to move">⋮⋮</span>}
        <h3 className="k-card-title">
          {icon && <Icon name={icon} />}
          {href ? <a className="k-link" style={{ color: "inherit" }} href={href}>{title}</a> : title}
        </h3>
        {pill && <Pill tone={pill.tone}>{pill.label}</Pill>}
      </div>
      {lines.map((l, i) => <p className="k-card-line" key={i}>{l}</p>)}
      {actions && <div className="k-card-actions">{actions}</div>}
    </article>
  );
}

// ---------------------------------------------------------------- tables
export type ColumnMenu = "text" | "num" | "date" | "group";
export interface Column<R> {
  key: string;
  label: string;
  /** CSS grid width, e.g. "minmax(0, 2fr)" or "120px". */
  width?: string;
  /** Header menu: sort by text / number / date, and "group" (only for choose-from-a-set columns). */
  menu?: ColumnMenu[];
  render?: (row: R) => ReactNode;
  /** The value sorting and grouping use (defaults to row[key]). */
  value?: (row: R) => string | number;
  wrap?: boolean;
}
export interface DataTableProps<R> {
  columns: Column<R>[];
  rows: R[];
  rowKey: (row: R) => string;
  /** The starting sort, e.g. { key: "requested", dir: "desc" }. */
  sort?: { key: string; dir: "asc" | "desc" };
  onRowClick?: (row: R) => void;
  /** Rows can be put in order by dragging (and with arrows): for tables with no sorting, like a queue. */
  onReorder?: (rows: R[]) => void;
  actions?: (row: R) => ReactNode;
  /** The column whose pill shows on the phone card. */
  statusKey?: string;
  empty?: ReactNode;
  /** Extra attributes on each row, e.g. { "data-mine": "1" } for a "Just mine" toggle. */
  rowAttrs?: (row: R) => Record<string, string>;
}

function cellValue<R>(c: Column<R>, r: R): string | number {
  if (c.value) return c.value(r);
  const v = (r as Record<string, unknown>)[c.key];
  return typeof v === "number" ? v : v == null ? "" : String(v);
}

export function DataTable<R>({ columns, rows, rowKey, sort: initialSort, onRowClick, onReorder, actions, statusKey, empty, rowAttrs }: DataTableProps<R>) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [groupBy, setGroupBy] = useState<string | null>(null);
  const drag = useRef<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const sorted = useMemo(() => {
    if (!sort || onReorder) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const out = rows.slice().sort((a, b) => {
      const x = cellValue(col, a), y = cellValue(col, b);
      const d = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
      return sort.dir === "asc" ? d : -d;
    });
    return out;
  }, [rows, sort, columns, onReorder]);

  const groups = useMemo(() => {
    if (!groupBy) return [{ name: "", rows: sorted }];
    const col = columns.find((c) => c.key === groupBy)!;
    const map = new Map<string, R[]>();
    sorted.forEach((r) => {
      const g = String(cellValue(col, r)) || "None";
      map.set(g, (map.get(g) ?? []).concat([r]));
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, rs]) => ({ name, rows: rs }));
  }, [sorted, groupBy, columns]);

  const hasActions = !!actions;
  const grid = [onReorder ? "34px 40px" : "", ...columns.map((c) => c.width ?? "minmax(0, 1fr)"), hasActions ? "auto" : ""].filter(Boolean).join(" ");

  const move = (key: string, to: number) => {
    if (!onReorder) return;
    const list = rows.slice();
    const from = list.findIndex((r) => rowKey(r) === key);
    if (from < 0 || to < 0 || to >= list.length) return;
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    onReorder(list);
  };

  const header = (
    <div className="k-thead" style={{ gridTemplateColumns: grid }}>
      {onReorder && <><span /><span title="Priority: 1 is first">Order</span></>}
      {columns.map((c) => <HeaderCell key={c.key} col={c} sort={onReorder ? null : sort} setSort={setSort} groupBy={groupBy} setGroupBy={setGroupBy} />)}
      {hasActions && <span />}
    </div>
  );

  const rowEl = (r: R, i: number) => {
    const k = rowKey(r);
    const dragProps = onReorder ? {
      draggable: true,
      onDragStart: () => { drag.current = k; setDragging(k); },
      onDragEnd: () => { drag.current = null; setDragging(null); },
      onDragOver: (e: React.DragEvent) => e.preventDefault(),
      onDrop: (e: React.DragEvent) => { e.preventDefault(); if (drag.current && drag.current !== k) move(drag.current, rows.findIndex((x) => rowKey(x) === k)); },
    } : {};
    return (
      <div key={k} {...(rowAttrs ? rowAttrs(r) : {})} data-tr="1"
        className={`k-tr${onRowClick ? " k-tr--click" : ""}${dragging === k ? " is-dragging" : ""}`} style={{ gridTemplateColumns: grid }}
        onClick={onRowClick ? (e) => { if (!(e.target as HTMLElement).closest("button,a,input,select,textarea,summary")) onRowClick(r); } : undefined}
        {...dragProps}>
        {onReorder && <><span className="k-handle" title="Drag to change the order" aria-hidden="true">⋮⋮</span><b style={{ color: "var(--color-gold)", textAlign: "center" }}>{i + 1}</b></>}
        {columns.map((c) => <span key={c.key} className={`k-td${c.wrap ? " k-td--wrap" : ""}`}>{c.render ? c.render(r) : String(cellValue(c, r))}</span>)}
        {hasActions && <span className="k-row" style={{ flexWrap: "nowrap" }}>{actions!(r)}{onReorder && <MoveButtons onUp={() => move(k, i - 1)} onDown={() => move(k, i + 1)} />}</span>}
      </div>
    );
  };

  const statusCol = columns.find((c) => c.key === statusKey);
  const [first, ...rest] = columns;
  const card = (r: R, i: number) => (
    <div key={rowKey(r)} {...(rowAttrs ? rowAttrs(r) : {})} data-tr="1" className="k-box k-tcard" onClick={onRowClick ? () => onRowClick(r) : undefined}>
      <div className="k-tcard-top">
        {onReorder && <b style={{ color: "var(--color-gold)" }}>{i + 1}</b>}
        <span style={{ flex: 1, minWidth: 0 }}>{first.render ? first.render(r) : String(cellValue(first, r))}</span>
        {statusCol && (statusCol.render ? statusCol.render(r) : String(cellValue(statusCol, r)))}
      </div>
      <span className="k-tcard-meta">
        {rest.filter((c) => c !== statusCol).map((c) => String(cellValue(c, r))).filter(Boolean).join(" · ")}
      </span>
      {(hasActions || onReorder) && <div className="k-row">{actions?.(r)}{onReorder && <MoveButtons onUp={() => move(rowKey(r), i - 1)} onDown={() => move(rowKey(r), i + 1)} />}</div>}
    </div>
  );
  const sortable = columns.filter((c) => c.menu?.some((m) => m !== "group"));
  const groupable = columns.filter((c) => c.menu?.includes("group"));

  return (
    <div className="k-table k-table--cards">
      <div className="k-box k-table-grid">
        {header}
        {rows.length === 0 && <div className="k-empty">{empty ?? "Nothing here yet."}</div>}
        {groups.map((g) => (
          <div key={g.name || "all"}>
            {groupBy && <div className="k-group-head">{g.name} · {g.rows.length}</div>}
            {g.rows.map((r, i) => rowEl(r, i))}
          </div>
        ))}
      </div>
      <div className="k-cards-list">
        {!onReorder && (sortable.length > 0 || groupable.length > 0) && (
          <details className="k-box k-sortgroup">
            <summary>Sort and group</summary>
            <div className="k-stack" style={{ gap: 6, marginTop: 8 }}>
              <select aria-label="Sort by" value={sort ? `${sort.key}:${sort.dir}` : ""} onChange={(e) => { const [key, dir] = e.target.value.split(":"); setSort(key ? { key, dir: dir as "asc" | "desc" } : null); }}>
                <option value="">Sort: as listed</option>
                {sortable.map((c) => <option key={c.key + "a"} value={`${c.key}:asc`}>{c.label}: {c.menu?.includes("date") ? "oldest first" : "A to Z"}</option>)}
                {sortable.map((c) => <option key={c.key + "d"} value={`${c.key}:desc`}>{c.label}: {c.menu?.includes("date") ? "newest first" : "Z to A"}</option>)}
              </select>
              {groupable.map((c) => (
                <label key={c.key} className="k-toggle"><input type="checkbox" checked={groupBy === c.key} onChange={() => setGroupBy(groupBy === c.key ? null : c.key)} />Group by {c.label.toLowerCase()}</label>
              ))}
            </div>
          </details>
        )}
        {rows.length === 0 && <div className="k-empty">{empty ?? "Nothing here yet."}</div>}
        {groups.map((g) => (
          <div key={g.name || "all"} className="k-stack" style={{ gap: 8 }}>
            {groupBy && <p className="k-label">{g.name} · {g.rows.length}</p>}
            {g.rows.map((r, i) => card(r, i))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MoveButtons({ onUp, onDown }: { onUp: () => void; onDown: () => void }) {
  return (
    <span className="k-move">
      <button type="button" title="Move up" aria-label="Move up" onClick={onUp}>▲</button>
      <button type="button" title="Move down" aria-label="Move down" onClick={onDown}>▼</button>
    </span>
  );
}

function HeaderCell<R>({ col, sort, setSort, groupBy, setGroupBy }: { col: Column<R>; sort: { key: string; dir: "asc" | "desc" } | null; setSort: (s: { key: string; dir: "asc" | "desc" } | null) => void; groupBy: string | null; setGroupBy: (g: string | null) => void }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const kinds = col.menu ?? [];
  if (!kinds.length) return <span>{col.label}</span>;
  const on = sort?.key === col.key;
  const pick = (dir: "asc" | "desc") => { setSort({ key: col.key, dir }); if (ref.current) ref.current.open = false; };
  const names: [string, "asc" | "desc"][] = [];
  if (kinds.includes("date")) names.push(["Newest first", "desc"], ["Oldest first", "asc"]);
  if (kinds.includes("text")) names.push(["Sort A to Z", "asc"], ["Sort Z to A", "desc"]);
  if (kinds.includes("num")) names.push(["Sort low to high", "asc"], ["Sort high to low", "desc"]);
  return (
    <details className="k-hmenu" ref={ref}>
      <summary className={on ? "is-sorted" : ""}>{col.label} <span className="k-hmenu-arrow">{on ? (sort!.dir === "asc" ? "▲" : "▼") : "▾"}</span></summary>
      <div className="k-menu" role="menu">
        {names.map(([label, dir]) => (
          <button key={label} type="button" role="menuitem" className={on && sort!.dir === dir ? "is-on" : ""} onClick={() => pick(dir)}>{label}{on && sort!.dir === dir ? " ✓" : ""}</button>
        ))}
        {kinds.includes("group") && (
          <label><input type="checkbox" checked={groupBy === col.key} onChange={() => setGroupBy(groupBy === col.key ? null : col.key)} />Group by {col.label.toLowerCase()}</label>
        )}
      </div>
    </details>
  );
}

/** A sub-item's name with a tree line from its parent (UX rule: tree lines, not arrows). */
export function TreeName({ last, children }: { last?: boolean; children: ReactNode }) {
  return <span className={`k-tree${last ? " k-tree--last" : ""}`}>{children}</span>;
}

// ---------------------------------------------------------------- forms
export function Field({ label, hint, wide, children }: { label: string; hint?: ReactNode; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`k-field${wide ? " k-field--wide" : ""}`}>
      {label}
      {children}
      {hint && <span className="k-hint">{hint}</span>}
    </label>
  );
}
export function Fields({ cols = 2, children }: { cols?: number; children: ReactNode }) {
  return <div className="k-fields" style={{ "--k-cols": cols } as CSSProperties}>{children}</div>;
}
export function KeyValue({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="k-box k-kv">
      {items.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}
    </dl>
  );
}

// ---------------------------------------------------------------- the notes editor
/** Bullets continue on Enter; Tab and Shift+Tab indent a bullet; Write / Preview (UX rule 12). */
export function NotesEditor({ value, onChange, onSubmit, submitLabel = "Save", rows = 4, placeholder, hint = "Markdown works: - for a bullet, **bold**." }: {
  value: string; onChange: (v: string) => void; onSubmit?: () => void; submitLabel?: string; rows?: number; placeholder?: string; hint?: string;
}) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  return (
    <div className="k-box k-editor">
      <div className="k-editor-tabs" role="tablist">
        <button type="button" role="tab" className="k-editor-tab" aria-selected={tab === "write"} onClick={() => setTab("write")}>Write</button>
        <button type="button" role="tab" className="k-editor-tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")}>Preview</button>
      </div>
      {tab === "write" ? (
        <textarea className="k-input" rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => bulletKeys(e, onChange)} />
      ) : (
        <div className="k-editor-preview">{renderNotes(value)}</div>
      )}
      {(onSubmit || hint) && (
        <div className="k-editor-foot">
          <span className="k-editor-hint">{hint}</span>
          {onSubmit && <Btn kind="primary" small onClick={onSubmit}>{submitLabel}</Btn>}
        </div>
      )}
    </div>
  );
}

export function bulletKeys(e: React.KeyboardEvent<HTMLTextAreaElement>, set: (v: string) => void) {
  const t = e.currentTarget, v = t.value, p = t.selectionStart;
  const ls = v.lastIndexOf("\n", p - 1) + 1;
  let le = v.indexOf("\n", p); if (le < 0) le = v.length;
  const line = v.slice(ls, le), before = v.slice(ls, p);
  const m = before.match(/^(\s*)- /);
  const apply = (next: string, caret: number) => { set(next); requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = caret; }); };
  if (e.key === "Tab" && /^\s*- /.test(line)) {
    e.preventDefault();
    if (e.shiftKey) { const r = line.match(/^ {1,2}/); if (r) apply(v.slice(0, ls) + line.slice(r[0].length) + v.slice(le), Math.max(ls, p - r[0].length)); }
    else apply(v.slice(0, ls) + "  " + line + v.slice(le), p + 2);
  } else if (e.key === "Enter" && m) {
    e.preventDefault();
    if (before === m[0]) apply(v.slice(0, ls) + v.slice(p), ls); // an empty bullet ends the list
    else apply(v.slice(0, p) + "\n" + m[1] + "- " + v.slice(p), p + 1 + m[1].length + 2);
  }
}

/** A small, safe Markdown subset for notes: bullets, **bold**, and links. Text is never inserted as HTML. */
export function renderNotes(text: string): ReactNode {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = () => { if (list.length) { out.push(<ul key={out.length}>{list}</ul>); list = []; } };
  lines.forEach((l, i) => {
    const b = l.match(/^(\s*)- (.*)$/);
    if (b) list.push(<li key={i} style={{ marginLeft: b[1].length * 8 }}>{inline(b[2])}</li>);
    else { flush(); if (l.trim()) out.push(<p key={i} style={{ margin: "0 0 6px" }}>{inline(l)}</p>); }
  });
  flush();
  return out.length ? out : <span className="k-hint">Nothing to preview.</span>;
}
function inline(s: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|(https?:\/\/[^\s)]+)/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push(s.slice(last, m.index));
    if (m[1]) parts.push(<strong key={k++}>{m[1]}</strong>);
    else parts.push(<a key={k++} href={m[2]} target="_blank" rel="noopener">{m[2]} ↗</a>);
    last = re.lastIndex;
  }
  if (last < s.length) parts.push(s.slice(last));
  return parts;
}
