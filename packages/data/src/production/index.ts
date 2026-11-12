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
import { byUrgency, newPart, partLabel, STATUS_LABELS } from "./rules";
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

export * from "./rules";
export type * from "./types";
