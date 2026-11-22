// 1-2-3-100 on the server: each student picks one of four things, sends a plan, then a result, and Operations approves
// both. Plan: https://github.com/Team-6220/team6220.org/wiki/Operations-Business. SERVER ONLY.
// The rules (what a student may send, when a step is open) are in ../../business/fundraising.ts, which the demo backend
// uses too. Students only ever read and change their own things; Operations and the leads see everyone's.
//   bizMy / bizPick                              the student's pick and progress
//   bizItemSave / bizItemSend                    a restaurant day, grant or pitch: fill it in, then send it
//   bizPitchSent / bizPitchReply / bizFollowUpSent   what happens after a pitch is sent
//   bizMerchAdd / bizMerchRemove / bizMerchDone  merch sales
//   bizApprovals / bizReview / bizDecide         Operations' side
//   bizStatus                                    everyone's status
//   bizGetSettings / bizSaveSettings             the deadline, limits and reminders
//   bizDistance                                  how far a restaurant is from the school
import { BADGES } from "../../config";
import { BizError, COLLECTION_GRANTS, COLLECTION_SPONSORS, cleanGrant, cleanSponsor, sameName, seasonLabel } from "../../business/plan";
import {
  COLLECTION_CHOICES, COLLECTION_MERCH, COLLECTION_TEMPLATES, COLLECTION_PITCHES, COLLECTION_RESTAURANT, COLLECTION_SETTINGS, COLLECTION_STUDENT_GRANTS, FAR_MILES, MERCH_GOAL, REPLY_STATUS, SCHOOL,
  cleanPitch, cleanRestaurant, cleanSale, cleanSettings, cleanStudentGrant, decide, defaultSettings, followUpsFor, grantPlanProblem, isApproved, isReply, merchTotal, miles,
  pickOption, pitchPlanProblem, pitchesByMonth, progressRows, restaurantDaysUsed, restaurantProblem, sendApproval, standingCounts, standingOf, statusDetail, type StudentRecords,
} from "../../business/fundraising";
import { NO_APPROVAL, type Approval, type BizSettings, type Choice, type EmailTemplate, type Grant, type MerchSale, type Pitch, type RestaurantDay, type Sponsor, type StudentGrant } from "../../business/types";
import { rolesFor } from "../roles";
import { COLLECTION_PEOPLE, getRecord, type Ctx } from "./context";
import { apiError, type Doc } from "./env";
import * as notify from "./notify";
import { teamMembers } from "./rsvp";

export const FUNDRAISING_COLLECTIONS = [COLLECTION_TEMPLATES, COLLECTION_SETTINGS, COLLECTION_CHOICES, COLLECTION_RESTAURANT, COLLECTION_STUDENT_GRANTS, COLLECTION_PITCHES, COLLECTION_MERCH] as const;

function plan<T>(step: () => T): T {
  try {
    return step();
  } catch (e) {
    if (e instanceof BizError) throw apiError("bad-request", e.message);
    throw e;
  }
}

const season = (ctx: Ctx) => seasonLabel(ctx.today());
const now = (ctx: Ctx) => ctx.env.now().toISOString();

// ----- loading -----

export async function settingsOf(ctx: Ctx): Promise<BizSettings> {
  const row = (await ctx.data.query(COLLECTION_SETTINGS, { season: season(ctx) }, 1))[0] as unknown as BizSettings | undefined;
  return row ?? ({ ...defaultSettings(season(ctx)) } as BizSettings);
}

/** One student's things this season. */
export async function recordsOf(ctx: Ctx, memberId: string): Promise<StudentRecords> {
  const filter = { season: season(ctx), memberId };
  const [choice, restaurant, grants, pitches, sales] = await Promise.all([
    ctx.data.query(COLLECTION_CHOICES, filter, 1),
    ctx.data.query(COLLECTION_RESTAURANT, filter, 5),
    ctx.data.query(COLLECTION_STUDENT_GRANTS, filter, 5),
    ctx.data.query(COLLECTION_PITCHES, filter, 10),
    ctx.data.query(COLLECTION_MERCH, filter, 200),
  ]);
  return { choice: (choice[0] as unknown as Choice) ?? null, restaurant: restaurant as unknown as RestaurantDay[], grants: grants as unknown as StudentGrant[], pitches: pitches as unknown as Pitch[], sales: sales as unknown as MerchSale[] };
}

const nameOf = async (ctx: Ctx, memberId: string) => String((await ctx.data.query(COLLECTION_PEOPLE, { memberId }, 1))[0]?.name ?? "A student");

/** Operations and the leads: who is asked to approve. */
const approvers = (ctx: Ctx) => notify.membersWithBadge(ctx, [BADGES.lead, "Subteam: Operations"]);

/** {} -> { settings, records, rows, restaurantUsed }. */
export async function bizMy(ctx: Ctx) {
  const [settings, records, taken] = await Promise.all([settingsOf(ctx), recordsOf(ctx, ctx.actor.id), ctx.data.query(COLLECTION_RESTAURANT, { season: season(ctx) }, 200)]);
  return { settings, records, rows: progressRows(records, ctx.today()), restaurantUsed: restaurantDaysUsed(taken as unknown as RestaurantDay[]) };
}

/** { option } -> { choice }. */
export async function bizPick(ctx: Ctx, body: Doc) {
  const records = await recordsOf(ctx, ctx.actor.id);
  const started = records.restaurant.some((d) => d.plan.status !== "draft") || records.grants.some((g) => g.plan.status !== "draft") || records.pitches.some((p) => p.plan.status !== "draft") || records.sales.length > 0;
  // Operations has only "approved" something when a plan is approved; waiting plans can still be withdrawn by asking, so they block too.
  const approved = records.restaurant.some((d) => isApproved(d.plan)) || records.grants.some((g) => isApproved(g.plan)) || records.pitches.some((p) => isApproved(p.plan));
  const option = plan(() => pickOption(body.option, records.choice, approved || (started && records.sales.length > 0)));
  const saved = await ctx.data.save(COLLECTION_CHOICES, { ...(records.choice ?? { season: season(ctx), memberId: ctx.actor.id, merchDone: NO_APPROVAL }), option, touchedAt: now(ctx) } as unknown as Doc);
  return { choice: saved };
}

// ----- files -----

/** Which fields of which kind hold a file, and when the student may still change it. */
const FILE_FIELDS: Record<Kind, Record<string, (row: Doc) => boolean>> = {
  restaurant: { flyer: (r) => isApproved(r.plan as Approval), proof: (r) => isApproved(r.plan as Approval) },
  grant: { application: (r) => !isApproved(r.plan as Approval) && (r.plan as Approval).status !== "waiting", finalFile: (r) => isApproved(r.plan as Approval) && !isApproved(r.result as Approval) },
  pitch: {},
};
const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** The team's Drive helper (an Apps Script on the team Google account): its address and secret are Wix secrets. */
async function drive(ctx: Ctx, call: Record<string, unknown>): Promise<Record<string, any>> {
  const [url, secret] = await Promise.all([ctx.env.secret("BIZ_FILES_URL"), ctx.env.secret("BIZ_FILES_SECRET")]);
  if (!url || !secret) throw apiError("bad-request", "Uploads aren't set up yet: ask a web admin to finish the Drive helper (BIZ_FILES_URL and BIZ_FILES_SECRET).");
  const response = await ctx.env.fetch(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ secret, ...call }) });
  const answer = (await response.json().catch(() => null)) as Record<string, any> | null;
  if (!response.ok || !answer || answer.ok === false) throw apiError("bad-request", "The file didn't go through. Try again in a minute.");
  return answer;
}

/** { kind, id, field, name, mime, data (base64) } -> { item }. Puts the file in the team's Drive folder and keeps its ID. */
export async function bizAttach(ctx: Ctx, body: Doc) {
  const kind = kindOf(body.kind);
  const row = await own(ctx, kind, body.id);
  const field = String(body.field);
  const allowed = FILE_FIELDS[kind][field];
  if (!allowed) throw apiError("bad-request", "That isn't a place for a file.");
  if (!allowed(row)) throw apiError("bad-request", "That step isn't open for files right now.");
  const data = typeof body.data === "string" ? body.data : "";
  const size = Math.floor((data.length * 3) / 4);
  if (!data || size > MAX_FILE_BYTES) throw apiError("bad-request", "Pick a file up to 8 MB.");
  const name = String(body.name ?? "file").replace(/[^\w .()-]/g, "_").slice(0, 100);
  const stored = await drive(ctx, { action: "put", season: season(ctx), student: ctx.actor.name, name, mime: String(body.mime ?? "application/octet-stream"), data });
  const saved = await ctx.data.save(KINDS[kind], { ...row, [field]: { id: String(stored.id), name, size }, touchedAt: now(ctx) } as Doc);
  return { item: saved };
}

/** { kind, id, field } -> { name, mime, data }. Operations, or the student who sent it, opens a file. */
export async function bizFile(ctx: Ctx, body: Doc) {
  const kind = kindOf(body.kind);
  const row = await getRecord(ctx, KINDS[kind], body.id, "item");
  const mine = row.memberId === ctx.actor.id;
  if (!mine && !rolesFor(ctx.actor.badges).business) throw apiError("forbidden", "Only Operations and the student who sent it can open this.");
  const file = row[String(body.field)] as { id: string; name: string } | null;
  if (!file) throw apiError("bad-request", "There is no file there.");
  const got = await drive(ctx, { action: "get", id: file.id });
  return { name: file.name, mime: String(got.mime ?? "application/octet-stream"), data: String(got.data ?? "") };
}

// ----- a restaurant day, grant or pitch -----

const KINDS = { restaurant: COLLECTION_RESTAURANT, grant: COLLECTION_STUDENT_GRANTS, pitch: COLLECTION_PITCHES } as const;
type Kind = keyof typeof KINDS;
const kindOf = (value: unknown): Kind => {
  if (typeof value === "string" && Object.hasOwn(KINDS, value)) return value as Kind;
  throw apiError("bad-request", "Unknown kind.");
};
const SLOTS = { restaurant: 1, grant: 2, pitch: 3 } as const;
const OPTION_FOR = { restaurant: "restaurant", grant: "grant", pitch: "sponsor" } as const;

/** Your own row, or an error: nobody changes someone else's. */
async function own(ctx: Ctx, kind: Kind, id: unknown): Promise<Doc> {
  const row = await getRecord(ctx, KINDS[kind], id, "item");
  if (row.memberId !== ctx.actor.id) throw apiError("forbidden", "That isn't yours.");
  return row;
}

/** { kind, id?, slot?, fields } -> { item }. Makes the item the first time; after that only the fields that are still open change. */
export async function bizItemSave(ctx: Ctx, body: Doc) {
  const kind = kindOf(body.kind);
  const fields = (body.fields ?? {}) as Record<string, unknown>;
  const before = body.id ? ((await own(ctx, kind, body.id)) as unknown) : null;
  const choice = (await recordsOf(ctx, ctx.actor.id)).choice;
  if (choice?.option !== OPTION_FOR[kind]) throw apiError("bad-request", "Pick that option first on My 1-2-3-100.");
  let clean: Doc;
  if (kind === "restaurant") clean = plan(() => cleanRestaurant(fields, before as RestaurantDay | null)) as Doc;
  else if (kind === "grant") clean = plan(() => cleanStudentGrant(fields, before as StudentGrant | null)) as Doc;
  else clean = plan(() => cleanPitch(fields, before as Pitch | null)) as Doc;
  let row: Doc;
  if (before) row = { ...(before as unknown as Doc), ...clean };
  else {
    const slot = Math.floor(Number(body.slot ?? 1));
    if (!(slot >= 1 && slot <= SLOTS[kind])) throw apiError("bad-request", "That is more than you need to do.");
    const mine = (await ctx.data.query(KINDS[kind], { season: season(ctx), memberId: ctx.actor.id, slot }, 1))[0];
    if (mine) throw apiError("bad-request", "You already started that one.");
    row = { season: season(ctx), memberId: ctx.actor.id, slot, ...BLANK[kind], ...clean };
  }
  const saved = await ctx.data.save(KINDS[kind], { ...row, touchedAt: now(ctx) } as Doc);
  return { item: saved };
}

const A = NO_APPROVAL;
const BLANK: Record<Kind, Doc> = {
  restaurant: { restaurant: "", partner: "", date: "", allDay: false, startTime: "", endTime: "", address: "", miles: 0, link: "", notes: "", plan: A, flyer: null, proof: null, setupNotes: "", setUp: false },
  grant: { title: "", organization: "", link: "", deadline: "", asking: "", amount: "", notes: "", application: null, plan: A, submittedOn: "", finalFile: null, resultNotes: "", result: A, trackerId: "" },
  pitch: { company: "", contactName: "", contactEmail: "", contactPhone: "", method: "email", why: "", plan: A, visit: { date: "", who: "", what: "" }, template: "", sentOn: "", sentBy: "", followUps: [], reply: "none", result: { status: "", support: "", amount: "", tier: "", expires: false, endDate: "", followUpsDone: false, notes: "" }, resultApproval: A, trackerId: "" },
};

/** { kind, id, step: "plan" | "result" | "setup" } -> { item }. Sends the step to Operations. */
export async function bizItemSend(ctx: Ctx, body: Doc) {
  const kind = kindOf(body.kind);
  const row = await own(ctx, kind, body.id);
  const at = now(ctx);
  const settings = await settingsOf(ctx);
  let label = "";
  if (kind === "restaurant") {
    const d = row as unknown as RestaurantDay;
    if (body.step === "setup") {
      if (!isApproved(d.plan)) throw apiError("bad-request", "Wait for Operations to approve step 1.");
      if (!d.flyer || !d.proof) throw apiError("bad-request", "Upload the flyer and your proof that you contacted the restaurant.");
      row.setUp = true;
      label = `a restaurant day (${d.restaurant}) that is all set up`;
    } else {
      const problem = restaurantProblem(d);
      if (problem) throw apiError("bad-request", problem);
      const taken = restaurantDaysUsed((await ctx.data.query(COLLECTION_RESTAURANT, { season: season(ctx) }, 200)) as unknown as RestaurantDay[]);
      if (taken >= settings.restaurantLimit) throw apiError("bad-request", `All ${settings.restaurantLimit} restaurant days this year are taken. Pick something else.`);
      row.plan = plan(() => sendApproval(d.plan, at));
      label = `a restaurant day plan (${d.restaurant})`;
    }
  } else if (kind === "grant") {
    const g = row as unknown as StudentGrant;
    if (body.step === "result") {
      if (!isApproved(g.plan)) throw apiError("bad-request", "Wait for Operations to approve step 1.");
      if (!g.submittedOn || !g.finalFile) throw apiError("bad-request", "Type the date you submitted it and upload the submitted application.");
      row.result = plan(() => sendApproval(g.result, at));
      label = `the submitted grant application (${g.title})`;
    } else {
      const problem = grantPlanProblem(g);
      if (problem) throw apiError("bad-request", problem);
      row.plan = plan(() => sendApproval(g.plan, at));
      label = `a grant plan (${g.title})`;
    }
  } else {
    const p = row as unknown as Pitch;
    if (body.step === "result") {
      if (!p.sentOn && !p.visit.date) throw apiError("bad-request", "Say you sent it first.");
      row.resultApproval = plan(() => sendApproval(p.resultApproval, at));
      label = `the result of a sponsor pitch (${p.company})`;
    } else {
      const problem = pitchPlanProblem(p, settings.minWords);
      if (problem) throw apiError("bad-request", problem);
      row.plan = plan(() => sendApproval(p.plan, at));
      label = `a sponsor pitch plan (${p.company})`;
    }
  }
  const saved = await ctx.data.save(KINDS[kind], { ...row, touchedAt: at } as Doc);
  await notify.sendAll(ctx, [notify.rules.bizWaiting(ctx.actor.name, label, await approvers(ctx))]);
  return { item: saved };
}

// ----- after a pitch is sent -----

/** The company's row on the Sponsor tracker: made when its plan is approved, then moved along. */
async function syncSponsor(ctx: Ctx, pitch: Pitch, studentName: string, fields: Partial<Sponsor>): Promise<string> {
  const here = season(ctx);
  const all = (await ctx.data.query(COLLECTION_SPONSORS, { season: here }, 1000)) as unknown as Sponsor[];
  const found = all.find((s) => sameName(s.company, pitch.company));
  const contact = [pitch.contactName, pitch.contactEmail, pitch.contactPhone].filter(Boolean).join(" · ");
  if (found) {
    const clean = cleanSponsor(fields, found, here);
    await ctx.data.save(COLLECTION_SPONSORS, { ...found, ...clean } as unknown as Doc);
    return found._id;
  }
  const clean = cleanSponsor({ company: pitch.company, studentContact: studentName, contact, ...fields }, null, here);
  const saved = await ctx.data.save(COLLECTION_SPONSORS, { ...clean, createdAt: now(ctx) } as unknown as Doc);
  return String(saved._id);
}

/** { id, sentOn, sentBy } -> { item }. "I sent it": the follow-up reminders start. */
export async function bizPitchSent(ctx: Ctx, body: Doc) {
  const p = (await own(ctx, "pitch", body.id)) as unknown as Pitch;
  if (!isApproved(p.plan)) throw apiError("bad-request", "Wait for Operations to approve your plan.");
  const sentOn = typeof body.sentOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.sentOn) ? body.sentOn : ctx.today();
  const settings = await settingsOf(ctx);
  const saved = await ctx.data.save(COLLECTION_PITCHES, { ...p, sentOn, sentBy: String(body.sentBy ?? "email").slice(0, 40), followUps: p.method === "email" ? followUpsFor(sentOn, settings.followUps) : [], reply: "none", touchedAt: now(ctx) } as unknown as Doc);
  await syncSponsor(ctx, p, ctx.actor.name, { status: "2. Pending" });
  return { item: saved };
}

/** { id, reply } -> { item }. The tracker follows; follow-up reminders stop on any reply. */
export async function bizPitchReply(ctx: Ctx, body: Doc) {
  const p = (await own(ctx, "pitch", body.id)) as unknown as Pitch;
  if (!p.sentOn) throw apiError("bad-request", "Say you sent it first.");
  if (!isReply(body.reply)) throw apiError("bad-request", "Pick one of the answers.");
  await syncSponsor(ctx, p, ctx.actor.name, { status: REPLY_STATUS[body.reply] as Sponsor["status"] });
  return { item: await ctx.data.save(COLLECTION_PITCHES, { ...p, reply: body.reply, touchedAt: now(ctx) } as unknown as Doc) };
}

/** { id, n } -> { item }. */
export async function bizFollowUpSent(ctx: Ctx, body: Doc) {
  const p = (await own(ctx, "pitch", body.id)) as unknown as Pitch;
  const followUps = p.followUps.map((f) => (f.n === Number(body.n) ? { ...f, sentOn: ctx.today() } : f));
  return { item: await ctx.data.save(COLLECTION_PITCHES, { ...p, followUps, touchedAt: now(ctx) } as unknown as Doc) };
}

// ----- merch -----

/** { sale: { item, quantity, price, boughtBy, payment? } } -> { sale }. */
export async function bizMerchAdd(ctx: Ctx, body: Doc) {
  const records = await recordsOf(ctx, ctx.actor.id);
  if (records.choice?.option !== "merch") throw apiError("bad-request", "Pick Merch first on My 1-2-3-100.");
  const clean = plan(() => cleanSale((body.sale ?? {}) as Record<string, unknown>, ctx.today()));
  const saved = await ctx.data.save(COLLECTION_MERCH, { season: season(ctx), memberId: ctx.actor.id, ...clean } as unknown as Doc);
  return { sale: saved };
}

/** { id } -> {}. You can take back a sale you added by mistake, until Operations confirms you're done. */
export async function bizMerchRemove(ctx: Ctx, body: Doc) {
  const sale = await getRecord(ctx, COLLECTION_MERCH, body.id, "sale");
  if (sale.memberId !== ctx.actor.id) throw apiError("forbidden", "That isn't yours.");
  const choice = (await recordsOf(ctx, ctx.actor.id)).choice;
  if (choice && isApproved(choice.merchDone)) throw apiError("bad-request", "Operations already confirmed you're done.");
  await ctx.data.remove(COLLECTION_MERCH, String(sale._id));
  return {};
}

/** {} -> { choice }. "Tell Operations I'm done." */
export async function bizMerchDone(ctx: Ctx) {
  const records = await recordsOf(ctx, ctx.actor.id);
  if (records.choice?.option !== "merch") throw apiError("bad-request", "Pick Merch first.");
  if (merchTotal(records.sales) < MERCH_GOAL) throw apiError("bad-request", `Sell $${MERCH_GOAL} first (you have $${merchTotal(records.sales)}).`);
  const merchDone = plan(() => sendApproval(records.choice!.merchDone, now(ctx)));
  const saved = await ctx.data.save(COLLECTION_CHOICES, { ...records.choice, merchDone, touchedAt: now(ctx) } as unknown as Doc);
  await notify.sendAll(ctx, [notify.rules.bizWaiting(ctx.actor.name, `merch sales of $${merchTotal(records.sales)}`, await approvers(ctx))]);
  return { choice: saved };
}

// ----- Operations: approvals -----

export interface ApprovalRow {
  /** What kind of thing, and which one. */
  kind: "restaurant" | "grant" | "pitch" | "merch";
  id: string;
  step: "plan" | "result" | "done";
  memberId: string;
  student: string;
  option: string;
  what: string;
  sentAt: string;
  status: Approval["status"];
}

/** Everything students have sent, as one list. */
async function approvalRows(ctx: Ctx): Promise<ApprovalRow[]> {
  const filter = { season: season(ctx) };
  const [restaurant, grants, pitches, choices, people] = await Promise.all([
    ctx.data.query(COLLECTION_RESTAURANT, filter, 500), ctx.data.query(COLLECTION_STUDENT_GRANTS, filter, 500), ctx.data.query(COLLECTION_PITCHES, filter, 500),
    ctx.data.query(COLLECTION_CHOICES, filter, 500), ctx.data.query(COLLECTION_PEOPLE, {}, 1000),
  ]);
  const names = new Map(people.map((p) => [String(p.memberId), String(p.name)]));
  const row = (kind: ApprovalRow["kind"], d: Doc, step: ApprovalRow["step"], a: Approval, option: string, what: string): ApprovalRow[] =>
    a.status === "draft" ? [] : [{ kind, id: String(d._id), step, memberId: String(d.memberId), student: names.get(String(d.memberId)) ?? "A student", option, what, sentAt: a.sentAt, status: a.status }];
  return [
    ...(restaurant as unknown as RestaurantDay[]).flatMap((d) => row("restaurant", d, "plan", d.plan, "Restaurant day", `${d.restaurant}, ${d.date}`)),
    ...(grants as unknown as StudentGrant[]).flatMap((g) => [...row("grant", g, "plan", g.plan, "Grants", g.title), ...row("grant", g, "result", g.result, "Grants", g.title)]),
    ...(pitches as unknown as Pitch[]).flatMap((p) => [...row("pitch", p, "plan", p.plan, "Sponsor pitches", p.company), ...row("pitch", p, "result", p.resultApproval, "Sponsor pitches", p.company)]),
    ...(choices as unknown as Choice[]).flatMap((c) => row("merch", c, "done", c.merchDone, "Merch", `$${MERCH_GOAL} sold`)),
  ].sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

/** {} -> { rows, restaurantUsed, restaurantLimit }. Everything students sent, newest first. */
export async function bizApprovals(ctx: Ctx) {
  const [rows, settings, taken] = await Promise.all([approvalRows(ctx), settingsOf(ctx), ctx.data.query(COLLECTION_RESTAURANT, { season: season(ctx) }, 200)]);
  return { rows, restaurantUsed: restaurantDaysUsed(taken as unknown as RestaurantDay[]), restaurantLimit: settings.restaurantLimit };
}

/** { kind, id } -> { item, student, others, settings }. The page Operations reads before deciding. */
export async function bizReview(ctx: Ctx, body: Doc) {
  const kind = typeof body.kind === "string" && body.kind === "merch" ? "merch" : kindOf(body.kind);
  const item = kind === "merch" ? await getRecord(ctx, COLLECTION_CHOICES, body.id, "item") : await getRecord(ctx, KINDS[kind], body.id, "item");
  const memberId = String(item.memberId);
  const records = await recordsOf(ctx, memberId);
  return { item, student: await nameOf(ctx, memberId), records, rows: progressRows(records, ctx.today()), settings: await settingsOf(ctx) };
}

const RESULT_TO_STATUS: Record<string, string> = { pending: "2. Pending", discussing: "3. Discussing", accepted: "4. Accepted", declined: "4. Declined", money: "5. Received monetary", inkind: "5. Received in-kind" };

/** { kind, id, step, decision: "approve" | "back", note? } -> { item }. */
export async function bizDecide(ctx: Ctx, body: Doc) {
  const kind = body.kind === "merch" ? "merch" : kindOf(body.kind);
  const collection = kind === "merch" ? COLLECTION_CHOICES : KINDS[kind];
  const row = await getRecord(ctx, collection, body.id, "item");
  const field = kind === "merch" ? "merchDone" : kind === "pitch" && body.step === "result" ? "resultApproval" : body.step === "result" ? "result" : "plan";
  const decided = plan(() => decide(row[field] as Approval, body.decision, ctx.actor.name, body.note, now(ctx)));
  row[field] = decided;
  const approved = decided.status === "approved";
  const student = await nameOf(ctx, String(row.memberId));
  // An approved pitch plan puts the company on the Sponsor tracker; an approved pitch result fills in how it ended; an
  // approved grant result puts the grant on the Grant tracker.
  if (approved && kind === "pitch") {
    const p = row as unknown as Pitch;
    if (body.step === "result") {
      const r = p.result;
      row.trackerId = await syncSponsor(ctx, p, student, { status: (RESULT_TO_STATUS[r.status] ?? "2. Pending") as Sponsor["status"], support: r.support as Sponsor["support"], amount: r.amount.replace(/^\$/, ""), tier: r.tier as Sponsor["tier"], notes: r.notes });
    } else row.trackerId = await syncSponsor(ctx, p, student, { status: "1. Request in progress" });
  }
  if (approved && kind === "grant" && body.step === "result") {
    const g = row as unknown as StudentGrant;
    const here = season(ctx);
    const clean = cleanGrant({ title: g.title, organization: g.organization, link: g.link, writer: student, status: "2. Submitted", deadline: g.deadline, notes: g.resultNotes }, null, here);
    row.trackerId = String((await ctx.data.save(COLLECTION_GRANTS, { ...clean, prior: false, createdAt: now(ctx) } as unknown as Doc))._id);
  }
  const saved = await ctx.data.save(collection, { ...row, touchedAt: now(ctx) } as Doc);
  const what = kind === "merch" ? "your merch sales" : kind === "restaurant" ? "your restaurant day" : kind === "grant" ? `your grant (${row.title})` : `your sponsor pitch (${row.company})`;
  await notify.sendAll(ctx, [notify.rules.bizDecided(what, approved, decided.note, String(row.memberId))]);
  ctx.log({ kind: "biz", id: String(row._id) }, approved ? "approved" : "sent back", `${student}: ${what}`);
  return { item: saved };
}

// ----- Operations: everyone's status -----

/** {} -> { deadline, rows }. Every team member and where they are. */
export async function bizStatus(ctx: Ctx) {
  const filter = { season: season(ctx) };
  const [settings, team, choices, restaurant, grants, pitches, sales] = await Promise.all([
    settingsOf(ctx), teamMembers(ctx), ctx.data.query(COLLECTION_CHOICES, filter, 1000), ctx.data.query(COLLECTION_RESTAURANT, filter, 1000),
    ctx.data.query(COLLECTION_STUDENT_GRANTS, filter, 1000), ctx.data.query(COLLECTION_PITCHES, filter, 1000), ctx.data.query(COLLECTION_MERCH, filter, 3000),
  ]);
  const exempt = new Set(settings.exempt.map((e) => e.memberId));
  const rows = team.map((m) => {
    const by = <T extends Doc>(list: T[]) => list.filter((x) => x.memberId === m.memberId);
    const records: StudentRecords = { choice: (by(choices)[0] as unknown as Choice) ?? null, restaurant: by(restaurant) as unknown as RestaurantDay[], grants: by(grants) as unknown as StudentGrant[], pitches: by(pitches) as unknown as Pitch[], sales: by(sales) as unknown as MerchSale[] };
    const standing = exempt.has(m.memberId) ? ("exempt" as const) : standingOf(records);
    const touched = [...by(choices), ...by(restaurant), ...by(grants), ...by(pitches)].map((x) => String(x.touchedAt ?? "")).sort().pop() ?? "";
    return { memberId: m.memberId, name: m.name, subteams: m.subteams, option: records.choice?.option ?? "", standing, detail: statusDetail(records), lastActivity: touched };
  });
  return { deadline: settings.deadline, exempt: settings.exempt, rows };
}

/** { memberIds? } -> { sent }. A reminder now, to the students (or those named) who aren't done. */
export async function bizRemind(ctx: Ctx, body: Doc) {
  const { rows, deadline } = await bizStatus(ctx);
  const ask = Array.isArray(body.memberIds) ? new Set(body.memberIds.map(String)) : null;
  const to = rows.filter((r) => r.standing !== "done" && r.standing !== "exempt" && (!ask || ask.has(r.memberId))).map((r) => r.memberId);
  if (to.length) await notify.sendAll(ctx, [notify.rules.bizReminder(to, deadline)]);
  ctx.log({ kind: "biz", id: "reminder" }, "reminded", `${to.length} students`);
  return { sent: to.length };
}

// ----- settings -----

/** {} -> { settings }. Students read it too: the deadline and the limits. */
export async function bizGetSettings(ctx: Ctx) {
  return { settings: await settingsOf(ctx) };
}

/** { settings } -> { settings }. Leads. */
export async function bizSaveSettings(ctx: Ctx, body: Doc) {
  const before = await settingsOf(ctx);
  const clean = plan(() => cleanSettings((body.settings ?? {}) as Record<string, unknown>, before));
  const saved = await ctx.data.save(COLLECTION_SETTINGS, { ...(before as unknown as Doc), ...clean } as unknown as Doc);
  ctx.log({ kind: "biz", id: "settings" }, "updated", "1-2-3-100 settings");
  return { settings: saved };
}

// ----- email templates -----

/** {} -> { templates, cc }. The pitch emails students fill in, and who is copied on them. */
export async function bizTemplates(ctx: Ctx) {
  const [templates, settings] = await Promise.all([ctx.data.query(COLLECTION_TEMPLATES, {}, 200), settingsOf(ctx)]);
  return { templates: (templates as unknown as EmailTemplate[]).sort((a, b) => a.order - b.order), cc: settings.pitchCc };
}

// ----- numbers for Stats -----

/** What Stats takes from 1-2-3-100: restaurant days taken, students by standing, and pitches sent each month. */
export async function statsExtra(ctx: Ctx, seasonLabelText: string) {
  if (seasonLabelText !== season(ctx)) return {};
  const [settings, restaurant, status, pitches] = await Promise.all([settingsOf(ctx), ctx.data.query(COLLECTION_RESTAURANT, { season: seasonLabelText }, 500), bizStatus(ctx), ctx.data.query(COLLECTION_PITCHES, { season: seasonLabelText }, 1000)]);
  return {
    restaurant: { used: restaurantDaysUsed(restaurant as unknown as RestaurantDay[]), limit: settings.restaurantLimit },
    progress: standingCounts(status.rows.filter((r) => r.standing !== "exempt").map((r) => r.standing)),
    pitchesByMonth: pitchesByMonth(pitches as unknown as Pitch[], Number(seasonLabelText.slice(0, 4))),
  };
}

// ----- restaurant distance -----

/** An address's latitude and longitude from OpenStreetMap's search, or null when it isn't found. Answers are kept for a day. */
async function geocode(ctx: Ctx, address: string): Promise<{ lat: number; lon: number } | null> {
  const key = `geocode:${address.toLowerCase()}`;
  const cached = ctx.env.cache.get(key);
  if (cached) return JSON.parse(cached) as { lat: number; lon: number } | null;
  const response = await ctx.env.fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(address)}`, { headers: { "User-Agent": "Los-Al-Robotics-Team-6220-operations" } });
  if (!response.ok) throw apiError("bad-request", "We couldn't look that address up right now. Try again in a minute.");
  const [first] = (await response.json()) as { lat: string; lon: string }[];
  const found = first ? { lat: Number(first.lat), lon: Number(first.lon) } : null;
  ctx.env.cache.put(key, JSON.stringify(found), 86400);
  return found;
}

/** { address } -> { miles, far }. Straight-line distance from the school, from OpenStreetMap's search (nothing is stored). */
export async function bizDistance(ctx: Ctx, body: Doc) {
  const address = typeof body.address === "string" ? body.address.trim().slice(0, 200) : "";
  if (address.length < 6) throw apiError("bad-request", "Type the whole address.");
  const found = await geocode(ctx, address);
  if (!found) return { miles: null, far: false };
  const away = miles(SCHOOL, found);
  return { miles: away, far: away > FAR_MILES };
}

