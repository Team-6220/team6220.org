// production: the functions /apps/production uses. Plan: docs/operations/PRODUCTION.md.
//
//   import { production } from "@team6220/data";
//   const parts = await production.listParts();
//   await production.requestParts([request], me);            // a designer submits parts
//   await production.step(part._id, me, (p) => production.claim(p, me));   // one step in a part's life
//
// Parts are written straight to Wix by members: every Team Member can do everything in Production, and each step
// is written to the history log under the person who did it. The steps themselves are in rules.ts.
import "./mock"; // registers the demo data (only used in demo mode)
import { logHistory, nextNumber, store } from "../ops";
import type { Me } from "../ops/types";
import * as cutting from "../inventory/cutting";
import { byUrgency, cancel, cutWord, markCut, newPart, partLabel, STATUS_LABELS } from "./rules";
import type { Part, PartRequest } from "./types";

const COLLECTION = "production_parts";

/** Every part, most urgent first. */
export async function listParts(): Promise<Part[]> {
  return (await store().list<Part>(COLLECTION)).sort(byUrgency);
}

/** A designer submits one or more parts. Each gets the next PR number. */
export async function requestParts(requests: PartRequest[], me: Me): Promise<Part[]> {
  if (!requests.length) return [];
  let number = await nextNumber("part", requests.length);
  const saved: Part[] = [];
  for (const request of requests) {
    const part = await store().save<Part>(COLLECTION, newPart(request, number++, me));
    await logHistory({ kind: "part", id: part._id }, "requested", `${partLabel(part)} ${part.partName} x${part.quantity}`);
    saved.push(part);
  }
  return saved;
}

/**
 * One step in a part's life (claim, hand back, mark cut...). It reads the part again first, so if someone else
 * changed it a moment ago the step is checked against what is really there, not against an old screen.
 * `change` is one of the functions in rules.ts and throws when the step isn't allowed.
 */
export async function step(partId: string, me: Me, change: (part: Part) => Part): Promise<Part> {
  if (!me.roles.team) throw new Error("Your account can look at Production but not change it.");
  const fresh = (await store().list<Part>(COLLECTION)).find((p) => p._id === partId);
  if (!fresh) throw new Error("That part doesn't exist any more. Reload the page.");
  const changed = change(fresh);
  const saved = await store().save<Part>(COLLECTION, changed);
  await logHistory({ kind: "part", id: saved._id }, STATUS_LABELS[saved.status].toLowerCase(), `${partLabel(saved)} ${saved.partName}`);
  return saved;
}

/** For the "Needs you" list on the dashboard: parts this person has claimed, and Shapeoko parts waiting for setup. */
export async function needsMe(me: Me): Promise<{ claimed: number; pendingSetup: number }> {
  const parts = await store().list<Part>(COLLECTION);
  return {
    claimed: parts.filter((p) => p.status === "in-progress" && p.work.some((w) => !w.endedAt && w.memberId === me.id)).length,
    pendingSetup: parts.filter((p) => p.status === "pending-setup").length,
  };
}

// ----- with Inventory's raw stock (the Cut planner) -----

/** After the Cut planner reserved spots: remembers on each part which Inventory cut jobs hold its spots. */
export async function rememberCutJobs(spots: { partId: string; jobIds: string[]; stock: string }[], me: Me): Promise<void> {
  for (const spot of spots) {
    await step(spot.partId, me, (p) => ({ ...p, cutJobIds: spot.jobIds, cutStock: spot.stock }));
  }
}

/** True when a part's stock has been planned on Inventory pieces. Parts saved before this existed have no list. */
export function isPlanned(part: Pick<Part, "cutJobIds">): boolean {
  return (part.cutJobIds ?? []).length > 0;
}

/**
 * Confirm cut. When the part has a reserved spot on Inventory stock, the stock piece becomes what is left of it first
 * (Inventory's "Mark as cut" rule); then the part is marked cut. Returns a sentence saying what happened.
 */
export async function confirmCut(part: Part, me: Me): Promise<string> {
  let stockNote = "";
  if (isPlanned(part)) {
    let left = 0;
    for (const jobId of part.cutJobIds) left = (await cutting.confirmCut(jobId)).leftovers;
    stockNote = left
      ? " Inventory updated to what is left; leftovers are flagged to measure at the next audit."
      : " Inventory updated: the stock piece was used up.";
  }
  const saved = await step(part._id, me, markCut);
  return `${partLabel(saved)} ${cutWord(saved).toLowerCase()}.${stockNote}`;
}

/** Cancel a part, giving its reserved spot on the stock back. */
export async function cancelPart(part: Part, me: Me): Promise<void> {
  for (const jobId of part.cutJobIds ?? []) await cutting.release(jobId).catch(() => undefined); // already gone is fine
  await step(part._id, me, (p) => ({ ...cancel(p), cutJobIds: [], cutStock: "" }));
}

export * from "./rules";
export { stlSize, type StlSize } from "./stl";
export type * from "./types";
