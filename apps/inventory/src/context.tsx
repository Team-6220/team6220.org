// App-wide state: the loaded tables, the connected data service, permissions, and helpers for writes,
// confirmations and toasts.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import {
  InventoryError,
  type Changes,
  type InventoryService,
  type MemberSession,
  type PackingMeta,
  type Row,
  type Snapshot,
  type TableKey,
  type Tables,
  type WriteResult,
} from "@team6220/data/inventory";
import { makeLookup, type Lookup } from "./lib/lookup.ts";
import { ConfirmDialog, Toasts, type ConfirmOptions, type Toast } from "./ui.tsx";

/**
 * Who may do what. Team decision (Nov 2026): there is no Inventory Manager role; every approved member
 * (status APPROVED + `Team Member` badge) can view and edit everything, including +/-, items, audits, the
 * packing list and settings. In Phase 1 the real lock is the Wix collection permission "site members";
 * Phase 2 checks the same rule in /api/inventory.
 */
export interface Permissions {
  edit: boolean;
}

export function permissionsFor(session: MemberSession): Permissions {
  return { edit: session.loggedIn && session.approved };
}

export function applyChanges(tables: Tables, packingMeta: PackingMeta, ch: Changes): { tables: Tables; packingMeta: PackingMeta } {
  const next = { ...tables };
  for (const [k, rows] of Object.entries(ch.upserts) as [TableKey, Row[]][]) {
    const m = new Map(next[k].map((r) => [r.id, r]));
    for (const r of rows) m.set(r.id, r);
    next[k] = [...m.values()];
  }
  for (const [k, ids] of Object.entries(ch.removals) as [TableKey, string[]][]) {
    const gone = new Set(ids);
    next[k] = next[k].filter((r) => !gone.has(r.id));
  }
  return { tables: next, packingMeta: ch.packingMeta ?? packingMeta };
}

export interface WriteOptions {
  /** Toast shown on success. */
  ok?: string;
  /** Error codes the caller handles itself (no error toast). */
  quiet?: string[];
  /** Rows to show at once, before the save finishes (put back if it fails). */
  optimistic?: { table: TableKey; rows: Row[] };
}

interface Ctx {
  svc: InventoryService;
  session: MemberSession;
  perms: Permissions;
  L: Lookup;
  packingMeta: PackingMeta;
  demo: boolean;
  saving: number;
  /** Runs a write, applies what it changed, and shows an error toast unless the code is in `quiet`. */
  write<T>(p: () => Promise<WriteResult<T>>, opts?: WriteOptions): Promise<T>;
  replaceSnapshot(s: Snapshot): void;
  confirm(o: ConfirmOptions): Promise<boolean>;
  toast(message: string, type?: Toast["type"]): void;
}

const AppContext = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppContext);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}

export function errorMessage(e: unknown): string {
  if (e instanceof InventoryError) return e.message;
  if (e instanceof Error && /network|fetch/i.test(e.message)) return "Could not reach the server. Check your connection and try again.";
  return "Something went wrong. Please try again.";
}

export function AppProvider(props: { svc: InventoryService; session: MemberSession; initial: Snapshot; demo: boolean; children: ReactNode }) {
  const [data, setData] = useState({ tables: props.initial.tables, packingMeta: props.initial.packingMeta });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<{ o: ConfirmOptions; resolve: (b: boolean) => void } | null>(null);
  const [saving, setSaving] = useState(0);
  const nextToast = useRef(1);

  const toast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = nextToast.current++;
    setToasts((t) => [...t.slice(-3), { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === "error" ? 8000 : 4000);
  }, []);

  const write = useCallback(
    async <T,>(p: () => Promise<WriteResult<T>>, opts: WriteOptions = {}): Promise<T> => {
      setSaving((n) => n + 1);
      let before: Row[] = [];
      if (opts.optimistic) {
        const { table, rows } = opts.optimistic;
        const ids = new Set(rows.map((r) => r.id));
        setData((d) => {
          before = d.tables[table].filter((r) => ids.has(r.id));
          return applyChanges(d.tables, d.packingMeta, { upserts: { [table]: rows }, removals: {} });
        });
      }
      try {
        const r = await p();
        setData((d) => applyChanges(d.tables, d.packingMeta, r.changes));
        if (opts.ok) toast(opts.ok, "ok");
        return r.value;
      } catch (e) {
        if (opts.optimistic && before.length) {
          const { table } = opts.optimistic;
          setData((d) => applyChanges(d.tables, d.packingMeta, { upserts: { [table]: before }, removals: {} }));
        }
        if (!(e instanceof InventoryError && opts.quiet?.includes(e.code))) {
          console.warn(e);
          toast(errorMessage(e), "error");
        }
        throw e;
      } finally {
        setSaving((n) => n - 1);
      }
    },
    [toast],
  );

  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmState({ o, resolve })), []);

  const value = useMemo<Ctx>(
    () => ({
      svc: props.svc,
      session: props.session,
      perms: permissionsFor(props.session),
      L: makeLookup(data.tables),
      packingMeta: data.packingMeta,
      demo: props.demo,
      saving,
      write,
      replaceSnapshot: (s) => setData({ tables: s.tables, packingMeta: s.packingMeta }),
      confirm,
      toast,
    }),
    [props.svc, props.session, props.demo, data, saving, write, confirm, toast],
  );

  return (
    <AppContext.Provider value={value}>
      {props.children}
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
      {confirmState && (
        <ConfirmDialog
          o={confirmState.o}
          onDone={(yes) => {
            confirmState.resolve(yes);
            setConfirmState(null);
          }}
        />
      )}
    </AppContext.Provider>
  );
}

/** Swallows an error that write() already reported with a toast. */
export const reported = () => undefined;
