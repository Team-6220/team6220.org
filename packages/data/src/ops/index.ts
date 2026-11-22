// ops: what the operations apps (Icarus, Production, BOM) share. Plan: https://github.com/Team-6220/team6220.org/wiki/Operations-Architecture.
//
//   import { ops } from "@team6220/data";
//   const viewer = await ops.getViewer();          // signed-out | pending | member (with roles and subteams)
//   const projects = await ops.listProjects();     // p10, p11, ...
//   await ops.saveProject({ name: "Summer Bot" }); // Leads only; checked on the server
//
// Two ways data moves:
//   store()    reads, and writes any member may make, straight to Wix CMS as the signed-in member
//   callOps()  anything that needs a badge, a number or a signature, through the ops API (Apps Script)
//
// Demo mode: `pnpm dev`, or ?demo=member|lead|mentor|booster|supervisor|pending|signed-out on a deployed page,
// uses made-up data in memory and never talks to Wix.
import * as auth from "../auth";
import { onWixBuild } from "../runtime";
import { BADGES } from "../config";
import { saveAccessHint } from "../wix";
import { httpTransport } from "./http";
import { MOCK_ROLES, mockStore, mockTransport, type MockRole } from "./mock";
import { rolesFor, subteamsOf } from "./roles";
import {
  OpsError,
  type Draft,
  type HistoryEntry,
  type Item,
  type Me,
  type OpsErrorCode,
  type OpsViewer,
  type Person,
  type Project,
  type RecordLink,
  type Store,
  type Transport,
} from "./types";

// ----- which backend -----

export type DemoRole = MockRole | "signed-out";
const DEMO_KEY = "team6220.ops.demo";
const DEMO_ROLES: DemoRole[] = [...MOCK_ROLES, "signed-out"];

function session(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Reads ?demo=<role> from the address once and remembers it for this tab. ?demo=off leaves demo mode. */
export function readDemoFromUrl(): void {
  if (typeof window === "undefined") return;
  const wanted = new URLSearchParams(window.location.search).get("demo");
  if (!wanted) return;
  try {
    if (DEMO_ROLES.includes(wanted as DemoRole)) session()?.setItem(DEMO_KEY, wanted);
    else session()?.removeItem(DEMO_KEY);
  } catch {
    // storage blocked: demo mode can't be chosen from the address
  }
}

function buildUsesMock(): boolean {
  let env: Record<string, unknown> | undefined;
  try {
    env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
  } catch {
    env = undefined;
  }
  const v = env?.PUBLIC_OPS_BACKEND;
  if (v === "wix") return false;
  if (v === "mock") return true;
  return env?.PROD !== true; // `pnpm dev` and tests: mock. `pnpm build`: Wix.
}

/** True when there is an operations server to call: the Wix build has /api/ops, the static build doesn't. */
function hasServer(): boolean {
  return onWixBuild();
}

/**
 * The demo role for this tab, or null when using the real backend.
 * Demo mode is on when: ?demo=<role> chose one; or this is `pnpm dev` / a test; or the team server isn't
 * connected yet. In that last case (the static build, with no /api) nothing real could work, so those pages show the
 * demo, signed in as a lead.
 */
export function demoRole(): DemoRole | null {
  const stored = session()?.getItem(DEMO_KEY) as DemoRole | null | undefined;
  if (stored && DEMO_ROLES.includes(stored)) return stored;
  return buildUsesMock() || !hasServer() ? "lead" : null;
}

/** True when someone asked for the demo (?demo=<role>) or this is `pnpm dev` / a test; false on the static build's
 *  fallback demo. Home uses it: without a server it shows the real sign-in, not a made-up lead. */
export function isChosenDemo(): boolean {
  readDemoFromUrl();
  const stored = session()?.getItem(DEMO_KEY) as DemoRole | null | undefined;
  return (!!stored && DEMO_ROLES.includes(stored)) || buildUsesMock();
}

/** True when the apps show made-up data. */
export function isDemo(): boolean {
  return demoRole() !== null;
}

/** True when protected actions can reach a server (the real URL is set, or demo mode). */
export function isConnected(): boolean {
  return isDemo() || hasServer();
}

/** The line every operations app shows under its header while it is on demo data. */
export function demoNotice(): string | undefined {
  if (!isDemo()) return undefined;
  return hasServer() || buildUsesMock()
    ? "Demo data: nothing here is saved."
    : "Demo data: the team server isn't connected yet, so nothing here is real or saved. Add ?demo=member, mentor, booster or supervisor to the address to try other roles.";
}

// ----- the two ways data moves -----

/** Reads and simple writes. Other data modules use this; apps don't. */
export function store(): Store {
  if (isDemo()) return mockStore;
  // Loaded on first use so demo pages never pull in the Wix SDK's data module.
  return lazyWixStore;
}

const wixStoreModule = () => import("./wix-store");
// With the team server connected, every read and write goes through it, so it can check who is asking (records.ts).
// Without it (the static test build) the browser talks to Wix directly, as before.
const lazyWixStore: Store = {
  list: async <T extends Item>(collection: string) =>
    isConnected() ? ((await callOps<{ items: T[] }>("listRecords", { collection })).items) : (await wixStoreModule()).wixStore.list<T>(collection),
  save: async <T extends Item>(collection: string, item: Draft<T>) =>
    isConnected() ? ((await callOps<{ item: T }>("saveRecord", { collection, item })).item) : (await wixStoreModule()).wixStore.save<T>(collection, item),
  remove: async (collection, id) => {
    if (isConnected()) await callOps("removeRecord", { collection, id });
    else await (await wixStoreModule()).wixStore.remove(collection, id);
  },
};

const ERROR_CODES: OpsErrorCode[] = [
  "kiosk-closed", "signed-out", "pending", "forbidden", "not-configured", "bad-request", "busy", "conflict", "wix-unavailable",
  "server-error", "network",
];
let http: Transport | undefined;

/** Actions anyone may call, signed in or not (the demo's "signed out" visitor too). */
const OPEN_ACTIONS = ["publicCalendar"];

/** One protected action on the ops API. Throws OpsError with the server's code and message when it says no. */
export async function callOps<T = Record<string, unknown>>(action: string, args: Record<string, unknown> = {}): Promise<T> {
  const role = demoRole();
  let transport: Transport;
  let token: string | undefined;
  if (role) {
    if (role === "signed-out" && !OPEN_ACTIONS.includes(action)) throw new OpsError("signed-out", "Sign in to continue.");
    transport = mockTransport;
    token = `mock:${role}`;
  } else {
    if (!isConnected()) throw new OpsError("not-configured", "This app isn't connected to the team server yet.");
    transport = http ??= httpTransport();
  }
  // On the real server, who is asking comes from the session cookie, not from anything sent here.
  const body = await transport({ action, ...(token ? { token } : {}), ...args });
  if (body?.ok !== true) {
    const code = ERROR_CODES.includes(body?.error as OpsErrorCode) ? (body.error as OpsErrorCode) : "server-error";
    throw new OpsError(code, typeof body?.message === "string" ? body.message : "The team server had a problem.");
  }
  return body as T;
}

// ----- who is looking -----

export { saveAccessHint } from "../wix";

/** Tells the page chrome which apps this person can open (account.js: canOpen), then returns the viewer unchanged. */
function rememberAccess(viewer: OpsViewer, badges: readonly string[] = []): OpsViewer {
  if (!isDemo()) saveAccessHint(viewer.kind === "member" ? "member" : viewer.kind === "guest" ? "guest" : "visitor", badges.includes(BADGES.webAdmin));
  return viewer;
}

/**
 * Who is looking, for choosing what to show. Hiding a button is only cosmetic: the ops API checks every action.
 * If the ops API isn't connected yet, roles come from the badges the browser can see, so viewing still works.
 * `guests: true` is for the apps guests may open (Icarus); in the others a guest gets the "not open to guests" screen.
 */
export async function getViewer(options: { guests?: boolean } = {}): Promise<OpsViewer> {
  if (demoRole() === "signed-out") return { kind: "signed-out" };
  if (!isDemo()) {
    const member = await auth.getMember();
    if (!member) return { kind: "signed-out" };
    if (!isConnected()) {
      const badges = member.status === "APPROVED" ? await auth.getBadges() : [];
      const roles = rolesFor(badges);
      if (!roles.viewer) return rememberAccess({ kind: "pending", name: member.name });
      if (roles.guest && !options.guests) return rememberAccess({ kind: "guest", name: member.name }, badges);
      const me: Me = { id: member.id, name: member.name, badges, subteams: subteamsOf(badges), roles };
      return rememberAccess({ kind: "member", me, subteams: [] }, badges);
    }
  }
  try {
    const { me, subteams } = await callOps<{ me: Me; subteams: string[] }>("whoAmI");
    // Guests may open only the apps that say so (Icarus); everywhere else they see the "not open to guests" screen.
    if (me.roles.guest && !options.guests) return rememberAccess({ kind: "guest", name: me.name }, me.badges);
    return rememberAccess({ kind: "member", me, subteams }, me.badges);
  } catch (err) {
    if (err instanceof OpsError && (err.code === "pending" || err.code === "forbidden")) {
      return rememberAccess({ kind: "pending", name: isDemo() ? "Demo Visitor" : ((await auth.getMember())?.name ?? "") });
    }
    if (err instanceof OpsError && err.code === "signed-out") return { kind: "signed-out" };
    throw err;
  }
}

// ----- projects, people, history, subteams -----

/** Every project, lowest number first. */
export async function listProjects(): Promise<Project[]> {
  return (await store().list<Project>("ops_projects")).sort((a, b) => a.number - b.number);
}

/** Create or change a project (Leads). A new project gets the next p-number from the server. */
export async function saveProject(project: Partial<Project> & { name: string }): Promise<Project> {
  return (await callOps<{ project: Project }>("saveProject", { project })).project;
}

/** Active team members who have opened the apps at least once, by name. */
export async function listPeople(): Promise<Person[]> {
  const people = await store().list<Person>("ops_people");
  return people.filter((p) => p.active !== false).sort((a, b) => a.name.localeCompare(b.name));
}

/** The change log of one record, newest first. */
export async function listHistory(record: RecordLink): Promise<HistoryEntry[]> {
  const all = await store().list<HistoryEntry>("ops_history");
  // Two changes can land in the same millisecond. Reversing first means such a tie still shows the later one first
  // (sort keeps the order of equal entries).
  return all
    .filter((h) => h.recordKind === record.kind && h.recordId === record.id)
    .reverse()
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** Add a line to a record's change log, after a change that was written straight to Wix. */
export async function logHistory(record: RecordLink, change: string, summary = ""): Promise<void> {
  await callOps("logHistory", { record, change, summary });
}

/**
 * The next number of a kind ("task" -> 42). Used by the data modules when they create a record.
 * With count, sets aside that many in a row and returns the first.
 */
export async function nextNumber(kind: "task" | "project" | "part" | "order", count = 1): Promise<number> {
  return (await callOps<{ number: number }>("nextNumber", { kind, count })).number;
}

/** A member picks their own subteams. */
export async function setMySubteams(subteams: string[]): Promise<string[]> {
  return (await callOps<{ subteams: string[] }>("setMySubteams", { subteams })).subteams;
}

/** A Lead, Mentor or Web Admin sets the subteams of up to 50 people at once. */
export async function setSubteams(memberIds: string[], subteams: string[]): Promise<void> {
  await callOps("setSubteams", { memberIds, subteams });
}

/** A Lead, Mentor or Web Admin copies the site's approved members into the people list, so anyone can be @mentioned. */
export async function syncPeople(): Promise<{ people: number; added: number; removed: number }> {
  return callOps("syncPeople");
}

/** Sets a member's GitHub username, so GitHub sync can match issue assignees to them. Your own, or anyone's for a Lead, Mentor or Web Admin. */
export async function setGithubLogin(login: string, memberId?: string): Promise<Person> {
  return (await callOps<{ person: Person }>("setGithubLogin", { login, memberId })).person;
}

/**
 * "https://github.com/Team-6220/robot-2027" or "Team-6220/robot-2027" -> "Team-6220/robot-2027".
 * Null for anything else: GitHub sync only works with the team's own organization.
 */
export function teamRepoFrom(text: string): string | null {
  const m = text.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/(\.git)?\/?$/, "").match(/^team-6220\/([A-Za-z0-9._-]+)$/i);
  return m ? `Team-6220/${m[1]}` : null;
}

/** "p10", "t42.1": how numbers are written everywhere. */
export function projectLabel(project: Pick<Project, "number">): string {
  return `p${project.number}`;
}

export { rolesFor, subteamsOf } from "./roles";
export { toCsv } from "./csv";
export { mockActions, mockDb, resetMock, seedMock, type MockAction, type MockActor, type MockDb } from "./mock";
export * from "./types";
