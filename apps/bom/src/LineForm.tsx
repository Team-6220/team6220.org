// The form for adding an item to a vendor section, or changing one.
import { useState, type FormEvent } from "react";
import { bom, type BomLine, type BomLineInput } from "@team6220/data";

interface LineFormProps {
  sectionId: string;
  /** The line being changed, or undefined for a new one. */
  line?: BomLine;
  /** For a new line: the name and quantity another app asked for. */
  prefill?: { name: string; quantity: number };
  onSave: (input: BomLineInput) => Promise<void>;
  onCancel: () => void;
}

export function LineForm({ sectionId, line, prefill, onSave, onCancel }: LineFormProps) {
  const [name, setName] = useState(line?.name ?? prefill?.name ?? "");
  const [link, setLink] = useState(line?.link ?? "");
  const [vendorPartNumber, setPartNumber] = useState(line?.vendorPartNumber ?? "");
  const [unitCost, setUnitCost] = useState(line ? String(line.unitCost) : "");
  const [quantity, setQuantity] = useState(String(line?.quantity ?? prefill?.quantity ?? 1));
  const [comments, setComments] = useState(line?.comments ?? "");
  const [saving, setSaving] = useState(false);

  const cost = Number(unitCost);
  const count = Number(quantity);
  const valid = name.trim() !== "" && unitCost !== "" && cost >= 0 && Number.isInteger(count) && count >= 1;
  // Changing what is bought on a signed line removes its signatures, so say so before saving.
  const willClearSignatures =
    !!line && line.signatures.length > 0 && (name.trim() !== line.name || link.trim() !== line.link || cost !== line.unitCost || count !== line.quantity);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      await onSave({ _id: line?._id, sectionId, name, link, vendorPartNumber, unitCost: cost, quantity: count, comments });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="bom__line-form" onSubmit={submit}>
      <label className="t-field bom__wide">
        Item name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={300} required autoFocus />
      </label>
      <label className="t-field bom__wide">
        Link
        <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://… (leave empty for in-person)" />
      </label>
      <label className="t-field">
        Item cost ($)
        <input type="number" min="0" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} required />
      </label>
      <label className="t-field">
        Qty
        <input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
      </label>
      <label className="t-field">
        Part number
        <input value={vendorPartNumber} onChange={(e) => setPartNumber(e.target.value)} maxLength={80} />
      </label>
      <label className="t-field bom__wide">
        Comments
        <input value={comments} onChange={(e) => setComments(e.target.value)} maxLength={500} />
      </label>
      {willClearSignatures && (
        <p className="t-status t-status--warn bom__wide">Saving this change removes the signatures, so it has to be signed again.</p>
      )}
      <div className="bom__buttons bom__wide">
        <button className="t-button" type="submit" disabled={!valid || saving}>
          {line ? "Save" : "Add item"}
          {valid && ` (${bom.formatMoney(bom.lineCost({ unitCost: cost, quantity: count }))})`}
        </button>
        <button className="t-button t-button--quiet" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
