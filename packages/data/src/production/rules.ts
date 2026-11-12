// The life of a part: which step can follow which, and what each step records.
// Every function here takes a part and returns the changed part (or throws when the step isn't allowed), so the
// rules can be tested without a screen or a database.
import type { Draft } from "../ops/types";
import type { Method, Part, PartRequest, PartStatus, Priority, PrintDetails, WorkEntry } from "./types";

export const METHOD_LABELS: Record<Method, string> = {
  handmade: "Handmade",
  shapeoko: "Shapeoko (CNC)",
  print: "3D print",
  other: "Lathe / other",
};
export const PRIORITY_LABELS: Record<Priority, string> = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };
const PRIORITY_ORDER: Priority[] = ["urgent", "high", "normal", "low"];
export const STATUS_LABELS: Record<PartStatus, string> = {
  "pending-setup": "Pending setup",
  ready: "Ready",
  "in-progress": "In progress",
  "handed-back": "Handed back",
  cut: "Cut",
  done: "Done",
  cancelled: "Cancelled",
};

/** The materials the request form offers. Free text is allowed too. Linking to Inventory's lists comes later. */
export const COMMON_MATERIALS = [
  "Aluminum sheet", "Aluminum tube", "Polycarbonate sheet", "Hex shaft", "Round shaft", "Wood", "PLA", "PETG", "Other",
];

/** "PR-0123" */
export function partLabel(part: Pick<Part, "number">): string {
  return `PR-${String(part.number).padStart(4, "0")}`;
}

/** For a printed part the word is "Printed", for everything else "Cut". */
export function cutWord(part: Pick<Part, "method">): string {
  return part.method === "print" ? "Printed" : "Cut";
}

export interface Who {
  id: string;
  name: string;
}

const now = () => new Date().toISOString();
const EMPTY_PRINT: PrintDetails = { printer: "", filament: "", color: "", estMinutes: 0, estGrams: 0, failReason: "" };

function fail(message: string): never {
  throw new Error(message);
}

/** A new part from the request form. Shapeoko parts start in "pending setup"; everything else is ready to make. */
export function newPart(request: PartRequest, number: number, designer: Who): Draft<Part> {
  if (!request.partName.trim()) fail("A part needs a name.");
  if (!(Number.isInteger(request.quantity) && request.quantity >= 1)) fail("Quantity must be 1 or more.");
  return {
    ...request,
    partName: request.partName.trim(),
    number,
    designerId: designer.id,
    designerName: designer.name,
    status: request.method === "shapeoko" ? "pending-setup" : "ready",
    work: [],
    setupNotes: "",
    setupBy: "",
    print: request.method === "print" ? { ...EMPTY_PRINT, ...request.print } : null,
    createdAt: now(),
  };
}

/** The work entry of whoever has the part right now, if anyone. */
export function currentWork(part: Pick<Part, "work">): WorkEntry | undefined {
  return part.work.find((w) => !w.endedAt);
}

/** Ends the open work entry. */
function endWork(part: Part, result: "finished" | "unfinished", note = "", leftAt = ""): WorkEntry[] {
  return part.work.map((w) => (w.endedAt ? w : { ...w, endedAt: now(), result, note, leftAt }));
}

/** A Shapeoko part gets its real stock size and toolpath, and becomes ready to cut. */
export function release(part: Part, who: Who, setupNotes: string): Part {
  if (part.status !== "pending-setup") fail("This part isn't waiting for setup.");
  if (!setupNotes.trim()) fail("Write the stock size and where the toolpath file is.");
  return { ...part, status: "ready", setupNotes: setupNotes.trim(), setupBy: who.name };
}

/** Someone starts making the part. Their name stays on it even if they don't finish. */
export function claim(part: Part, who: Who): Part {
  if (part.status !== "ready" && part.status !== "handed-back") fail("This part can't be claimed right now.");
  const entry: WorkEntry = { memberId: who.id, name: who.name, startedAt: now(), endedAt: "", result: "", note: "", leftAt: "" };
  return { ...part, status: "in-progress", work: [...part.work, entry] };
}

/** Someone stops before finishing: why, and where the piece is. */
export function handBack(part: Part, note: string, leftAt: string): Part {
  if (part.status !== "in-progress") fail("Only a part someone is working on can be handed back.");
  if (!note.trim() || !leftAt.trim()) fail("Say what is left to do and where you left the piece.");
  return { ...part, status: "handed-back", work: endWork(part, "unfinished", note.trim(), leftAt.trim()) };
}

/** The part is cut (or printed). It may still need finishing. */
export function markCut(part: Part): Part {
  if (part.status !== "in-progress") fail("Claim the part before marking it cut.");
  return { ...part, status: "cut", work: endWork(part, "finished"), print: part.print && { ...part.print, failReason: "" } };
}

/** A print failed: it goes back in the queue with the reason. */
export function failPrint(part: Part, reason: string): Part {
  if (part.method !== "print" || part.status !== "in-progress") fail("Only a print that is running can fail.");
  if (!reason.trim()) fail("Say what went wrong, so the next try can avoid it.");
  return { ...part, status: "ready", work: endWork(part, "unfinished", reason.trim()), print: { ...(part.print ?? EMPTY_PRINT), failReason: reason.trim() } };
}

/** Finished and checked against the accuracy the designer asked for. */
export function markDone(part: Part): Part {
  if (part.status !== "cut" && part.status !== "in-progress") fail("Only a part that is being made or is cut can be finished.");
  return { ...part, status: "done", work: endWork(part, "finished") };
}

export function cancel(part: Part): Part {
  if (part.status === "done" || part.status === "cancelled") fail("This part is already closed.");
  return { ...part, status: "cancelled", work: endWork(part, "unfinished", "Cancelled") };
}

export const isOpen = (part: Pick<Part, "status">) => part.status !== "done" && part.status !== "cancelled";

/** The order the tracker lists parts in: most urgent first, then the soonest due date, then the oldest. */
export function byUrgency(a: Part, b: Part): number {
  return (
    PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) ||
    (a.dueDate || "9999").localeCompare(b.dueDate || "9999") ||
    a.number - b.number
  );
}
