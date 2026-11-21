// Your own account, on the server: your profile on the team, the frame settings that follow you to every device, and
// finishing your profile when you first sign in (students on the roster become Team Members straight away). SERVER ONLY.
// Everything here acts on the person asking, never on anyone else.
import { BADGES, SUBTEAM_BADGE_PREFIX } from "../../config";
import { COLLECTION_PEOPLE, COLLECTION_ROSTER, text, type Ctx } from "./context";
import { apiError, type Doc } from "./env";

const ROLES = ["student", "parent", "mentor", "booster", "alumni", "guest", "public"] as const;
const MAX_PREFS_BYTES = 20_000;

async function myRow(ctx: Ctx): Promise<Doc | undefined> {
  return (await ctx.data.query(COLLECTION_PEOPLE, { memberId: ctx.actor.id }, 1))[0];
}

function splitName(name: string): [string, string] {
  const parts = name.trim().split(/\s+/);
  return [parts[0] ?? "", parts.slice(1).join(" ")];
}

/** {} -> { profile, prefs }. */
export async function getAccount(ctx: Ctx) {
  const [row, roster] = await Promise.all([myRow(ctx), ctx.data.query(COLLECTION_ROSTER, { memberId: ctx.actor.id }, 1).catch(() => [])]);
  const [first, last] = splitName(String(row?.customName || ctx.actor.name || ""));
  const r = roster[0];
  return {
    profile: {
      firstName: String(row?.firstName ?? first),
      lastName: String(row?.lastName ?? last),
      githubLogin: String(row?.githubLogin ?? ""),
      discordName: String(row?.discordName ?? ""),
      ...(r ? { grade: String(r.grade ?? ""), studentId: String(r.studentId ?? "") } : {}),
    },
    prefs: row?.prefs && typeof row.prefs === "object" ? row.prefs : null,
  };
}

/** { profile: { firstName, lastName, githubLogin, discordName } } -> { profile }. A name typed here wins over the Google name. */
export async function saveMyProfile(ctx: Ctx, body: Doc) {
  const p = (body.profile ?? {}) as Doc;
  const row = (await myRow(ctx)) ?? { memberId: ctx.actor.id, name: ctx.actor.name, subteams: [], active: true };
  const firstName = p.firstName === undefined ? String(row.firstName ?? "") : text(p.firstName, "first name", 60);
  const lastName = p.lastName === undefined ? String(row.lastName ?? "") : text(p.lastName, "last name", 60, true);
  const githubLogin = p.githubLogin === undefined ? String(row.githubLogin ?? "") : text(p.githubLogin, "GitHub username", 39, true);
  if (githubLogin && !/^[A-Za-z0-9-]+$/.test(githubLogin)) throw apiError("bad-request", "A GitHub username has only letters, numbers and dashes.");
  const discordName = p.discordName === undefined ? String(row.discordName ?? "") : text(p.discordName, "Discord username", 40, true);
  const customName = `${firstName} ${lastName}`.trim();
  const next = { ...row, firstName, lastName, githubLogin, discordName, customName, name: customName || row.name };
  await ctx.data.save(COLLECTION_PEOPLE, next);
  // Students: the roster keeps the same name.
  const roster = (await ctx.data.query(COLLECTION_ROSTER, { memberId: ctx.actor.id }, 1).catch(() => []))[0];
  if (roster && (roster.firstName !== firstName || roster.lastName !== lastName)) await ctx.data.save(COLLECTION_ROSTER, { ...roster, firstName, lastName });
  ctx.log({ kind: "person", id: ctx.actor.id }, "profile", "changed their profile", { type: "person.profile" });
  return { profile: (await getAccount(ctx)).profile };
}

/** { prefs } -> {}. The frame's settings (layout, pins, hidden apps, keybinds), so they follow the account. */
export async function savePrefs(ctx: Ctx, body: Doc) {
  const prefs = body.prefs;
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) throw apiError("bad-request", "Missing settings.");
  if (JSON.stringify(prefs).length > MAX_PREFS_BYTES) throw apiError("bad-request", "Those settings are too big to save.");
  const row = (await myRow(ctx)) ?? { memberId: ctx.actor.id, name: ctx.actor.name, subteams: [], active: true };
  await ctx.data.save(COLLECTION_PEOPLE, { ...row, prefs });
  return {};
}

/**
 * { form: { role, firstName, lastName, studentId?, subteams?, discordName?, githubLogin? } } -> { approved, message }.
 * A student whose ID and last name match a roster row (not yet linked to someone else) gets the Team Member badge and
 * the subteams they picked, their Wix account is approved, and the roster row is linked to them. Anyone else is saved for a person to approve.
 */
export async function finishProfile(ctx: Ctx, body: Doc) {
  const f = (body.form ?? {}) as Doc;
  const role = String(f.role ?? "") as (typeof ROLES)[number];
  if (!ROLES.includes(role)) throw apiError("bad-request", "Pick who you are.");
  const firstName = text(f.firstName, "first name", 60);
  const lastName = text(f.lastName, "last name", 60);
  const discordName = text(f.discordName, "Discord username", 40, role !== "student");
  const githubLogin = text(f.githubLogin, "GitHub username", 39, true);
  const row = (await myRow(ctx)) ?? { memberId: ctx.actor.id, subteams: [], active: true };
  const customName = `${firstName} ${lastName}`.trim();
  await ctx.data.save(COLLECTION_PEOPLE, { ...row, name: customName, customName, firstName, lastName, discordName, githubLogin, signupRole: role });

  if (role === "public") return { approved: false, message: "Done. You can use the apps that are open to everyone; nobody needs to approve you." };
  if (role !== "student") {
    ctx.log({ kind: "person", id: ctx.actor.id }, "signup", `${customName} signed up as ${role}`, { type: "person.signup", data: { role } });
    return { approved: false, message: "Thanks! A web admin will approve your account soon." };
  }

  const studentId = text(f.studentId, "student ID", 12);
  if (!/^\d{6,12}$/.test(studentId)) throw apiError("bad-request", "A student ID is 6 to 12 digits.");
  const match = (await ctx.data.query(COLLECTION_ROSTER, { studentId }, 2))[0];
  const same = (a: unknown, b: string) => String(a ?? "").trim().toLowerCase() === b.trim().toLowerCase();
  if (!match || !same(match.lastName, lastName) || (match.memberId && match.memberId !== ctx.actor.id)) {
    ctx.log({ kind: "person", id: ctx.actor.id }, "signup", `${customName} signed up as a student (no roster match)`, { type: "person.signup", data: { role, rosterMatch: false } });
    return { approved: false, message: "We couldn't find you on the roster with that student ID and last name. A web admin will approve you by hand." };
  }

  // On the roster: Team Member, their subteams, and the roster row linked to them.
  const titles = await ctx.siteBadges();
  const idOf = (title: string) => Object.keys(titles).find((id) => titles[id] === title);
  const team = idOf(BADGES.teamMember);
  if (!team) throw apiError("not-configured", `The "${BADGES.teamMember}" badge doesn't exist on the site.`);
  const wanted = (Array.isArray(f.subteams) ? f.subteams.map(String) : []).map((s: string) => idOf(SUBTEAM_BADGE_PREFIX + s)).filter(Boolean) as string[];
  await ctx.env.badges.assign([team, ...wanted].map((badgeId) => ({ badgeId, memberId: ctx.actor.id })));
  if (!ctx.actor.approved) await ctx.env.members.approve(ctx.actor.id);
  await ctx.data.save(COLLECTION_ROSTER, { ...match, memberId: ctx.actor.id, firstName, lastName });
  ctx.log({ kind: "person", id: ctx.actor.id }, "approved", `${customName} matched the roster and became a Team Member`, { type: "person.approved", data: { by: "roster" } });
  return { approved: true, message: `You're on the roster${match.grade ? ` (${match.grade})` : ""}. Welcome to the team!` };
}

/**
 * { rows: [{ studentId, firstName, lastName, grade }] } -> { added, updated }. The one-time import of the roster (and
 * later updates). Rows are matched by student ID; links to members are kept. Web Admins, Leads and Mentors.
 */
export async function importRoster(ctx: Ctx, body: Doc) {
  const rows = Array.isArray(body.rows) ? (body.rows as Doc[]) : [];
  if (!rows.length || rows.length > 1000) throw apiError("bad-request", "Send between 1 and 1000 roster rows.");
  const clean = rows.map((r, i) => {
    const studentId = String(r.studentId ?? "").trim();
    if (!/^\d{6,12}$/.test(studentId)) throw apiError("bad-request", `Row ${i + 1}: a student ID is 6 to 12 digits.`);
    return { studentId, firstName: text(r.firstName, `row ${i + 1} first name`, 60), lastName: text(r.lastName, `row ${i + 1} last name`, 60), grade: text(r.grade, `row ${i + 1} grade`, 20, true) };
  });
  const existing = new Map((await ctx.data.query(COLLECTION_ROSTER, {})).map((d) => [String(d.studentId), d]));
  const docs = clean.map((r) => ({ ...existing.get(r.studentId), ...r, active: true }));
  await ctx.data.saveMany(COLLECTION_ROSTER, docs);
  ctx.log({ kind: "person", id: "roster" }, "imported", `${docs.length} roster rows`, { type: "roster.imported" });
  const updated = clean.filter((r) => existing.has(r.studentId)).length;
  return { added: clean.length - updated, updated };
}
