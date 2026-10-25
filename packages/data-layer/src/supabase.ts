import { checkDoc, checkSettings, checkTeamInput, RateLimiter } from "./limits.js";
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

// ---------------------------------------------------------------------------
// The subset of the supabase-js v2 client this layer uses. Pass the real client:
//   new SupabaseDataLayer(createClient(url, anonKey) as unknown as SupabaseLike)
// Only the anon key belongs in the browser; row-level security does the enforcement.
// ---------------------------------------------------------------------------

export interface PgError {
  message: string;
  code?: string;
  details?: string;
}
export interface PgResult<T = unknown> {
  data: T | null;
  error: PgError | null;
}
export interface Query extends PromiseLike<PgResult> {
  select(columns?: string): Query;
  insert(values: unknown): Query;
  update(values: unknown): Query;
  upsert(values: unknown): Query;
  delete(): Query;
  eq(column: string, value: unknown): Query;
  in(column: string, values: unknown[]): Query;
  contains(column: string, value: unknown): Query;
  ilike(column: string, pattern: string): Query;
  order(column: string, opts?: { ascending?: boolean }): Query;
  limit(n: number): Query;
  single(): Query;
  maybeSingle(): Query;
}
interface AuthUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}
export interface SupabaseLike {
  auth: {
    getSession(): Promise<{ data: { session: { user: AuthUser } | null }; error: PgError | null }>;
    signInWithOAuth(args: { provider: "google"; options?: { redirectTo?: string } }): Promise<{ error: PgError | null }>;
    signInWithOtp(args: { email: string; options?: { emailRedirectTo?: string } }): Promise<{ error: PgError | null }>;
    signOut(): Promise<{ error: PgError | null }>;
    onAuthStateChange(cb: (event: string, session: { user: AuthUser } | null) => void): { data: { subscription: { unsubscribe(): void } } };
  };
  from(table: string): Query;
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<PgResult>;
}

/** Maps database errors to data-layer errors. SQL functions raise messages prefixed with a code, e.g. "quota: ...". */
export function mapError(e: PgError | Error | unknown): DataLayerError {
  if (e instanceof DataLayerError) return e;
  if (e instanceof TypeError) return new DataLayerError("network", "Can't reach the server. Your work is kept in this tab; saving will retry.");
  const err = e as PgError;
  const msg = err?.message ?? String(e);
  const prefixed = /^(quota|forbidden|not_found|invalid|rate_limited|too_large):\s*(.*)$/s.exec(msg);
  if (prefixed) return new DataLayerError(prefixed[1] as DataLayerError["code"], prefixed[2]!);
  if (err?.code === "42501") return new DataLayerError("forbidden", "You don't have permission to do that.");
  if (err?.code === "PGRST116") return new DataLayerError("not_found", "Not found.");
  if (err?.code === "23514" || err?.code === "23502" || err?.code === "22P02") return new DataLayerError("invalid", msg);
  if (/fetch|network|timeout/i.test(msg)) return new DataLayerError("network", "Can't reach the server. Saving will retry.");
  return new DataLayerError("unavailable", msg);
}

async function run<T>(q: PromiseLike<PgResult>): Promise<T> {
  let r: PgResult;
  try {
    r = await q;
  } catch (e) {
    throw mapError(e);
  }
  if (r.error) throw mapError(r.error);
  return r.data as T;
}

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? null : String(v));

const toTeam = (r: Row): Team => ({
  id: String(r.id),
  name: String(r.name),
  type: r.type as TeamType,
  teamNumber: (r.team_number as number | null) ?? null,
  createdAt: String(r.created_at),
});
const toMember = (r: Row): Membership => ({
  teamId: String(r.team_id),
  userId: String(r.user_id),
  role: r.role as Role,
  displayName: String(r.display_name ?? ""),
  joinedAt: String(r.joined_at),
});
const toInvite = (r: Row): Invite => ({
  id: String(r.id),
  teamId: String(r.team_id),
  code: String(r.code),
  createdAt: String(r.created_at),
  expiresAt: String(r.expires_at),
  revoked: !!r.revoked,
});
const toRequest = (r: Row): JoinRequest => ({
  id: String(r.id),
  teamId: String(r.team_id),
  userId: String(r.user_id),
  displayName: String(r.display_name ?? ""),
  status: r.status as JoinRequest["status"],
  createdAt: String(r.created_at),
});
const toSummary = (r: Row): TeamDocSummary => ({
  id: String(r.id),
  teamId: String(r.team_id),
  kind: r.kind as DocKind,
  name: String(r.name),
  version: Number(r.version),
  createdBy: s(r.created_by),
  updatedBy: s(r.updated_by),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});
const toDoc = (r: Row): TeamDoc => ({ ...toSummary(r), data: r.data } as TeamDoc);
const toVersion = (r: Row): DocVersion => ({
  docId: String(r.doc_id),
  version: Number(r.version),
  name: String(r.name),
  data: r.data,
  savedBy: s(r.saved_by),
  savedAt: String(r.saved_at),
} as DocVersion);
const toSnapshot = (r: Row): PublishedSnapshot => ({
  id: String(r.id),
  title: String(r.title),
  description: String(r.description ?? ""),
  tags: (r.tags as string[]) ?? [],
  gameId: s(r.game_id),
  attribution: (r.attribution as PublishedSnapshot["attribution"]) ?? null,
  payload: (r.payload as PublishedSnapshot["payload"]) ?? {},
  meta: (r.meta as PublishedSnapshot["meta"]) ?? {},
  license: String(r.license),
  createdAt: String(r.created_at),
});

const SUMMARY_COLUMNS = "id,team_id,kind,name,version,created_by,updated_by,created_at,updated_at";

export class SupabaseDataLayer implements DataLayer {
  private limiter = new RateLimiter();
  private cachedUser: User | null = null;

  constructor(private sb: SupabaseLike) {}

  private async user(): Promise<User> {
    const session = await this.getSession();
    if (!session) throw new DataLayerError("unauthenticated", "Sign in to save or load team data.");
    return session.user;
  }

  private async write(): Promise<User> {
    const u = await this.user();
    this.limiter.take();
    return u;
  }

  private async toUser(au: AuthUser): Promise<User> {
    if (this.cachedUser?.id === au.id) return this.cachedUser;
    const fallback = (au.email ?? "").split("@")[0] || "Member";
    let displayName = String(au.user_metadata?.full_name ?? fallback);
    try {
      const p = await run<Row | null>(this.sb.from("profiles").select("display_name").eq("id", au.id).maybeSingle());
      if (p?.display_name) displayName = String(p.display_name);
    } catch {
      // profile row is created by a trigger on sign-up; fall back to the email name
    }
    this.cachedUser = { id: au.id, email: au.email ?? "", displayName };
    return this.cachedUser;
  }

  // ---------------------------------------------------------------- auth

  async getSession(): Promise<Session | null> {
    const { data, error } = await this.sb.auth.getSession();
    if (error) throw mapError(error);
    return data.session ? { user: await this.toUser(data.session.user) } : null;
  }

  async signInWithGoogle(redirectTo?: string): Promise<void> {
    const { error } = await this.sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) throw mapError(error);
  }

  async signInWithEmail(email: string, redirectTo?: string): Promise<void> {
    const { error } = await this.sb.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo } });
    if (error) throw mapError(error);
  }

  async signOut(): Promise<void> {
    this.cachedUser = null;
    const { error } = await this.sb.auth.signOut();
    if (error) throw mapError(error);
  }

  onAuthChange(fn: (session: Session | null) => void): () => void {
    const { data } = this.sb.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        this.cachedUser = null;
        fn(null);
      } else void this.toUser(session.user).then((user) => fn({ user }));
    });
    return () => data.subscription.unsubscribe();
  }

  async updateDisplayName(name: string): Promise<User> {
    const u = await this.write();
    if (!name.trim() || name.length > 60) throw new DataLayerError("invalid", "Display name must be 1-60 characters.");
    await run(this.sb.from("profiles").update({ display_name: name.trim() }).eq("id", u.id));
    this.cachedUser = { ...u, displayName: name.trim() };
    return this.cachedUser;
  }

  // ---------------------------------------------------------------- settings

  async getSettings(): Promise<UserSettings> {
    const u = await this.user();
    const r = await run<Row | null>(this.sb.from("user_settings").select("settings").eq("user_id", u.id).maybeSingle());
    return { ...DEFAULT_SETTINGS, ...((r?.settings as UserSettings) ?? {}) };
  }

  async saveSettings(settings: UserSettings): Promise<UserSettings> {
    const u = await this.write();
    checkSettings(settings);
    await run(this.sb.from("user_settings").upsert({ user_id: u.id, settings }));
    return settings;
  }

  // ---------------------------------------------------------------- teams

  async createTeam(input: { name: string; type: TeamType; teamNumber?: number | null }): Promise<Team> {
    await this.write();
    checkTeamInput(input.name, input.teamNumber);
    const r = await run<Row>(this.sb.rpc("create_team", { p_name: input.name.trim(), p_type: input.type, p_team_number: input.teamNumber ?? null }));
    return toTeam(Array.isArray(r) ? (r[0] as Row) : r);
  }

  async listMyTeams(): Promise<(Team & { role: Role })[]> {
    const u = await this.user();
    const rows = await run<Row[]>(this.sb.from("memberships").select("role, team:teams(*)").eq("user_id", u.id));
    return rows
      .filter((r) => r.team)
      .map((r) => ({ ...toTeam(r.team as Row), role: r.role as Role }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async renameTeam(teamId: string, name: string): Promise<Team> {
    await this.write();
    checkTeamInput(name);
    const rows = await run<Row[]>(this.sb.from("teams").update({ name: name.trim() }).eq("id", teamId).select());
    if (!rows.length) throw new DataLayerError("forbidden", "Only team admins can rename the team.");
    return toTeam(rows[0]!);
  }

  async deleteTeam(teamId: string): Promise<void> {
    await this.write();
    const rows = await run<Row[]>(this.sb.from("teams").delete().eq("id", teamId).select("id"));
    if (!rows.length) throw new DataLayerError("forbidden", "Only team admins can delete the team.");
  }

  async listMembers(teamId: string): Promise<Membership[]> {
    await this.user();
    const rows = await run<Row[]>(this.sb.from("team_members").select("*").eq("team_id", teamId).order("joined_at"));
    if (!rows.length) throw new DataLayerError("not_found", "Team not found.");
    return rows.map(toMember);
  }

  async setMemberRole(teamId: string, userId: string, role: Role): Promise<void> {
    await this.write();
    await run(this.sb.rpc("set_member_role", { p_team: teamId, p_user: userId, p_role: role }));
  }

  async removeMember(teamId: string, userId: string): Promise<void> {
    await this.write();
    await run(this.sb.rpc("remove_member", { p_team: teamId, p_user: userId }));
  }

  // ---------------------------------------------------------------- invites

  async createInvite(teamId: string, daysValid = 14): Promise<Invite> {
    await this.write();
    const r = await run<Row>(this.sb.rpc("create_invite", { p_team: teamId, p_days: daysValid }));
    return toInvite(Array.isArray(r) ? (r[0] as Row) : r);
  }

  async listInvites(teamId: string): Promise<Invite[]> {
    await this.user();
    return (await run<Row[]>(this.sb.from("invites").select("*").eq("team_id", teamId).order("created_at", { ascending: false }))).map(toInvite);
  }

  async revokeInvite(inviteId: string): Promise<void> {
    await this.write();
    const rows = await run<Row[]>(this.sb.from("invites").update({ revoked: true }).eq("id", inviteId).select("id"));
    if (!rows.length) throw new DataLayerError("not_found", "Invite not found.");
  }

  async requestToJoin(code: string): Promise<JoinRequest> {
    await this.write();
    const r = await run<Row>(this.sb.rpc("request_join", { p_code: code.trim().toUpperCase() }));
    return toRequest(Array.isArray(r) ? (r[0] as Row) : r);
  }

  async listJoinRequests(teamId: string): Promise<JoinRequest[]> {
    await this.user();
    return (await run<Row[]>(this.sb.from("join_requests_view").select("*").eq("team_id", teamId).order("created_at", { ascending: false }))).map(toRequest);
  }

  async decideJoinRequest(requestId: string, approve: boolean): Promise<void> {
    await this.write();
    await run(this.sb.rpc("decide_join_request", { p_request: requestId, p_approve: approve }));
  }

  // ---------------------------------------------------------------- docs

  async listDocs<K extends DocKind>(teamId: string, kind: K): Promise<TeamDocSummary<K>[]> {
    await this.user();
    const rows = await run<Row[]>(this.sb.from("team_docs").select(SUMMARY_COLUMNS).eq("team_id", teamId).eq("kind", kind).order("updated_at", { ascending: false }));
    return rows.map(toSummary) as TeamDocSummary<K>[];
  }

  async getDoc<K extends DocKind>(docId: string): Promise<TeamDoc<K>> {
    await this.user();
    const r = await run<Row | null>(this.sb.from("team_docs").select("*").eq("id", docId).maybeSingle());
    if (!r) throw new DataLayerError("not_found", "Document not found.");
    return toDoc(r) as TeamDoc<K>;
  }

  async createDoc<K extends DocKind>(teamId: string, kind: K, name: string, data: DocDataByKind[K]): Promise<TeamDoc<K>> {
    await this.write();
    checkDoc(kind, name, data);
    const r = await run<Row>(this.sb.from("team_docs").insert({ team_id: teamId, kind, name: name.trim(), data }).select().single());
    return toDoc(r) as TeamDoc<K>;
  }

  async saveDoc<K extends DocKind>(docId: string, expectedVersion: number, name: string, data: DocDataByKind[K]): Promise<SaveResult<K>> {
    await this.write();
    const current = await this.getDoc<K>(docId);
    checkDoc(current.kind, name, data);
    const rows = await run<Row[]>(
      this.sb.from("team_docs").update({ name: name.trim(), data, version: expectedVersion + 1 }).eq("id", docId).eq("version", expectedVersion).select(),
    );
    if (rows.length) return { ok: true, doc: toDoc(rows[0]!) as TeamDoc<K> };
    const theirs = await this.getDoc<K>(docId);
    return { ok: false, conflict: { mine: { name, data }, theirs } };
  }

  async deleteDoc(docId: string): Promise<void> {
    await this.write();
    const rows = await run<Row[]>(this.sb.from("team_docs").delete().eq("id", docId).select("id"));
    if (!rows.length) throw new DataLayerError("not_found", "Document not found.");
  }

  async listVersions<K extends DocKind>(docId: string): Promise<DocVersion<K>[]> {
    await this.user();
    return (await run<Row[]>(this.sb.from("doc_versions").select("*").eq("doc_id", docId).order("version", { ascending: false }))).map(toVersion) as DocVersion<K>[];
  }

  // ---------------------------------------------------------------- publishing

  async publish(teamId: string, opts: PublishOptions): Promise<PublishedSnapshot> {
    await this.write();
    if (!opts.title?.trim()) throw new DataLayerError("invalid", "Give the published test a title.");
    const r = await run<Row>(
      this.sb.rpc("publish_snapshot", {
        p_team: teamId,
        p_test_run: opts.testRunId,
        p_title: opts.title.trim(),
        p_description: opts.description ?? "",
        p_tags: opts.tags ?? [],
        p_include: opts.include,
        p_anonymous: opts.attribution === "anonymous",
        p_license: opts.license ?? "CC BY 4.0",
      }),
    );
    return toSnapshot(Array.isArray(r) ? (r[0] as Row) : r);
  }

  async unpublish(snapshotId: string): Promise<void> {
    await this.write();
    await run(this.sb.rpc("unpublish_snapshot", { p_snapshot: snapshotId }));
  }

  async listSnapshots(query: SnapshotQuery = {}): Promise<PublishedSnapshot[]> {
    let q = this.sb.from("published_snapshots").select("*");
    if (query.gameId) q = q.eq("game_id", query.gameId);
    if (query.tag) q = q.contains("tags", [query.tag]);
    if (query.text) q = q.ilike("title", `%${query.text.replace(/[%_]/g, "")}%`);
    const rows = await run<Row[]>(q.order("created_at", { ascending: false }).limit(Math.min(query.limit ?? 100, 500)));
    return rows.map(toSnapshot);
  }

  async getSnapshot(snapshotId: string): Promise<PublishedSnapshot> {
    const r = await run<Row | null>(this.sb.from("published_snapshots").select("*").eq("id", snapshotId).maybeSingle());
    if (!r) throw new DataLayerError("not_found", "Published test not found.");
    return toSnapshot(r);
  }

  async listTeamSnapshots(teamId: string): Promise<PublishedSnapshot[]> {
    await this.user();
    const rows = await run<Row[]>(this.sb.from("snapshot_owners").select("snapshot:published_snapshots(*)").eq("team_id", teamId));
    return rows.filter((r) => r.snapshot).map((r) => toSnapshot(r.snapshot as Row));
  }

  async remixDesign(snapshotId: string, designIndex: number, teamId: string): Promise<TeamDoc<"design">> {
    const snap = await this.getSnapshot(snapshotId);
    const design = snap.payload.designs?.[designIndex];
    if (!design) throw new DataLayerError("not_found", "That published test has no such design.");
    return this.createDoc(teamId, "design", `${design.name} (remix)`, design);
  }

  // ---------------------------------------------------------------- export / delete

  async exportMyData(): Promise<UserExport> {
    const user = await this.user();
    const memberships = (await run<Row[]>(this.sb.from("team_members").select("*").eq("user_id", user.id))).map(toMember);
    const joinRequests = (await run<Row[]>(this.sb.from("join_requests_view").select("*").eq("user_id", user.id))).map(toRequest);
    return { user, settings: await this.getSettings(), memberships, joinRequests };
  }

  async deleteMyAccount(): Promise<void> {
    await this.user();
    await run(this.sb.rpc("delete_my_account"));
    await this.signOut();
  }

  async exportTeam(teamId: string): Promise<TeamExport> {
    const u = await this.user();
    const members = await this.listMembers(teamId);
    if (members.find((m) => m.userId === u.id)?.role !== "admin") throw new DataLayerError("forbidden", "Only team admins can export the team's data.");
    const team = toTeam(await run<Row>(this.sb.from("teams").select("*").eq("id", teamId).single()));
    const docs = (await run<Row[]>(this.sb.from("team_docs").select("*").eq("team_id", teamId))).map(toDoc);
    const versions = (await run<Row[]>(this.sb.from("doc_versions").select("*").eq("team_id", teamId))).map(toVersion);
    return { team, members, docs, versions, snapshots: await this.listTeamSnapshots(teamId) };
  }
}
