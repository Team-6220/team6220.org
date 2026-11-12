// ops: what the operations apps (Icarus, Production, BOM) share. Plan: docs/operations/ARCHITECTURE.md.
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
import { OPS_API_URL } from "../config";
import * as auth from "../auth";
import { memberAccessToken } from "../wix";
import { httpTransport } from "./http";
import { MOCK_ROLES, mockStore, mockTransport, type MockRole } from "./mock";
import { rolesFor, subteamsOf } from "./roles";
import {
  OpsError,
  type HistoryEntry,
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

/** The demo role for this tab, or null when using the real backend. */
export function demoRole(): DemoRole | null {
  const stored = session()?.getItem(DEMO_KEY) as DemoRole | null | undefined;
  if (stored && DEMO_ROLES.includes(stored)) return stored;
  return buildUsesMock() ? "lead" : null;
}

/** True when the apps show made-up data. */
export function isDemo(): boolean {
  return demoRole() !== null;
}

/** True when protected actions can reach a server (the real URL is set, or demo mode). */
export function isConnected(): boolean {
  return isDemo() || /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(OPS_API_URL);
}

// ----- the two ways data moves -----

/** Reads and simple writes. Other data modules use this; apps don't. */
export function store(): Store {
  if (isDemo()) return mockStore;
  // Loaded on first use so demo pages never pull in the Wix SDK's data module.
  return lazyWixStore;
}

const wixStoreModule = () => import("./wix-store");
const lazyWixStore: Store = {
  list: async (collection) => (await wixStoreModule()).wixStore.list(collection),
  save: async (collection, item) => (await wixStoreModule()).wixStore.save(collection, item),
  remove: async (collection, id) => (await wixStoreModule()).wixStore.remove(collection, id),
};

const ERROR_CODES: OpsErrorCode[] = [
  "signed-out", "pending", "forbidden", "not-configured", "bad-request", "busy", "conflict", "wix-unavailable",
  "server-error", "network",
];
let http: Transport | undefined;

/** One protected action on the ops API. Throws OpsError with the server's code and message when it says no. */
export async function callOps<T = Record<string, unknown>>(action: string, args: Record<string, unknown> = {}): Promise<T> {
  const role = demoRole();
  let transport: Transport;
  let token: string | null;
  if (role) {
    transport = mockTransport;
    token = role === "signed-out" ? null : `mock:${role}`;
  } else {
    if (!isConnected()) throw new OpsError("not-configured", "This app isn't connected to the team server yet.");
    transport = http ??= httpTransport(OPS_API_URL);
    token = await memberAccessToken();
  }
  if (!token) throw new OpsError("signed-out", "Sign in to continue.");
  const body = await transport({ action, token, ...args });
  if (body?.ok !== true) {
    const code = ERROR_CODES.includes(body?.error as OpsErrorCode) ? (body.error as OpsErrorCode) : "server-error";
    throw new OpsError(code, typeof body?.message === "string" ? body.message : "The team server had a problem.");
  }
  return body as T;
}

// ----- who is looking -----

/**
 * Who is looking, for choosing what to show. Hiding a button is only cosmetic: the ops API checks every action.
 * If the ops API isn't connected yet, roles come from the badges the browser can see, so viewing still works.
 */
export async function getViewer(): Promise<OpsViewer> {
  if (demoRole() === "signed-out") return { kind: "signed-out" };
  if (!isDemo()) {
    const member = await auth.getMember();
    if (!member) return { kind: "signed-out" };
    if (!isConnected()) {
      const badges = member.status === "APPROVED" ? await auth.getBadges() : [];
      const roles = rolesFor(badges);
      if (!roles.viewer) return { kind: "pending", name: member.name };
      const me: Me = { id: member.id, name: member.name, badges, subteams: subteamsOf(badges), roles };
      return { kind: "member", me, subteams: [] };
    }
  }
  try {
    const { me, subteams } = await callOps<{ me: Me; subteams: string[] }>("whoAmI");
    return { kind: "member", me, subteams };
  } catch (err) {
    if (err instanceof OpsError && (err.code === "pending" || err.code === "forbidden")) {
      return { kind: "pending", name: isDemo() ? "Demo Visitor" : ((await auth.getMember())?.name ?? "") };
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
  return all
    .filter((h) => h.recordKind === record.kind && h.recordId === record.id)
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

/** "p10", "t42.1": how numbers are written everywhere. */
export function projectLabel(project: Pick<Project, "number">): string {
  return `p${project.number}`;
}

export { rolesFor, subteamsOf } from "./roles";
export { mockActions, mockDb, resetMock, seedMock, type MockAction, type MockActor, type MockDb } from "./mock";
export * from "./types";
