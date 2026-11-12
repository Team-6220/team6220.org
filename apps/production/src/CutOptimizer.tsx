// Manufacturing > Cut optimizer: the planner's engine on its own. Type stock and parts, get a layout and a cut list.
// Nothing is saved and Inventory isn't touched, so it is for quick questions ("will these fit on one sheet?").
import { useState, type ClipboardEvent } from "react";
import { formatInches, planLinear, planSheets, rect, stockExtra, roundUpToEighth, type LinearPlan, type SheetPlan, type Stock } from "@team6220/cut-engine";
import { PieceDrawing } from "./PieceDrawing";

type Mode = "sheets" | "tubes";
type Row = Record<string, string>;

const EXTRAS: { label: string; value: number }[] = [
  { label: "No extra (exact sizes)", value: 0 },
  { label: 'Hand cut: +1/4"', value: stockExtra("handmade", 0) },
  { label: 'Shapeoko, thin stock: +1"', value: stockExtra("shapeoko", 0.125) },
  { label: 'Shapeoko, 1/4" and thicker: +3/4"', value: stockExtra("shapeoko", 0.25) },
];

/** An editable table of rows. Pasting rows copied from a spreadsheet (Ctrl+V on the table) fills it in. */
function Rows({ columns, rows, onChange, blank }: { columns: [string, string][]; rows: Row[]; onChange: (rows: Row[]) => void; blank: Row }) {
  function paste(event: ClipboardEvent) {
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (!text.includes("\t") && !text.includes("\n")) return; // one cell: let the field take it
    event.preventDefault();
    const pasted = text.split(/\r?\n/).filter((l) => l.trim()).map((line) => {
      const cells = line.split("\t");
      return Object.fromEntries(columns.map(([key], i) => [key, (cells[i] ?? "").trim()]));
    });
    onChange([...rows.filter((r) => Object.values(r).some((v) => v && v !== blank.quantity)), ...pasted]);
  }
  return (
    <>
      <table className="t-table prod__rows" onPaste={paste}>
        <thead>
          <tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}<th aria-label="Remove" /></tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map(([key, label]) => (
                <td key={key}>
                  <input aria-label={`${label} ${i + 1}`} value={row[key] ?? ""} inputMode={key === "name" ? undefined : "decimal"}
                    onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, [key]: e.target.value } : r)))} />
                </td>
              ))}
              <td>
                <button type="button" className="t-button t-button--quiet" aria-label="Remove row" onClick={() => onChange(rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ ...blank }])}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="t-button t-button--quiet" onClick={() => onChange([...rows, { ...blank }])}>Add a row</button>
      <p className="t-hint">Tip: copy rows from a spreadsheet and press Ctrl+V on this table.</p>
    </>
  );
}

const num = (v: string | undefined) => Number(String(v ?? "").replace(/[",\s]|in$/g, ""));
const count = (v: string | undefined) => Math.max(0, Math.min(200, Math.floor(num(v)) || 0));

export function CutOptimizer() {
  const [mode, setMode] = useState<Mode>("sheets");
  const [sheetStock, setSheetStock] = useState<Row[]>([{ length: "48", width: "24", quantity: "1" }]);
  const [sheetParts, setSheetParts] = useState<Row[]>([{ name: "", length: "", width: "", quantity: "1" }]);
  const [extra, setExtra] = useState(0);
  const [tubeStock, setTubeStock] = useState<Row[]>([{ length: "72", quantity: "2" }]);
  const [tubeParts, setTubeParts] = useState<Row[]>([{ name: "", length: "", quantity: "1" }]);
  const [kerf, setKerf] = useState("0.125");
  const [sheetPlan, setSheetPlan] = useState<SheetPlan | null>(null);
  const [tubePlan, setTubePlan] = useState<LinearPlan | null>(null);

  function planTheSheets() {
    const stocks: Stock[] = sheetStock.flatMap((r, i) =>
      Array.from({ length: count(r.quantity) }, (_, copy) => ({ id: `${formatInches(num(r.length))} × ${formatInches(num(r.width))} #${i + 1}`, copy, points: rect(0, 0, num(r.length), num(r.width)) })),
    ).filter((s) => s.points[2][0] > 0 && s.points[2][1] > 0);
    const parts = sheetParts.flatMap((r, i) =>
      Array.from({ length: count(r.quantity) }, (_, c) => ({
        key: `${i}#${c}`,
        name: `${r.name || `Part ${i + 1}`}${count(r.quantity) > 1 ? ` ${c + 1}` : ""}`,
        w: roundUpToEighth(Math.max(num(r.length), num(r.width)) + extra),
        h: roundUpToEighth(Math.min(num(r.length), num(r.width)) + extra),
      })).filter((p) => num(r.length) > 0 && num(r.width) > 0),
    );
    setSheetPlan(planSheets(stocks, parts));
  }

  function planTheTubes() {
    setTubePlan(
      planLinear(
        tubeStock.map((r, i) => ({ id: `${formatInches(num(r.length))} #${i + 1}`, length: num(r.length), quantity: count(r.quantity) })).filter((s) => s.length > 0),
        tubeParts.flatMap((r, i) =>
          Array.from({ length: count(r.quantity) }, (_, c) => ({ key: `${i}#${c}`, name: `${r.name || `Cut ${i + 1}`}${count(r.quantity) > 1 ? ` ${c + 1}` : ""}`, length: num(r.length) })).filter((p) => p.length > 0),
        ),
        { kerf: num(kerf) || 0 },
      ),
    );
  }

  const usedSheets = sheetPlan ? [...new Set(sheetPlan.placed.map((p) => p.stock))] : [];
  const sheetUse = sheetPlan && usedSheets.length
    ? Math.round((sheetPlan.placed.reduce((s, p) => s + p.part.w * p.part.h, 0) / usedSheets.reduce((s, st) => s + st.points[2][0] * st.points[2][1], 0)) * 100)
    : 0;

  return (
    <div className="prod__planner">
      <section className="t-panel prod__no-print">
        <h2>Cut optimizer</h2>
        <p className="t-muted">Type the stock you have and the parts you need. Nothing is saved and Inventory isn't changed.</p>
        <div className="prod__buttons" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "sheets"} className={mode === "sheets" ? "t-button" : "t-button t-button--quiet"} onClick={() => setMode("sheets")}>Sheets and plates</button>
          <button type="button" role="tab" aria-selected={mode === "tubes"} className={mode === "tubes" ? "t-button" : "t-button t-button--quiet"} onClick={() => setMode("tubes")}>Tube and shaft</button>
        </div>

        {mode === "sheets" ? (
          <>
            <h3>Stock sheets</h3>
            <Rows columns={[["length", "Length (in)"], ["width", "Width (in)"], ["quantity", "How many"]]} rows={sheetStock} onChange={setSheetStock} blank={{ length: "", width: "", quantity: "1" }} />
            <h3>Parts</h3>
            <Rows columns={[["name", "Name"], ["length", "Length (in)"], ["width", "Width (in)"], ["quantity", "Qty"]]} rows={sheetParts} onChange={setSheetParts} blank={{ name: "", length: "", width: "", quantity: "1" }} />
            <label className="t-field prod__narrow">
              Extra stock around each part
              <select value={extra} onChange={(e) => setExtra(Number(e.target.value))}>
                {EXTRAS.map((x) => <option key={x.label} value={x.value}>{x.label}</option>)}
              </select>
            </label>
            <button type="button" className="t-button" onClick={planTheSheets}>Lay out the parts</button>
          </>
        ) : (
          <>
            <h3>Stock lengths</h3>
            <Rows columns={[["length", "Length (in)"], ["quantity", "How many"]]} rows={tubeStock} onChange={setTubeStock} blank={{ length: "", quantity: "1" }} />
            <h3>Cuts</h3>
            <Rows columns={[["name", "Name"], ["length", "Length (in)"], ["quantity", "Qty"]]} rows={tubeParts} onChange={setTubeParts} blank={{ name: "", length: "", quantity: "1" }} />
            <label className="t-field prod__narrow">
              Saw blade width (in)
              <input value={kerf} onChange={(e) => setKerf(e.target.value)} inputMode="decimal" />
            </label>
            <button type="button" className="t-button" onClick={planTheTubes}>Plan the cuts</button>
          </>
        )}
      </section>

      {mode === "sheets" && sheetPlan && (
        <section className="t-panel prod__results">
          <h2>{sheetPlan.placed.length} parts on {usedSheets.length} sheet{usedSheets.length === 1 ? "" : "s"} ({sheetUse}% of those sheets used)</h2>
          {sheetPlan.unplaced.length > 0 && <p className="t-status t-status--warn">Didn't fit: {sheetPlan.unplaced.map((p) => p.name).join(", ")}.</p>}
          <div className="prod__pieces">
            {usedSheets.map((stock) => (
              <PieceDrawing key={`${stock.id}-${stock.copy}`} points={stock.points} title={`${stock.id.replace(/ #\d+$/, "")} sheet ${stock.copy + 1}`}
                parts={sheetPlan.placed.filter((p) => p.stock === stock).map((p) => ({ placement: p.placement, label: p.part.name, kind: "new" }))} />
            ))}
          </div>
          <button type="button" className="t-button t-button--quiet prod__no-print" onClick={() => window.print()}>Print</button>
        </section>
      )}

      {mode === "tubes" && tubePlan && (
        <section className="t-panel prod__results">
          <h2>
            {tubePlan.bars.length} length{tubePlan.bars.length === 1 ? "" : "s"} used, {tubePlan.used ? Math.round((tubePlan.parts / tubePlan.used) * 100) : 0}% of it ends up in parts
          </h2>
          {tubePlan.unplaced.length > 0 && <p className="t-status t-status--warn">Longer than any stock, or not enough stock: {tubePlan.unplaced.map((p) => p.name).join(", ")}.</p>}
          {tubePlan.bars.map((bar, i) => (
            <figure key={i} className="prod__bar">
              <figcaption>{bar.stock.id.replace(/ #\d+$/, "")} length {i + 1}: leftover {formatInches(bar.leftover)}</figcaption>
              <svg viewBox={`0 0 ${bar.stock.length} 3`} preserveAspectRatio="none" role="img" aria-label={`Bar ${i + 1}`}>
                <rect x={0} y={0.5} width={bar.stock.length} height={2} className="prod__piece-stock" />
                {bar.cuts.map((c, j) => <rect key={j} x={c.at} y={0.5} width={c.part.length} height={2} className="prod__bar-cut" />)}
              </svg>
              <ol className="prod__bar-list">
                {bar.cuts.map((c, j) => <li key={j}>{c.part.name}: {formatInches(c.part.length)}, starting at {formatInches(c.at)} from the end</li>)}
              </ol>
            </figure>
          ))}
          <button type="button" className="t-button t-button--quiet prod__no-print" onClick={() => window.print()}>Print</button>
        </section>
      )}
    </div>
  );
}
