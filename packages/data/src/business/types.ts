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
  /** What kind of funder it is (Stats counts grants by kind). Empty until someone picks one. */
  kind: GrantKind | "";
  createdAt: string;
}

/** What kind of funder a grant is, for the Stats screen. */
export const GRANT_KINDS = ["FIRST / FRC-specific", "Local (school, city)", "Corporate", "Foundation", "Government"] as const;
export type GrantKind = (typeof GRANT_KINDS)[number];

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
  /** Grants filled out (stage 2 and on) and accepted, for each kind. */
  kinds: { kind: GrantKind; filled: number; accepted: number }[];
  /** Money raised in each season that has anything, oldest first. */
  seasonsRaised: { season: string; raised: number }[];
  /** Sponsor pitches sent by the end of each month, August to January (a running total). */
  pitchesByMonth: number[];
  /** Restaurant fundraiser days taken this season, and the limit. */
  restaurant: { used: number; limit: number };
  /** Students by 1-2-3-100 status. */
  progress: { done: number; waiting: number; inProgress: number; notStarted: number };
}

/** The first number of a status: its stage. */
export const stageOf = (status: string): number => Number(status.slice(0, 1)) || 0;

/** A row's own fields, before it is saved: no _id or createdAt (and none of Item's catch-all index signature). */
export type NewRow<T> = { [K in keyof T as string extends K ? never : K extends "_id" | "createdAt" ? never : K]: T[K] };

// ---------------------------------------------------------------------------------------------------------------------
// 1-2-3-100: each student does one of four things, and Operations approves the plan before they start and the result after.
// ---------------------------------------------------------------------------------------------------------------------

export const OPTIONS = ["restaurant", "grant", "sponsor", "merch"] as const;
export type Option = (typeof OPTIONS)[number];

/** A file kept in the team's Google Drive folder. Only Operations and the student who sent it can open it. */
export interface FileRef {
  id: string;
  name: string;
  size: number;
}

/** Operations' answer to something a student sent. A student can change it until it is approved. */
export interface Approval {
  status: "draft" | "waiting" | "approved" | "sent-back";
  sentAt: string;
  decidedAt: string;
  /** Who decided. */
  by: string;
  /** What Operations said when sending it back. */
  note: string;
}
export const NO_APPROVAL: Approval = { status: "draft", sentAt: "", decidedAt: "", by: "", note: "" };

/** One student's pick for a season (collection biz_choices). */
export interface Choice extends Item {
  season: string;
  memberId: string;
  option: Option | "";
  /** Merch only: "I'm done", confirmed by Operations. */
  merchDone: Approval;
}

export interface RestaurantDay extends Item {
  season: string;
  memberId: string;
  restaurant: string;
  /** The other student doing it with them (required). */
  partner: string;
  date: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  address: string;
  /** Miles from Los Alamitos High School, worked out from the address (0 until it is). */
  miles: number;
  link: string;
  notes: string;
  /** Step 1: approval to do it. */
  plan: Approval;
  /** Step 2. */
  flyer: FileRef | null;
  proof: FileRef | null;
  setupNotes: string;
  /** "Tell Operations it's all set up": there is no result to approve. */
  setUp: boolean;
}

/** One of a student's two grants (collection biz_student_grants). Its result becomes a row on the Grant tracker. */
export interface StudentGrant extends Item {
  season: string;
  memberId: string;
  slot: number;
  title: string;
  organization: string;
  link: string;
  deadline: string;
  asking: string;
  amount: string;
  notes: string;
  application: FileRef | null;
  plan: Approval;
  submittedOn: string;
  finalFile: FileRef | null;
  resultNotes: string;
  result: Approval;
  /** The Grant tracker row the approved result wrote. */
  trackerId: string;
}

export const PITCH_METHODS = ["email", "person", "phone"] as const;
export type PitchMethod = (typeof PITCH_METHODS)[number];
export const REPLIES = ["none", "replied", "yes", "no", "money", "inkind"] as const;
export type Reply = (typeof REPLIES)[number];

/** One of a student's three sponsor pitches (collection biz_pitches). Its result becomes a row on the Sponsor tracker. */
export interface Pitch extends Item {
  season: string;
  memberId: string;
  slot: number;
  company: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  method: PitchMethod;
  /** "Why this company fits us": at least the minimum number of words (a setting). */
  why: string;
  plan: Approval;
  /** In person or by phone: what happened. */
  visit: { date: string; who: string; what: string };
  template: string;
  /** When it was sent, and how. */
  sentOn: string;
  sentBy: string;
  /** Follow-ups, each due a week after the one before. */
  followUps: { n: number; dueOn: string; sentOn: string }[];
  reply: Reply;
  result: { status: string; support: string; amount: string; tier: string; expires: boolean; endDate: string; followUpsDone: boolean; notes: string };
  resultApproval: Approval;
  trackerId: string;
}

export interface MerchSale extends Item {
  season: string;
  memberId: string;
  item: string;
  quantity: number;
  /** Price of one, in dollars. */
  price: number;
  /** Who bought it: a description is fine ("friend", "Mr. Jones"). */
  boughtBy: string;
  date: string;
  /** How the money got to a booster. */
  payment: string;
}

export interface ExemptStudent {
  memberId: string;
  reason: string;
}
export interface ReminderStep {
  /** From this many weeks before the deadline, down to the next step. */
  weeks: number;
  everyDays: number;
}
/** The 1-2-3-100 settings for one season (collection biz_settings). Leads change them. */
export interface BizSettings extends Item {
  season: string;
  /** The due date for everyone, yyyy-mm-dd. */
  deadline: string;
  reminders: ReminderStep[];
  /** How reminders arrive. */
  ways: { discord: boolean; badge: boolean; push: boolean };
  followUps: number;
  minWords: number;
  restaurantLimit: number;
  exempt: ExemptStudent[];
}

/** A student's overall standing, for Everyone's status and Stats. */
export type Standing = "done" | "waiting" | "inProgress" | "notStarted" | "exempt";
