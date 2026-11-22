// Business on the server: the Sponsor tracker, the Grant tracker and Stats. Plan: https://github.com/Team-6220/team6220.org/wiki/Operations-Business. SERVER ONLY.
//
// Everyone on the team sees a company or grant and its stage (so two people never pitch the same company). Operations,
// leads, mentors and boosters (the `business` role) also see contacts, amounts and notes, and can change anything.
// The rules (what a field may hold, what a prior sponsor is, the numbers) are in ../../business/plan.ts, which the demo
// backend uses too.
//   bizSponsors / bizAddSponsor / bizSaveSponsor / bizImportSponsors     the Sponsor tracker
//   bizGrants / bizAddGrant / bizSaveGrant / bizImportGrants             the Grant tracker
//   bizGrantToSponsor                                                    a received grant becomes a sponsor row
//   bizStats                                                             the season's numbers
import { BizError, COLLECTION_GRANTS, COLLECTION_SPONSORS, cleanGrant, cleanSponsor, importGrants, importSponsors, priorGrantTitles, priorNames, publicGrant, publicSponsor, sameName, seasonLabel, statsFor } from "../../business/plan";
import type { Grant, Sponsor } from "../../business/types";
import { rolesFor } from "../roles";
import { statsExtra } from "./fundraising";
import { getRecord, type Ctx } from "./context";
import { apiError, type Doc } from "./env";

export const BUSINESS_COLLECTIONS = [COLLECTION_SPONSORS, COLLECTION_GRANTS] as const;

function plan<T>(step: () => T): T {
  try {
    return step();
  } catch (e) {
    if (e instanceof BizError) throw apiError("bad-request", e.message);
    throw e;
  }
}

const isBusiness = (ctx: Ctx) => rolesFor(ctx.actor.badges).business;
const season = (ctx: Ctx, body: Doc) => (typeof body.season === "string" && /^\d{4}–\d{2}$/.test(body.season) ? body.season : seasonLabel(ctx.today()));
const seasonsOf = (rows: { season: string }[], now: string) => [...new Set([seasonLabel(now), ...rows.map((r) => r.season)])].sort().reverse();

async function allSponsors(ctx: Ctx): Promise<Sponsor[]> {
  return (await ctx.data.query(COLLECTION_SPONSORS, {}, 1000)) as unknown as Sponsor[];
}
async function allGrants(ctx: Ctx): Promise<Grant[]> {
  return (await ctx.data.query(COLLECTION_GRANTS, {}, 1000)) as unknown as Grant[];
}
const byName = <T extends { company?: string; title?: string }>(a: T, b: T) => (a.company ?? a.title ?? "").localeCompare(b.company ?? b.title ?? "");

// ----- Sponsor tracker -----

/** { season? } -> { season, seasons, full, rows }. `full` rows (with contacts, amounts and notes) only for the business role. */
export async function bizSponsors(ctx: Ctx, body: Doc) {
  const all = await allSponsors(ctx);
  const here = season(ctx, body);
  const rows = all.filter((s) => s.season === here).sort(byName);
  const full = isBusiness(ctx);
  return { season: here, seasons: seasonsOf(all, ctx.today()), full, rows: full ? rows : rows.map(publicSponsor) };
}

/** { sponsor: { company, studentContact?, contact? } } -> { sponsor }. Anyone on the team can add a company. */
export async function bizAddSponsor(ctx: Ctx, body: Doc) {
  const input = (body.sponsor ?? {}) as Record<string, unknown>;
  const here = seasonLabel(ctx.today());
  const all = await allSponsors(ctx);
  const clean = plan(() => cleanSponsor({ company: input.company, studentContact: input.studentContact, contact: input.contact }, null, here));
  if (all.some((s) => s.season === here && sameName(s.company, clean.company))) throw apiError("bad-request", `${clean.company} is already on the tracker.`);
  const prior = priorNames(all, here).some((p) => sameName(p, clean.company));
  const saved = (await ctx.data.save(COLLECTION_SPONSORS, { ...clean, prior, createdAt: ctx.env.now().toISOString() } as unknown as Doc)) as unknown as Sponsor;
  ctx.log({ kind: "sponsor", id: String(saved._id) }, "created", saved.company);
  return { sponsor: isBusiness(ctx) ? saved : publicSponsor(saved) };
}

/** { sponsor: { _id, ...fields } } -> { sponsor }. Only the fields sent change. */
export async function bizSaveSponsor(ctx: Ctx, body: Doc) {
  const input = (body.sponsor ?? {}) as Record<string, unknown>;
  const before = (await getRecord(ctx, COLLECTION_SPONSORS, input._id, "company")) as unknown as Sponsor;
  const clean = plan(() => cleanSponsor(input, before, before.season));
  const saved = (await ctx.data.save(COLLECTION_SPONSORS, { ...before, ...clean } as unknown as Doc)) as unknown as Sponsor;
  if (before.status !== saved.status) ctx.log({ kind: "sponsor", id: String(saved._id) }, "status", `${saved.company}: ${saved.status}`);
  return { sponsor: saved };
}

/** { from: "2025–26" } -> { added }. Companies, contacts and notes come over, not statuses; earlier yeses are marked Prior. */
export async function bizImportSponsors(ctx: Ctx, body: Doc) {
  const here = seasonLabel(ctx.today());
  const all = await allSponsors(ctx);
  const rows = importSponsors(all.filter((s) => s.season === body.from), all.filter((s) => s.season === here), all, here);
  const now = ctx.env.now().toISOString();
  if (rows.length) await ctx.data.insertMany(COLLECTION_SPONSORS, rows.map((r) => ({ ...r, createdAt: now }) as unknown as Doc));
  ctx.log({ kind: "sponsor", id: "import" }, "imported", `${rows.length} from ${String(body.from)}`);
  return { added: rows.length };
}

// ----- Grant tracker -----

export async function bizGrants(ctx: Ctx, body: Doc) {
  const all = await allGrants(ctx);
  const here = season(ctx, body);
  const rows = all.filter((g) => g.season === here).sort(byName);
  const full = isBusiness(ctx);
  return { season: here, seasons: seasonsOf(all, ctx.today()), full, rows: full ? rows : rows.map(publicGrant) };
}

/** { grant: { title, link? } } -> { grant }. Anyone on the team can add a grant. */
export async function bizAddGrant(ctx: Ctx, body: Doc) {
  const input = (body.grant ?? {}) as Record<string, unknown>;
  const here = seasonLabel(ctx.today());
  const all = await allGrants(ctx);
  const clean = plan(() => cleanGrant({ title: input.title, link: input.link }, null, here));
  if (all.some((g) => g.season === here && sameName(g.title, clean.title))) throw apiError("bad-request", `${clean.title} is already on the tracker.`);
  const prior = priorGrantTitles(all, here).some((p) => sameName(p, clean.title));
  const saved = (await ctx.data.save(COLLECTION_GRANTS, { ...clean, prior, createdAt: ctx.env.now().toISOString() } as unknown as Doc)) as unknown as Grant;
  ctx.log({ kind: "grant", id: String(saved._id) }, "created", saved.title);
  return { grant: isBusiness(ctx) ? saved : publicGrant(saved) };
}

export async function bizSaveGrant(ctx: Ctx, body: Doc) {
  const input = (body.grant ?? {}) as Record<string, unknown>;
  const before = (await getRecord(ctx, COLLECTION_GRANTS, input._id, "grant")) as unknown as Grant;
  const clean = plan(() => cleanGrant(input, before, before.season));
  const saved = (await ctx.data.save(COLLECTION_GRANTS, { ...before, ...clean } as unknown as Doc)) as unknown as Grant;
  if (before.status !== saved.status) ctx.log({ kind: "grant", id: String(saved._id) }, "status", `${saved.title}: ${saved.status}`);
  return { grant: saved };
}

export async function bizImportGrants(ctx: Ctx, body: Doc) {
  const here = seasonLabel(ctx.today());
  const all = await allGrants(ctx);
  const rows = importGrants(all.filter((g) => g.season === body.from), all.filter((g) => g.season === here), all, here);
  const now = ctx.env.now().toISOString();
  if (rows.length) await ctx.data.insertMany(COLLECTION_GRANTS, rows.map((r) => ({ ...r, createdAt: now }) as unknown as Doc));
  ctx.log({ kind: "grant", id: "import" }, "imported", `${rows.length} from ${String(body.from)}`);
  return { added: rows.length };
}

/** { grantId } -> { sponsor }. A received grant's giver becomes a sponsor row, with the note "Received through <grant>". */
export async function bizGrantToSponsor(ctx: Ctx, body: Doc) {
  const grant = (await getRecord(ctx, COLLECTION_GRANTS, body.grantId, "grant")) as unknown as Grant;
  if (grant.status !== "5. Received") throw apiError("bad-request", "Only a received grant can be added to the Sponsor tracker.");
  const name = grant.organization || grant.title;
  const here = seasonLabel(ctx.today());
  const all = await allSponsors(ctx);
  if (all.some((s) => s.season === here && sameName(s.company, name))) throw apiError("bad-request", `${name} is already on the Sponsor tracker.`);
  const clean = plan(() => cleanSponsor({ company: name, status: "5. Received monetary", support: "Sponsorship (money)", amount: grant.amount, notes: `Received through ${grant.title}` }, null, here));
  const saved = (await ctx.data.save(COLLECTION_SPONSORS, { ...clean, prior: priorNames(all, here).some((p) => sameName(p, name)), createdAt: ctx.env.now().toISOString() } as unknown as Doc)) as unknown as Sponsor;
  await ctx.data.save(COLLECTION_GRANTS, { ...grant, sponsored: true } as unknown as Doc);
  ctx.log({ kind: "sponsor", id: String(saved._id) }, "created", `${name} (from ${grant.title})`);
  return { sponsor: saved };
}

// ----- Stats -----

/** { season? } -> { stats }. */
export async function bizStats(ctx: Ctx, body: Doc) {
  const [sponsors, grants] = await Promise.all([allSponsors(ctx), allGrants(ctx)]);
  const here = season(ctx, body);
  return { stats: statsFor(here, sponsors, grants, await statsExtra(ctx, here)), seasons: seasonsOf([...sponsors, ...grants], ctx.today()) };
}
