// business: the functions /apps/business uses. Plan: https://github.com/Team-6220/team6220.org/wiki/Operations-Business.
//
//   import { business } from "@team6220/data";
//   const { rows, full } = await business.sponsors("2026–27");   // everyone sees company, stage, student contact; `full` adds the rest
//   await business.saveSponsor({ _id, status: "2. Pending" });  // Operations, leads, mentors and boosters
//
// Every call goes to the team server (/api/ops), which checks who is asking. Demo mode (?demo=lead|member) uses made-up
// data (./mock.ts).
import "./mock"; // the demo data (only used in demo mode)
import "./mock-fundraising";
import { callOps } from "../ops";
import type { BizStats, Grant, GrantPublic, Sponsor, SponsorPublic } from "./types";

export * from "./types";
export { dollars, seasonLabel } from "./plan";

export type SponsorList = { season: string; seasons: string[]; full: boolean; rows: (Sponsor | SponsorPublic)[] };
export type GrantList = { season: string; seasons: string[]; full: boolean; rows: (Grant | GrantPublic)[] };

/** The Sponsor tracker for a season (this one by default). */
export const sponsors = (season?: string): Promise<SponsorList> => callOps("bizSponsors", { season });
/** Anyone on the team adds a company; the rest is filled in as it moves along. */
export const addSponsor = async (sponsor: Partial<Sponsor>) => (await callOps<{ sponsor: Sponsor | SponsorPublic }>("bizAddSponsor", { sponsor })).sponsor;
/** Changes the fields sent. Operations, leads, mentors and boosters. */
export const saveSponsor = async (sponsor: Partial<Sponsor> & { _id: string }) => (await callOps<{ sponsor: Sponsor }>("bizSaveSponsor", { sponsor })).sponsor;
/** Brings last seasons' companies, contacts and notes into this season (not statuses). */
export const importSponsors = async (from: string) => (await callOps<{ added: number }>("bizImportSponsors", { from })).added;

export const grants = (season?: string): Promise<GrantList> => callOps("bizGrants", { season });
export const addGrant = async (grant: Partial<Grant>) => (await callOps<{ grant: Grant | GrantPublic }>("bizAddGrant", { grant })).grant;
export const saveGrant = async (grant: Partial<Grant> & { _id: string }) => (await callOps<{ grant: Grant }>("bizSaveGrant", { grant })).grant;
export const importGrants = async (from: string) => (await callOps<{ added: number }>("bizImportGrants", { from })).added;
/** A received grant's giver becomes a row on the Sponsor tracker, with the note "Received through <grant>". */
export const grantToSponsor = async (grantId: string) => (await callOps<{ sponsor: Sponsor }>("bizGrantToSponsor", { grantId })).sponsor;

export const stats = (season?: string): Promise<{ stats: BizStats; seasons: string[] }> => callOps("bizStats", { season });

// ----- 1-2-3-100 -----
export { FAR_MILES, MERCH_GOAL, MERCH_ITEMS, REPLY_STATUS, followUpsFor, isApproved, isOpen, merchTotal, wordCount } from "./fundraising";
import type { ProgressRow, StudentRecords } from "./fundraising";
import type { Approval, BizSettings, Choice, MerchSale, Option, Pitch, RestaurantDay, StudentGrant, Standing } from "./types";
export type { ProgressRow, StudentRecords };

export type My = { settings: BizSettings; records: StudentRecords; rows: ProgressRow[]; restaurantUsed: number };
export type ItemKind = "restaurant" | "grant" | "pitch";
export type ItemOf<K extends ItemKind> = K extends "restaurant" ? RestaurantDay : K extends "grant" ? StudentGrant : Pitch;
export type ApprovalRow = { kind: ItemKind | "merch"; id: string; step: "plan" | "result" | "done"; memberId: string; student: string; option: string; what: string; sentAt: string; status: Approval["status"] };
export type StatusRow = { memberId: string; name: string; subteams: string[]; option: Option | ""; standing: Standing; progress: number; total: number; merch: number; pitches: number; lastActivity: string };
export type Review = { item: Record<string, unknown> & { _id: string }; student: string; records: StudentRecords; rows: ProgressRow[]; settings: BizSettings };

/** Your pick, your things, and what is left to do. */
export const my = (): Promise<My> => callOps("bizMy");
export const pick = async (option: Option): Promise<Choice> => (await callOps<{ choice: Choice }>("bizPick", { option })).choice;
/** Starts (slot) or changes (id) a restaurant day, grant or pitch. Only the fields still open change. */
export const itemSave = async <K extends ItemKind>(kind: K, fields: Record<string, unknown>, where: { id?: string; slot?: number } = {}): Promise<ItemOf<K>> => (await callOps<{ item: ItemOf<K> }>("bizItemSave", { kind, fields, ...where })).item;
/** Sends a step to Operations: "plan", "result", or (restaurant) "setup". */
export const itemSend = async <K extends ItemKind>(kind: K, id: string, step: "plan" | "result" | "setup"): Promise<ItemOf<K>> => (await callOps<{ item: ItemOf<K> }>("bizItemSend", { kind, id, step })).item;
export const pitchSent = async (id: string, sentOn: string, sentBy: string) => (await callOps<{ item: Pitch }>("bizPitchSent", { id, sentOn, sentBy })).item;
export const pitchReply = async (id: string, reply: string) => (await callOps<{ item: Pitch }>("bizPitchReply", { id, reply })).item;
export const followUpSent = async (id: string, n: number) => (await callOps<{ item: Pitch }>("bizFollowUpSent", { id, n })).item;
export const merchAdd = async (sale: { item: string; quantity: number; price: number; boughtBy: string; payment?: string }) => (await callOps<{ sale: MerchSale }>("bizMerchAdd", { sale })).sale;
export const merchRemove = (id: string) => callOps("bizMerchRemove", { id });
export const merchDone = async () => (await callOps<{ choice: Choice }>("bizMerchDone")).choice;
/** Miles from the school, from the address (null when it isn't found). */
export const distance = (address: string): Promise<{ miles: number | null; far: boolean }> => callOps("bizDistance", { address });

export const approvals = (): Promise<{ rows: ApprovalRow[]; restaurantUsed: number; restaurantLimit: number }> => callOps("bizApprovals");
export const review = (kind: ItemKind | "merch", id: string): Promise<Review> => callOps("bizReview", { kind, id });
export const decide = (kind: ItemKind | "merch", id: string, step: "plan" | "result" | "done", decision: "approve" | "back", note = "") => callOps("bizDecide", { kind, id, step, decision, note });
export const status = (): Promise<{ deadline: string; exempt: { memberId: string; reason: string }[]; rows: StatusRow[] }> => callOps("bizStatus");
export const remind = async (memberIds?: string[]) => (await callOps<{ sent: number }>("bizRemind", { memberIds })).sent;
export const settings = async (): Promise<BizSettings> => (await callOps<{ settings: BizSettings }>("bizGetSettings")).settings;
export const saveSettings = async (changes: Partial<BizSettings>): Promise<BizSettings> => (await callOps<{ settings: BizSettings }>("bizSaveSettings", { settings: changes })).settings;
