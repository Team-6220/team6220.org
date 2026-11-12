// Demo stand-in for Wix and the ops API: everything lives in memory and is reset when the page reloads.
// Used by `pnpm dev`, by `?demo=<role>` on any operations app, and by tests.
//
// Each app's data module adds its own made-up data (seedMock) and its own protected actions (mockActions),
// so this file only knows the shared parts: people, projects, numbers, history and subteams.
import { BADGES, SUBTEAM_BADGE_PREFIX } from "../config";
import { rolesFor, subteamsOf } from "./roles";
import { OpsError, type ApiRequest, type Draft, type Item, type Store, type Transport } from "./types";

export type MockRole = "member" | "lead" | "mentor" | "booster" | "supervisor" | "pending";
export const MOCK_ROLES: MockRole[] = ["member", "lead", "mentor", "booster", "supervisor", "pending"];
export const MOCK_SUBTEAMS = ["Design", "Manufacturing", "Programming", "Electrical", "Operations"];

/** Who is calling a mock action. */
export interface MockActor {
  id: string;
  name: string;
  badges: string[];
  agent: boolean;
}

/** The made-up people behind each demo role. Tokens are "mock:<role>". */
const DEMO_PEOPLE: Record<MockRole, MockActor> = {
  member: { id: "demo-member", name: "Demo Member", badges: [BADGES.teamMember, "Subteam: Programming"], agent: false },
  lead: { id: "demo-lead", name: "Demo Lead", badges: [BADGES.teamMember, BADGES.lead, "Subteam: Design"], agent: false },
  mentor: { id: "demo-mentor", name: "Demo Mentor", badges: [BADGES.mentor], agent: false },
  booster: { id: "demo-booster", name: "Demo Booster", badges: [BADGES.booster], agent: false },
  supervisor: { id: "demo-supervisor", name: "Demo Supervisor", badges: [BADGES.supervisor], agent: false },
  pending: { id: "demo-pending", name: "Demo Visitor", badges: [], agent: false },
};

export type MockAction = (request: ApiRequest, actor: MockActor, db: MockDb) => Record<string, unknown>;

/** The in-memory collections, plus the helpers mock actions need. */
export class MockDb {
  private collections = new Map<string, Item[]>();
  private nextId = 1;
  /** Badges per member ID, standing in for Wix badge assignments. */
  readonly badges = new Map<string, string[]>();

  rows<T extends Item = Item>(collection: string): T[] {
    if (!this.collections.has(collection)) this.collections.set(collection, []);
    return this.collections.get(collection) as T[];
  }

  save<T extends Item = Item>(collection: string, item: Draft<T>): T {
    const rows = this.rows<T>(collection);
    const saved = { ...item, _id: item._id ?? `mock-${this.nextId++}` } as T;
    const at = rows.findIndex((r) => r._id === saved._id);
    if (at === -1) rows.push(saved);
    else rows[at] = saved;
    return saved;
  }

  remove(collection: string, id: string): void {
    const rows = this.rows(collection);
    const at = rows.findIndex((r) => r._id === id);
    if (at !== -1) rows.splice(at, 1);
  }

  /** The next number of a kind. With count, sets aside that many in a row and returns the first. */
  takeNumber(kind: string, count = 1): number {
    const row = this.rows("ops_counters").find((r) => r.key === kind) ?? this.save("ops_counters", { key: kind, next: 1 });
    const number = Number(row.next);
    row.next = number + count;
    return number;
  }

  writeHistory(actor: MockActor, record: { kind: string; id: string }, action: string, summary = ""): void {
    this.save("ops_history", {
      recordKind: record.kind,
      recordId: record.id,
      actorId: actor.id,
      actorName: actor.name,
      actorIsAgent: actor.agent,
      action,
      summary,
      at: new Date().toISOString(),
    });
  }
}

function seedShared(db: MockDb): void {
  for (const person of Object.values(DEMO_PEOPLE)) db.badges.set(person.id, [...person.badges]);
  const people: [string, string, string[]][] = [
    ["demo-member", "Demo Member", ["Programming"]],
    ["demo-lead", "Demo Lead", ["Design"]],
    ["demo-mentor", "Demo Mentor", []],
    ["demo-booster", "Demo Booster", []],
    ["p-ada", "Ada Lovelace", ["Programming"]],
    ["p-grace", "Grace Hopper", ["Programming", "Electrical"]],
    ["p-nikola", "Nikola Tesla", ["Electrical"]],
    ["p-hedy", "Hedy Lamarr", ["Design", "Manufacturing"]],
    ["p-katherine", "Katherine Johnson", ["Operations"]],
  ];
  for (const [memberId, name, subteams] of people) {
    db.save("ops_people", { memberId, name, subteams, active: true });
    if (!db.badges.has(memberId)) db.badges.set(memberId, [BADGES.teamMember, ...subteams.map((s) => SUBTEAM_BADGE_PREFIX + s)]);
  }
  const projects: [string, string[]][] = [
    ["Summer Bot", ["Design", "Manufacturing"]],
    ["Elevator code", ["Programming"]],
    ["Super Pit", ["Operations"]],
  ];
  for (const [name, subteams] of projects) {
    db.save("ops_projects", {
      number: db.takeNumber("project"),
      name,
      description: "",
      subteams,
      status: "active",
      githubRepo: "",
      startDate: "",
      endDate: "",
    });
  }
}

// ----- shared actions: the same names and rules as backend/apps-script/ops-api/Shared.gs -----

function text(value: unknown, name: string, optional = false): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s && !optional) throw new OpsError("bad-request", `Missing ${name}.`);
  return s;
}

function wantedSubteams(value: unknown): string[] {
  const wanted = Array.isArray(value) ? value.map(String) : [];
  for (const name of wanted) {
    if (!MOCK_SUBTEAMS.includes(name)) throw new OpsError("bad-request", `There is no subteam called '${name}'.`);
  }
  return MOCK_SUBTEAMS.filter((s) => wanted.includes(s));
}

function changeSubteams(db: MockDb, memberId: string, subteams: string[]): void {
  const others = (db.badges.get(memberId) ?? []).filter((b) => !b.startsWith(SUBTEAM_BADGE_PREFIX));
  db.badges.set(memberId, [...others, ...subteams.map((s) => SUBTEAM_BADGE_PREFIX + s)]);
  const person = db.rows("ops_people").find((p) => p.memberId === memberId);
  if (person) person.subteams = subteams;
}

const SHARED_ACTIONS: Record<string, { who: keyof ReturnType<typeof rolesFor>; run: MockAction }> = {
  whoAmI: {
    who: "viewer",
    run: (_request, actor) => ({
      me: { id: actor.id, name: actor.name, badges: actor.badges, subteams: subteamsOf(actor.badges), roles: rolesFor(actor.badges) },
      subteams: MOCK_SUBTEAMS,
    }),
  },
  nextNumber: {
    who: "team",
    run: (request, _actor, db) => {
      const count = request.count === undefined ? 1 : Math.floor(Number(request.count));
      if (!(count >= 1 && count <= 200)) throw new OpsError("bad-request", "Ask for between 1 and 200 numbers.");
      return { number: db.takeNumber(text(request.kind, "kind"), count) };
    },
  },
  logHistory: {
    who: "team",
    run: (request, actor, db) => {
      const record = (request.record ?? {}) as { kind?: unknown; id?: unknown };
      db.writeHistory(
        actor,
        { kind: text(record.kind, "record kind"), id: text(record.id, "record id") },
        text(request.change, "change"),
        text(request.summary, "summary", true),
      );
      return {};
    },
  },
  saveProject: {
    who: "lead",
    run: (request, actor, db) => {
      const input = (request.project ?? {}) as Record<string, unknown>;
      const existing = input._id ? db.rows("ops_projects").find((p) => p._id === input._id) : undefined;
      if (input._id && !existing) throw new OpsError("bad-request", "That project doesn't exist any more.");
      const project = db.save("ops_projects", {
        ...(existing ? { _id: existing._id } : {}),
        number: existing ? existing.number : db.takeNumber("project"),
        name: text(input.name, "project name"),
        description: text(input.description, "description", true),
        subteams: wantedSubteams(input.subteams),
        status: ["active", "done", "cancelled"].includes(String(input.status)) ? input.status : "active",
        githubRepo: text(input.githubRepo, "GitHub repository", true),
        startDate: text(input.startDate, "start date", true),
        endDate: text(input.endDate, "end date", true),
      });
      db.writeHistory(actor, { kind: "project", id: project._id }, existing ? "updated" : "created", `p${project.number} ${project.name}`);
      return { project };
    },
  },
  setMySubteams: {
    who: "team",
    run: (request, actor, db) => {
      const subteams = wantedSubteams(request.subteams);
      changeSubteams(db, actor.id, subteams);
      db.writeHistory(actor, { kind: "person", id: actor.id }, "subteams", subteams.join(", ") || "none");
      return { subteams };
    },
  },
  setSubteams: {
    who: "peopleAdmin",
    run: (request, actor, db) => {
      const ids = Array.isArray(request.memberIds) ? request.memberIds.map(String) : [];
      if (!ids.length || ids.length > 50) throw new OpsError("bad-request", "Choose between 1 and 50 people.");
      const subteams = wantedSubteams(request.subteams);
      for (const memberId of ids) {
        changeSubteams(db, memberId, subteams);
        db.writeHistory(actor, { kind: "person", id: memberId }, "subteams", subteams.join(", ") || "none");
      }
      return { changed: ids.length };
    },
  },
};

// ----- what the other data modules plug in -----

type RoleName = keyof ReturnType<typeof rolesFor>;
const moduleActions: Record<string, { who: RoleName; run: MockAction }> = {};
const moduleSeeds: ((db: MockDb) => void)[] = [];

/** Checks subteam names the way the server does. For other data modules' demo rules. */
export { wantedSubteams as mockWantedSubteams };

/** A data module's protected actions in demo mode: { actionName: { who, run } }. */
export function mockActions(actions: Record<string, { who: RoleName; run: MockAction }>): void {
  Object.assign(moduleActions, actions);
}

/** A data module's made-up starting data. */
export function seedMock(seed: (db: MockDb) => void): void {
  moduleSeeds.push(seed);
  if (db) seed(db);
}

let db: MockDb | undefined;

/** The one demo database for this page. */
export function mockDb(): MockDb {
  if (!db) {
    db = new MockDb();
    seedShared(db);
    for (const seed of moduleSeeds) seed(db);
  }
  return db;
}

/** Start again from the made-up data (tests call this). */
export function resetMock(): void {
  db = undefined;
}

function actorFor(token: unknown): MockActor {
  const role = typeof token === "string" && token.startsWith("mock:") ? (token.slice(5) as MockRole) : null;
  if (!role || !MOCK_ROLES.includes(role)) throw new OpsError("signed-out", "Sign in to continue.");
  const person = DEMO_PEOPLE[role];
  // Badges come from the database, so a subteam change shows up on the next request.
  return { ...person, badges: mockDb().badges.get(person.id) ?? person.badges };
}

/** Answers ops API requests from memory, with the same permission rules as the real server. */
export const mockTransport: Transport = async (request) => {
  try {
    const action = SHARED_ACTIONS[request.action] ?? moduleActions[request.action];
    if (!action) throw new OpsError("bad-request", "Unknown action.");
    const actor = actorFor(request.token);
    if (!rolesFor(actor.badges).viewer) throw new OpsError("pending", "A web admin hasn't approved your account yet.");
    if (!rolesFor(actor.badges)[action.who]) throw new OpsError("forbidden", "Your account isn't allowed to do that.");
    return { ok: true, ...action.run(request, actor, mockDb()) };
  } catch (err) {
    if (err instanceof OpsError) return { ok: false, error: err.code, message: err.message };
    throw err;
  }
};

/** Reads and simple writes from memory. Copies rows so callers can't change the database by accident. */
export const mockStore: Store = {
  async list<T extends Item>(collection: string): Promise<T[]> {
    return mockDb().rows<T>(collection).map((row) => structuredClone(row));
  },
  async save<T extends Item>(collection: string, item: Draft<T>): Promise<T> {
    return structuredClone(mockDb().save<T>(collection, structuredClone(item)));
  },
  async remove(collection: string, id: string): Promise<void> {
    mockDb().remove(collection, id);
  },
};
