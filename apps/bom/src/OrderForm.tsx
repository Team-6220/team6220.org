// What the buyer (a Mentor or Booster) fills in after placing a vendor's order: the checklist the team wants
// every buyer to follow, then the date and what was really paid.
import { useState, type FormEvent } from "react";
import { bom, type BomLine, type BomSection } from "@team6220/data";

const CHECKLIST = [
  "The options (size, color, pack count) match each line.",
  "The prices in the cart match the lines that were signed.",
  "The total below is the final amount charged, with tax and shipping.",
];

interface OrderFormProps {
  section: BomSection;
  /** The lines that will be marked ordered (the ones with two signatures). */
  lines: BomLine[];
  onSave: (args: { orderDate: string; finalTotal: number; expectedArrival: string }) => Promise<void>;
  onCancel: () => void;
}

export function OrderForm({ section, lines, onSave, onCancel }: OrderFormProps) {
  const [checked, setChecked] = useState<boolean[]>(CHECKLIST.map(() => false));
  const [orderDate, setOrderDate] = useState(section.orderDate || new Date().toLocaleDateString("en-CA")); // yyyy-mm-dd
  const [finalTotal, setFinalTotal] = useState(section.finalTotal === null ? "" : String(section.finalTotal));
  const [expectedArrival, setExpectedArrival] = useState(section.expectedArrival);
  const [saving, setSaving] = useState(false);
  const ready = checked.every(Boolean) && orderDate !== "" && finalTotal !== "" && Number(finalTotal) >= 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setSaving(true);
    try {
      await onSave({ orderDate, finalTotal: Number(finalTotal), expectedArrival });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="t-panel bom__order-form" onSubmit={submit}>
      <h3>Order from {section.vendor}</h3>
      <p>
        {lines.length} {lines.length === 1 ? "line" : "lines"} with two signatures, {bom.formatMoney(bom.totalCost(lines))} before tax
        and shipping.
      </p>
      <ol className="bom__to-buy">
        {lines.map((line) => (
          <li key={line._id}>
            {line.quantity} × {line.link ? <a href={line.link} target="_blank" rel="noreferrer">{line.name}</a> : line.name}
            {line.vendorPartNumber && ` (${line.vendorPartNumber})`}
          </li>
        ))}
      </ol>
      {CHECKLIST.map((text, i) => (
        <label key={text} className="bom__check">
          <input type="checkbox" checked={checked[i]} onChange={() => setChecked(checked.map((c, j) => (j === i ? !c : c)))} /> {text}
        </label>
      ))}
      <div className="bom__line-form">
        <label className="t-field">
          Order date
          <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} required />
        </label>
        <label className="t-field">
          Final total ($)
          <input type="number" min="0" step="0.01" value={finalTotal} onChange={(e) => setFinalTotal(e.target.value)} required />
        </label>
        <label className="t-field">
          Expected arrival (if known)
          <input type="date" value={expectedArrival} onChange={(e) => setExpectedArrival(e.target.value)} />
        </label>
      </div>
      <div className="bom__buttons">
        <button className="t-button" type="submit" disabled={!ready || saving}>
          Mark ordered
        </button>
        <button className="t-button t-button--quiet" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
