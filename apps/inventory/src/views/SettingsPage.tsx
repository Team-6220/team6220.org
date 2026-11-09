// Settings: categories, tags, locations, suppliers, dropdown lists, saved filters, archive. Ported from JsSettings.html.
// Renaming updates every item instantly (items store IDs). Removing something that is in use asks first.
import { useState, type ReactNode } from "react";
import { INVENTORY_SECTIONS, InventoryError, LIST_KEYS, TABLES, type ListKey, type Row, type TableKey } from "@team6220/data/inventory";
import { reported, useApp } from "../context.tsx";
import { plural, timeAgo } from "../lib/lookup.ts";
import { SECTIONS } from "../sections.ts";
import { Empty, Select } from "../ui.tsx";

type Tab = "categories" | "tags" | "locations" | "suppliers" | "lists" | "collections" | "archive";
const TABS: { id: Tab; label: string }[] = [
  { id: "categories", label: "Categories" },
  { id: "tags", label: "Tags" },
  { id: "locations", label: "Locations" },
  { id: "suppliers", label: "Suppliers" },
  { id: "lists", label: "Dropdown lists" },
  { id: "collections", label: "Saved filters" },
  { id: "archive", label: "Archive" },
];

const TABLE_NOUNS: Partial<Record<TableKey, string>> = {
  parts: "part", rawMaterials: "raw material", tools: "tool", fasteners: "fastener", wire: "wire", tags: "tag",
  collections: "saved filter", categories: "category", locations: "location", packingItems: "packing entry", production: "production job",
};

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>("categories");
  const { perms } = useApp();
  return (
    <div className="inv-page">
      <div className="inv-page-head">
        <div>
          <h1>Settings</h1>
          <div className="inv-sub">{perms.manage ? "Changes apply to every item right away." : "Only Inventory Managers can change settings."}</div>
        </div>
      </div>
      <div className="inv-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "categories" && <SimpleList table="categories" noun="category" />}
      {tab === "tags" && <TagsTab />}
      {tab === "locations" && <LocationsTab />}
      {tab === "suppliers" && <SimpleList table="suppliers" noun="supplier" />}
      {tab === "lists" && <ListsTab />}
      {tab === "collections" && <SimpleList table="collections" noun="saved filter" noAdd hint="Save filters from the Parts page (Saved → Save current filters)." />}
      {tab === "archive" && <ArchiveTab />}
    </div>
  );
}

/** Shared actions for one settings row: rename, move up/down, remove (asking first if it's in use). */
function useSettingActions(table: TableKey) {
  const { svc, write, confirm } = useApp();
  const field = table === "lists" ? "value" : "name";
  return {
    async rename(r: Row) {
      const v = window.prompt("New name:", r[field]);
      if (v === null || v.trim() === r[field]) return;
      await write(() => svc.update(table, r.id, { [field]: v }), { ok: "Renamed." }).catch(reported);
    },
    async move(group: Row[], r: Row, dir: -1 | 1) {
      const i = group.findIndex((x) => x.id === r.id);
      const j = i + dir;
      if (j < 0 || j >= group.length) return;
      const ids = group.map((x) => x.id);
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await write(() => svc.reorder(table, ids)).catch(reported);
    },
    async remove(r: Row) {
      try {
        await write(() => svc.removeSetting(table, r.id, false), { ok: "Removed.", quiet: ["IN_USE"] });
      } catch (e) {
        if (!(e instanceof InventoryError && e.code === "IN_USE")) return;
        const d = e.details as { counts: Record<string, number>; childCount: number };
        const uses = Object.entries(d.counts).map(([k, n]) => plural(n, TABLE_NOUNS[k as TableKey] ?? k));
        if (d.childCount) uses.unshift(plural(d.childCount, "container"));
        const yes = await confirm({
          title: `Remove “${r[field]}”?`,
          message: `It is used by ${uses.join(", ")}. Removing it clears it from all of them${d.childCount ? " and removes the containers inside it" : ""}.`,
          confirmLabel: "Remove it",
          danger: true,
        });
        if (yes) await write(() => svc.removeSetting(table, r.id, true), { ok: "Removed." }).catch(reported);
      }
    },
  };
}

function SettingRow({ table, r, group, label, extra }: { table: TableKey; r: Row; group: Row[]; label?: string; extra?: ReactNode }) {
  const { perms } = useApp();
  const a = useSettingActions(table);
  const field = table === "lists" ? "value" : "name";
  return (
    <li className="inv-row static">
      <div className="inv-row-main">
        <span className="inv-row-title">{label ?? r[field]}</span>
      </div>
      {extra}
      {perms.manage && (
        <span className="inv-pack-tools">
          <button type="button" className="inv-icon-btn" aria-label={`Move ${r[field]} up`} onClick={() => void a.move(group, r, -1)}>
            ↑
          </button>
          <button type="button" className="inv-icon-btn" aria-label={`Move ${r[field]} down`} onClick={() => void a.move(group, r, 1)}>
            ↓
          </button>
          <button type="button" className="inv-link" onClick={() => void a.rename(r)}>
            Rename
          </button>
          <button type="button" className="inv-link danger-text" onClick={() => void a.remove(r)}>
            Remove
          </button>
        </span>
      )}
    </li>
  );
}

function AddForm({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => Promise<unknown> }) {
  const [v, setV] = useState("");
  const { perms } = useApp();
  if (!perms.manage) return null;
  return (
    <form
      className="inv-inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.trim()) return;
        void onAdd(v).then(() => setV(""), reported);
      }}
    >
      <input type="text" value={v} placeholder={placeholder} aria-label={placeholder} maxLength={80} onChange={(e) => setV(e.target.value)} />
      <button type="submit" className="inv-btn">
        Add
      </button>
    </form>
  );
}

function SimpleList({ table, noun, noAdd, hint }: { table: TableKey; noun: string; noAdd?: boolean; hint?: string }) {
  const { L, svc, write } = useApp();
  const rows = L.sorted(table);
  return (
    <div className="inv-card">
      {hint && <p className="inv-hint">{hint}</p>}
      {!noAdd && <AddForm placeholder={`New ${noun}`} onAdd={(name) => write(() => svc.create(table, { name }), { ok: "Added." })} />}
      {rows.length === 0 ? (
        <Empty title={`No ${noun}s yet`} />
      ) : (
        <ul className="inv-list">
          {rows.map((r) => (
            <SettingRow key={r.id} table={table} r={r} group={rows} label={table === "collections" ? `${r.name} (${SECTIONS[r.section as keyof typeof SECTIONS]?.title ?? r.section})` : undefined} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TagsTab() {
  const { L, svc, write, perms } = useApp();
  const [group, setGroup] = useState("");
  const all = L.sorted("tags");
  const cats = L.sorted("categories");
  const groups = [...cats.map((c) => ({ id: c.id, name: c.name })), { id: "", name: "No group (mechanisms, projects…)" }];
  return (
    <div className="inv-card">
      {perms.manage && (
        <div className="inv-row-inline">
          <Select ariaLabel="Group for the new tag" value={group} empty="No group" options={cats.map((c) => ({ value: c.id, label: c.name }))} onChange={setGroup} />
          <AddForm placeholder="New tag" onAdd={(name) => write(() => svc.create("tags", { name, categoryId: group }), { ok: "Tag added." })} />
        </div>
      )}
      {groups.map((g) => {
        const tags = all.filter((t) => (t.categoryId || "") === g.id);
        if (!tags.length) return null;
        return (
          <div key={g.id || "none"}>
            <h3 className="inv-h3">{g.name}</h3>
            <ul className="inv-list">
              {tags.map((t) => (
                <SettingRow
                  key={t.id}
                  table="tags"
                  r={t}
                  group={tags}
                  extra={
                    perms.manage && (
                      <Select
                        ariaLabel={`Group for ${t.name}`}
                        value={t.categoryId || ""}
                        empty="No group"
                        options={cats.map((c) => ({ value: c.id, label: c.name }))}
                        onChange={(v) => void write(() => svc.update("tags", t.id, { categoryId: v })).catch(reported)}
                      />
                    )
                  }
                />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function LocationsTab() {
  const { L, svc, write, perms } = useApp();
  const tree = L.locationTree();
  const areas = tree.map((n) => n.area);
  return (
    <div className="inv-card">
      <p className="inv-hint">Two levels: an area (Shop, Pit cart) and the containers in it (Drawer A, Spares bin).</p>
      <AddForm placeholder="New area" onAdd={(name) => write(() => svc.create("locations", { name }), { ok: "Area added." })} />
      {tree.length === 0 && <Empty title="No locations yet" />}
      {tree.map((n) => (
        <div key={n.area.id} className="inv-loc-area">
          <ul className="inv-list">
            <SettingRow table="locations" r={n.area} group={areas} label={`${n.area.name}${n.children.length ? ` (${plural(n.children.length, "container")})` : ""}`} />
          </ul>
          <ul className="inv-list inv-indent">
            {n.children.map((c) => (
              <SettingRow key={c.id} table="locations" r={c} group={n.children} />
            ))}
          </ul>
          {perms.manage && (
            <div className="inv-indent">
              <AddForm placeholder={`New container in ${n.area.name}`} onAdd={(name) => write(() => svc.create("locations", { name, parentId: n.area.id }), { ok: "Container added." })} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ListsTab() {
  const { L, svc, write } = useApp();
  const [key, setKey] = useState<ListKey>("materialType");
  const rows = L.listOptions(key);
  return (
    <div className="inv-card">
      <label className="inv-sort">
        List
        <Select value={key} options={(Object.keys(LIST_KEYS) as ListKey[]).map((k) => ({ value: k, label: LIST_KEYS[k] }))} onChange={(v) => setKey(v as ListKey)} />
      </label>
      <AddForm placeholder={`New value for ${LIST_KEYS[key].toLowerCase()}`} onAdd={(value) => write(() => svc.create("lists", { listKey: key, value }), { ok: "Added." })} />
      {rows.length === 0 ? (
        <Empty title="This list is empty" />
      ) : (
        <ul className="inv-list">
          {rows.map((r) => (
            <SettingRow key={r.id} table="lists" r={r} group={rows} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ArchiveTab() {
  const { L, svc, write, confirm, perms } = useApp();
  const archived = INVENTORY_SECTIONS.flatMap((k) => L.tables[k].filter((r) => r.archivedAt).map((r) => ({ k, r }))).sort((a, b) =>
    String(b.r.archivedAt).localeCompare(String(a.r.archivedAt)),
  );
  return (
    <div className="inv-card">
      <p className="inv-hint">
        Archived items are hidden from the lists. Restore one to bring it back. The old app deleted archived items after 30 days automatically;
        here an Inventory Manager deletes them.
      </p>
      {archived.length === 0 ? (
        <Empty title="The archive is empty" />
      ) : (
        <ul className="inv-list">
          {archived.map(({ k, r }) => (
            <li key={r.id} className="inv-row static">
              <div className="inv-row-main">
                <span className="inv-row-title">{SECTIONS[k].primary(r, L) || r.id}</span>
                <span className="inv-row-meta">
                  {TABLES[k].label} · archived {timeAgo(r.archivedAt)}
                </span>
              </div>
              {perms.manage && (
                <span className="inv-pack-tools">
                  <button type="button" className="inv-link" onClick={() => void write(() => svc.restore(k, r.id), { ok: "Restored." }).catch(reported)}>
                    Restore
                  </button>
                  <button
                    type="button"
                    className="inv-link danger-text"
                    onClick={async () => {
                      const yes = await confirm({ title: "Delete permanently?", message: "This can’t be undone.", confirmLabel: "Delete", danger: true });
                      if (yes) await write(() => svc.deletePermanently(k, r.id), { ok: "Deleted." }).catch(reported);
                    }}
                  >
                    Delete forever
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

