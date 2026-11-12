// One order: a table per vendor, laid out like the team's BOM sheet, with the actions each person may take.
import { useEffect, useState } from "react";
import { bom, stock, type BomLine, type BomLineState, type BomOrderDetail, type BomSection, type Me, type ReceiveInto, type StockItem } from "@team6220/data";
import { StatusPill, type StatusTone } from "@team6220/ui";
import { LineForm } from "./LineForm";
import { OrderForm } from "./OrderForm";
import { useSelection } from "./useSelection";

const STATE_TONES: Record<BomLineState, StatusTone> = {
  draft: "neutral",
  "signed-once": "warn",
  approved: "info",
  ordered: "info",
  "partly-received": "warn",
  received: "ok",
};

interface OrderViewProps {
  detail: BomOrderDetail;
  me: Me;
  /** Runs a change, then reloads the order. Shows the error if the server says no. */
  run: (change: () => Promise<string | void>) => Promise<void>;
  /** An item another app asked to add ("Add to BOM"). It prefills the next new line. */
  toAdd?: { name: string; quantity: number } | null;
  onAdded?: () => void;
}

/** Which form is open, if any. Only one at a time, so the page stays readable. */
type OpenForm =
  | { kind: "add"; sectionId: string }
  | { kind: "edit"; lineId: string }
  | { kind: "order"; sectionId: string }
  | { kind: "receive"; lineId: string }
  | { kind: "confirm-sign" }
  | null;

export function OrderView({ detail, me, run, toAdd, onAdded }: OrderViewProps) {
  const [open, setOpen] = useState<OpenForm>(null);
  const { team, lead, approver } = me.roles;

  const allLines = detail.sections.flatMap((s) => s.lines);
  // The lines this person could sign right now, in screen order. Only these get a tick box.
  const signable = approver ? allLines.filter((line) => bom.cantSign(line, me.id) === "") : [];
  const selection = useSelection(signable.map((l) => l._id));
  const chosen = signable.filter((l) => selection.selected.has(l._id));

  const close = () => setOpen(null);
  const act = (change: () => Promise<string | void>) => run(change).then(close);

  return (
    <div className="bom__order">
      <p className="bom__totals">
        Requested {bom.formatMoney(bom.totalCost(allLines))} · Paid{" "}
        {bom.formatMoney(detail.sections.reduce((sum, s) => sum + (s.section.finalTotal ?? 0), 0))}
      </p>

      {approver && (
        <div className="bom__sign-bar">
          <span>
            {chosen.length
              ? `${chosen.length} ${chosen.length === 1 ? "line" : "lines"} chosen, ${bom.formatMoney(bom.totalCost(chosen))}`
              : "To sign: tick lines, shift-click a range, or drag down the boxes."}
          </span>
          <button className="t-button t-button--quiet" type="button" onClick={() => selection.add(signable.map((l) => l._id))} disabled={!signable.length}>
            Choose all I can sign ({signable.length})
          </button>
          {chosen.length > 0 && (
            <>
              <button className="t-button" type="button" onClick={() => setOpen({ kind: "confirm-sign" })}>
                Sign chosen…
              </button>
              <button className="t-button t-button--quiet" type="button" onClick={selection.clear}>
                Clear
              </button>
            </>
          )}
        </div>
      )}

      {open?.kind === "confirm-sign" && (
        <section className="t-panel t-panel--notice" role="dialog" aria-label="Confirm signatures">
          <h3>
            Sign {chosen.length} {chosen.length === 1 ? "line" : "lines"} for {bom.formatMoney(bom.totalCost(chosen))}?
          </h3>
          <ul className="bom__to-buy">
            {chosen.map((line) => (
              <li key={line._id}>
                {line.quantity} × {line.name}: {bom.formatMoney(bom.lineCost(line))}
              </li>
            ))}
          </ul>
          <div className="bom__buttons">
            <button
              className="t-button"
              type="button"
              onClick={() =>
                act(async () => {
                  const result = await bom.signLines(chosen.map((l) => l._id));
                  selection.clear();
                  const skipped = result.skipped.length ? ` ${result.skipped.length} skipped: ${result.skipped[0].reason}` : "";
                  return `Signed ${result.signed.length} for ${bom.formatMoney(result.total)}.${skipped}`;
                })
              }
            >
              Sign as {me.name}
            </button>
            <button className="t-button t-button--quiet" type="button" onClick={close}>
              Cancel
            </button>
          </div>
        </section>
      )}

      {detail.sections.map(({ section, lines }) => vendorSection(section, lines))}
    </div>
  );

  // The two functions below are plain functions that return part of the page (not components), so they can use
  // the state above without passing a dozen props.
  function vendorSection(section: BomSection, lines: BomLine[]) {
    const ready = lines.filter((l) => bom.lineState(l) === "approved");
    const mine = signable.filter((l) => l.sectionId === section._id);
    if (!lines.length && !team) return null; // viewers don't need empty vendors
    return (
      <section key={section._id} className="t-panel bom__section">
        <header className="bom__section-head">
          <h3>{section.vendor}</h3>
          <span className="t-muted">
            Subtotal {bom.formatMoney(bom.totalCost(lines))}
            {section.finalTotal !== null && ` · Paid ${bom.formatMoney(section.finalTotal)}`}
            {section.orderDate && ` · Ordered ${section.orderDate}`}
            {section.expectedArrival && ` · Expected ${section.expectedArrival}`}
          </span>
          <span className="t-muted">
            {section.approval ? `Approval to order: ${section.approval.name}` : lines.length ? "No approval to order yet" : ""}
          </span>
        </header>

        {lines.length > 0 && (
          <div className="bom__scroll">
            <table className="t-table bom__table">
              <thead>
                <tr>
                  {approver && <th aria-label="Choose" />}
                  <th>Item</th>
                  <th>Item cost</th>
                  <th>Qty</th>
                  <th>Cost</th>
                  <th>Signatures</th>
                  <th>Status</th>
                  <th>Comments</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>{lines.map(lineRow)}</tbody>
            </table>
          </div>
        )}

        <div className="bom__buttons">
          {team && (
            <button className="t-button t-button--quiet" type="button" onClick={() => setOpen({ kind: "add", sectionId: section._id })}>
              Add item
            </button>
          )}
          {lines.some((l) => l.link) && (
            <button className="t-button t-button--quiet" type="button" onClick={() => openAll(lines)}>
              Open all links
            </button>
          )}
          {approver && mine.length > 0 && (
            <button className="t-button t-button--quiet" type="button" onClick={() => selection.add(mine.map((l) => l._id))}>
              Choose section ({mine.length})
            </button>
          )}
          {approver && !section.approval && lines.length > 0 && (
            <button className="t-button t-button--quiet" type="button" onClick={() => act(async () => void (await bom.approveSection(section._id)))}>
              Give approval to order
            </button>
          )}
          {approver && section.approval && (ready.length > 0 || section.orderedBy) && (
            <button className="t-button" type="button" onClick={() => setOpen({ kind: "order", sectionId: section._id })}>
              {ready.length ? `Mark ordered (${ready.length})…` : "Correct the total…"}
            </button>
          )}
        </div>

        {open?.kind === "add" && open.sectionId === section._id && (
          <LineForm sectionId={section._id} prefill={toAdd ?? undefined} onCancel={close} onSave={(input) => act(async () => (await bom.saveLine(input), onAdded?.()))} />
        )}
        {open?.kind === "order" && open.sectionId === section._id && (
          <OrderForm
            section={section}
            lines={ready}
            onCancel={close}
            onSave={(args) =>
              act(async () => {
                const result = await bom.markOrdered({ sectionId: section._id, ...args });
                return result.notReady ? `Ordered. ${result.notReady} line(s) still need signatures and were left out.` : "Ordered.";
              })
            }
          />
        )}
      </section>
    );
  }

  function lineRow(line: BomLine) {
    const state = bom.lineState(line);
    const canChoose = signable.some((l) => l._id === line._id);
    const left = line.quantity - line.receivedQty;
    if (open?.kind === "edit" && open.lineId === line._id) {
      return (
        <tr key={line._id}>
          <td colSpan={approver ? 9 : 8}>
            <LineForm
              sectionId={line.sectionId}
              line={line}
              onCancel={close}
              onSave={(input) =>
                act(async () => ((await bom.saveLine(input)).signaturesCleared ? "Saved. The signatures were removed, so it needs signing again." : undefined))
              }
            />
          </td>
        </tr>
      );
    }
    return (
      <tr key={line._id} className={selection.selected.has(line._id) ? "bom__row bom__row--chosen" : "bom__row"} onPointerEnter={() => selection.dragOver(line._id)}>
        {approver && (
          <td
            className="bom__pick"
            onPointerDown={(e) => {
              if (!canChoose) return;
              e.preventDefault(); // no text selection while dragging down the boxes
              selection.press(line._id, e.shiftKey);
            }}
          >
            {canChoose && (
              <input type="checkbox" checked={selection.selected.has(line._id)} readOnly aria-label={`Choose ${line.name}`}
                onKeyDown={(e) => e.key === " " && (e.preventDefault(), selection.press(line._id, e.shiftKey))} />
            )}
          </td>
        )}
        <td>
          {line.link ? <a href={line.link} target="_blank" rel="noreferrer">{line.name}</a> : line.name}
          {line.vendorPartNumber && <span className="t-hint"> {line.vendorPartNumber}</span>}
        </td>
        <td>{bom.formatMoney(line.unitCost)}</td>
        <td>{line.quantity}</td>
        <td>{bom.formatMoney(bom.lineCost(line))}</td>
        <td>{line.signatures.map((s) => s.name + (s.imported ? " (imported)" : "")).join(", ") || "—"}</td>
        <td>
          <StatusPill tone={STATE_TONES[state]}>{bom.LINE_STATE_LABELS[state]}</StatusPill>
          {state === "partly-received" && ` ${line.receivedQty} of ${line.quantity}`}
        </td>
        <td>{line.comments}</td>
        <td>
          <div className="bom__row-actions">
            {open?.kind === "receive" && open.lineId === line._id ? (
              <ReceiveBox line={line} left={left} onCancel={close} onArrived={(quantity, into) => act(() => bom.receiveIntoInventory(line, quantity, into))} />
            ) : (
              <>
                {team && line.orderedAt && left > 0 && (
                  <button className="t-button t-button--quiet" type="button" onClick={() => setOpen({ kind: "receive", lineId: line._id })}>
                    Receive
                  </button>
                )}
                {team && !line.orderedAt && (
                  <button className="t-button t-button--quiet" type="button" onClick={() => setOpen({ kind: "edit", lineId: line._id })}>
                    Edit
                  </button>
                )}
                {team && state === "draft" && (
                  <button className="t-button t-button--quiet" type="button" onClick={() => act(() => bom.removeLine(line._id))}>
                    Remove
                  </button>
                )}
                {lead && state !== "draft" && line.receivedQty === 0 && (
                  <button className="t-button t-button--quiet" type="button" onClick={() => act(async () => void (await bom.reopenLine(line._id)))}>
                    Reopen
                  </button>
                )}
              </>
            )}
          </div>
        </td>
      </tr>
    );
  }
}

/**
 * Replaces a line's buttons while receiving: how many arrived, and where they go in Inventory.
 * The person has to choose one of: an existing Inventory part, a new part, or "don't track".
 */
function ReceiveBox({ line, left, onArrived, onCancel }: { line: BomLine; left: number; onArrived: (quantity: number, into: ReceiveInto) => void; onCancel: () => void }) {
  const [quantity, setQuantity] = useState(String(left));
  const [parts, setParts] = useState<StockItem[] | null>(null);
  const [choice, setChoice] = useState(line.inventoryItemId); // a part's id, "new", "none", or "" (not chosen yet)
  const count = Number(quantity);

  useEffect(() => {
    stock.list().then(
      (list) => {
        setParts(list);
        // Suggest the part with the same name, if this line has no part yet.
        const sameName = list.find((p) => p.name.toLowerCase() === line.name.toLowerCase());
        setChoice((current) => current || sameName?.id || "");
      },
      () => setParts([]), // Inventory can't be reached: creating a part or "don't track" still work
    );
  }, [line._id]);

  const chosenPart = parts?.find((p) => p.id === choice);
  const into: ReceiveInto | null = chosenPart ? { kind: "existing", itemId: chosenPart.id } : choice === "new" ? { kind: "new" } : choice === "none" ? { kind: "none" } : null;
  const ready = !!into && Number.isInteger(count) && count >= 1 && count <= left;

  return (
    <span className="bom__receive">
      <input type="number" min="1" max={left} value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-label="How many arrived" />
      <select value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Where it goes in Inventory" disabled={!parts}>
        <option value="">{parts ? "Where does it go in Inventory?" : "Loading Inventory…"}</option>
        <option value="new">Create a new Inventory part</option>
        <option value="none">Don't track (used up or one-off)</option>
        {parts?.map((p) => (
          <option key={p.id} value={p.id}>
            Add to: {p.name} (have {p.quantity})
          </option>
        ))}
      </select>
      <button className="t-button" type="button" disabled={!ready} onClick={() => into && onArrived(count, into)}>
        {chosenPart && ready ? `Arrived (${chosenPart.quantity} → ${chosenPart.quantity + count})` : "Arrived"}
      </button>
      <button className="t-button t-button--quiet" type="button" onClick={onCancel}>
        Cancel
      </button>
    </span>
  );
}

/** Opens every line's link in its own tab. Browsers may ask the person to allow pop-ups the first time. */
function openAll(lines: BomLine[]) {
  for (const line of lines) if (line.link) window.open(line.link, "_blank", "noopener");
}
