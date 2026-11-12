// /apps/bom: the list of things to buy. Plan: docs/operations/BOM.md.
// This file loads who is looking and which BOM and order are open; OrderView.tsx draws the order.
import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { auth, bom, ops, OpsError, type Bom as BomRecord, type BomOrder, type BomOrderDetail, type OpsViewer, type Project } from "@team6220/data";
import { AppShell, ProjectPicker, type AppShellState } from "@team6220/ui";
import { OrderView } from "./OrderView";

type Message = { tone: "ok" | "error"; text: string } | null;

export default function Bom() {
  const [viewer, setViewer] = useState<OpsViewer | null>(null);
  const [loadError, setLoadError] = useState("");
  const [boms, setBoms] = useState<BomRecord[]>([]);
  const [bomId, setBomId] = useState("");
  const [orders, setOrders] = useState<BomOrder[]>([]);
  const [orderId, setOrderId] = useState("");
  const [detail, setDetail] = useState<BomOrderDetail | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [message, setMessage] = useState<Message>(null);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  // Opened from "Add to BOM" in another app: /apps/bom?add=<item name>&qty=<how many>
  const [toAdd, setToAdd] = useState(() => {
    const query = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    const name = query.get("add") ?? "";
    return name ? { name, quantity: Math.max(1, Math.floor(Number(query.get("qty")) || 1)) } : null;
  });

  // Who is looking, the BOMs and the projects: once, when the page opens.
  useEffect(() => {
    ops.readDemoFromUrl();
    (async () => {
      const who = await ops.getViewer();
      setViewer(who);
      if (who.kind !== "member") return;
      const [allBoms, allProjects] = await Promise.all([bom.listBoms(), ops.listProjects()]);
      setBoms(allBoms);
      setProjects(allProjects);
      setBomId(allBoms.find((b) => b.status === "open")?._id ?? allBoms[0]?._id ?? "");
    })().catch((err) => setLoadError(err instanceof Error ? err.message : "We couldn't load the BOMs."));
  }, []);

  // The orders of the chosen BOM.
  useEffect(() => {
    if (!bomId) return setOrders([]);
    bom.listOrders(bomId).then((list) => {
      setOrders(list);
      setOrderId((current) => (list.some((o) => o._id === current) ? current : (list[list.length - 1]?._id ?? "")));
    });
  }, [bomId]);

  const reloadOrder = useCallback(async () => setDetail(orderId ? await bom.getOrder(orderId) : null), [orderId]);
  useEffect(() => void reloadOrder(), [reloadOrder]);

  /** Runs a change, shows what happened, and reloads the order either way. */
  const run = useCallback(
    async (change: () => Promise<string | void>) => {
      try {
        const text = await change();
        setMessage(text ? { tone: "ok", text } : null);
      } catch (err) {
        setMessage({ tone: "error", text: err instanceof OpsError ? err.message : "That didn't work. Try again." });
      }
      await reloadOrder();
    },
    [reloadOrder],
  );

  const state: AppShellState = loadError ? "error" : !viewer ? "loading" : viewer.kind === "member" ? "ready" : viewer.kind;
  const me = viewer?.kind === "member" ? viewer.me : null;

  return (
    <AppShell
      title="BOM"
      state={state}
      who={me?.name}
      errorMessage={loadError}
      notice={ops.demoNotice()}
      onSignIn={() => void auth.login("/apps/bom")}
    >
      {me && (
        <div className="bom">
          <div className="bom__bar">
            <label className="t-field">
              BOM
              <select value={bomId} onChange={(e) => setBomId(e.target.value)}>
                {boms.length === 0 && <option value="">No BOMs yet</option>}
                {boms.map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            {me.roles.lead && (
              <button
                className="t-button t-button--quiet"
                type="button"
                onClick={() => {
                  const name = window.prompt("Name of the new BOM (for example: 2027 Competition BOM)");
                  if (!name) return;
                  void run(async () => {
                    const created = await bom.saveBom({ name, season: (name.match(/\d{4}/) ?? [""])[0] });
                    setBoms(await bom.listBoms());
                    setBomId(created._id);
                  });
                }}
              >
                New BOM
              </button>
            )}
          </div>

          <nav className="bom__tabs" aria-label="Orders">
            {orders.map((order) => (
              <button key={order._id} type="button" className={order._id === orderId ? "bom__tab bom__tab--on" : "bom__tab"} onClick={() => setOrderId(order._id)}>
                {bom.orderName(order, projects)}
              </button>
            ))}
            {me.roles.lead && bomId && (
              <button type="button" className="bom__tab" onClick={() => setNewOrderOpen(!newOrderOpen)}>
                + New order
              </button>
            )}
          </nav>

          {newOrderOpen && (
            <NewOrder
              projects={projects}
              onCancel={() => setNewOrderOpen(false)}
              onCreate={(make) =>
                run(async () => {
                  const created = await make(bomId);
                  setNewOrderOpen(false);
                  setOrders(await bom.listOrders(bomId));
                  setOrderId(created._id);
                })
              }
            />
          )}

          {message && <p className={`t-status t-status--${message.tone}`} role="status">{message.text}</p>}

          {detail ? (
            <>
              {toAdd && (
                <p className="t-status t-status--warn">
                  To add <strong>{toAdd.quantity} × {toAdd.name}</strong>, press <strong>Add item</strong> under the vendor that sells it.{" "}
                  <button type="button" className="bom__link" onClick={() => setToAdd(null)}>Never mind</button>
                </p>
              )}
              <OrderView detail={detail} me={me} run={run} toAdd={toAdd} onAdded={() => setToAdd(null)} />
              <button className="t-button t-button--quiet" type="button" onClick={() => downloadCsv(detail, bom.orderName(detail.order, projects))}>
                Export this order (CSV, sheet layout)
              </button>
            </>
          ) : (
            <p className="t-muted">{bomId ? "This BOM has no orders yet." : "There are no BOMs yet. A lead can create one."}</p>
          )}
        </div>
      )}
    </AppShell>
  );
}

/** A lead starts an order: plain ("Order 3"), for a project ("Summer Bot 2"), custom-named, or from an old sheet. */
function NewOrder({
  projects,
  onCreate,
  onCancel,
}: {
  projects: Project[];
  onCreate: (make: (bomId: string) => Promise<BomOrder>) => Promise<void>;
  onCancel: () => void;
}) {
  const [projectId, setProjectId] = useState("");
  const [customName, setCustomName] = useState("");
  const [importError, setImportError] = useState("");

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = bom.parseSheetRows(bom.parseCsv(await file.text()));
      const lines = imported.sections.reduce((n, s) => n + s.lines.length, 0);
      const warnings = imported.warnings.length ? `\n\n${imported.warnings.join("\n")}` : "";
      if (!window.confirm(`Import ${lines} lines from ${imported.sections.length} vendors?${warnings}`)) return;
      const name = customName || file.name.replace(/\.csv$/i, "");
      await onCreate((bomId) => bom.importOrder(bomId, name, imported));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "That file couldn't be read.");
    }
  }

  return (
    <section className="t-panel">
      <h3>New order</h3>
      <div className="bom__line-form">
        <ProjectPicker label="Project (optional)" projects={projects} value={projectId} onChange={setProjectId} />
        <label className="t-field">
          Custom name (optional)
          <input value={customName} onChange={(e) => setCustomName(e.target.value)} maxLength={80} placeholder="Leave empty for “Order 3”" />
        </label>
      </div>
      <div className="bom__buttons">
        <button className="t-button" type="button" onClick={() => void onCreate((bomId) => bom.createOrder({ bomId, projectId, customName }))}>
          Create order
        </button>
        <label className="t-button t-button--quiet">
          Import a sheet tab (CSV)
          <input type="file" accept=".csv,text/csv" hidden onChange={importFile} />
        </label>
        <button className="t-button t-button--quiet" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {importError && <p className="t-status t-status--error">{importError}</p>}
    </section>
  );
}

function downloadCsv(detail: BomOrderDetail, name: string) {
  const blob = new Blob([bom.toCsv(bom.orderToSheetRows(detail))], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${name}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}
