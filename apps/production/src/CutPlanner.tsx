// Manufacturing > Cut planner: works out which Inventory stock each part is cut from, and reserves those spots.
// The geometry is @team6220/cut-engine; the stock and the reservations are Inventory's (cutting in @team6220/data).
import { useEffect, useMemo, useState } from "react";
import { cutting, production, type CutPlan, type Me, type Part } from "@team6220/data";
import { formatInches, type CutMethod } from "@team6220/cut-engine";
import { PieceDrawing } from "./PieceDrawing";

type Loaded = Awaited<ReturnType<typeof cutting.load>>;

interface CutPlannerProps {
  me: Me;
  /** Every part in Production (the planner offers the ones that still need stock). */
  parts: Part[];
  /** Runs a change, shows its message and reloads. */
  run: (change: () => Promise<string | void>) => Promise<void>;
}

/** A part typed straight into the planner. It becomes a Production request when the spots are reserved. */
interface TypedPart {
  name: string;
  length: string;
  width: string;
  quantity: string;
}

const EMPTY_ROW: TypedPart = { name: "", length: "", width: "", quantity: "1" };

/** "1/4\"", "0.25", "6mm" -> inches, or null when the text isn't a size. */
function thicknessInches(text: string): number | null {
  const s = text.trim().toLowerCase().replace(/["″]|in(ch(es)?)?$/g, "").trim();
  const mm = s.match(/^(\d+(?:\.\d+)?)\s*mm$/);
  if (mm) return Number(mm[1]) / 25.4;
  const mixed = s.match(/^(?:(\d+)[\s-]+)?(\d+)\s*\/\s*(\d+)$/);
  if (mixed) return Number(mixed[1] ?? 0) + Number(mixed[2]) / Number(mixed[3]);
  return /^\d*\.?\d+$/.test(s) ? Number(s) : null;
}

/** Parts that can be planned here: not finished, not planned yet, cut from sheet with a length and width. */
function plannable(part: Part): boolean {
  return (
    (part.status === "pending-setup" || part.status === "ready" || part.status === "handed-back") &&
    (part.method === "handmade" || part.method === "shapeoko") &&
    part.length > 0 &&
    part.width > 0 &&
    !production.isPlanned(part)
  );
}

export function CutPlanner({ me, parts, run }: CutPlannerProps) {
  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [thickness, setThickness] = useState(0);
  const [method, setMethod] = useState<CutMethod>("shapeoko");
  const [chosen, setChosen] = useState<string[]>([]);
  const [typed, setTyped] = useState<TypedPart[]>([{ ...EMPTY_ROW }]);
  const [plan, setPlan] = useState<CutPlan | null>(null);

  const reload = () =>
    cutting.load().then(
      (loaded) => {
        setData(loaded);
        setMaterialId((m) => m || loaded.materials[0]?.id || "");
      },
      (err) => setLoadError(err instanceof Error ? err.message : "Inventory's stock couldn't be loaded."),
    );
  useEffect(() => void reload(), []);

  const material = data?.materials.find((m) => m.id === materialId);
  useEffect(() => setThickness(material?.thicknesses[0] ?? 0), [materialId, data === null]);
  useEffect(() => setPlan(null), [materialId, thickness, method, chosen.join(), JSON.stringify(typed)]);

  // Offer only parts of the chosen thickness. Parts with a different thickness are listed too, but can't be ticked.
  const thicknessOf = (p: Part) => thicknessInches(p.thickness);
  const sameThickness = (p: Part) => thicknessOf(p) === null || Math.abs((thicknessOf(p) ?? 0) - thickness) < 0.01;
  const candidates = parts.filter(plannable).filter(sameThickness);
  const otherThickness = parts.filter(plannable).filter((p) => !sameThickness(p));
  /** Everything to plan, one entry per physical copy. */
  const toPlan = useMemo(() => {
    const fromTracker = candidates
      .filter((p) => chosen.includes(p._id))
      .flatMap((p) => Array.from({ length: p.quantity }, (_, i) => ({ key: `${p._id}#${i}`, name: `${production.partLabel(p)} ${p.partName}${p.quantity > 1 ? ` (${i + 1}/${p.quantity})` : ""}`, length: p.length, width: p.width })));
    const fromTyped = typed.flatMap((row, r) => {
      const length = Number(row.length), width = Number(row.width), qty = Math.floor(Number(row.quantity));
      if (!row.name.trim() || !(length > 0) || !(width > 0) || !(qty >= 1)) return [];
      return Array.from({ length: Math.min(qty, 50) }, (_, i) => ({ key: `typed${r}#${i}`, name: `${row.name.trim()}${qty > 1 ? ` (${i + 1}/${qty})` : ""}`, length, width }));
    });
    return [...fromTracker, ...fromTyped];
  }, [chosen.join(), JSON.stringify(typed), parts]);

  if (loadError) return <p className="t-status t-status--error">{loadError}</p>;
  if (!data) return <p className="t-muted">Loading Inventory's stock…</p>;
  if (!data.materials.length) return <p className="t-muted">Inventory has no raw stock with a size yet. Add sheets under Inventory → Raw Materials.</p>;

  const choice = { materialTypeId: materialId, thicknessIn: thickness, method };
  const stockLabel = `${material?.name ?? ""}, ${formatInches(thickness)}`;

  /** Saves the plan: typed parts become Production requests, every placed part gets its reserved spots. */
  const reserve = (current: CutPlan) =>
    run(async () => {
      const typedNames = typed.filter((row) => current.placed.some((p) => p.part.key.startsWith(`typed${typed.indexOf(row)}#`)));
      const created = await production.requestParts(
        typedNames.map((row) => ({
          partName: row.name.trim(), projectId: "", taskId: "", cadLink: "", fileLinks: "", material: material?.name ?? "", thickness: formatInches(thickness),
          length: Number(row.length), width: Number(row.width), quantity: Math.floor(Number(row.quantity)), method, accuracy: "", priority: "normal", dueDate: "", details: "Added in the cut planner.",
        })),
        me,
      );
      const jobs = await cutting.reserve(current, choice);
      // Which Production part each placed copy belongs to.
      const partIdOf = (key: string) => {
        if (!key.startsWith("typed")) return key.split("#")[0];
        const row = Number(key.slice(5).split("#")[0]);
        return created[typedNames.indexOf(typed[row])]?._id;
      };
      const byPart = new Map<string, string[]>();
      for (const [key, jobId] of jobs) {
        const id = partIdOf(key);
        if (id) byPart.set(id, [...(byPart.get(id) ?? []), jobId]);
      }
      await production.rememberCutJobs([...byPart].map(([partId, jobIds]) => ({ partId, jobIds, stock: stockLabel })), me);
      setChosen([]);
      setTyped([{ ...EMPTY_ROW }]);
      setPlan(null);
      await reload();
      return `Reserved ${jobs.size} spot${jobs.size === 1 ? "" : "s"} on ${stockLabel}. The parts show their stock in the tracker; Confirm cut updates Inventory.`;
    });

  // The pieces this plan uses, with what is already reserved on them and what this plan adds.
  const used = plan
    ? [...new Map(plan.placed.map((p) => [`${p.stock.id}#${p.stock.copy}`, p.stock])).values()].map((stock) => ({
        stock,
        parts: [
          ...data.reserved.filter((r) => r.pieceId === stock.id && r.copy === stock.copy).map((r) => ({ placement: r.placement, label: r.partName, kind: "reserved" as const })),
          ...plan.placed.filter((p) => p.stock === stock).map((p) => ({ placement: p.placement, label: p.part.name, kind: "new" as const })),
        ],
      }))
    : [];

  return (
    <div className="prod__planner">
      <section className="t-panel prod__no-print">
        <h2>Cut planner</h2>
        <p className="t-muted">
          Picks the Inventory stock that wastes the least: offcuts before full sheets, and pieces already being cut before new ones.
          Adds {method === "handmade" ? '1/4"' : thickness >= 0.25 ? '3/4"' : '1"'} of extra stock around each part ({method === "handmade" ? "handmade" : "Shapeoko"} rule).
        </p>
        <div className="prod__fields">
          <label className="t-field">
            Material
            <select value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
              {data.materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label className="t-field">
            Thickness
            <select value={thickness} onChange={(e) => setThickness(Number(e.target.value))}>
              {material?.thicknesses.map((t) => <option key={t} value={t}>{formatInches(t)}</option>)}
            </select>
          </label>
          <label className="t-field">
            Cut by
            <select value={method} onChange={(e) => setMethod(e.target.value as CutMethod)}>
              <option value="shapeoko">Shapeoko (CNC)</option>
              <option value="handmade">Hand (bandsaw, chop saw)</option>
            </select>
          </label>
        </div>

        <h3>Parts from the tracker</h3>
        {candidates.length === 0 ? (
          <p className="t-muted">No requested parts need sheet stock right now. Add parts by hand below.</p>
        ) : (
          <ul className="prod__choose">
            {candidates.map((p) => (
              <li key={p._id}>
                <label>
                  <input type="checkbox" checked={chosen.includes(p._id)} onChange={() => setChosen(chosen.includes(p._id) ? chosen.filter((id) => id !== p._id) : [...chosen, p._id])} />{" "}
                  <strong>{production.partLabel(p)}</strong> {p.partName} · {p.quantity} × {formatInches(p.length)} × {formatInches(p.width)} · {p.material} {p.thickness}
                </label>
              </li>
            ))}
          </ul>
        )}

        {otherThickness.length > 0 && (
          <p className="t-hint">
            Not shown because they need a different thickness: {otherThickness.map((p) => `${production.partLabel(p)} ${p.partName} (${p.thickness})`).join(", ")}.
          </p>
        )}

        <h3>Parts typed here</h3>
        <p className="t-hint">These become Production requests when you reserve the spots.</p>
        <table className="t-table prod__rows">
          <thead>
            <tr><th>Name</th><th>Length (in)</th><th>Width (in)</th><th>Qty</th><th aria-label="Remove" /></tr>
          </thead>
          <tbody>
            {typed.map((row, i) => (
              <tr key={i}>
                {(["name", "length", "width", "quantity"] as const).map((field) => (
                  <td key={field}>
                    <input aria-label={`${field} ${i + 1}`} value={row[field]} inputMode={field === "name" ? undefined : "decimal"}
                      onChange={(e) => setTyped(typed.map((r, j) => (j === i ? { ...r, [field]: e.target.value } : r)))} />
                  </td>
                ))}
                <td>
                  <button type="button" className="t-button t-button--quiet" aria-label="Remove row" onClick={() => setTyped(typed.length > 1 ? typed.filter((_, j) => j !== i) : [{ ...EMPTY_ROW }])}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="prod__buttons">
          <button type="button" className="t-button t-button--quiet" onClick={() => setTyped([...typed, { ...EMPTY_ROW }])}>Add a row</button>
          <button type="button" className="t-button" disabled={!toPlan.length || !thickness} onClick={() => setPlan(cutting.plan(data, { ...choice, parts: toPlan }))}>
            Plan {toPlan.length || ""} part{toPlan.length === 1 ? "" : "s"}
          </button>
        </div>
      </section>

      {plan && (
        <section className="t-panel prod__results">
          <h2>
            Plan: {plan.placed.length} of {plan.placed.length + plan.unplaced.length} parts on {used.length} piece{used.length === 1 ? "" : "s"} of {stockLabel}
          </h2>
          {plan.unplaced.length > 0 && (
            <p className="t-status t-status--warn">
              No stock big enough for: {plan.unplaced.map((p) => p.name).join(", ")}.{" "}
              <a href={`/apps/bom?add=${encodeURIComponent(`${material?.name ?? "Stock"} ${formatInches(thickness)} sheet`)}&qty=1`}>Add stock to the BOM</a>
            </p>
          )}
          <div className="prod__pieces">
            {used.map(({ stock, parts: drawn }) => (
              <PieceDrawing key={`${stock.id}#${stock.copy}`} points={stock.points} parts={drawn}
                title={`${stock.piece.description || "Stock piece"}${stock.piece.quantity > 1 ? ` (sheet ${stock.copy + 1} of ${stock.piece.quantity})` : ""}`} />
            ))}
          </div>
          <table className="t-table prod__cutlist">
            <thead><tr><th>Part</th><th>Finished size</th><th>Cut stock to</th><th>From</th></tr></thead>
            <tbody>
              {plan.placed.map((p) => (
                <tr key={p.part.key}>
                  <td>{p.part.name}</td>
                  <td>{formatInches(p.part.length)} × {formatInches(p.part.width)}</td>
                  <td>{formatInches(p.part.w)} × {formatInches(p.part.h)}</td>
                  <td>{p.stock.piece.description || "Stock piece"}{p.stock.piece.quantity > 1 ? `, sheet ${p.stock.copy + 1}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="prod__buttons prod__no-print">
            <button type="button" className="t-button" disabled={!plan.placed.length || !me.roles.team} onClick={() => reserve(plan)}>
              Reserve these spots
            </button>
            <button type="button" className="t-button t-button--quiet" onClick={() => window.print()}>Print the cut list</button>
          </div>
        </section>
      )}
    </div>
  );
}
