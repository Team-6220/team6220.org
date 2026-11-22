// business: the functions /apps/business uses. Plan: https://github.com/Team-6220/team6220.org/wiki/Operations-Business.
//
//   import { business } from "@team6220/data";
//   const { rows, full } = await business.sponsors("2026–27");   // everyone sees company, stage, student contact; `full` adds the rest
//   await business.saveSponsor({ _id, status: "2. Pending" });  // Operations, leads, mentors and boosters
//
// Every call goes to the team server (/api/ops), which checks who is asking. Demo mode (?demo=lead|member) uses made-up
// data (./mock.ts).
import "./mock"; // the demo data (only used in demo mode)
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
