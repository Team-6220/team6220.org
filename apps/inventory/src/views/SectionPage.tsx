// One page per inventory section (Parts, Raw Materials, Tools, Fasteners, Wire): search, filters, sorting,
// quantity +/- buttons and the add/edit drawer. Ported from JsParts.html and JsSections.html.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { InventoryError, type Row } from "@team6220/data/inventory";
import { reported, useApp } from "../context.tsx";
import { fmtQty, plural, type Lookup } from "../lib/lookup.ts";
import { buildIndex } from "../lib/search.ts";
import { isLowStock, type FilterDef, type FormField, type SectionConfig } from "../sections.ts";
import { Empty, Field, Modal, Select } from "../ui.tsx";

interface FilterState {
  q: string;
  sel: Record<string, string[]>;
  tagMode: "any" | "all";
  lowStock: boolean;
  needsCheck: boolean;
}

const emptyFilter = (): FilterState => ({ q: "", sel: {}, tagMode: "any", lowStock: false, needsCheck: false });

/** Saved filters ("Collections") use the old app's format so imported ones keep working. */
const SAVED_KEYS: Record<string, string> = { category: "categoryIds", tag: "tagIds", location: "locationIds", supplier: "supplierIds" };

function toSaved(f: FilterState): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [id, key] of Object.entries(SAVED_KEYS)) if (f.sel[id]?.length) out[key] = f.sel[id];
  if (f.sel.tag?.length) out.tagMode = f.tagMode;
  if (f.lowStock) out.lowStock = true;
  if (f.needsCheck) out.needsCheck = true;
  return out;
}

function fromSaved(s: Record<string, unknown>): FilterState {
  const f = emptyFilter();
  for (const [id, key] of Object.entries(SAVED_KEYS)) if (Array.isArray(s[key])) f.sel[id] = s[key] as string[];
  f.tagMode = s.tagMode === "all" ? "all" : "any";
  f.lowStock = s.lowStock === true;
  f.needsCheck = s.needsCheck === true;
  return f;
}

function loadSort(key: string, fallback: string): string {
  try {
    return localStorage.getItem(`inv.sort.${key}`) || fallback;
  } catch {
    return fallback;
  }
}

export function SectionPage({ cfg }: { cfg: SectionConfig }) {
  const { L, perms } = useApp();
  const [f, setF] = useState<FilterState>(emptyFilter);
  const [sort, setSort] = useState(() => loadSort(cfg.key, cfg.sorts[0].id));
  const [limit, setLimit] = useState(100);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [savedId, setSavedId] = useState<string>("");

  const rows = L.rows(cfg.key);
  const index = useMemo(() => buildIndex(rows, (r) => cfg.search(r, L)), [rows, cfg, L]);

  const results = useMemo(() => {
    const filters = cfg.filters
      .filter((d) => f.sel[d.id]?.length)
      .map((d) => ({ d, set: d.location ? L.locationAndChildren(f.sel[d.id]) : new Set(f.sel[d.id]) }));
    let list = index.query(f.q).filter(({ rec }) => {
      for (const { d, set } of filters) {
        const v = d.value(rec);
        if (Array.isArray(v)) {
          const has = (x: string) => v.includes(x);
          if (d.id === "tag" && f.tagMode === "all" ? ![...set].every(has) : !v.some((x) => set.has(x))) return false;
        } else if (!set.has(v)) return false;
      }
      if (f.lowStock && !isLowStock(rec)) return false;
      if (f.needsCheck && !rec.needsCheck) return false;
      return true;
    });
    const s = cfg.sorts.find((x) => x.id === sort) ?? cfg.sorts[0];
    const cmp = s.cmp(L);
    list = f.q.trim() ? list : list.sort((a, b) => cmp(a.rec, b.rec));
    return list.map((x) => x.rec);
  }, [index, f, sort, cfg, L]);

  const lowCount = cfg.lowStock ? rows.filter(isLowStock).length : 0;
  const checkCount = cfg.auditable ? rows.filter((r) => r.needsCheck).length : 0;
  const filtered = f.q || Object.values(f.sel).some((v) => v.length) || f.lowStock || f.needsCheck;
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const setSel = (id: string, ids: string[]) => {
    setF((x) => ({ ...x, sel: { ...x.sel, [id]: ids } }));
    setLimit(100);
  };

  return (
    <div className="inv-page">
      <div className="inv-page-head">
        <div>
          <h1>{cfg.title}</h1>
          <div className="inv-sub">
            {plural(rows.length, cfg.noun, cfg.nouns)}
            {cfg.key === "fasteners" ? " on hand" : ""}
          </div>
        </div>
        {perms.manage && (
          <button type="button" className="inv-btn primary" onClick={() => setEditing("new")}>
            + {cfg.addLabel}
          </button>
        )}
      </div>

      <div className="inv-search">
        <input
          ref={searchRef}
          type="search"
          placeholder={cfg.searchPlaceholder}
          aria-label={`Search ${cfg.nouns}`}
          value={f.q}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setF((x) => ({ ...x, q: e.target.value }));
            setLimit(100);
          }}
        />
        <kbd>/</kbd>
      </div>

      <div className="inv-filters">
        {cfg.filters.map((d) => (
          <FilterMenu key={d.id} d={d} L={L} selected={f.sel[d.id] ?? []} onChange={(ids) => setSel(d.id, ids)} tagMode={d.id === "tag" ? f.tagMode : undefined} onTagMode={(m) => setF((x) => ({ ...x, tagMode: m }))} />
        ))}
        {cfg.lowStock && (
          <button type="button" className={`inv-pill ${f.lowStock ? "on" : ""}`} aria-pressed={f.lowStock} onClick={() => setF((x) => ({ ...x, lowStock: !x.lowStock }))}>
            Low stock{lowCount ? ` (${lowCount})` : ""}
          </button>
        )}
        {cfg.auditable && (
          <button type="button" className={`inv-pill ${f.needsCheck ? "on" : ""}`} aria-pressed={f.needsCheck} onClick={() => setF((x) => ({ ...x, needsCheck: !x.needsCheck }))}>
            Needs check{checkCount ? ` (${checkCount})` : ""}
          </button>
        )}
        {cfg.savedFilters && <SavedFilters f={f} savedId={savedId} onApply={(s, id) => (setF({ ...fromSaved(s), q: f.q }), setSavedId(id))} />}
        {filtered && (
          <button
            type="button"
            className="inv-link"
            onClick={() => {
              setF(emptyFilter());
              setSavedId("");
            }}
          >
            Clear all
          </button>
        )}
        <label className="inv-sort">
          Sort
          <Select
            value={f.q.trim() ? "relevance" : sort}
            options={[...(f.q.trim() ? [{ value: "relevance", label: "Best match" }] : []), ...cfg.sorts.map((s) => ({ value: s.id, label: s.label }))]}
            onChange={(v) => {
              if (v === "relevance") return;
              setSort(v);
              try {
                localStorage.setItem(`inv.sort.${cfg.key}`, v);
              } catch {
                /* storage unavailable */
              }
            }}
          />
        </label>
      </div>

      {filtered && (
        <div className="inv-results-meta">
          {results.length === rows.length ? `All ${plural(rows.length, cfg.noun, cfg.nouns)}` : `${results.length} of ${plural(rows.length, cfg.noun, cfg.nouns)}`}
        </div>
      )}

      {rows.length === 0 ? (
        <Empty title={`No ${cfg.nouns} yet`}>{cfg.emptyText}</Empty>
      ) : results.length === 0 ? (
        <Empty title="Nothing matches">Try fewer words or clear the filters.</Empty>
      ) : (
        <ul className="inv-list" aria-label={cfg.title}>
          {results.slice(0, limit).map((r) => (
            <ItemRow key={r.id} cfg={cfg} r={r} onOpen={() => setEditing(r)} />
          ))}
        </ul>
      )}
      {results.length > limit && (
        <button type="button" className="inv-btn inv-more" onClick={() => setLimit((n) => n + 200)}>
          Show more ({results.length - limit} left)
        </button>
      )}

      {editing && <ItemEditor cfg={cfg} rec={editing === "new" ? null : editing} initialName={editing === "new" ? f.q : ""} onClose={() => setEditing(null)} />}
    </div>
  );
}

function FilterMenu(props: { d: FilterDef; L: Lookup; selected: string[]; onChange: (ids: string[]) => void; tagMode?: "any" | "all"; onTagMode: (m: "any" | "all") => void }) {
  const { d, L, selected, onChange } = props;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const options = open ? d.options(L) : [];
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="inv-filter" ref={ref}>
      <button type="button" className={`inv-pill ${selected.length ? "on" : ""}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {d.label}
        {selected.length ? ` (${selected.length})` : ""} ▾
      </button>
      {open && (
        <div className="inv-popover" role="group" aria-label={d.label}>
          {props.tagMode && (
            <div className="inv-seg">
              <button type="button" aria-pressed={props.tagMode === "any"} onClick={() => props.onTagMode("any")}>
                Any tag
              </button>
              <button type="button" aria-pressed={props.tagMode === "all"} onClick={() => props.onTagMode("all")}>
                All tags
              </button>
            </div>
          )}
          {options.length === 0 && <div className="inv-hint">Nothing to filter by yet.</div>}
          {options.map((o) => (
            <label key={o.id} className={`inv-check ${o.indent ? "indent" : ""}`}>
              <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
              {o.label}
            </label>
          ))}
          {selected.length > 0 && (
            <button type="button" className="inv-link" onClick={() => onChange([])}>
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SavedFilters({ f, savedId, onApply }: { f: FilterState; savedId: string; onApply: (s: Record<string, unknown>, id: string) => void }) {
  const { L, perms, write, svc } = useApp();
  const saved = L.sorted("collections", (c) => c.section === "parts");
  const snap = toSaved(f);
  const canSave = Object.keys(snap).length > 0;
  return (
    <label className="inv-sort">
      Saved
      <Select
        value={savedId}
        empty="Saved filters…"
        options={[
          ...saved.map((c) => ({ value: c.id, label: c.name })),
          ...(perms.manage && canSave ? [{ value: "__new", label: "＋ Save current filters…" }] : []),
        ]}
        onChange={async (v) => {
          if (v === "__new") {
            const name = window.prompt("Name for these filters (e.g. Dead Axle Components)")?.trim();
            if (!name) return;
            const rec = await write(() => svc.create("collections", { name, section: "parts", filter: snap }), { ok: "Filters saved." }).catch(reported);
            if (rec) onApply(rec.filter, rec.id);
            return;
          }
          const c = saved.find((x) => x.id === v);
          if (c) onApply(c.filter ?? {}, c.id);
        }}
      />
    </label>
  );
}

// ─────────────── one row ───────────────

function ItemRow({ cfg, r, onOpen }: { cfg: SectionConfig; r: Row; onOpen: () => void }) {
  const { L } = useApp();
  const low = cfg.lowStock && isLowStock(r);
  return (
    <li className="inv-row">
      <button type="button" className="inv-row-main" onClick={onOpen}>
        <span className="inv-row-title">{cfg.primary(r, L) || "(no name)"}</span>
        <span className="inv-row-meta">
          {[cfg.meta(r, L), ...cfg.columns.map((c) => c.value(r, L))].filter(Boolean).join(" · ")}
        </span>
        <span className="inv-badges">
          {r.needsCheck && <span className="inv-badge warn">Needs check</span>}
          {low && <span className="inv-badge low">Low stock</span>}
        </span>
      </button>
      {cfg.qtyField && <QtyStepper cfg={cfg} r={r} />}
    </li>
  );
}

/**
 * +/- buttons. Taps within 600 ms are added up and sent as one change (a CHANGE, not a total, so two people
 * taking parts at once are both counted).
 */
function QtyStepper({ cfg, r }: { cfg: SectionConfig; r: Row }) {
  const { perms, svc, write, toast, L } = useApp();
  const field = cfg.qtyField!;
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef(0);
  const step = 1;
  const shown = Math.max(0, (Number(r[field]) || 0) + pending);
  const unit = cfg.qtyUnit?.(r, L) ?? "";

  const flush = async () => {
    const delta = pendingRef.current;
    if (!delta) return;
    pendingRef.current = 0;
    setBusy(true);
    try {
      const res = await write(() => svc.adjustQuantity(cfg.key, r.id, delta));
      if (res.clamped) toast("The quantity can’t go below 0, so it was set to 0.", "info");
    } catch {
      /* reported */
    } finally {
      setPending((p) => p - delta);
      setBusy(false);
    }
  };

  const bump = (d: number) => {
    pendingRef.current += d;
    setPending((p) => p + d);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  };

  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current);
      void flush();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!perms.manage) {
    return (
      <span className="inv-qty readonly" aria-label={cfg.qtyLabel}>
        {fmtQty(r[field])} {unit}
      </span>
    );
  }
  return (
    <span className={`inv-qty ${busy || pending ? "pending" : ""}`}>
      <button type="button" className="inv-step" aria-label={`Remove one ${cfg.noun}`} disabled={shown <= 0} onClick={() => bump(-step)}>
        −
      </button>
      <span className="inv-qty-num" aria-live="polite">
        {fmtQty(shown)}
        {unit && <small> {unit}</small>}
      </span>
      <button type="button" className="inv-step" aria-label={`Add one ${cfg.noun}`} onClick={() => bump(step)}>
        +
      </button>
    </span>
  );
}

// ─────────────── add / edit drawer ───────────────

function initialValues(cfg: SectionConfig, rec: Row | null, L: Lookup, initialName: string): Record<string, unknown> {
  const v: Record<string, unknown> = {};
  for (const fd of cfg.form) {
    if (rec) v[fd.name] = rec[fd.name];
    else v[fd.name] = fd.defaultValue ? fd.defaultValue(L) : fd.type === "tags" ? [] : "";
  }
  if (!rec && initialName && cfg.form.some((x) => x.name === "name")) v.name = initialName;
  for (const k of Object.keys(v)) if (v[k] === null || v[k] === undefined) v[k] = "";
  return v;
}

function ItemEditor({ cfg, rec, initialName, onClose }: { cfg: SectionConfig; rec: Row | null; initialName: string; onClose: () => void }) {
  const { L, perms, svc, write, confirm } = useApp();
  const [values, setValues] = useState(() => initialValues(cfg, rec, L, initialName));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const readOnly = !perms.manage;
  const live = rec ? (L.get(cfg.key, rec.id) ?? rec) : null;

  const set = (name: string, v: unknown) => setValues((x) => ({ ...x, [name]: v }));

  const changes = () => {
    if (!rec) return values;
    const out: Record<string, unknown> = {};
    for (const fd of cfg.form) {
      const before = rec[fd.name] ?? "";
      if (JSON.stringify(values[fd.name]) !== JSON.stringify(before)) out[fd.name] = values[fd.name];
    }
    return out;
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    setBusy(true);
    setErrors({});
    try {
      if (!rec) {
        await write(() => svc.create(cfg.key, values), { ok: `${cfg.noun[0].toUpperCase()}${cfg.noun.slice(1)} added.`, quiet: ["VALIDATION"] });
      } else {
        const ch = changes();
        if (Object.keys(ch).length) {
          try {
            await write(() => svc.update(cfg.key, rec.id, ch, rec.version), { ok: "Saved.", quiet: ["VALIDATION", "CONFLICT"] });
          } catch (err) {
            if (!(err instanceof InventoryError && err.code === "CONFLICT")) throw err;
            const yes = await confirm({
              title: "Someone else edited this",
              message: "While you were editing, someone else saved changes to this item. Save your version of the fields you changed anyway?",
              confirmLabel: "Save mine",
            });
            if (!yes) return;
            await write(() => svc.update(cfg.key, rec.id, ch, null), { ok: "Saved.", quiet: ["VALIDATION"] });
          }
        }
      }
      onClose();
    } catch (err) {
      if (err instanceof InventoryError && err.code === "VALIDATION") {
        setErrors((err.details?.fields as Record<string, string>) ?? {});
      }
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!rec) return;
    const yes = await confirm({
      title: `Archive this ${cfg.noun}?`,
      message: "It disappears from the lists. You can restore it from Settings → Archive.",
      confirmLabel: "Archive",
      danger: true,
    });
    if (!yes) return;
    await write(() => svc.archive(cfg.key, rec.id), { ok: "Moved to the archive." }).then(onClose, reported);
  };

  const toggleCheck = async () => {
    if (!live) return;
    await write(() => svc.setNeedsCheck(cfg.key, live.id, !live.needsCheck), { ok: live.needsCheck ? "Check cleared." : "Marked for a check." }).catch(reported);
  };

  return (
    <Modal
      kind="drawer"
      title={rec ? (readOnly ? cfg.primary(rec, L) : `Edit ${cfg.noun}`) : cfg.addLabel}
      onClose={onClose}
      footer={
        readOnly ? (
          <button type="button" className="inv-btn" onClick={onClose}>
            Close
          </button>
        ) : (
          <>
            {rec && (
              <button type="button" className="inv-btn danger-text" onClick={archive}>
                Archive
              </button>
            )}
            <span className="inv-spacer" />
            <button type="button" className="inv-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" form="inv-item-form" className="inv-btn primary" disabled={busy}>
              {busy ? "Saving…" : rec ? "Save" : "Add"}
            </button>
          </>
        )
      }
    >
      {live && cfg.auditable && (live.needsCheck || !readOnly) && (
        <div className={`inv-callout ${live.needsCheck ? "warn" : ""}`}>
          {live.needsCheck ? "An audit couldn’t find this. Check it and clear the flag." : "Not sure the count is right?"}
          {!readOnly && (
            <button type="button" className="inv-link" onClick={toggleCheck}>
              {live.needsCheck ? "Clear “needs check”" : "Mark “needs check”"}
            </button>
          )}
        </div>
      )}
      {rec?.shape?.kind === "traced" && (
        <div className="inv-callout">This piece has a traced outline from the old app. Changing length or width replaces it with a rectangle.</div>
      )}
      <form id="inv-item-form" className="inv-form" onSubmit={save}>
        <fieldset disabled={readOnly || busy}>
          {cfg.form.map((fd) => (
            <FormControl key={fd.name} fd={fd} value={values[fd.name]} error={errors[fd.name]} onChange={(v) => set(fd.name, v)} />
          ))}
        </fieldset>
      </form>
      {rec && (
        <div className="inv-hint inv-meta-foot">
          ID {rec.id} · updated {rec.updatedAt ? new Date(rec.updatedAt).toLocaleString() : "—"}
        </div>
      )}
    </Modal>
  );
}

function FormControl({ fd, value, error, onChange }: { fd: FormField; value: unknown; error?: string; onChange: (v: unknown) => void }) {
  const { L } = useApp();
  const str = value === null || value === undefined ? "" : String(value);
  return (
    <Field label={fd.label + (fd.required ? " *" : "")} hint={fd.hint} error={error} half={fd.half}>
      {(id) => {
        switch (fd.type) {
          case "textarea":
            return <textarea id={id} rows={3} value={str} onChange={(e) => onChange(e.target.value)} />;
          case "int":
          case "number":
            return <input id={id} type="number" inputMode={fd.type === "int" ? "numeric" : "decimal"} step={fd.type === "int" ? 1 : "any"} min={0} value={str} onChange={(e) => onChange(e.target.value)} />;
          case "list":
            return <Select id={id} value={str} empty="—" options={L.listOptions(fd.listKey!).map((o) => ({ value: o.id, label: o.value }))} onChange={onChange} />;
          case "category":
            return <Select id={id} value={str} empty="—" options={L.sorted("categories").map((o) => ({ value: o.id, label: o.name }))} onChange={onChange} />;
          case "supplier":
            return <Select id={id} value={str} empty="—" options={L.sorted("suppliers").map((o) => ({ value: o.id, label: o.name }))} onChange={onChange} />;
          case "location":
            return (
              <Select
                id={id}
                value={str}
                empty="No location"
                options={L.locationTree().flatMap((n) => [
                  { value: n.area.id, label: n.area.name + (n.children.length ? " (whole area)" : ""), group: n.area.name },
                  ...n.children.map((c) => ({ value: c.id, label: `${n.area.name} → ${c.name}`, group: n.area.name })),
                ])}
                onChange={onChange}
              />
            );
          case "tags":
            return <TagPicker id={id} value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} />;
          default:
            return <input id={id} type="text" value={str} placeholder={fd.placeholder} onChange={(e) => onChange(e.target.value)} />;
        }
      }}
    </Field>
  );
}

function TagPicker({ id, value, onChange }: { id: string; value: string[]; onChange: (v: string[]) => void }) {
  const { L } = useApp();
  const groups = [...L.sorted("categories").map((c) => ({ name: c.name, id: c.id })), { name: "Other", id: "" }]
    .map((g) => ({ ...g, tags: L.sorted("tags", (t) => (t.categoryId || "") === g.id || (g.id === "" && !!t.categoryId && !L.get("categories", t.categoryId))) }))
    .filter((g) => g.tags.length);
  return (
    <div id={id} className="inv-tags" role="group">
      {groups.map((g) => (
        <div key={g.id || "other"} className="inv-tag-group">
          <span className="inv-hint">{g.name}</span>
          {g.tags.map((t) => {
            const on = value.includes(t.id);
            return (
              <button key={t.id} type="button" className={`inv-chip ${on ? "on" : ""}`} aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== t.id) : [...value, t.id])}>
                {t.name}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
