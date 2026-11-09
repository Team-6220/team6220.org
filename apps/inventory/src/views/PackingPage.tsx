// The competition Packing List. Ported from JsPacking.html (without the "final check" mode yet).
//   Packing:   everyone ticks things off; packed items are struck through and sink to the end of their group.
//   Edit list: Inventory Managers add, rename, nest, reorder, link to inventory and delete entries.
// Sections: Always pack · <season> · U-Haul Checklist.
import { useMemo, useState } from "react";
import { PACKING_SECTIONS, type PackingSection, type Row } from "@team6220/data/inventory";
import { reported, useApp } from "../context.tsx";
import { natural, plural, timeAgo } from "../lib/lookup.ts";
import { Empty, Field, Modal, Select } from "../ui.tsx";

interface Tree {
  kids(id: string, section?: PackingSection): Row[];
  leaves(id: string): Row[];
}

function makeTree(rows: Row[]): Tree {
  const kids = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r.parentId || "";
    kids.set(k, [...(kids.get(k) ?? []), r]);
  }
  for (const list of kids.values()) list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || natural(a.name, b.name));
  const leafCache = new Map<string, Row[]>();
  const t: Tree = {
    kids: (id, section) => (kids.get(id) ?? []).filter((r) => id || r.section === section),
    leaves(id) {
      const hit = leafCache.get(id);
      if (hit) return hit;
      const c = kids.get(id) ?? [];
      const self = rows.find((r) => r.id === id);
      const out = c.length ? c.flatMap((x) => t.leaves(x.id)) : self ? [self] : [];
      leafCache.set(id, out);
      return out;
    },
  };
  return t;
}

export function PackingPage() {
  const { L, perms, packingMeta, svc, write, confirm } = useApp();
  const [section, setSection] = useState<PackingSection>("always");
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState<{ rec: Row | null; parentId: string } | null>(null);
  const [hidePacked, setHidePacked] = useState(false);
  const rows = L.tables.packingItems;
  const tree = useMemo(() => makeTree(rows), [rows]);
  const labels: Record<PackingSection, string> = { always: "Always pack", season: packingMeta.season || "This season", loadout: "U-Haul Checklist" };

  const sectionLeaves = (s: PackingSection) => tree.kids("", s).flatMap((r) => tree.leaves(r.id));
  const leaves = sectionLeaves(section);
  const packed = leaves.filter((r) => r.packed).length;

  const newRound = async () => {
    const ev = window.prompt("Start a new packing round. Event name (optional):", packingMeta.event);
    if (ev === null) return;
    await write(() => svc.packingReset(ev), { ok: "New packing round started. All checkmarks were cleared." }).catch(reported);
  };

  const clearSeason = async () => {
    const n = rows.filter((r) => r.section === "season").length;
    const yes = await confirm({ title: `Delete all ${n} season entries?`, message: "Do this when a new season starts. It can’t be undone.", confirmLabel: "Delete them", danger: true });
    if (yes) await write(() => svc.packingClearSeason(), { ok: "Season entries deleted." }).catch(reported);
  };

  const editInfo = async () => {
    const event = window.prompt("Event name (e.g. Beach Blitz 2026):", packingMeta.event);
    if (event === null) return;
    const season = window.prompt("Season list name (e.g. 2027 season):", packingMeta.season);
    if (season === null) return;
    await write(() => svc.packingSetInfo({ event, season }), { ok: "Saved." }).catch(reported);
  };

  return (
    <div className="inv-page">
      <div className="inv-page-head">
        <div>
          <h1>Packing List</h1>
          <div className="inv-sub">
            {packingMeta.event || "No event set"}
            {packingMeta.roundStartedAt ? ` · round started ${timeAgo(packingMeta.roundStartedAt)}` : ""}
          </div>
        </div>
        <div className="inv-actions">
          {perms.manage && (
            <button type="button" className={`inv-btn ${editMode ? "primary" : ""}`} aria-pressed={editMode} onClick={() => setEditMode((m) => !m)}>
              {editMode ? "Done editing" : "Edit list"}
            </button>
          )}
          {perms.manage && !editMode && (
            <button type="button" className="inv-btn" onClick={newRound}>
              Start new packing round
            </button>
          )}
        </div>
      </div>

      <div className="inv-tabs" role="tablist">
        {PACKING_SECTIONS.map((s) => {
          const ls = sectionLeaves(s);
          return (
            <button key={s} role="tab" type="button" aria-selected={section === s} onClick={() => setSection(s)}>
              {labels[s]} <span className="inv-count">{ls.filter((r) => r.packed).length}/{ls.length}</span>
            </button>
          );
        })}
      </div>

      {!editMode && leaves.length > 0 && (
        <>
          <div className="inv-progress" role="progressbar" aria-valuemin={0} aria-valuemax={leaves.length} aria-valuenow={packed}>
            <span style={{ width: `${(packed / leaves.length) * 100}%` }} />
          </div>
          <div className="inv-filters">
            <span className="inv-sub">
              {packed} of {plural(leaves.length, "thing")} packed
            </span>
            <label className="inv-check">
              <input type="checkbox" checked={hidePacked} onChange={(e) => setHidePacked(e.target.checked)} /> Hide packed
            </label>
          </div>
        </>
      )}

      {editMode && (
        <div className="inv-filters">
          <button type="button" className="inv-btn primary" onClick={() => setEditing({ rec: null, parentId: "" })}>
            + Add to {labels[section]}
          </button>
          <button type="button" className="inv-btn" onClick={editInfo}>
            Event &amp; season names
          </button>
          {section === "season" && (
            <button type="button" className="inv-btn danger-text" onClick={clearSeason}>
              Delete season entries
            </button>
          )}
        </div>
      )}

      {tree.kids("", section).length === 0 ? (
        <Empty title="Nothing on this list yet">{perms.manage ? "Use “Edit list” to add entries." : ""}</Empty>
      ) : (
        <ul className="inv-tree" role="tree">
          {sortForPacking(tree.kids("", section), tree, editMode).map((r) => (
            <PackNode key={r.id} r={r} tree={tree} depth={1} editMode={editMode} hidePacked={hidePacked} onEdit={(rec, parentId) => setEditing({ rec, parentId })} />
          ))}
        </ul>
      )}

      <Notes />
      {editing && <PackEditor rec={editing.rec} parentId={editing.parentId} section={section} tree={tree} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Packing mode: single items first, then groups; finished things sink to the end. Edit mode: saved order. */
function sortForPacking(list: Row[], tree: Tree, editMode: boolean): Row[] {
  if (editMode) return list;
  const done = (r: Row) => tree.leaves(r.id).every((x) => x.packed);
  const isGroup = (r: Row) => tree.kids(r.id).length > 0;
  return list.slice().sort((a, b) => Number(done(a)) - Number(done(b)) || Number(isGroup(a)) - Number(isGroup(b)));
}

function PackNode(props: { r: Row; tree: Tree; depth: number; editMode: boolean; hidePacked: boolean; onEdit: (rec: Row | null, parentId: string) => void }) {
  const { r, tree, depth, editMode, hidePacked, onEdit } = props;
  const { L, perms, svc, write } = useApp();
  const [open, setOpen] = useState(true);
  const kids = tree.kids(r.id);
  const leaves = tree.leaves(r.id);
  const packedCount = leaves.filter((x) => x.packed).length;
  const allPacked = packedCount === leaves.length;
  if (!editMode && hidePacked && allPacked) return null;
  const link = r.linkTable ? L.get(r.linkTable, r.linkId) : undefined;
  const siblings = tree.kids(r.parentId || "", r.section);

  const toggle = () => {
    if (!perms.pack) return;
    const value = !allPacked;
    void write(() => svc.packingSetPacked(leaves.map((x) => x.id), value), {
      optimistic: { table: "packingItems", rows: leaves.map((x) => ({ ...x, packed: value })) },
    }).catch(reported);
  };
  const move = (dir: -1 | 1) => {
    const i = siblings.findIndex((x) => x.id === r.id);
    const j = i + dir;
    if (j < 0 || j >= siblings.length) return;
    const ids = siblings.map((x) => x.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void write(() => svc.reorder("packingItems", ids)).catch(reported);
  };

  return (
    <li role="treeitem" aria-expanded={kids.length ? open : undefined} className={`inv-pack ${allPacked && !editMode ? "packed" : ""}`}>
      <div className="inv-pack-row">
        {kids.length > 0 && (
          <button type="button" className="inv-icon-btn" aria-label={open ? "Collapse" : "Expand"} onClick={() => setOpen((o) => !o)}>
            {open ? "▾" : "▸"}
          </button>
        )}
        {!editMode ? (
          <label className="inv-check">
            <input
              type="checkbox"
              checked={allPacked}
              ref={(el) => {
                if (el) el.indeterminate = packedCount > 0 && !allPacked;
              }}
              disabled={!perms.pack}
              onChange={toggle}
            />
            <span className="inv-pack-name">{r.name}</span>
          </label>
        ) : (
          <span className="inv-pack-name">{r.name}</span>
        )}
        {kids.length > 0 && (
          <span className="inv-count">
            {packedCount}/{leaves.length}
          </span>
        )}
        {link && <span className="inv-hint">({link.name})</span>}
        {r.note && <span className="inv-hint inv-pack-note">{r.note}</span>}
        {editMode && (
          <span className="inv-pack-tools">
            <button type="button" className="inv-icon-btn" aria-label="Move up" onClick={() => move(-1)}>
              ↑
            </button>
            <button type="button" className="inv-icon-btn" aria-label="Move down" onClick={() => move(1)}>
              ↓
            </button>
            {depth < 4 && (
              <button type="button" className="inv-link" onClick={() => onEdit(null, r.id)}>
                + inside
              </button>
            )}
            <button type="button" className="inv-link" onClick={() => onEdit(r, r.parentId || "")}>
              Edit
            </button>
          </span>
        )}
      </div>
      {kids.length > 0 && open && (
        <ul role="group">
          {sortForPacking(kids, tree, editMode).map((k) => (
            <PackNode key={k.id} r={k} tree={tree} depth={depth + 1} editMode={editMode} hidePacked={hidePacked} onEdit={onEdit} />
          ))}
        </ul>
      )}
    </li>
  );
}

function PackEditor({ rec, parentId, section, tree, onClose }: { rec: Row | null; parentId: string; section: PackingSection; tree: Tree; onClose: () => void }) {
  const { L, svc, write, confirm } = useApp();
  const [name, setName] = useState(rec?.name ?? "");
  const [note, setNote] = useState(rec?.note ?? "");
  const [parent, setParent] = useState(parentId);
  const [linkTable, setLinkTable] = useState<string>(rec?.linkTable ?? "");
  const [linkId, setLinkId] = useState<string>(rec?.linkId ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Possible parents: any entry in this section that isn't this one or inside it (depth is checked on save).
  const banned = new Set<string>();
  if (rec) {
    const walk = (id: string) => {
      banned.add(id);
      tree.kids(id).forEach((k) => walk(k.id));
    };
    walk(rec.id);
  }
  const parents: { value: string; label: string }[] = [];
  const addParents = (id: string, prefix: string) =>
    tree.kids(id, section).forEach((r) => {
      if (banned.has(r.id)) return;
      parents.push({ value: r.id, label: prefix + r.name });
      addParents(r.id, prefix + r.name + " → ");
    });
  addParents("", "");

  const save = async () => {
    const data = { name, note, parentId: parent, section, linkTable, linkId: linkTable ? linkId : "" };
    try {
      if (rec) await write(() => svc.packingUpdate(rec.id, data), { ok: "Saved.", quiet: ["VALIDATION"] });
      else await write(() => svc.packingCreate(data), { ok: "Added.", quiet: ["VALIDATION"] });
      onClose();
    } catch (e) {
      const f = (e as { details?: { fields?: Record<string, string> } }).details?.fields;
      if (f) setErrors(f);
    }
  };

  const del = async () => {
    if (!rec) return;
    const inside = tree.leaves(rec.id).filter((x) => x.id !== rec.id).length;
    const yes = await confirm({ title: `Delete “${rec.name}”?`, message: inside ? `Everything inside it is deleted too.` : "This can’t be undone.", confirmLabel: "Delete", danger: true });
    if (yes) await write(() => svc.packingDelete(rec.id), { ok: "Deleted." }).then(onClose, reported);
  };

  return (
    <Modal
      title={rec ? "Edit entry" : "Add entry"}
      onClose={onClose}
      footer={
        <>
          {rec && (
            <button type="button" className="inv-btn danger-text" onClick={del}>
              Delete
            </button>
          )}
          <span className="inv-spacer" />
          <button type="button" className="inv-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="inv-btn primary" onClick={save}>
            {rec ? "Save" : "Add"}
          </button>
        </>
      }
    >
      <Field label="Name *" error={errors.name}>
        {(id) => <input id={id} type="text" value={name} maxLength={150} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <Field label="Inside" error={errors.parentId} hint="Groups can be nested up to 4 levels.">
        {(id) => <Select id={id} value={parent} empty="(top level)" options={parents} onChange={setParent} />}
      </Field>
      <Field label="Note" error={errors.note}>
        {(id) => <input id={id} type="text" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      <Field label="Linked inventory item" error={errors.linkId} hint="Optional. Shows which part or tool this is.">
        {(id) => (
          <div className="inv-row-inline">
            <Select ariaLabel="Section" value={linkTable} empty="None" options={[{ value: "parts", label: "Parts" }, { value: "tools", label: "Tools" }]} onChange={(v) => (setLinkTable(v), setLinkId(""))} />
            {linkTable && (
              <Select id={id} value={linkId} empty="Pick an item…" options={L.rows(linkTable as "parts" | "tools").sort((a, b) => natural(a.name, b.name)).map((r) => ({ value: r.id, label: r.name }))} onChange={setLinkId} />
            )}
          </div>
        )}
      </Field>
    </Modal>
  );
}

function Notes() {
  const { L, perms, svc, write } = useApp();
  const [text, setText] = useState("");
  const notes = L.tables.packingNotes.slice().sort((a, b) => Number(a.done) - Number(b.done) || String(b.createdAt).localeCompare(String(a.createdAt)));
  return (
    <section className="inv-card inv-notes" aria-label="Notes for next time">
      <h2 className="inv-h2">Notes for next time</h2>
      {perms.pack && (
        <form
          className="inv-inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            void write(() => svc.packingNoteAdd(text)).then(() => setText(""), reported);
          }}
        >
          <input type="text" placeholder="Forgot something? Write it here." aria-label="New note" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} />
          <button type="submit" className="inv-btn">
            Add
          </button>
        </form>
      )}
      {notes.length === 0 ? (
        <div className="inv-hint">No notes.</div>
      ) : (
        <ul className="inv-notes-list">
          {notes.map((n) => (
            <li key={n.id} className={n.done ? "done" : ""}>
              <label className="inv-check">
                <input
                  type="checkbox"
                  checked={n.done}
                  disabled={!perms.pack}
                  onChange={() => void write(() => svc.packingNoteSet(n.id, !n.done), { optimistic: { table: "packingNotes", rows: [{ ...n, done: !n.done }] } }).catch(reported)}
                />
                {n.text}
              </label>
              {perms.manage && (
                <button type="button" className="inv-icon-btn" aria-label="Delete note" onClick={() => void write(() => svc.packingNoteDelete(n.id)).catch(reported)}>
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
