import type { RobotDesign, Replay } from "@goldsim/schema";
import { checkDoc, checkSettings, checkTeamInput, RateLimiter, TEAM_QUOTAS, byteSize } from "./limits.js";
import {
  DataLayerError,
  DEFAULT_SETTINGS,
  type DataLayer,
  type DocDataByKind,
  type DocKind,
  type DocVersion,
  type Invite,
  type JoinRequest,
  type Membership,
  type PublishOptions,
  type PublishedSnapshot,
  type Role,
  type SaveResult,
  type Session,
  type SnapshotQuery,
  type Team,
  type TeamDoc,
  type TeamDocSummary,
  type TeamExport,
  type TeamType,
  type User,
  type UserExport,
  type UserSettings,
} from "./types.js";

/** Kinds whose full version history is kept (PRD §9.1: designs). */
export const HISTORY_KINDS: DocKind[] = ["design"];
export const DEFAULT_LICENSE = "CC BY 4.0";

interface SnapshotRow {
  snap: PublishedSnapshot;
  teamId: string;
  publishedBy: string;
}

const clone = <T>(v: T): T => structuredClone(v);

function randomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

/**
 * Shared in-memory store. Several clients (one per simulated user) can point at the same backend,
 * which is how tests check permissions. Also usable as a throwaway store for guest mode.
 */
export class MemoryBackend {
  users = new Map<string, User>();
  settings = new Map<string, UserSettings>();
  teams = new Map<string, Team>();
  members = new Map<string, Membership[]>(); // teamId -> memberships
  invites = new Map<string, Invite>();
  requests = new Map<string, JoinRequest>();
  docs = new Map<string, TeamDoc>();
  versions = new Map<string, DocVersion[]>();
  snapshots = new Map<string, SnapshotRow>();
  now: () => Date = () => new Date();

  client(): MemoryDataLayer {
    return new MemoryDataLayer(this);
  }

  userByEmail(email: string): User | undefined {
    for (const u of this.users.values()) if (u.email === email) return u;
    return undefined;
  }
}

export class MemoryDataLayer implements DataLayer {
  private session: Session | null = null;
  private listeners: ((s: Session | null) => void)[] = [];
  private limiter = new RateLimiter();

  constructor(private db: MemoryBackend = new MemoryBackend()) {}

  // ---------------------------------------------------------------- helpers

  private iso(): string {
    return this.db.now().toISOString();
  }

  private me(): User {
    if (!this.session) throw new DataLayerError("unauthenticated", "Sign in to save or load team data.");
    return this.session.user;
  }

  private write(): User {
    const u = this.me();
    this.limiter.take();
    return u;
  }

  private membership(teamId: string, userId: string): Membership | undefined {
    return this.db.members.get(teamId)?.find((m) => m.userId === userId);
  }

  private requireMember(teamId: string): Membership {
    const u = this.me();
    const m = this.membership(teamId, u.id);
    // Same answer for "missing" and "not yours", like row-level security.
    if (!m || !this.db.teams.has(teamId)) throw new DataLayerError("not_found", "Team not found.");
    return m;
  }

  private requireAdmin(teamId: string): Membership {
    const m = this.requireMember(teamId);
    if (m.role !== "admin") throw new DataLayerError("forbidden", "Only team admins can do that.");
    return m;
  }

  private docFor(docId: string): TeamDoc {
    const d = this.db.docs.get(docId);
    if (!d || !this.membership(d.teamId, this.me().id)) throw new DataLayerError("not_found", "Document not found.");
    return d;
  }

  private emit(): void {
    for (const l of this.listeners) l(this.session ? clone(this.session) : null);
  }

  private teamBytes(teamId: string): number {
    let n = 0;
    for (const d of this.db.docs.values()) if (d.teamId === teamId) n += byteSize(d.data);
    return n;
  }

  // ---------------------------------------------------------------- auth

  async getSession(): Promise<Session | null> {
    return this.session ? clone(this.session) : null;
  }

  async signInWithGoogle(): Promise<void> {
    throw new DataLayerError("unavailable", "Google sign-in needs the hosted backend. The in-memory store supports email sign-in only.");
  }

  /** Simulates a magic link: signs in immediately, creating the user on first use. */
  async signInWithEmail(email: string): Promise<void> {
    const clean = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) throw new DataLayerError("invalid", "Enter a valid email address.");
    let user = this.db.userByEmail(clean);
    if (!user) {
      user = { id: crypto.randomUUID(), email: clean, displayName: clean.split("@")[0]! };
      this.db.users.set(user.id, user);
    }
    this.session = { user: clone(user) };
    this.emit();
  }

  async signOut(): Promise<void> {
    this.session = null;
    this.emit();
  }

  onAuthChange(fn: (session: Session | null) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  async updateDisplayName(name: string): Promise<User> {
    const u = this.write();
    if (!name.trim() || name.length > 60) throw new DataLayerError("invalid", "Display name must be 1-60 characters.");
    const stored = this.db.users.get(u.id)!;
    stored.displayName = name.trim();
    for (const list of this.db.members.values()) for (const m of list) if (m.userId === u.id) m.displayName = stored.displayName;
    this.session = { user: clone(stored) };
    this.emit();
    return clone(stored);
  }

  // ---------------------------------------------------------------- settings

  async getSettings(): Promise<UserSettings> {
    return clone(this.db.settings.get(this.me().id) ?? DEFAULT_SETTINGS);
  }

  async saveSettings(settings: UserSettings): Promise<UserSettings> {
    const u = this.write();
    checkSettings(settings);
    this.db.settings.set(u.id, clone(settings));
    return clone(settings);
  }

  // ---------------------------------------------------------------- teams

  async createTeam(input: { name: string; type: TeamType; teamNumber?: number | null }): Promise<Team> {
    const u = this.write();
    checkTeamInput(input.name, input.teamNumber);
    const team: Team = { id: crypto.randomUUID(), name: input.name.trim(), type: input.type, teamNumber: input.teamNumber ?? null, createdAt: this.iso() };
    this.db.teams.set(team.id, team);
    this.db.members.set(team.id, [{ teamId: team.id, userId: u.id, role: "admin", displayName: u.displayName, joinedAt: this.iso() }]);
    return clone(team);
  }

  async listMyTeams(): Promise<(Team & { role: Role })[]> {
    const u = this.me();
    const out: (Team & { role: Role })[] = [];
    for (const [teamId, list] of this.db.members) {
      const m = list.find((x) => x.userId === u.id);
      const t = this.db.teams.get(teamId);
      if (m && t) out.push({ ...clone(t), role: m.role });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async renameTeam(teamId: string, name: string): Promise<Team> {
    this.write();
    this.requireAdmin(teamId);
    checkTeamInput(name);
    const t = this.db.teams.get(teamId)!;
    t.name = name.trim();
    return clone(t);
  }

  async deleteTeam(teamId: string): Promise<void> {
    this.write();
    this.requireAdmin(teamId);
    this.db.teams.delete(teamId);
    this.db.members.delete(teamId);
    for (const [id, inv] of this.db.invites) if (inv.teamId === teamId) this.db.invites.delete(id);
    for (const [id, r] of this.db.requests) if (r.teamId === teamId) this.db.requests.delete(id);
    for (const [id, d] of this.db.docs)
      if (d.teamId === teamId) {
        this.db.docs.delete(id);
        this.db.versions.delete(id);
      }
    // Published snapshots are public copies; deleting the workspace removes them too.
    for (const [id, s] of this.db.snapshots) if (s.teamId === teamId) this.db.snapshots.delete(id);
  }

  async listMembers(teamId: string): Promise<Membership[]> {
    this.requireMember(teamId);
    return clone(this.db.members.get(teamId) ?? []);
  }

  private adminCount(teamId: string): number {
    return (this.db.members.get(teamId) ?? []).filter((m) => m.role === "admin").length;
  }

  async setMemberRole(teamId: string, userId: string, role: Role): Promise<void> {
    this.write();
    this.requireAdmin(teamId);
    const m = this.membership(teamId, userId);
    if (!m) throw new DataLayerError("not_found", "That person is not on this team.");
    if (m.role === "admin" && role !== "admin" && this.adminCount(teamId) === 1)
      throw new DataLayerError("forbidden", "A team needs at least one admin. Make someone else admin first.");
    m.role = role;
  }

  async removeMember(teamId: string, userId: string): Promise<void> {
    const u = this.write();
    const mine = this.requireMember(teamId);
    if (userId !== u.id && mine.role !== "admin") throw new DataLayerError("forbidden", "Only team admins can remove members.");
    const target = this.membership(teamId, userId);
    if (!target) throw new DataLayerError("not_found", "That person is not on this team.");
    if (target.role === "admin" && this.adminCount(teamId) === 1)
      throw new DataLayerError("forbidden", "A team needs at least one admin. Make someone else admin first, or delete the team.");
    this.db.members.set(
      teamId,
      this.db.members.get(teamId)!.filter((m) => m.userId !== userId),
    );
  }

  // ---------------------------------------------------------------- invites

  async createInvite(teamId: string, daysValid = 14): Promise<Invite> {
    this.write();
    this.requireAdmin(teamId);
    const now = this.db.now();
    const inv: Invite = {
      id: crypto.randomUUID(),
      teamId,
      code: randomCode(),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + daysValid * 86400_000).toISOString(),
      revoked: false,
    };
    this.db.invites.set(inv.id, inv);
    return clone(inv);
  }

  async listInvites(teamId: string): Promise<Invite[]> {
    this.requireAdmin(teamId);
    return [...this.db.invites.values()].filter((i) => i.teamId === teamId).map(clone);
  }

  async revokeInvite(inviteId: string): Promise<void> {
    this.write();
    const inv = this.db.invites.get(inviteId);
    if (!inv) throw new DataLayerError("not_found", "Invite not found.");
    this.requireAdmin(inv.teamId);
    inv.revoked = true;
  }

  async requestToJoin(code: string): Promise<JoinRequest> {
    const u = this.write();
    const inv = [...this.db.invites.values()].find((i) => i.code === code.trim().toUpperCase());
    if (!inv || inv.revoked || new Date(inv.expiresAt) < this.db.now())
      throw new DataLayerError("not_found", "That invite code is not valid or has expired. Ask your team admin for a new one.");
    if (this.membership(inv.teamId, u.id)) throw new DataLayerError("invalid", "You are already on this team.");
    const existing = [...this.db.requests.values()].find((r) => r.teamId === inv.teamId && r.userId === u.id && r.status === "pending");
    if (existing) return clone(existing);
    const req: JoinRequest = { id: crypto.randomUUID(), teamId: inv.teamId, userId: u.id, displayName: u.displayName, status: "pending", createdAt: this.iso() };
    this.db.requests.set(req.id, req);
    return clone(req);
  }

  async listJoinRequests(teamId: string): Promise<JoinRequest[]> {
    this.requireAdmin(teamId);
    return [...this.db.requests.values()].filter((r) => r.teamId === teamId).map(clone);
  }

  async decideJoinRequest(requestId: string, approve: boolean): Promise<void> {
    this.write();
    const req = this.db.requests.get(requestId);
    if (!req) throw new DataLayerError("not_found", "Request not found.");
    this.requireAdmin(req.teamId);
    if (req.status !== "pending") throw new DataLayerError("invalid", "That request was already decided.");
    req.status = approve ? "approved" : "denied";
    if (approve && !this.membership(req.teamId, req.userId)) {
      const user = this.db.users.get(req.userId);
      this.db.members.get(req.teamId)!.push({ teamId: req.teamId, userId: req.userId, role: "member", displayName: user?.displayName ?? req.displayName, joinedAt: this.iso() });
    }
  }

  // ---------------------------------------------------------------- docs

  async listDocs<K extends DocKind>(teamId: string, kind: K): Promise<TeamDocSummary<K>[]> {
    this.requireMember(teamId);
    return [...this.db.docs.values()]
      .filter((d) => d.teamId === teamId && d.kind === kind)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(({ data: _data, ...rest }) => clone(rest) as TeamDocSummary<K>);
  }

  async getDoc<K extends DocKind>(docId: string): Promise<TeamDoc<K>> {
    return clone(this.docFor(docId)) as TeamDoc<K>;
  }

  async createDoc<K extends DocKind>(teamId: string, kind: K, name: string, data: DocDataByKind[K]): Promise<TeamDoc<K>> {
    const u = this.write();
    this.requireMember(teamId);
    checkDoc(kind, name, data);
    const teamDocs = [...this.db.docs.values()].filter((d) => d.teamId === teamId);
    if (teamDocs.length >= TEAM_QUOTAS.docs) throw new DataLayerError("quota", "This team has reached its document limit. Delete old items first.");
    if (kind === "testRun" && teamDocs.filter((d) => d.kind === "testRun").length >= TEAM_QUOTAS.testRuns)
      throw new DataLayerError("quota", "This team has reached its test-run limit. Delete old test runs first.");
    if (this.teamBytes(teamId) + byteSize(data) > TEAM_QUOTAS.bytes) throw new DataLayerError("quota", "This team is out of storage.");
    const now = this.iso();
    const doc: TeamDoc<K> = { id: crypto.randomUUID(), teamId, kind, name: name.trim(), data: clone(data), version: 1, createdBy: u.id, updatedBy: u.id, createdAt: now, updatedAt: now };
    this.db.docs.set(doc.id, doc as TeamDoc);
    if (HISTORY_KINDS.includes(kind)) this.db.versions.set(doc.id, [{ docId: doc.id, version: 1, name: doc.name, data: clone(data), savedBy: u.id, savedAt: now }]);
    return clone(doc);
  }

  async saveDoc<K extends DocKind>(docId: string, expectedVersion: number, name: string, data: DocDataByKind[K]): Promise<SaveResult<K>> {
    const u = this.write();
    const doc = this.docFor(docId) as TeamDoc<K>;
    checkDoc(doc.kind, name, data);
    if (doc.version !== expectedVersion) return { ok: false, conflict: { mine: { name, data: clone(data) }, theirs: clone(doc) } };
    if (this.teamBytes(doc.teamId) - byteSize(doc.data) + byteSize(data) > TEAM_QUOTAS.bytes) throw new DataLayerError("quota", "This team is out of storage.");
    doc.version += 1;
    doc.name = name.trim();
    doc.data = clone(data);
    doc.updatedBy = u.id;
    doc.updatedAt = this.iso();
    if (HISTORY_KINDS.includes(doc.kind))
      this.db.versions.get(doc.id)?.push({ docId: doc.id, version: doc.version, name: doc.name, data: clone(data), savedBy: u.id, savedAt: doc.updatedAt });
    return { ok: true, doc: clone(doc) };
  }

  async deleteDoc(docId: string): Promise<void> {
    this.write();
    this.docFor(docId);
    this.db.docs.delete(docId);
    this.db.versions.delete(docId);
  }

  async listVersions<K extends DocKind>(docId: string): Promise<DocVersion<K>[]> {
    this.docFor(docId);
    return clone([...(this.db.versions.get(docId) ?? [])].reverse()) as DocVersion<K>[];
  }

  // ---------------------------------------------------------------- publishing

  async publish(teamId: string, opts: PublishOptions): Promise<PublishedSnapshot> {
    const u = this.write();
    this.requireAdmin(teamId);
    const run = this.db.docs.get(opts.testRunId);
    if (!run || run.teamId !== teamId || run.kind !== "testRun") throw new DataLayerError("not_found", "Test run not found in this team.");
    if (!opts.title?.trim()) throw new DataLayerError("invalid", "Give the published test a title.");
    const data = run.data as DocDataByKind["testRun"];
    const team = this.db.teams.get(teamId)!;
    const payload: PublishedSnapshot["payload"] = {};
    if (opts.include.stats) payload.stats = clone(data.summary ?? null);
    if (opts.include.designs) payload.designs = clone((data.designs ?? []) as RobotDesign[]);
    if (opts.include.replays)
      payload.replays = (data.replayIds ?? [])
        .map((id) => this.db.docs.get(id))
        .filter((d): d is TeamDoc => !!d && d.teamId === teamId && d.kind === "recording")
        .map((d) => clone(d.data as Replay));
    const snap: PublishedSnapshot = {
      id: crypto.randomUUID(),
      title: opts.title.trim(),
      description: opts.description ?? "",
      tags: [...new Set(opts.tags ?? [])],
      gameId: data.gameId ?? null,
      attribution: opts.attribution === "team" ? { teamName: team.name, teamNumber: team.teamNumber, verified: false } : null,
      payload,
      meta: { engineVersion: data.engineVersion, schemaVersion: data.schemaVersion, seeds: data.seeds, settings: clone(data.settings) },
      license: opts.license ?? DEFAULT_LICENSE,
      createdAt: this.iso(),
    };
    this.db.snapshots.set(snap.id, { snap, teamId, publishedBy: u.id });
    return clone(snap);
  }

  async unpublish(snapshotId: string): Promise<void> {
    this.write();
    const row = this.db.snapshots.get(snapshotId);
    if (!row) throw new DataLayerError("not_found", "Published test not found.");
    this.requireAdmin(row.teamId);
    this.db.snapshots.delete(snapshotId);
  }

  async listSnapshots(query: SnapshotQuery = {}): Promise<PublishedSnapshot[]> {
    const text = query.text?.toLowerCase();
    return [...this.db.snapshots.values()]
      .map((r) => r.snap)
      .filter((s) => (!query.gameId || s.gameId === query.gameId) && (!query.tag || s.tags.includes(query.tag)))
      .filter((s) => !text || `${s.title} ${s.description} ${s.tags.join(" ")}`.toLowerCase().includes(text))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, query.limit ?? 100)
      .map(clone);
  }

  async getSnapshot(snapshotId: string): Promise<PublishedSnapshot> {
    const row = this.db.snapshots.get(snapshotId);
    if (!row) throw new DataLayerError("not_found", "Published test not found.");
    return clone(row.snap);
  }

  async listTeamSnapshots(teamId: string): Promise<PublishedSnapshot[]> {
    this.requireMember(teamId);
    return [...this.db.snapshots.values()].filter((r) => r.teamId === teamId).map((r) => clone(r.snap));
  }

  async remixDesign(snapshotId: string, designIndex: number, teamId: string): Promise<TeamDoc<"design">> {
    const snap = await this.getSnapshot(snapshotId);
    const design = snap.payload.designs?.[designIndex];
    if (!design) throw new DataLayerError("not_found", "That published test has no such design.");
    return this.createDoc(teamId, "design", `${design.name} (remix)`, design);
  }

  // ---------------------------------------------------------------- export / delete

  async exportMyData(): Promise<UserExport> {
    const u = this.me();
    const memberships: Membership[] = [];
    for (const list of this.db.members.values()) for (const m of list) if (m.userId === u.id) memberships.push(clone(m));
    return {
      user: clone(this.db.users.get(u.id)!),
      settings: await this.getSettings(),
      memberships,
      joinRequests: [...this.db.requests.values()].filter((r) => r.userId === u.id).map(clone),
    };
  }

  async deleteMyAccount(): Promise<void> {
    const u = this.me();
    for (const [teamId, list] of this.db.members) {
      const m = list.find((x) => x.userId === u.id);
      if (!m) continue;
      if (list.length === 1) continue; // sole member: team is deleted below
      if (m.role === "admin" && this.adminCount(teamId) === 1)
        throw new DataLayerError("forbidden", `You are the only admin of "${this.db.teams.get(teamId)?.name}". Make someone else admin first.`);
    }
    for (const [teamId, list] of [...this.db.members]) {
      if (!list.some((x) => x.userId === u.id)) continue;
      if (list.length === 1) await this.deleteTeam(teamId);
      else this.db.members.set(teamId, list.filter((x) => x.userId !== u.id));
    }
    for (const [id, r] of this.db.requests) if (r.userId === u.id) this.db.requests.delete(id);
    this.db.settings.delete(u.id);
    this.db.users.delete(u.id);
    await this.signOut();
  }

  async exportTeam(teamId: string): Promise<TeamExport> {
    this.requireAdmin(teamId);
    const docs = [...this.db.docs.values()].filter((d) => d.teamId === teamId);
    return {
      team: clone(this.db.teams.get(teamId)!),
      members: clone(this.db.members.get(teamId) ?? []),
      docs: clone(docs),
      versions: clone(docs.flatMap((d) => this.db.versions.get(d.id) ?? [])),
      snapshots: [...this.db.snapshots.values()].filter((r) => r.teamId === teamId).map((r) => clone(r.snap)),
    };
  }
}
