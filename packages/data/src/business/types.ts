import type { Item } from "../ops/types";

// What the Business app keeps. Plan: https://github.com/Team-6220/team6220.org/wiki/Operations-Business
// Every collection is Admin-only in Wix and is reached through /api/ops, which decides who sees which fields.

/** A sponsor's stage on the Sponsor tracker. The number is the stage; two statuses share stage 4 and 5. */
export const SPONSOR_STATUSES = ["0. Needs research", "1. Request in progress", "2. Pending", "3. Discussing", "4. Accepted", "4. Declined", "5. Received monetary", "5. Received in-kind"] as const;
export type SponsorStatus = (typeof SPONSOR_STATUSES)[number];

/** A grant's stage on the Grant tracker. */
export const GRANT_STATUSES = ["0. Needs research", "1. Applying", "2. Submitted", "3. Follow-up", "4. Accepted", "4. Declined", "5. Received"] as const;
export type GrantStatus = (typeof GRANT_STATUSES)[number];

export const TIERS = ["Lion", "Eagle", "Griffin"] as const;
export type Tier = (typeof TIERS)[number];

export const SUPPORT_TYPES = ["Sponsorship (money)", "In-kind", "Both"] as const;
export type SupportType = (typeof SUPPORT_TYPES)[number];

/** The stage's name, shown in the "How it works" key and the tab counts. */
export const SPONSOR_STAGES = ["Needs research", "Request in progress", "Pending", "Discussing", "Decided", "Received"] as const;
export const GRANT_STAGES = ["Needs research", "Applying", "Submitted", "Follow-up", "Decided", "Received"] as const;

/** One company on the Sponsor tracker (`biz_sponsors`). */
export interface Sponsor extends Item {
  /** The school year it was added in: "2026–27". */
  season: string;
  company: string;
  /** The student to ask: free text, or a person from the roster. */
  studentContact: string;
  /** Who to write to, as one line: "Bruce · bruce@example.com · (555) 010-0102". */
  contact: string;
  status: SponsorStatus;
  support: SupportType | "";
  /** The amount or what they are giving: "$1,000" or "Laser cut parts". */
  amount: string;
  notes: string;
  tier: Tier | "";
  /** Accepted in any earlier season: shown as small grey text under the name. */
  prior: boolean;
  createdAt: string;
}

/** What everyone on the team sees of a sponsor: enough that two people never pitch the same company. */
export type SponsorPublic = Pick<Sponsor, "_id" | "season" | "company" | "studentContact" | "status" | "prior">;

/** One grant on the Grant tracker (`biz_grants`). */
export interface Grant extends Item {
  season: string;
  title: string;
  organization: string;
  link: string;
  /** Who is writing it. */
  writer: string;
  status: GrantStatus;
  /** As typed: "Jan 17, 2026", "Rolling". */
  deadline: string;
  /** What was received (or asked for): "$2,000". */
  amount: string;
  notes: string;
  /** The application's questions, which also load into the Answer bank. */
  questions: string;
  /** Received in an earlier season. */
  prior: boolean;
  /** A received grant's giver was added to the Sponsor tracker. */
  sponsored: boolean;
  createdAt: string;
}

export type GrantPublic = Pick<Grant, "_id" | "season" | "title" | "link" | "status" | "deadline" | "prior">;

/** The numbers on the Stats screen. */
export interface BizStats {
  season: string;
  /** Money raised this season, from received sponsors' and grants' amounts. */
  raised: { sponsors: number; grants: number };
  /** Sponsors at each stage 0 to 5, and how the decided ones ended. */
  sponsorStages: number[];
  pitches: { accepted: number; declined: number; deciding: number };
  grantStages: number[];
  grants: { applied: number; accepted: number };
}

/** The first number of a status: its stage. */
export const stageOf = (status: string): number => Number(status.slice(0, 1)) || 0;

/** A row's own fields, before it is saved: no _id or createdAt (and none of Item's catch-all index signature). */
export type NewRow<T> = { [K in keyof T as string extends K ? never : K extends "_id" | "createdAt" ? never : K]: T[K] };
