// The parts of a task that point at the other apps:
//   Needs materials   Inventory parts, with how many are in stock and a warning when there aren't enough
//   Parts being made  Production parts requested for this task, with their status
// A task never changes stock. When something is short, "Add to BOM" starts a BOM line for what is missing.
import { useEffect, useState } from "react";
import { icarus, production, stock, type MaterialNeed, type Part, type StockItem } from "@team6220/data";
import { StatusPill } from "@team6220/ui";

interface TaskLinksProps {
  needs: MaterialNeed[];
  onChange: (needs: MaterialNeed[]) => void;
  canEdit: boolean;
  /** The saved task's _id, or "" for a task that isn't saved yet. */
  taskId: string;
  projectId: string;
}

export function TaskLinks({ needs, onChange, canEdit, taskId, projectId }: TaskLinksProps) {
  const [items, setItems] = useState<StockItem[] | null>(null);
  const [parts, setParts] = useState<Part[]>([]);
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");

  useEffect(() => {
    stock.list().then(setItems, () => setItems([])); // if Inventory can't be reached, the list just stays empty
    if (taskId) production.listParts().then((all) => setParts(all.filter((p) => p.taskId === taskId)), () => setParts([]));
  }, [taskId]);

  const inStock = (id: string) => items?.find((i) => i.id === id)?.quantity;
  const chosen = items?.find((i) => i.id === itemId);
  const count = Number(quantity);

  return (
    <div className="icr__wide">
      <h3>Needs materials</h3>
      {needs.length === 0 && <p className="t-muted">Nothing listed.</p>}
      <ul className="icr__plain">
        {needs.map((need) => {
          const have = inStock(need.itemId);
          const short = icarus.shortfall(need, have);
          return (
            <li key={need.itemId}>
              {need.quantity} × {need.name}{" "}
              {have === undefined ? (
                <span className="t-muted">(not found in Inventory)</span>
              ) : short > 0 ? (
                <>
                  <StatusPill tone="warn">Short by {short} (have {have})</StatusPill>{" "}
                  <a className="t-button t-button--quiet icr__small" href={`/apps/bom?add=${encodeURIComponent(need.name)}&qty=${short}`}>
                    Add to BOM
                  </a>
                </>
              ) : (
                <StatusPill tone="ok">In stock ({have})</StatusPill>
              )}
              {canEdit && (
                <button className="t-button t-button--quiet icr__small" type="button" onClick={() => onChange(needs.filter((n) => n.itemId !== need.itemId))}>
                  Remove
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {canEdit && (
        <div className="icr__buttons">
          <select value={itemId} onChange={(e) => setItemId(e.target.value)} aria-label="Inventory part" disabled={!items}>
            <option value="">{items ? "Choose an Inventory part…" : "Loading Inventory…"}</option>
            {items?.filter((i) => !needs.some((n) => n.itemId === i.id)).map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} (have {i.quantity})
              </option>
            ))}
          </select>
          <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-label="How many are needed" className="icr__qty" />
          <button
            className="t-button t-button--quiet"
            type="button"
            disabled={!chosen || !(Number.isInteger(count) && count >= 1)}
            onClick={() => chosen && (onChange([...needs, { itemId: chosen.id, name: chosen.name, quantity: count }]), setItemId(""))}
          >
            Add material
          </button>
        </div>
      )}

      {taskId && (
        <>
          <h3>Parts being made</h3>
          {parts.length === 0 && <p className="t-muted">No parts have been requested for this task.</p>}
          <ul className="icr__plain">
            {parts.map((part) => (
              <li key={part._id}>
                <a href="/apps/production">{production.partLabel(part)}</a> {part.partName} ×{part.quantity}{" "}
                <StatusPill tone={part.status === "done" || part.status === "cut" ? "ok" : "info"}>{production.STATUS_LABELS[part.status]}</StatusPill>
                {production.currentWork(part) && <span className="t-muted"> {production.currentWork(part)!.name} has it</span>}
              </li>
            ))}
          </ul>
          <a className="t-button t-button--quiet" href={`/apps/production?task=${encodeURIComponent(taskId)}&project=${encodeURIComponent(projectId)}`}>
            Request a part for this task
          </a>
        </>
      )}
    </div>
  );
}
