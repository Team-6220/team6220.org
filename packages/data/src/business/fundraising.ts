// The 1-2-3-100 rules, worked out in one place: what a student may send, when a step is open, who is done. The server
// (ops/server/fundraising.ts) and the demo backend (./mock.ts) both use this file. No Wix, no network.
// Plan: https://github.com/Team-6220/team6220.org/wiki/Operations-Business
import { BizError, clean } from "./plan";
import { OPTIONS, PITCH_METHODS, REPLIES, type Approval, type BizSettings, type Choice, type MerchSale, type Option, type Pitch, type Reply, type RestaurantDay, type Standing, type StudentGrant } from "./types";

export const COLLECTION_SETTINGS = "biz_settings";
export const COLLECTION_CHOICES = "biz_choices";
export const COLLECTION_RESTAURANT = "biz_restaurant";
export const COLLECTION_STUDENT_GRANTS = "biz_student_grants";
export const COLLECTION_PITCHES = "biz_pitches";
export const COLLECTION_MERCH = "biz_merch_sales";
export const COLLECTION_TEMPLATES = "biz_templates";

/** Los Alamitos High School, for working out how far a restaurant is. */
export const SCHOOL = { lat: 33.7983, lon: -118.0645, name: "Los Alamitos High School" };
/** Over this many miles Operations may ask for somewhere closer. */
export const FAR_MILES = 5;
export const MERCH_GOAL = 100;
export const MERCH_ITEMS = [{ name: "Team shirt", price: 20 }, { name: "Hoodie", price: 40 }, { name: "Sticker pack", price: 5 }, { name: "Hat", price: 15 }] as const;

type Input = Record<string, unknown>;

export function defaultSettings(season: string): Omit<BizSettings, "_id"> {
  return {
    season,
    deadline: "",
    reminders: [{ weeks: 10, everyDays: 35 }, { weeks: 5, everyDays: 21 }, { weeks: 3, everyDays: 14 }, { weeks: 1, everyDays: 7 }, { weeks: 0.29, everyDays: 2 }, { weeks: 0, everyDays: 1 }],
    ways: { discord: true, badge: true, push: true },
    followUps: 2,
    minWords: 75,
    restaurantLimit: 3,
    exempt: [],
    pitchCc: "",
  };
}

/** Settings from a form: numbers kept in range, the deadline a date. */
export function cleanSettings(input: Input, before: Omit<BizSettings, "_id">): Omit<BizSettings, "_id"> {
  const int = (value: unknown, what: string, min: number, max: number) => {
    const n = Math.floor(Number(value));
    if (!(n >= min && n <= max)) throw new BizError(`${what} is a number from ${min} to ${max}.`);
    return n;
  };
  const deadline = clean(input.deadline ?? before.deadline, "deadline", 10);
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) throw new BizError("The deadline is a date.");
  const ways = (input.ways ?? before.ways) as Record<string, unknown>;
  const reminders = Array.isArray(input.reminders) ? (input.reminders as Input[]).map((r) => ({ weeks: Math.max(0, Number(r.weeks) || 0), everyDays: int(r.everyDays, "Days between reminders", 1, 60) })).sort((a, b) => b.weeks - a.weeks) : before.reminders;
  return {
    season: before.season,
    deadline,
    reminders,
    ways: { discord: !!ways.discord, badge: !!ways.badge, push: !!ways.push },
    followUps: "followUps" in input ? int(input.followUps, "Follow-ups per pitch", 0, 5) : before.followUps,
    minWords: "minWords" in input ? int(input.minWords, "The fewest words", 0, 500) : before.minWords,
    restaurantLimit: "restaurantLimit" in input ? int(input.restaurantLimit, "Restaurant days allowed", 0, 50) : before.restaurantLimit,
    pitchCc: "pitchCc" in input ? clean(input.pitchCc, "copy list", 400) : before.pitchCc,
    exempt: Array.isArray(input.exempt) ? (input.exempt as Input[]).map((e) => ({ memberId: clean(e.memberId, "student", 100, true), reason: clean(e.reason, "reason", 200) })) : before.exempt,
  };
}

// ----- approvals -----

/** A student may change what they sent until it is approved (and while it waits, they can't: Operations is reading it). */
export const isOpen = (a: Approval) => a.status === "draft" || a.status === "sent-back";
export const isApproved = (a: Approval) => a.status === "approved";

export function sendApproval(a: Approval, now: string): Approval {
  if (!isOpen(a)) throw new BizError(a.status === "waiting" ? "That is already waiting for Operations." : "That is already approved.");
  return { status: "waiting", sentAt: now, decidedAt: "", by: "", note: "" };
}

export function decide(a: Approval, decision: unknown, by: string, note: unknown, now: string): Approval {
  if (a.status !== "waiting") throw new BizError("That isn't waiting for approval.");
  if (decision === "approve") return { ...a, status: "approved", decidedAt: now, by, note: "" };
  if (decision === "back") return { ...a, status: "sent-back", decidedAt: now, by, note: clean(note, "note", 1000, true) };
  throw new BizError("Approve it, or send it back with a note.");
}

// ----- numbers and dates -----

export const wordCount = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The follow-ups for a pitch sent on `sentOn`: each due a week after the one before. */
export const followUpsFor = (sentOn: string, count: number) => Array.from({ length: count }, (_, i) => ({ n: i + 1, dueOn: addDays(sentOn, 7 * (i + 1)), sentOn: "" }));

/** Straight-line miles between two points. */
export function miles(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const a = Math.sin(rad(to.lat - from.lat) / 2) ** 2 + Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(rad(to.lon - from.lon) / 2) ** 2;
  return Math.round(3958.8 * 2 * Math.asin(Math.sqrt(a)) * 10) / 10;
}

export const merchTotal = (sales: Pick<MerchSale, "quantity" | "price">[]) => sales.reduce((sum, s) => sum + s.quantity * s.price, 0);

/** Restaurant days taken this season: one is taken as soon as a plan is sent, and freed if it is sent back and dropped. */
export const restaurantDaysUsed = (days: Pick<RestaurantDay, "plan">[]) => days.filter((d) => d.plan.status === "waiting" || d.plan.status === "approved").length;

// ----- what a student sends -----

/** The student's pick. They can switch until Operations approves something for their old pick. */
export function pickOption(option: unknown, before: Choice | null, started: boolean): Option {
  if (!(OPTIONS as readonly string[]).includes(option as string)) throw new BizError("Pick one of the four.");
  if (before && before.option && before.option !== option && started) throw new BizError("Operations already approved something for your pick, so it can't be changed now. Ask in #operations.");
  return option as Option;
}

const text = (input: Input, key: string, what: string, max: number, before = "", required = false) => (key in input ? clean(input[key], what, max, required) : before);

/** Restaurant day, step 1 (and 2's notes), from a form. */
export function cleanRestaurant(input: Input, before: RestaurantDay | null): Partial<RestaurantDay> {
  const out: Partial<RestaurantDay> = {};
  const b = before ?? ({} as Partial<RestaurantDay>);
  if (!before || isOpen(before.plan)) {
    out.restaurant = text(input, "restaurant", "restaurant", 100, b.restaurant);
    out.partner = text(input, "partner", "partner", 100, b.partner);
    out.date = text(input, "date", "date", 10, b.date);
    out.allDay = "allDay" in input ? !!input.allDay : (b.allDay ?? true);
    out.startTime = text(input, "startTime", "start time", 5, b.startTime);
    out.endTime = text(input, "endTime", "end time", 5, b.endTime);
    out.address = text(input, "address", "address", 200, b.address);
    out.link = text(input, "link", "link or contact", 300, b.link);
    out.notes = text(input, "notes", "notes", 1000, b.notes);
  }
  if (before && isApproved(before.plan)) out.setupNotes = text(input, "setupNotes", "notes", 1000, b.setupNotes);
  return out;
}

/** Why a restaurant plan can't be sent yet, or "". */
export function restaurantProblem(r: Pick<RestaurantDay, "restaurant" | "partner" | "date" | "address">): string {
  if (!r.restaurant) return "Type the restaurant's name.";
  if (!r.partner) return "A partner is required: the other student doing this with you.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return "Pick the date.";
  if (!r.address) return "Type the address.";
  return "";
}

export function cleanStudentGrant(input: Input, before: StudentGrant | null): Partial<StudentGrant> {
  const out: Partial<StudentGrant> = {};
  const b = before ?? ({} as Partial<StudentGrant>);
  if (!before || isOpen(before.plan)) {
    out.title = text(input, "title", "grant's title", 150, b.title);
    out.organization = text(input, "organization", "organization", 120, b.organization);
    out.link = text(input, "link", "application link", 500, b.link);
    out.deadline = text(input, "deadline", "deadline", 40, b.deadline);
    out.asking = text(input, "asking", "what we are asking for", 1000, b.asking);
    out.amount = text(input, "amount", "amount", 100, b.amount);
    out.notes = text(input, "notes", "notes", 1000, b.notes);
  }
  if (before && isApproved(before.plan) && isOpen(before.result)) {
    out.submittedOn = text(input, "submittedOn", "date", 10, b.submittedOn);
    out.resultNotes = text(input, "resultNotes", "notes", 1000, b.resultNotes);
  }
  return out;
}

export function grantPlanProblem(g: Pick<StudentGrant, "title" | "deadline" | "application">): string {
  if (!g.title) return "Type the grant's title.";
  if (!g.deadline) return "Type the deadline (or Rolling).";
  if (!g.application) return "Upload your application first, so Operations can review it. Don't submit it to the grant yet.";
  return "";
}

export function cleanPitch(input: Input, before: Pitch | null): Partial<Pitch> {
  const out: Partial<Pitch> = {};
  const b = before ?? ({} as Partial<Pitch>);
  if (!before || isOpen(before.plan)) {
    out.company = text(input, "company", "company", 100, b.company);
    out.contactName = text(input, "contactName", "contact name", 100, b.contactName);
    out.contactEmail = text(input, "contactEmail", "contact email", 150, b.contactEmail);
    out.contactPhone = text(input, "contactPhone", "phone", 40, b.contactPhone);
    out.method = "method" in input ? ((PITCH_METHODS as readonly string[]).includes(input.method as string) ? (input.method as Pitch["method"]) : "email") : (b.method ?? "email");
    out.why = text(input, "why", "answer", 3000, b.why);
  }
  if (before && isApproved(before.plan)) {
    if ("visit" in input) {
      const v = (input.visit ?? {}) as Input;
      out.visit = { date: clean(v.date, "date", 10), who: clean(v.who, "name", 100), what: clean(v.what, "notes", 2000) };
    }
    out.template = text(input, "template", "template", 40, b.template);
  }
  if (before && before.sentOn && isOpen(before.resultApproval)) {
    const r = (input.result ?? null) as Input | null;
    if (r) {
      out.result = {
        status: clean(r.status, "status", 40), support: clean(r.support, "support", 40), amount: clean(r.amount, "amount", 100), tier: clean(r.tier, "tier", 20),
        expires: !!r.expires, endDate: clean(r.endDate, "end date", 10), followUpsDone: !!r.followUpsDone, notes: clean(r.notes, "notes", 1000),
      };
    }
  }
  return out;
}

export function pitchPlanProblem(p: Pick<Pitch, "company" | "contactName" | "contactEmail" | "method" | "why">, minWords: number): string {
  if (!p.company) return "Type the company's name.";
  if (!p.contactName) return "Type who you will write to.";
  if (p.method === "email" && !/.+@.+\..+/.test(p.contactEmail)) return "Type the contact's email.";
  if (wordCount(p.why) < minWords) return `"Why this company fits us" needs at least ${minWords} words (you have ${wordCount(p.why)}).`;
  return "";
}

/** The buttons under "Did they reply?" and the Sponsor tracker status each one sets. */
export const REPLY_STATUS: Record<Reply, string> = {
  none: "2. Pending",
  replied: "3. Discussing",
  yes: "4. Accepted",
  no: "4. Declined",
  money: "5. Received monetary",
  inkind: "5. Received in-kind",
};
export const isReply = (value: unknown): value is Reply => (REPLIES as readonly string[]).includes(value as string);

export function cleanSale(input: Input, today: string): Omit<MerchSale, "_id" | "season" | "memberId"> {
  const quantity = Math.floor(Number(input.quantity));
  const price = Number(input.price);
  if (!(quantity >= 1 && quantity <= 100)) throw new BizError("Sell at least one.");
  if (!(price > 0 && price <= 1000)) throw new BizError("Type the price.");
  return { item: clean(input.item, "item", 60, true), quantity, price, boughtBy: clean(input.boughtBy, "who bought it", 100, true), date: today, payment: clean(input.payment, "how the money got to a booster", 30) };
}

// ----- where a student stands -----

export interface StudentRecords {
  choice: Choice | null;
  restaurant: RestaurantDay[];
  grants: StudentGrant[];
  pitches: Pitch[];
  sales: MerchSale[];
}

/** How a student is doing: nothing picked yet, working, waiting on Operations, or done. */
export function standingOf(r: StudentRecords): Standing {
  const option = r.choice?.option;
  if (!option) return "notStarted";
  const waiting =
    r.restaurant.some((d) => d.plan.status === "waiting") || r.grants.some((g) => g.plan.status === "waiting" || g.result.status === "waiting") ||
    r.pitches.some((p) => p.plan.status === "waiting" || p.resultApproval.status === "waiting") || r.choice?.merchDone.status === "waiting";
  if (option === "restaurant" && r.restaurant.some((d) => isApproved(d.plan) && d.setUp)) return "done";
  if (option === "grant" && r.grants.filter((g) => isApproved(g.result)).length >= 2) return "done";
  if (option === "sponsor" && r.pitches.filter((p) => isApproved(p.resultApproval)).length >= 3) return "done";
  if (option === "merch" && isApproved(r.choice!.merchDone)) return "done";
  return waiting ? "waiting" : "inProgress";
}

export interface ProgressRow {
  step: string;
  status: "Done" | "Approved" | "Waiting" | "Sent back" | "Due now" | "Your turn" | "Not started";
}

/** "Your progress": one line per step of the student's pick. */
export function progressRows(r: StudentRecords, today: string): ProgressRow[] {
  const option = r.choice?.option;
  if (!option) return [];
  const approvalStatus = (a: Approval): ProgressRow["status"] => (a.status === "approved" ? "Approved" : a.status === "waiting" ? "Waiting" : a.status === "sent-back" ? "Sent back" : "Your turn");
  const rows: ProgressRow[] = [{ step: `Pick one: ${{ restaurant: "Restaurant day", grant: "Grants", sponsor: "Sponsor pitches", merch: "Merch" }[option]}`, status: "Done" }];
  if (option === "restaurant") {
    const d = r.restaurant[0];
    rows.push({ step: d ? `Step 1: plan for ${d.restaurant || "your restaurant"}` : "Step 1: plan", status: d ? approvalStatus(d.plan) : "Not started" });
    rows.push({ step: "Step 2: fully set up", status: d?.setUp ? "Done" : d && isApproved(d.plan) ? "Your turn" : "Not started" });
  } else if (option === "grant") {
    for (const slot of [1, 2]) {
      const g = r.grants.find((x) => x.slot === slot);
      rows.push({ step: `Grant ${slot}: plan${g?.title ? ` for ${g.title}` : ""}`, status: g ? approvalStatus(g.plan) : "Not started" });
      rows.push({ step: `Grant ${slot}: submitted application`, status: g && isApproved(g.plan) ? (isApproved(g.result) ? "Approved" : g.result.status === "waiting" ? "Waiting" : "Your turn") : "Not started" });
    }
  } else if (option === "sponsor") {
    for (const slot of [1, 2, 3]) {
      const p = r.pitches.find((x) => x.slot === slot);
      if (!p) { if (slot === 1 || r.pitches.length >= slot - 1) rows.push({ step: slot === 1 ? "Pitch 1" : `Pitch ${slot}`, status: "Not started" }); continue; }
      rows.push({ step: `Pitch ${slot}: plan for ${p.company || "a company"}`, status: approvalStatus(p.plan) });
      if (p.sentOn) {
        rows.push({ step: `Pitch ${slot}: ${p.method === "email" ? "email" : p.method === "phone" ? "call" : "visit"} ${p.method === "email" ? "sent" : "done"} ${p.sentOn.slice(5).replace("-", "/")}`, status: "Done" });
        for (const f of p.followUps) rows.push({ step: `Pitch ${slot}: follow-up ${f.n} (due ${f.dueOn.slice(5).replace("-", "/")})`, status: f.sentOn ? "Done" : p.reply !== "none" ? "Not started" : f.dueOn <= today ? "Due now" : "Not started" });
        rows.push({ step: `Pitch ${slot}: result`, status: approvalStatus(p.resultApproval) === "Your turn" ? "Not started" : approvalStatus(p.resultApproval) });
      }
    }
  } else {
    rows.push({ step: `Sell $${MERCH_GOAL}: $${merchTotal(r.sales)} so far`, status: merchTotal(r.sales) >= MERCH_GOAL ? "Done" : "Your turn" });
    rows.push({ step: "Tell Operations you're done", status: r.choice!.merchDone.status === "draft" ? "Not started" : approvalStatus(r.choice!.merchDone) });
  }
  return rows;
}


// ----- email templates -----

/** What a template's [Brackets] are filled with. Anything else in brackets is left as typed. */
export function fillTemplate(text: string, values: Record<string, string>): string {
  return text.replace(/\[([^\]]+)\]/g, (whole, name: string) => (name in values && values[name] ? values[name] : whole));
}

/** The short line under a student's name on Everyone's status: "Plan sent", "2 of 3", "$45 of $100". */
export function statusDetail(r: StudentRecords): string {
  switch (r.choice?.option) {
    case "restaurant": {
      const d = r.restaurant[0];
      return !d ? "" : d.setUp ? "Set up" : d.plan.status === "approved" ? "Plan approved" : d.plan.status === "waiting" ? "Plan sent" : d.plan.status === "sent-back" ? "Plan sent back" : "Plan started";
    }
    case "grant": return `${r.grants.filter((g) => isApproved(g.result)).length} of 2`;
    case "sponsor": return `${r.pitches.filter((p) => isApproved(p.resultApproval)).length} of 3`;
    case "merch": return `$${merchTotal(r.sales)} of $${MERCH_GOAL}`;
    default: return "";
  }
}

/** Sponsor pitches sent by the end of each month, August to January (a running total). `startYear` is the season's first year. */
export function pitchesByMonth(pitches: Pick<Pitch, "sentOn" | "visit">[], startYear: number): number[] {
  const months = [[startYear, 8], [startYear, 9], [startYear, 10], [startYear, 11], [startYear, 12], [startYear + 1, 1]] as const;
  return months.map(([year, month]) => {
    const end = `${year}-${String(month).padStart(2, "0")}-31`;
    return pitches.filter((p) => (p.sentOn || p.visit.date) && (p.sentOn || p.visit.date) <= end).length;
  });
}

/** Students by standing, for Stats. Exempt students are left out. */
export function standingCounts(standings: Standing[]) {
  const n = (s: Standing) => standings.filter((x) => x === s).length;
  return { done: n("done"), waiting: n("waiting"), inProgress: n("inProgress"), notStarted: n("notStarted") };
}

/** How many days apart reminders are, this close to the deadline: the first step whose "above" is below the weeks left. */
export function reminderEvery(steps: BizSettings["reminders"], daysLeft: number): number {
  const weeksLeft = daysLeft / 7;
  const sorted = steps.slice().sort((a, b) => b.weeks - a.weeks);
  return (sorted.find((step) => weeksLeft > step.weeks) ?? sorted[sorted.length - 1])?.everyDays ?? 1;
}

/** Whole days from one yyyy-mm-dd to another. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
}
