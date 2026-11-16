// Things all three apps share: numbers, the history log, projects, people and subteam badges. SERVER ONLY.
// Ported from backend/apps-script/ops-api/Shared.gs; the answers are the same.
import { SUBTEAM_BADGE_PREFIX } from "../../config";
import { rolesFor, subteamsOf } from "../roles";
import { COLLECTION_PEOPLE, COLLECTION_PROJECTS, text, type Ctx } from "./context";
import { apiError, type Doc, type WixMember } from "./env";

/** Each kind of number and the letter shown in front of it (t42, p10). Parts and orders are added by their apps. */
const NUMBER_KINDS = ["task", "project", "part", "order"];

// ---------------------------------------------------------------------------------------------------------
// Numbers and history
// ---------------------------------------------------------------------------------------------------------

/** { kind, count? } -> { number }. Hands out the next number of that kind; with count (up to 200), that many in a row, and returns the first. */
export async function nextNumber(ctx: Ctx, body: Doc) {
  if (!NUMBER_KINDS.includes(body.kind)) throw apiError("bad-request", "Unknown kind of number.");
  const count = body.count === undefined ? 1 : Math.floor(Number(body.count));
  if (!(count >= 1 && count <= 200)) throw apiError("bad-request", "Ask for between 1 and 200 numbers.");
  return { number: await ctx.takeNumber(body.kind, count) };
}

/** { record: { kind, id }, change, summary } -> {}. Used by the apps after a change they wrote straight to Wix. */
export async function logHistory(ctx: Ctx, body: Doc) {
  const record = body.record ?? {};
  ctx.log({ kind: text(record.kind, "record kind", 40), id: text(record.id, "record id", 100) }, text(body.change, "change", 60), text(body.summary, "summary", 500, true));
  return {};
}

// ---------------------------------------------------------------------------------------------------------
// Projects (p10). One list, shared by Icarus, Production and BOM.
// ---------------------------------------------------------------------------------------------------------

const PROJECT_STATUSES = ["active", "done", "cancelled"];

/** { project: { _id?, name, description, subteams, status, githubRepo, startDate, endDate } } -> { project } */
export async function saveProject(ctx: Ctx, body: Doc) {
  const input = body.project ?? {};
  const existing = input._id ? (await ctx.data.queryIds(COLLECTION_PROJECTS, [String(input._id)]))[0] : undefined;
  if (input._id && !existing) throw apiError("bad-request", "That project doesn't exist any more.");
  const allowed = (await subteamBadges(ctx)).map((s) => s.name);
  const project: Doc = {
    number: existing ? existing.number : await ctx.takeNumber("project"),
    name: text(input.name, "project name", 100),
    description: text(input.description, "description", 2000, true),
    subteams: (Array.isArray(input.subteams) ? input.subteams : []).filter((s: string) => allowed.includes(s)),
    status: PROJECT_STATUSES.includes(input.status) ? input.status : "active",
    githubRepo: text(input.githubRepo, "GitHub repository", 140, true),
    startDate: text(input.startDate, "start date", 10, true),
    endDate: text(input.endDate, "end date", 10, true),
  };
  if (existing) project._id = existing._id;
  const saved = await ctx.data.save(COLLECTION_PROJECTS, project);
  ctx.log({ kind: "project", id: String(saved._id) }, existing ? "updated" : "created", `p${project.number} ${project.name}`);
  return { project: saved };
}

// ---------------------------------------------------------------------------------------------------------
// People and subteam badges
// ---------------------------------------------------------------------------------------------------------

/** [{ name: "Design", badgeId }] for every site badge called "Subteam: <name>". The badges are the list. */
export async function subteamBadges(ctx: Ctx): Promise<{ name: string; badgeId: string }[]> {
  const badges = await ctx.siteBadges();
  return Object.keys(badges)
    .filter((id) => badges[id].startsWith(SUBTEAM_BADGE_PREFIX))
    .map((id) => ({ name: badges[id].slice(SUBTEAM_BADGE_PREFIX.length), badgeId: id }));
}

/** {} -> { me: { id, name, badges, subteams, roles }, subteams: [names] }. Also keeps the member's ops_people row fresh. */
export async function whoAmI(ctx: Ctx) {
  const actor = ctx.actor;
  const subteams = subteamsOf(actor.badges);
  await rememberPerson(ctx, actor.id, actor.name, subteams, actor.username);
  return {
    me: { id: actor.id, name: actor.name, badges: actor.badges, subteams, roles: rolesFor(actor.badges) },
    subteams: (await subteamBadges(ctx)).map((s) => s.name),
  };
}

/** { subteams: [names] } -> { subteams }. A member picks their own subteams. */
export async function setMySubteams(ctx: Ctx, body: Doc) {
  const actor = ctx.actor;
  const [subteams] = await changeSubteams(ctx, [actor.id], await checkSubteams(ctx, body.subteams));
  await rememberPerson(ctx, actor.id, actor.name, subteams);
  ctx.log({ kind: "person", id: actor.id }, "subteams", subteams.join(", ") || "none");
  return { subteams };
}

/** { memberIds: [...], subteams: [names] } -> { changed }. A Lead, Mentor or Web Admin sets other people's subteams. */
export async function setSubteams(ctx: Ctx, body: Doc) {
  const ids: string[] = Array.isArray(body.memberIds) ? body.memberIds.map(String) : [];
  if (!ids.length || ids.length > 50) throw apiError("bad-request", "Choose between 1 and 50 people.");
  const wanted = await checkSubteams(ctx, body.subteams);
  const people = await ctx.data.query(COLLECTION_PEOPLE, {});
  const rows = ids.map((id) => people.find((p) => p.memberId === id));
  if (rows.some((p) => !p)) throw apiError("bad-request", "One of those people hasn't opened the apps yet.");
  await changeSubteams(ctx, ids, wanted);
  await ctx.data.saveMany(COLLECTION_PEOPLE, rows.map((p) => ({ ...p, subteams: wanted })));
  ids.forEach((id) => ctx.log({ kind: "person", id }, "subteams", wanted.join(", ") || "none"));
  return { changed: ids.length };
}

/** Checks a list of subteam names against the real subteam badges, and returns them in the badges' order. */
export async function checkSubteams(ctx: Ctx, names: unknown): Promise<string[]> {
  const known = (await subteamBadges(ctx)).map((s) => s.name);
  const wanted = Array.isArray(names) ? names.map(String) : [];
  for (const name of wanted) {
    if (!known.includes(name)) throw apiError("bad-request", `There is no subteam called '${name}'.`);
  }
  return known.filter((name) => wanted.includes(name));
}

/**
 * Makes these members' subteam badges match `wanted`, with two bulk calls at most. This is the ONLY place the server
 * changes badges, and it only ever touches the "Subteam: " badges: it cannot give Team Member, Lead, Mentor or any other.
 * Returns `wanted` once per member.
 */
async function changeSubteams(ctx: Ctx, memberIds: string[], wanted: string[]): Promise<string[][]> {
  const subteams = await subteamBadges(ctx);
  const held = await ctx.env.badges.assignmentsOf(memberIds, subteams.map((s) => s.badgeId));
  const toAdd: { badgeId: string; memberId: string }[] = [];
  const toRemove: string[] = [];
  for (const memberId of memberIds) {
    for (const subteam of subteams) {
      const has = held.find((a) => a.memberId === memberId && a.badgeId === subteam.badgeId);
      const want = wanted.includes(subteam.name);
      if (want && !has) toAdd.push({ badgeId: subteam.badgeId, memberId });
      if (!want && has) toRemove.push(has.id);
    }
  }
  if (toAdd.length) await ctx.env.badges.assign(toAdd);
  if (toRemove.length) await ctx.env.badges.removeAssignments(toRemove);
  return memberIds.map(() => wanted);
}

/** The row kept for a member, so pickers and @mentions can list people without asking Wix Members. */
function personRow(existing: Doc | undefined, memberId: string, name: string, subteams: string[], username?: string): Doc {
  return { ...existing, memberId, name, subteams, active: true, username: username || existing?.username || "" };
}

/** Keeps one ops_people row per member. Saves only when something changed. */
async function rememberPerson(ctx: Ctx, memberId: string, name: string, subteams: string[], username?: string): Promise<void> {
  const existing = (await ctx.data.query(COLLECTION_PEOPLE, { memberId }, 1))[0];
  const next = personRow(existing, memberId, name, subteams, username);
  if (existing && JSON.stringify(existing) === JSON.stringify(next)) return;
  await ctx.data.save(COLLECTION_PEOPLE, next);
}

/** The short name people type after "@": the member's profile slug, or their nickname without spaces. */
export function memberUsername(member: WixMember): string {
  const profile = member.profile ?? {};
  return String(profile.slug || profile.nickname || "").replace(/\s+/g, "").toLowerCase();
}

/** The most members one sync reads (5 requests of 100). The team is far smaller. */
const MAX_MEMBER_PAGES = 5;

/**
 * {} -> { people, added, removed }. Copies the site's approved members into ops_people, so everyone can be
 * @mentioned even before they have opened an app. People who are no longer approved members are kept (their
 * name still shows on old tasks) but marked inactive, which hides them from the pickers.
 */
export async function syncPeople(ctx: Ctx) {
  const members: WixMember[] = [];
  for (let page = 0; page < MAX_MEMBER_PAGES; page++) {
    const batch = await ctx.env.members.list(page * 100);
    members.push(...batch.filter((m) => m.status === "APPROVED"));
    if (batch.length < 100) break;
  }
  const byId = new Map((await ctx.data.query(COLLECTION_PEOPLE, {})).map((p) => [p.memberId as string, p]));
  const changed: Doc[] = [];
  let added = 0;
  for (const m of members) {
    const contact = m.contact ?? {};
    const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() || m.profile?.nickname || "Team member";
    const existing = byId.get(m.id);
    if (!existing) added++;
    const next = personRow(existing, m.id, name, existing?.subteams ?? [], memberUsername(m));
    if (!existing || JSON.stringify(existing) !== JSON.stringify(next)) changed.push(next);
    byId.delete(m.id);
  }
  // Whoever is left is no longer an approved member.
  const gone = [...byId.values()].filter((p) => p.active !== false);
  await ctx.data.saveMany(COLLECTION_PEOPLE, [...changed, ...gone.map((p) => ({ ...p, active: false }))]);
  ctx.log({ kind: "person", id: ctx.actor.id }, "synced people", `${members.length} members`);
  return { people: members.length, added, removed: gone.length };
}

/** Looks a person up by member id (one call). */
export async function findPerson(ctx: Ctx, memberId: string): Promise<Doc | undefined> {
  return (await ctx.data.query(COLLECTION_PEOPLE, { memberId }, 1))[0];
}
