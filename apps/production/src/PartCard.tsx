// One part: what it is, who has worked on it, and the buttons for the steps that can come next.
import { useState } from "react";
import { production, type Me, type Part, type PartStatus, type Project } from "@team6220/data";
import { StatusPill, type StatusTone } from "@team6220/ui";

const TONES: Record<PartStatus, StatusTone> = {
  "pending-setup": "warn", ready: "info", "in-progress": "info", "handed-back": "warn", cut: "ok", done: "ok", cancelled: "neutral",
};

interface PartCardProps {
  part: Part;
  me: Me;
  projects: Project[];
  /** Runs one step from production's rules on this part, then reloads. */
  onStep: (part: Part, change: (part: Part) => Part) => Promise<void>;
  /** Runs a change that does more than one step (it also changes Inventory), shows its message, then reloads. */
  onAction: (change: () => Promise<string | void>) => Promise<void>;
}

/** Which small form is open under the buttons. */
type Asking = "hand-back" | "setup" | "fail" | null;

export function PartCard({ part, me, projects, onStep, onAction }: PartCardProps) {
  const [asking, setAsking] = useState<Asking>(null);
  const [note, setNote] = useState("");
  const [leftAt, setLeftAt] = useState("");
  const project = projects.find((p) => p._id === part.projectId);
  const working = production.currentWork(part);
  const mine = working?.memberId === me.id;
  const can = me.roles.team;
  const step = (change: (p: Part) => Part) => onStep(part, change).then(() => (setAsking(null), setNote(""), setLeftAt("")));
  const size = [part.thickness, part.length ? `${part.length} in` : "", part.width ? `× ${part.width} in` : ""].filter(Boolean).join(" ");

  return (
    <article className={`t-panel prod__card prod__card--${part.priority}`}>
      <header className="prod__card-head">
        <h3>
          <span className="prod__number">{production.partLabel(part)}</span> {part.partName}
        </h3>
        <StatusPill tone={TONES[part.status]}>{part.status === "cut" ? production.cutWord(part) : production.STATUS_LABELS[part.status]}</StatusPill>
        {part.priority !== "normal" && <StatusPill tone={part.priority === "low" ? "neutral" : "error"}>{production.PRIORITY_LABELS[part.priority]}</StatusPill>}
      </header>
      <p className="prod__facts">
        <strong>{part.quantity} ×</strong> {part.material} {size} · {production.METHOD_LABELS[part.method]}
        {part.accuracy && ` · ${part.accuracy}`}
        {part.dueDate && ` · due ${part.dueDate}`}
      </p>
      <p className="t-muted">
        Designer: {part.designerName}
        {project && ` · p${project.number} ${project.name}`}
        {part.taskId && <> · <a href={`/apps/icarus?task=${encodeURIComponent(part.taskId)}`}>Icarus task</a></>}
        {part.cadLink && <> · <a href={part.cadLink} target="_blank" rel="noreferrer">CAD</a></>}
        {part.fileLinks && ` · Files: ${part.fileLinks}`}
      </p>
      {part.details && <p>{part.details}</p>}
      {part.cutStock && <p><strong>Stock:</strong> {part.cutStock} <span className="t-muted">(spot reserved in Inventory)</span></p>}
      {part.setupNotes && <p><strong>Setup ({part.setupBy}):</strong> {part.setupNotes}</p>}
      {part.print && (
        <p className="t-muted">
          {[part.print.printer, part.print.filament, part.print.color, part.print.estMinutes ? `${part.print.estMinutes} min` : "", part.print.estGrams ? `${part.print.estGrams} g` : ""].filter(Boolean).join(" · ")}
          {part.print.failReason && <span className="prod__warn"> · Last try failed: {part.print.failReason}</span>}
        </p>
      )}
      {part.work.length > 0 && (
        <ul className="prod__work">
          {part.work.map((w, i) => (
            <li key={i}>
              {w.name} {w.result ? `(${w.result})` : "(working on it)"}
              {w.note && `: ${w.note}`}
              {w.leftAt && ` Left at: ${w.leftAt}`}
            </li>
          ))}
        </ul>
      )}

      {can && production.isOpen(part) && (
        <div className="prod__buttons">
          {part.status === "pending-setup" && <button className="t-button" type="button" onClick={() => setAsking("setup")}>Set up for the Shapeoko…</button>}
          {(part.status === "ready" || part.status === "handed-back") && (
            <button className="t-button" type="button" onClick={() => step((p) => production.claim(p, me))}>
              {part.method === "print" ? "Start print" : "Claim"}
            </button>
          )}
          {part.status === "in-progress" && (
            <>
              <button className="t-button" type="button" onClick={() => onAction(() => production.confirmCut(part, me))}
                title={production.isPlanned(part) ? "Also updates the stock piece in Inventory to what is left" : undefined}>
                {part.method === "print" ? "Printed" : "Confirm cut"}
              </button>
              {part.method === "print"
                ? <button className="t-button t-button--quiet" type="button" onClick={() => setAsking("fail")}>Print failed…</button>
                : <button className="t-button t-button--quiet" type="button" onClick={() => setAsking("hand-back")}>Hand back…</button>}
              {!mine && working && <span className="t-muted">{working.name} has this</span>}
            </>
          )}
          {(part.status === "cut" || part.status === "in-progress") && <button className="t-button t-button--quiet" type="button" onClick={() => step(production.markDone)}>Done</button>}
          <button className="t-button t-button--quiet" type="button" onClick={() => window.confirm(`Cancel ${production.partLabel(part)}?`) && void onAction(() => production.cancelPart(part, me))}>
            Cancel part
          </button>
        </div>
      )}

      {asking === "setup" && (
        <div className="prod__ask">
          <label className="t-field">
            Stock size and where the toolpath is
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Stock 9 x 6 in, toolpath in Drive > CAM > …" autoFocus />
          </label>
          <button className="t-button" type="button" disabled={!note.trim()} onClick={() => step((p) => production.release(p, me, note))}>Ready to cut</button>
        </div>
      )}
      {asking === "hand-back" && (
        <div className="prod__ask">
          <label className="t-field">
            What is left to do
            <input value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          </label>
          <label className="t-field">
            Where you left the piece
            <input value={leftAt} onChange={(e) => setLeftAt(e.target.value)} />
          </label>
          <button className="t-button" type="button" disabled={!note.trim() || !leftAt.trim()} onClick={() => step((p) => production.handBack(p, note, leftAt))}>Hand back</button>
        </div>
      )}
      {asking === "fail" && (
        <div className="prod__ask">
          <label className="t-field">
            What went wrong
            <input value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          </label>
          <button className="t-button" type="button" disabled={!note.trim()} onClick={() => step((p) => production.failPrint(p, note))}>Back in the queue</button>
        </div>
      )}
    </article>
  );
}
