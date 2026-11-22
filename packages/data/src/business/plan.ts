// The Business app's rules, worked out in one place. The server (ops/server/business.ts) and the demo backend (./mock.ts)
// both use this file, so a rule is written once. No Wix, no network. Plan: https://github.com/Team-6220/team6220.org/wiki/Operations-Business
import { seasonOf } from "../attendance/stats";
import { GRANT_STATUSES, SPONSOR_STATUSES, SUPPORT_TYPES, TIERS, stageOf, type BizStats, type Grant, type GrantPublic, type NewRow, type Sponsor, type SponsorPublic } from "./types";

export const COLLECTION_SPONSORS = "biz_sponsors";
export const COLLECTION_GRANTS = "biz_grants";

/** A rule the person broke ("Type the company's name"). The server turns it into a bad-request answer. */
export class BizError extends Error {}

type Input = Record<string, unknown>;

/** Trimmed text, cut to `max`; with `required`, empty text is an error. */
export function clean(value: unknown, what: string, max: number, required = false): string {
  const text = typeof value === "string" ? value.trim().slice(0, max) : "";
  if (required && !text) throw new BizError(`Type the ${what}.`);
  return text;
}

/** "2026-11-21" -> "2026–27" (the school year it is in). */
export function seasonLabel(date: string): string {
  const start = Number(seasonOf(date));
  return `${start}–${String(start + 1).slice(2)}`;
}

// ----- the Sponsor tracker -----

/** A new company, or changes to one. Only the fields sent are changed; the rest stay as they were. */
export function cleanSponsor(input: Input, before: Sponsor | null, season: string): NewRow<Sponsor> {
  const pick = <T extends readonly string[]>(list: T, value: unknown, fallback: T[number] | ""): T[number] | "" => (typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T[number]) : fallback);
  const has = (key: string) => key in input;
  const base = before ?? { season, company: "", studentContact: "", contact: "", status: SPONSOR_STATUSES[0], support: "" as const, amount: "", notes: "", tier: "" as const, prior: false };
  return {
    season: base.season,
    company: has("company") ? clean(input.company, "company's name", 100, true) : base.company,
    studentContact: has("studentContact") ? clean(input.studentContact, "student contact", 100) : base.studentContact,
    contact: has("contact") ? clean(input.contact, "contact", 250) : base.contact,
    status: has("status") ? (pick(SPONSOR_STATUSES, input.status, base.status) as Sponsor["status"]) : base.status,
    support: has("support") ? (pick(SUPPORT_TYPES, input.support, "") as Sponsor["support"]) : base.support,
    amount: has("amount") ? clean(input.amount, "amount", 100) : base.amount,
    notes: has("notes") ? clean(input.notes, "notes", 2000) : base.notes,
    tier: has("tier") ? (pick(TIERS, input.tier, "") as Sponsor["tier"]) : base.tier,
    prior: base.prior,
  };
}

/** What everyone on the team sees. */
export const publicSponsor = (s: Sponsor): SponsorPublic => ({ _id: s._id, season: s.season, company: s.company, studentContact: s.studentContact, status: s.status, prior: s.prior });

/** The same company in another season, ignoring case and extra spaces. */
export const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Companies that said yes (Accepted or Received) in any season: a new row for one of them is a prior sponsor. */
export function priorNames(all: { company: string; status: string; season: string }[], season: string): string[] {
  return all.filter((s) => s.season !== season && stageOf(s.status) >= 4 && s.status !== "4. Declined").map((s) => s.company);
}

/**
 * Copies last seasons' companies into this one: the company, its contact and its notes, but not its status. A company
 * that was accepted in any earlier season is marked Prior. Companies already in this season are left alone.
 */
export function importSponsors(from: Sponsor[], here: Sponsor[], everything: Sponsor[], season: string): NewRow<Sponsor>[] {
  const prior = priorNames(everything, season);
  const out: NewRow<Sponsor>[] = [];
  for (const s of from) {
    if (here.some((h) => sameName(h.company, s.company)) || out.some((o) => sameName(o.company, s.company))) continue;
    out.push({ ...cleanSponsor({ company: s.company, contact: s.contact, notes: s.notes }, null, season), prior: prior.some((p) => sameName(p, s.company)) });
  }
  return out;
}

// ----- the Grant tracker -----

export function cleanGrant(input: Input, before: Grant | null, season: string): NewRow<Grant> {
  const has = (key: string) => key in input;
  const base = before ?? { season, title: "", organization: "", link: "", writer: "", status: GRANT_STATUSES[0], deadline: "", amount: "", notes: "", questions: "", prior: false, sponsored: false };
  const status = typeof input.status === "string" && (GRANT_STATUSES as readonly string[]).includes(input.status) ? (input.status as Grant["status"]) : base.status;
  return {
    season: base.season,
    title: has("title") ? clean(input.title, "grant's title", 150, true) : base.title,
    organization: has("organization") ? clean(input.organization, "organization", 120) : base.organization,
    link: has("link") ? clean(input.link, "application link", 500) : base.link,
    writer: has("writer") ? clean(input.writer, "writer", 100) : base.writer,
    status: has("status") ? status : base.status,
    deadline: has("deadline") ? clean(input.deadline, "deadline", 40) : base.deadline,
    amount: has("amount") ? clean(input.amount, "amount", 100) : base.amount,
    notes: has("notes") ? clean(input.notes, "notes", 2000) : base.notes,
    questions: has("questions") ? clean(input.questions, "questions", 6000) : base.questions,
    prior: base.prior,
    sponsored: base.sponsored,
  };
}

export const publicGrant = (g: Grant): GrantPublic => ({ _id: g._id, season: g.season, title: g.title, link: g.link, status: g.status, deadline: g.deadline, prior: g.prior });

/** Grants that were received in any other season. */
export const priorGrantTitles = (all: { title: string; status: string; season: string }[], season: string): string[] => all.filter((g) => g.season !== season && stageOf(g.status) >= 4 && g.status !== "4. Declined").map((g) => g.title);

export function importGrants(from: Grant[], here: Grant[], everything: Grant[], season: string): NewRow<Grant>[] {
  const prior = priorGrantTitles(everything, season);
  const out: NewRow<Grant>[] = [];
  for (const g of from) {
    if (here.some((h) => sameName(h.title, g.title)) || out.some((o) => sameName(o.title, g.title))) continue;
    out.push({ ...cleanGrant({ title: g.title, organization: g.organization, link: g.link, notes: g.notes, questions: g.questions }, null, season), prior: prior.some((p) => sameName(p, g.title)) });
  }
  return out;
}

// ----- numbers -----

/** "1,500" or "$1,500" -> 1500, "986.15 + 78.89 tax" -> 986.15 (the first amount), "Laser cut parts" -> 0. */
export function dollars(text: string): number {
  const match = text.replace(/,/g, "").match(/^\s*\$?\s*(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

/** The Stats screen's numbers for one season. */
export function statsFor(season: string, sponsors: Sponsor[], grants: Grant[]): BizStats {
  const mine = sponsors.filter((s) => s.season === season);
  const gmine = grants.filter((g) => g.season === season);
  const count = (stages: number[], rows: { status: string }[]) => stages.map((n) => rows.filter((r) => stageOf(r.status) === n).length);
  return {
    season,
    raised: {
      sponsors: mine.filter((s) => s.status.startsWith("5. Received")).reduce((sum, s) => sum + dollars(s.amount), 0),
      grants: gmine.filter((g) => g.status === "5. Received").reduce((sum, g) => sum + dollars(g.amount), 0),
    },
    sponsorStages: count([0, 1, 2, 3, 4, 5], mine),
    pitches: {
      accepted: mine.filter((s) => s.status === "4. Accepted" || s.status.startsWith("5. Received")).length,
      declined: mine.filter((s) => s.status === "4. Declined").length,
      deciding: mine.filter((s) => stageOf(s.status) >= 2 && stageOf(s.status) <= 3).length,
    },
    grantStages: count([0, 1, 2, 3, 4, 5], gmine),
    grants: { applied: gmine.filter((g) => stageOf(g.status) >= 2).length, accepted: gmine.filter((g) => g.status === "4. Accepted" || g.status === "5. Received").length },
  };
}
