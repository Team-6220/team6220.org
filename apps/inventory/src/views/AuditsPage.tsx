// Inventory Audits (preseason / postseason counts). Ported from JsAudits.html.
//   No audit running: explanation, "Start an audit", past audits.
//   Audit running:    progress, filters, and a row per item with Confirm / Different / Missing.
// Many members can count at once: each tap saves only that one item.
import { useMemo, useState } from "react";
import { AUDIT_SECTIONS, InventoryError, type AuditConflict, type AuditSection, type AuditStatus, type Row } from "@team6220/data/inventory";
import { reported, useApp } from "../context.tsx";
import { fmtQty, natural, plural } from "../lib/lookup.ts";
import { buildIndex } from "../lib/search.ts";
import { SECTIONS } from "../sections.ts";
import { Empty, Field, Modal } from "../ui.tsx";

const SECTION_LABELS: Record<AuditSection, string> = { parts: "Parts", rawMaterials: "Raw Materials", tools: "Tools & Equipment", wire: "Wire" };
const STATUS_LABELS: Record<AuditStatus, string> = { unchecked: "Not checked", confirmed: "Confirmed", different: "Different", missing: "Missing" };

export function AuditsPage() {
  const { L } = useApp();
  const active = L.tables.auditSessions.find((s) => s.status === "active");
  return active ? <ActiveAudit session={active} /> : <NoAudit />;
}

function NoAudit() {
  const { L, perms } = useApp();
  const [starting, setStarting] = useState(false);
  const past = L.tables.auditSessions.filter((s) => s.status !== "active").sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return (
    <div className="inv-page">
      <div className="inv-page-head">
        <div>
          <h1>Inventory Audits</h1>
          <div className="inv-sub">Count everything before and after the season.</div>
        </div>
        {perms.manage && (
          <button type="button" className="inv-btn primary" onClick={() => setStarting(true)}>
            Start an audit
          </button>
        )}
      </div>
      <div className="inv-card">
        <p>
          An audit lists every item in the sections you choose. Team members mark each one <b>Confirmed</b>, <b>Different</b> (with the
          count) or <b>Missing</b>. When it’s finished, an Inventory Manager applies the results: different counts replace the quantity,
          missing items keep their quantity and get flagged “Needs check”.
        </p>
        <p className="inv-hint">If someone uses parts while the audit runs, their counts aren’t applied automatically; you choose which number to keep.</p>
      </div>
      <h2 className="inv-h2">Past audits</h2>
      {past.length === 0 ? (
        <Empty title="No audits yet" />
      ) : (
        <ul className="inv-list">
          {past.map((s) => (
            <li key={s.id} className="inv-row static">
              <div className="inv-row-main">
                <span className="inv-row-title">{s.name}</span>
                <span className="inv-row-meta">
                  {s.status === "finalized" ? "Applied" : "Cancelled"} {s.finalizedAt ? new Date(s.finalizedAt).toLocaleDateString() : ""} ·{" "}
                  {(s.sections as string[]).map((k) => SECTION_LABELS[k as AuditSection] ?? k).join(", ")}
                </span>
                <span className="inv-row-meta">{summaryText(s)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {starting && <StartAuditDialog onClose={() => setStarting(false)} />}
    </div>
  );
}

function summaryText(s: Row): string {
  const m = s.summary ?? {};
  if (s.status === "cancelled") return `${m.checked ?? 0} of ${plural(m.total ?? 0, "item")} had been counted`;
  return [
    plural(m.total ?? 0, "item"),
    m.confirmed ? `${m.confirmed} confirmed` : "",
    m.updated ? `${m.updated} updated` : "",
    m.missing ? `${m.missing} missing` : "",
    m.keptCurrent ? `${m.keptCurrent} kept current` : "",
    m.unchecked ? `${m.unchecked} not checked` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function StartAuditDialog({ onClose }: { onClose: () => void }) {
  const { svc, write, L } = useApp();
  const [name, setName] = useState(() => `${new Date().getMonth() < 6 ? "Postseason" : "Preseason"} audit ${new Date().getFullYear()}`);
  const [secs, setSecs] = useState<AuditSection[]>([...AUDIT_SECTIONS]);
  const [err, setErr] = useState<Record<string, string>>({});
  const total = secs.reduce((n, k) => n + L.rows(k).length, 0);
  const start = async () => {
    try {
      await write(() => svc.startAudit(name, secs), { ok: "Audit started.", quiet: ["VALIDATION"] });
      onClose();
    } catch (e) {
      if (e instanceof InventoryError && e.code === "VALIDATION") setErr((e.details?.fields as Record<string, string>) ?? {});
    }
  };
  return (
    <Modal
      title="Start an audit"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="inv-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="inv-btn primary" onClick={start} disabled={!secs.length}>
            Start ({plural(total, "item")})
          </button>
        </>
      }
    >
      <Field label="Name" error={err.name}>
        {(id) => <input id={id} type="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <fieldset className="inv-fieldset">
        <legend>Sections to count</legend>
        {AUDIT_SECTIONS.map((k) => (
          <label key={k} className="inv-check">
            <input type="checkbox" checked={secs.includes(k)} onChange={() => setSecs((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]))} />
            {SECTION_LABELS[k]} ({L.rows(k).length})
          </label>
        ))}
        {err.sections && <div className="inv-field-error">{err.sections}</div>}
      </fieldset>
    </Modal>
  );
}

/** Current name of the audited item (falls back to the name saved when the audit started). */
function auditLabel(ai: Row, L: ReturnType<typeof useApp>["L"]): string {
  const k = ai.itemTable as AuditSection;
  const rec = L.get(k, ai.itemId);
  if (!rec || rec.archivedAt) return `${ai.nameSnapshot} (removed)`;
  return SECTIONS[k].primary(rec, L) || ai.nameSnapshot;
}

function ActiveAudit({ session }: { session: Row }) {
  const { L, perms, svc, write, confirm } = useApp();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<AuditStatus | "">("");
  const [section, setSection] = useState<string>("");
  const [conflicts, setConflicts] = useState<AuditConflict[] | null>(null);
  const items = L.tables.auditItems.filter((a) => a.auditId === session.id);
  const counts = { unchecked: 0, confirmed: 0, different: 0, missing: 0 } as Record<AuditStatus, number>;
  items.forEach((a) => counts[a.status as AuditStatus]++);
  const done = items.length - counts.unchecked;

  const index = useMemo(() => buildIndex(items, (a) => [[auditLabel(a, L), 5], [L.locationLabel(L.get(a.itemTable, a.itemId)?.locationId ?? ""), 2]]), [items, L]);
  const shown = index
    .query(q)
    .map((x) => x.rec)
    .filter((a) => (!status || a.status === status) && (!section || a.itemTable === section));
  if (!q.trim()) {
    shown.sort((a, b) => natural(a.itemTable, b.itemTable) || natural(L.locationLabel(L.get(a.itemTable, a.itemId)?.locationId ?? "") || "~", L.locationLabel(L.get(b.itemTable, b.itemId)?.locationId ?? "") || "~") || natural(auditLabel(a, L), auditLabel(b, L)));
  }

  const finalize = async (resolutions: Record<string, "counted" | "current"> = {}) => {
    if (!conflicts) {
      const yes = await confirm({
        title: "Apply this audit?",
        message: `${counts.different} different count(s) will replace quantities, ${counts.missing} missing item(s) will be flagged “Needs check”, and ${counts.unchecked} item(s) not checked stay as they are.`,
        confirmLabel: "Apply results",
      });
      if (!yes) return;
    }
    try {
      const r = await write(() => svc.finalizeAudit(session.id, resolutions), { ok: "Audit applied.", quiet: ["AUDIT_CONFLICTS"] });
      setConflicts(null);
      return r;
    } catch (e) {
      if (e instanceof InventoryError && e.code === "AUDIT_CONFLICTS") setConflicts((e.details?.conflicts as AuditConflict[]) ?? []);
    }
  };

  const cancel = async () => {
    const yes = await confirm({ title: "Cancel this audit?", message: "All counts are thrown away and no inventory changes.", confirmLabel: "Cancel audit", cancelLabel: "Keep counting", danger: true });
    if (yes) await write(() => svc.cancelAudit(session.id), { ok: "Audit cancelled." }).catch(reported);
  };

  return (
    <div className="inv-page">
      <div className="inv-page-head">
        <div>
          <h1>{session.name}</h1>
          <div className="inv-sub">
            Started {new Date(session.createdAt).toLocaleDateString()} · {done} of {plural(items.length, "item")} counted
          </div>
        </div>
        {perms.manage && (
          <div className="inv-actions">
            <button type="button" className="inv-btn danger-text" onClick={cancel}>
              Cancel audit
            </button>
            <button type="button" className="inv-btn primary" onClick={() => void finalize()}>
              Finish and apply
            </button>
          </div>
        )}
      </div>
      <div className="inv-progress" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done}>
        <span style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
      </div>
      <div className="inv-search">
        <input type="search" placeholder="Search items in this audit…" aria-label="Search audit items" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="inv-filters">
        {(["", "unchecked", "confirmed", "different", "missing"] as const).map((s) => (
          <button key={s || "all"} type="button" className={`inv-pill ${status === s ? "on" : ""}`} aria-pressed={status === s} onClick={() => setStatus(s)}>
            {s ? `${STATUS_LABELS[s]} (${counts[s]})` : `All (${items.length})`}
          </button>
        ))}
        <select aria-label="Section" value={section} onChange={(e) => setSection(e.target.value)}>
          <option value="">All sections</option>
          {(session.sections as AuditSection[]).map((k) => (
            <option key={k} value={k}>
              {SECTION_LABELS[k]}
            </option>
          ))}
        </select>
      </div>
      {shown.length === 0 ? (
        <Empty title="Nothing here" />
      ) : (
        <ul className="inv-list">
          {shown.slice(0, 300).map((a) => (
            <AuditRow key={a.id} ai={a} />
          ))}
        </ul>
      )}
      {shown.length > 300 && <div className="inv-hint">Showing the first 300. Search or filter to find the rest.</div>}
      {conflicts && <ConflictDialog conflicts={conflicts} onClose={() => setConflicts(null)} onResolve={(r) => void finalize(r)} />}
    </div>
  );
}

function AuditRow({ ai }: { ai: Row }) {
  const { L, perms, svc, write } = useApp();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [err, setErr] = useState("");
  const k = ai.itemTable as AuditSection;
  const rec = L.get(k, ai.itemId);
  const unit = k === "wire" && rec ? L.listVal(rec.lengthUnitId) : "";
  const set = (status: AuditStatus, qty?: string) =>
    write(() => svc.setAuditCount(ai.id, status, qty ?? null), { quiet: ["VALIDATION"] }).then(
      () => {
        setEditing(false);
        setErr("");
      },
      (e) => e instanceof InventoryError && e.code === "VALIDATION" && setErr(e.message),
    );
  return (
    <li className={`inv-row audit ${ai.status}`}>
      <div className="inv-row-main">
        <span className="inv-row-title">{auditLabel(ai, L)}</span>
        <span className="inv-row-meta">
          {SECTION_LABELS[k]} · {L.locationLabel(rec?.locationId ?? "") || "No location"} · expected {fmtQty(ai.baselineQty)} {unit}
          {ai.status === "different" && ` · counted ${fmtQty(ai.countedQty)} ${unit}`}
        </span>
        {ai.status !== "unchecked" && <span className={`inv-badge ${ai.status}`}>{STATUS_LABELS[ai.status as AuditStatus]}</span>}
      </div>
      {perms.count && (
        <div className="inv-audit-actions">
          {editing ? (
            <form
              className="inv-inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                void set("different", val);
              }}
            >
              <input type="number" inputMode="decimal" min={0} step="any" aria-label="Counted amount" autoFocus value={val} onChange={(e) => setVal(e.target.value)} />
              <button type="submit" className="inv-btn primary small">
                Save
              </button>
              <button type="button" className="inv-btn small" onClick={() => setEditing(false)}>
                Cancel
              </button>
              {err && <span className="inv-field-error">{err}</span>}
            </form>
          ) : ai.status === "unchecked" ? (
            <>
              <button type="button" className="inv-btn small ok" onClick={() => void set("confirmed")}>
                Confirm
              </button>
              <button
                type="button"
                className="inv-btn small"
                onClick={() => {
                  setVal(String(ai.baselineQty ?? ""));
                  setEditing(true);
                }}
              >
                Different
              </button>
              <button type="button" className="inv-btn small warn" onClick={() => void set("missing")}>
                Missing
              </button>
            </>
          ) : (
            <button type="button" className="inv-btn small" onClick={() => void set("unchecked")}>
              Undo
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function ConflictDialog({ conflicts, onClose, onResolve }: { conflicts: AuditConflict[]; onClose: () => void; onResolve: (r: Record<string, "counted" | "current">) => void }) {
  const [choice, setChoice] = useState<Record<string, "counted" | "current">>(() => Object.fromEntries(conflicts.map((c) => [c.auditItemId, "current" as const])));
  return (
    <Modal
      title="Some items changed during the audit"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="inv-btn" onClick={onClose}>
            Back
          </button>
          <button type="button" className="inv-btn primary" onClick={() => onResolve(choice)}>
            Apply with these choices
          </button>
        </>
      }
    >
      <p>Someone changed these quantities after the audit started. Choose which number to keep for each.</p>
      <ul className="inv-list">
        {conflicts.map((c) => (
          <li key={c.auditItemId} className="inv-row static">
            <div className="inv-row-main">
              <span className="inv-row-title">{c.name}</span>
              <span className="inv-row-meta">
                at start {fmtQty(c.baseline)} · counted {fmtQty(c.counted)} · now {fmtQty(c.current)}
              </span>
            </div>
            <div className="inv-seg">
              <button type="button" aria-pressed={choice[c.auditItemId] === "counted"} onClick={() => setChoice((x) => ({ ...x, [c.auditItemId]: "counted" }))}>
                Use counted ({fmtQty(c.counted)})
              </button>
              <button type="button" aria-pressed={choice[c.auditItemId] === "current"} onClick={() => setChoice((x) => ({ ...x, [c.auditItemId]: "current" }))}>
                Keep current ({fmtQty(c.current)})
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
