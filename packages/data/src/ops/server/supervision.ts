// Calendar supervision: supervisors' paperwork and signing up for shifts. Plan:
// https://github.com/Team-6220/team6220.org/wiki/Operations-Calendar. SERVER ONLY.
//
// A supervisor's paperwork is kept on their own account row (ops_people.supervisor). What each change does is worked
// out in ../../calendar/supervision.ts, which the demo backend uses too.
//   signUpShift      an approved supervisor takes an open shift; leads, mentors and boosters can put any approved one in
//   withdrawShift    off a shift (your own; leads, mentors and boosters: anyone's). Everyone who could fill it hears
//   saveSupervisor   someone's paperwork (leads, mentors and boosters). Approving gives the Supervisor badge and
//                    approves a pending account
//   mySupervisorRow  your own paperwork, before your account is approved too (Become a supervisor)
//   askToSupervise   "I want to supervise": starts your paperwork and tells the leads, mentors and boosters
// Asking and being approved both move the old sheet's shifts with exactly your name onto your account.
import { BADGES } from "../../config";
import { COLLECTION_EVENTS, COLLECTION_SHIFTS, PlanError } from "../../calendar/plan";
import { cleanSupervisorInfo, FIRST_STEPS, linkedShifts, signUp, supervisorFor, supervisorsFrom, withdraw } from "../../calendar/supervision";
import type { CalEvent, Shift, Supervisor, SupervisorInfo } from "../../calendar/types";
import type { Person } from "../types";
import { requireRole } from "./auth";
import { COLLECTION_PEOPLE, getRecord, type Ctx } from "./context";
import { apiError, type Doc } from "./env";
import * as notify from "./notify";

function plan<T>(step: () => T): T {
  try {
    return step();
  } catch (e) {
    if (e instanceof PlanError) throw apiError("bad-request", e.message);
    throw e;
  }
}

const MANAGERS = [BADGES.lead, BADGES.mentor, BADGES.booster];

async function people(ctx: Ctx): Promise<Person[]> {
  return (await ctx.data.query(COLLECTION_PEOPLE, {})) as unknown as Person[];
}

async function shiftAndEvent(ctx: Ctx, shiftId: unknown): Promise<{ shift: Shift; event: CalEvent | undefined }> {
  const shift = (await getRecord(ctx, COLLECTION_SHIFTS, shiftId, "shift")) as unknown as Shift;
  const event = (await ctx.data.queryIds(COLLECTION_EVENTS, [shift.eventId]))[0] as unknown as CalEvent | undefined;
  return { shift, event };
}

/** The old sheet's shifts with this person's name, moved onto their account. */
async function linkOldShifts(ctx: Ctx, memberId: string, name: string) {
  const moved = linkedShifts(memberId, name, (await ctx.data.query(COLLECTION_SHIFTS, { memberId: "" })) as unknown as Shift[]);
  await ctx.data.saveMany(COLLECTION_SHIFTS, moved as unknown as Doc[]);
}

/** { shiftId, memberId? } -> { shift } */
export async function signUpShift(ctx: Ctx, body: Doc) {
  const [{ shift, event }, all] = await Promise.all([shiftAndEvent(ctx, body.shiftId), people(ctx)]);
  const supervisors = supervisorsFrom(all);
  const forSomeoneElse = typeof body.memberId === "string" && body.memberId && body.memberId !== ctx.actor.id;
  if (forSomeoneElse) requireRole(ctx.actor, "scheduler");
  const who = supervisorFor(supervisors, forSomeoneElse ? String(body.memberId) : ctx.actor.id);
  if (!who) throw apiError(forSomeoneElse ? "bad-request" : "forbidden", forSomeoneElse ? "That person isn't a supervisor." : "Only approved supervisors can sign up for a shift. See Become a supervisor.");
  const saved = plan(() => signUp(shift, event, who, ctx.today(), ctx.env.now().toISOString()));
  if (saved !== shift) {
    await ctx.data.save(COLLECTION_SHIFTS, saved as unknown as Doc);
    ctx.log({ kind: "shift", id: shift._id }, "signed up", `${who.name} ${event!.startDate} ${shift.start}`);
    if (forSomeoneElse) await notify.sendAll(ctx, [notify.rules.shiftAssigned(saved as unknown as Doc, event as unknown as Doc)]);
  }
  return { shift: saved };
}

/** { shiftId } -> { shift } */
export async function withdrawShift(ctx: Ctx, body: Doc) {
  const { shift, event } = await shiftAndEvent(ctx, body.shiftId);
  if (shift.memberId !== ctx.actor.id) requireRole(ctx.actor, "scheduler");
  if (!shift.memberId && !shift.name) return { shift };
  const saved = plan(() => withdraw(shift, event, ctx.today()));
  await ctx.data.save(COLLECTION_SHIFTS, saved as unknown as Doc);
  ctx.log({ kind: "shift", id: shift._id }, "withdrew", `${shift.name} ${event!.startDate} ${shift.start}`);
  const approved = supervisorsFrom(await people(ctx)).filter((s) => s.status === "approved").map((s) => s.memberId);
  const to = [...new Set([...(await notify.membersWithBadge(ctx, MANAGERS)), ...approved])].filter((id) => id !== shift.memberId);
  await notify.sendAll(ctx, [notify.rules.shiftOpened(saved as unknown as Doc, event as unknown as Doc, shift.name || "A supervisor", to)]);
  return { shift: saved };
}

/** { memberId, supervisor: { status, steps, approvedMonth } } -> { supervisor } */
export async function saveSupervisor(ctx: Ctx, body: Doc) {
  const memberId = typeof body.memberId === "string" ? body.memberId : "";
  const row = (await people(ctx)).find((p) => p.memberId === memberId);
  if (!row) throw apiError("bad-request", "That person hasn't signed in to the apps yet.");
  const info = plan(() => cleanSupervisorInfo((body.supervisor ?? {}) as Record<string, unknown>));
  const was = row.supervisor?.status;
  await ctx.data.save(COLLECTION_PEOPLE, { ...row, supervisor: info } as unknown as Doc);
  if (info.status === "approved" && was !== "approved") {
    await giveSupervisorBadge(ctx, memberId);
    await linkOldShifts(ctx, memberId, row.name);
  }
  ctx.log({ kind: "person", id: memberId }, "supervisor", `${row.name}: ${info.status}`);
  return { supervisor: { memberId, name: row.name, ...info } satisfies Supervisor };
}

/** The Supervisor badge, and an approved account (a parent's account waits for approval until now). */
async function giveSupervisorBadge(ctx: Ctx, memberId: string) {
  const titles = await ctx.siteBadges();
  const badgeId = Object.keys(titles).find((id) => titles[id] === BADGES.supervisor);
  if (!badgeId) throw apiError("wix-unavailable", "The site has no Supervisor badge.");
  const held = await ctx.env.badges.assignmentsOf([memberId], [badgeId]);
  if (!held.length) await ctx.env.badges.assign([{ badgeId, memberId }]);
  try {
    await ctx.env.members.approve(memberId);
  } catch {
    // already approved
  }
}

/** {} -> { supervisor } (or null) */
export async function mySupervisorRow(ctx: Ctx) {
  const row = (await ctx.data.query(COLLECTION_PEOPLE, { memberId: ctx.actor.id }, 1))[0] as unknown as Person | undefined;
  return { supervisor: row?.supervisor ? ({ memberId: row.memberId, name: row.name, ...row.supervisor } satisfies Supervisor) : null };
}

/** {} -> { supervisor } */
export async function askToSupervise(ctx: Ctx) {
  const row = (await ctx.data.query(COLLECTION_PEOPLE, { memberId: ctx.actor.id }, 1))[0] as unknown as Person | undefined;
  if (row?.supervisor) return { supervisor: { memberId: row.memberId, name: row.name, ...row.supervisor } };
  const name = row?.name || ctx.actor.name;
  const info: SupervisorInfo = { ...FIRST_STEPS, steps: [...FIRST_STEPS.steps] };
  await ctx.data.save(COLLECTION_PEOPLE, { ...(row ?? { memberId: ctx.actor.id, name, subteams: [], active: true }), supervisor: info } as unknown as Doc);
  await linkOldShifts(ctx, ctx.actor.id, name);
  ctx.log({ kind: "person", id: ctx.actor.id }, "supervisor", `${name} wants to supervise`);
  await notify.sendAll(ctx, [notify.rules.supervisorRequest(name, await notify.membersWithBadge(ctx, MANAGERS))]);
  return { supervisor: { memberId: ctx.actor.id, name, ...info } satisfies Supervisor };
}
