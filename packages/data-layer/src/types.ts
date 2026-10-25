import type { Replay, RobotDesign } from "@goldsim/schema";

/**
 * The data layer is the only way the web app reads or writes saved data (PRD §14).
 * All simulation stays client-side; the backend only stores data.
 */

export type Role = "admin" | "member";
export type TeamType = "frc_team" | "group";

export interface User {
  id: string;
  email: string;
  displayName: string;
}

export interface Session {
  user: User;
}

export interface UserSettings {
  /** Controller bindings (shape owned by the web app). */
  bindings?: unknown;
  units: "metric" | "imperial";
  theme: "dark" | "light" | "system";
  /** Other UI preferences. */
  ui?: Record<string, unknown>;
}

export const DEFAULT_SETTINGS: UserSettings = { units: "imperial", theme: "system" };

export interface Team {
  id: string;
  name: string;
  type: TeamType;
  /** Self-declared and unverified (PRD §14.3). */
  teamNumber: number | null;
  createdAt: string;
}

export interface Membership {
  teamId: string;
  userId: string;
  role: Role;
  displayName: string;
  joinedAt: string;
}

export interface Invite {
  id: string;
  teamId: string;
  code: string;
  createdAt: string;
  expiresAt: string;
  revoked: boolean;
}

export interface JoinRequest {
  id: string;
  teamId: string;
  userId: string;
  displayName: string;
  status: "pending" | "approved" | "denied";
  createdAt: string;
}

/** Team-owned document kinds (PRD §14.2). */
export type DocKind = "design" | "driverProfile" | "recording" | "testRun" | "calibration" | "importedFile";

export interface TestRunData {
  gameId?: string;
  engineVersion?: string;
  schemaVersion?: number;
  seeds?: number[];
  settings?: unknown;
  /** Aggregate stats / summary tables. */
  summary?: unknown;
  coverage?: unknown;
  designs?: RobotDesign[];
  /** Recording doc ids whose replays belong to this test. */
  replayIds?: string[];
  [k: string]: unknown;
}

export interface CalibrationData {
  robot: string;
  measurements: Record<string, unknown>[];
  provenance: { date: string; source: string };
  [k: string]: unknown;
}

export interface ImportedFileData {
  fileName: string;
  format: "path" | "auto" | "traj" | "other";
  content: unknown;
}

export interface DocDataByKind {
  design: RobotDesign;
  driverProfile: Record<string, unknown>;
  recording: Replay;
  testRun: TestRunData;
  calibration: CalibrationData;
  importedFile: ImportedFileData;
}

export interface TeamDoc<K extends DocKind = DocKind> {
  id: string;
  teamId: string;
  kind: K;
  name: string;
  data: DocDataByKind[K];
  /** Starts at 1; every save increments it (optimistic concurrency, PRD §14.9). */
  version: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Listing entry without the (possibly large) data. */
export type TeamDocSummary<K extends DocKind = DocKind> = Omit<TeamDoc<K>, "data">;

export interface DocVersion<K extends DocKind = DocKind> {
  docId: string;
  version: number;
  name: string;
  data: DocDataByKind[K];
  savedBy: string | null;
  savedAt: string;
}

export type SaveResult<K extends DocKind = DocKind> =
  | { ok: true; doc: TeamDoc<K> }
  | { ok: false; conflict: { mine: { name: string; data: DocDataByKind[K] }; theirs: TeamDoc<K> } };

export type ConflictChoice = "keep-mine" | "keep-theirs" | "save-as-copy";

export interface PublishOptions {
  testRunId: string;
  title: string;
  description?: string;
  tags?: string[];
  include: { stats: boolean; designs: boolean; replays: boolean };
  attribution: "team" | "anonymous";
  /** License shown at publish time (open question; proposal CC BY 4.0). */
  license?: string;
}

export interface PublishedSnapshot {
  id: string;
  title: string;
  description: string;
  tags: string[];
  gameId: string | null;
  /** null when published anonymously. The backend still knows the owner (PRD §14.6). */
  attribution: { teamName: string; teamNumber: number | null; verified: false } | null;
  payload: { stats?: unknown; designs?: RobotDesign[]; replays?: Replay[] };
  meta: { engineVersion?: string; schemaVersion?: number; seeds?: number[]; settings?: unknown };
  license: string;
  createdAt: string;
}

export interface SnapshotQuery {
  gameId?: string;
  tag?: string;
  text?: string;
  limit?: number;
}

export interface UserExport {
  user: User;
  settings: UserSettings;
  memberships: Membership[];
  joinRequests: JoinRequest[];
}

export interface TeamExport {
  team: Team;
  members: Membership[];
  docs: TeamDoc[];
  versions: DocVersion[];
  snapshots: PublishedSnapshot[];
}

export interface DataLayer {
  // Auth
  getSession(): Promise<Session | null>;
  signInWithGoogle(redirectTo?: string): Promise<void>;
  signInWithEmail(email: string, redirectTo?: string): Promise<void>;
  signOut(): Promise<void>;
  onAuthChange(fn: (session: Session | null) => void): () => void;
  updateDisplayName(name: string): Promise<User>;

  // Settings
  getSettings(): Promise<UserSettings>;
  saveSettings(settings: UserSettings): Promise<UserSettings>;

  // Teams and membership
  createTeam(input: { name: string; type: TeamType; teamNumber?: number | null }): Promise<Team>;
  listMyTeams(): Promise<(Team & { role: Role })[]>;
  renameTeam(teamId: string, name: string): Promise<Team>;
  deleteTeam(teamId: string): Promise<void>;
  listMembers(teamId: string): Promise<Membership[]>;
  setMemberRole(teamId: string, userId: string, role: Role): Promise<void>;
  /** Admins remove anyone; members can remove themselves (leave). The last admin cannot leave. */
  removeMember(teamId: string, userId: string): Promise<void>;

  // Invites
  createInvite(teamId: string, daysValid?: number): Promise<Invite>;
  listInvites(teamId: string): Promise<Invite[]>;
  revokeInvite(inviteId: string): Promise<void>;
  requestToJoin(code: string): Promise<JoinRequest>;
  listJoinRequests(teamId: string): Promise<JoinRequest[]>;
  decideJoinRequest(requestId: string, approve: boolean): Promise<void>;

  // Team documents
  listDocs<K extends DocKind>(teamId: string, kind: K): Promise<TeamDocSummary<K>[]>;
  getDoc<K extends DocKind>(docId: string): Promise<TeamDoc<K>>;
  createDoc<K extends DocKind>(teamId: string, kind: K, name: string, data: DocDataByKind[K]): Promise<TeamDoc<K>>;
  /** Saves only if the stored version still equals expectedVersion; otherwise returns the conflict. */
  saveDoc<K extends DocKind>(docId: string, expectedVersion: number, name: string, data: DocDataByKind[K]): Promise<SaveResult<K>>;
  deleteDoc(docId: string): Promise<void>;
  /** Version history (kept for designs). Newest first. */
  listVersions<K extends DocKind>(docId: string): Promise<DocVersion<K>[]>;

  // Publishing
  publish(teamId: string, opts: PublishOptions): Promise<PublishedSnapshot>;
  unpublish(snapshotId: string): Promise<void>;
  /** Public read; no account needed. */
  listSnapshots(query?: SnapshotQuery): Promise<PublishedSnapshot[]>;
  getSnapshot(snapshotId: string): Promise<PublishedSnapshot>;
  /** Snapshots this team published (members only). */
  listTeamSnapshots(teamId: string): Promise<PublishedSnapshot[]>;
  /** Copies a published design into a team workspace (sign-in required). */
  remixDesign(snapshotId: string, designIndex: number, teamId: string): Promise<TeamDoc<"design">>;

  // Export / delete (PRD §14.6)
  exportMyData(): Promise<UserExport>;
  deleteMyAccount(): Promise<void>;
  exportTeam(teamId: string): Promise<TeamExport>;
}

export type DataLayerErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "invalid"
  | "too_large"
  | "rate_limited"
  | "quota"
  | "network"
  | "unavailable";

export class DataLayerError extends Error {
  constructor(
    readonly code: DataLayerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DataLayerError";
  }
}

/** Applies the user's choice for a save conflict (PRD §14.9). */
export async function resolveConflict<K extends DocKind>(
  dl: DataLayer,
  result: Extract<SaveResult<K>, { ok: false }>,
  choice: ConflictChoice,
): Promise<TeamDoc<K>> {
  const { mine, theirs } = result.conflict;
  switch (choice) {
    case "keep-theirs":
      return theirs;
    case "keep-mine": {
      const r = await dl.saveDoc<K>(theirs.id, theirs.version, mine.name, mine.data);
      if (r.ok) return r.doc;
      throw new DataLayerError("invalid", "The document changed again while resolving the conflict. Try again.");
    }
    case "save-as-copy":
      return dl.createDoc(theirs.teamId, theirs.kind, `${mine.name} (copy)`, mine.data);
  }
}
