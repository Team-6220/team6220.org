// Shapes shared by the operations apps (Icarus, Production, BOM). Plan: docs/operations/ARCHITECTURE.md.

/** One stored record. Every collection item has an _id; the other fields depend on the collection. */
export type Item = { _id: string } & Record<string, unknown>;
/** A record that may not be saved yet. */
export type Draft<T extends Item = Item> = { [K in keyof T as K extends "_id" ? never : K]: T[K] } & { _id?: string };

/** The kinds of record the apps can point at. */
export type RecordKind =
  | "task"
  | "project"
  | "part"
  | "bomLine"
  | "order"
  | "inventoryItem"
  | "rawMaterial"
  | "githubIssue"
  | "person"
  | "bom"
  | "bomSection"
  | "season"
  | "milestone"
  | "event"
  | "template";

/** A pointer from one record to another, in any app. Shown with <RecordLink> from @team6220/ui. */
export interface RecordLink {
  kind: RecordKind;
  id: string;
}

/** What a person's badges allow. See roles.ts. */
export interface Roles {
  /** May open the apps. Supervisors can view and nothing else. */
  viewer: boolean;
  /** May do everyday work: tasks, parts, BOM lines. */
  team: boolean;
  /** May plan: projects, milestones, templates, BOMs. */
  lead: boolean;
  /** May sign BOM lines and buy (Mentors and Boosters). */
  approver: boolean;
  /** May change anyone's subteams. */
  peopleAdmin: boolean;
}

/** The signed-in person. */
export interface Me {
  id: string;
  name: string;
  badges: string[];
  subteams: string[];
  roles: Roles;
}

/** Who is looking at an app. */
export type OpsViewer =
  | { kind: "signed-out" }
  | { kind: "pending"; name: string }
  | { kind: "member"; me: Me; subteams: string[] };

/** A team member as the pickers show them (collection ops_people). */
export interface Person extends Item {
  memberId: string;
  name: string;
  /** The short name typed after "@" (from the member's Wix profile). May be "" for older rows. */
  username: string;
  /** Their GitHub username, for matching task owners to issue assignees. "" when not set. */
  githubLogin?: string;
  subteams: string[];
  active: boolean;
}

export type ProjectStatus = "active" | "done" | "cancelled";

/** A project, written p10 (collection ops_projects). Shared by Icarus, Production and BOM. */
export interface Project extends Item {
  number: number;
  name: string;
  description: string;
  subteams: string[];
  status: ProjectStatus;
  githubRepo: string;
  startDate: string;
  endDate: string;
}

/** One line of the change log (collection ops_history). */
export interface HistoryEntry extends Item {
  recordKind: RecordKind;
  recordId: string;
  actorId: string;
  actorName: string;
  actorIsAgent: boolean;
  action: string;
  summary: string;
  at: string;
}

export type OpsErrorCode =
  | "signed-out"
  | "pending"
  | "forbidden"
  | "not-configured"
  | "bad-request"
  | "busy"
  | "conflict"
  | "wix-unavailable"
  | "server-error"
  | "network";

export class OpsError extends Error {
  readonly code: OpsErrorCode;
  constructor(code: OpsErrorCode, message: string) {
    super(message);
    this.name = "OpsError";
    this.code = code;
  }
}

export type ApiRequest = { action: string } & Record<string, unknown>;
/** Sends one request to the ops API (or the mock) and returns the parsed body ({ ok: true|false, ... }). */
export type Transport = (request: ApiRequest) => Promise<Record<string, unknown>>;

/** Reads and simple writes of collections. Real: Wix CMS as the signed-in member. Demo: memory. */
export interface Store {
  list<T extends Item = Item>(collection: string): Promise<T[]>;
  save<T extends Item = Item>(collection: string, item: Draft<T>): Promise<T>;
  remove(collection: string, id: string): Promise<void>;
}
