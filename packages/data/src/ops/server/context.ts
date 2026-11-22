// What every action gets: who is asking, the environment, the history lines to write, and the small checks that
// keep requests tidy. SERVER ONLY.
import { apiError, type Doc, type OpsEnv } from "./env";
import { SUBTEAM_BADGE_PREFIX } from "../../config";

/** Who is acting. Members come from the Wix session; Apollo and the timers are fixed names. */
export interface Actor {
  id: string;
  name: string;
  /** The short name typed after "@". */
  username?: string;
  /** Apollo, or a job such as the GitHub sync: not a person with badges. */
  agent?: boolean;
  approved: boolean;
  /** Badge titles. */
  badges: string[];
}

/** Apollo, the team's Hermes agent. Everything it does is recorded under this ID and name. */
export const APOLLO: Actor = { id: "apollo", name: "Apollo", username: "apollo", agent: true, approved: true, badges: [] };
/** Jobs run by the timer, recorded under their own names. */
export const GITHUB_SYNC: Actor = { id: "github-sync", name: "GitHub sync", agent: true, approved: true, badges: [] };
export const BLUE_ALLIANCE: Actor = { id: "tba", name: "The Blue Alliance", agent: true, approved: true, badges: [] };

export const COLLECTION_COUNTERS = "ops_counters";
export const COLLECTION_HISTORY = "ops_history";
export const COLLECTION_PROJECTS = "ops_projects";
export const COLLECTION_PEOPLE = "ops_people";
/** The student roster (student ID, name, grade), imported once from its sheet; only the server reads it. */
export const COLLECTION_ROSTER = "ops_roster";
export const REQUIRED_COLLECTIONS = [COLLECTION_COUNTERS, COLLECTION_HISTORY, COLLECTION_PROJECTS, COLLECTION_PEOPLE, COLLECTION_ROSTER];

export interface Record_ {
  kind: string;
  id: string;
}

export class Ctx {
  private history: Doc[] = [];
  private badgeTitles?: Promise<Record<string, string>>;
  private secrets = new Map<string, Promise<string | undefined>>();

  constructor(
    readonly env: OpsEnv,
    readonly actor: Actor,
  ) {}

  get data() {
    return this.env.data;
  }

  /** The same context, acting as someone else (a timer job). History lines are shared. */
  as(actor: Actor): Ctx {
    const other = new Ctx(this.env, actor);
    other.history = this.history;
    other.badgeTitles = this.badgeTitles;
    other.secrets = this.secrets;
    return other;
  }

  /** Adds a line to the change log. Written with the other lines at the end of the request (one call). */
  log(record: Record_, action: string, summary = "", event?: { type: string; data?: Record<string, unknown> }): void {
    this.history.push({
      // What happened, for the notification rules (for example "task.assigned"); see EVENT_TYPES in events-log.ts.
      ...(event ? { type: event.type, data: event.data ?? {} } : {}),
      recordKind: record.kind,
      recordId: record.id,
      actorId: this.actor.id,
      actorName: this.actor.name,
      actorIsAgent: this.actor.agent === true,
      action,
      summary,
      at: this.env.now().toISOString(),
    });
  }

  /** Writes the lines logged so far. Called once per request, even after an error, so work already saved is on record. */
  async flushHistory(): Promise<void> {
    if (!this.history.length) return;
    const lines = this.history;
    this.history = [];
    await this.env.data.insertMany(COLLECTION_HISTORY, lines);
  }

  /** { badge id: title } for every badge on the site. Asked for once per request. */
  siteBadges(): Promise<Record<string, string>> {
    this.badgeTitles ??= this.env.badges.list().then((all) => Object.fromEntries(all.filter((b) => b.id).map((b) => [b.id, b.title || ""])));
    return this.badgeTitles;
  }

  /** A secret, read once per request (each read is a call to Wix). */
  secret(name: string): Promise<string | undefined> {
    if (!this.secrets.has(name)) this.secrets.set(name, this.env.secret(name));
    return this.secrets.get(name)!;
  }

  /** The next free number of a kind, set aside `count` in a row. Numbers are never reused. */
  async takeNumber(kind: string, count = 1): Promise<number> {
    const claimed = await this.data.increment(COLLECTION_COUNTERS, kind, "next", count);
    if (claimed) return Number(claimed.next) - count;
    // First number of this kind: create the counter, then take from it. If another request created it first, taking from it still works.
    try {
      await this.data.insert(COLLECTION_COUNTERS, { _id: kind, key: kind, next: 1 });
    } catch {
      // someone else made it just now
    }
    const created = await this.data.increment(COLLECTION_COUNTERS, kind, "next", count);
    if (!created) throw apiError("wix-unavailable", "Couldn't hand out a number. Try again.");
    return Number(created.next) - count;
  }

  /** Today's date as the team sees it, yyyy-mm-dd. */
  today(): string {
    return this.env.now().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  }
}

// ---------------------------------------------------------------------------------------------------------
// Checking what the browser sent
// ---------------------------------------------------------------------------------------------------------

/** A short text argument, trimmed. Throws bad-request when it is missing or too long. */
export function text(value: unknown, name: string, max: number, optional = false): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s && !optional) throw apiError("bad-request", `Missing ${name}.`);
  if (s.length > max) throw apiError("bad-request", `${name} is too long.`);
  return s;
}

/** A number of dollars with at most two decimals, 0 or more. */
export function money(value: unknown, name: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) throw apiError("bad-request", `${name} must be an amount of money.`);
  return Math.round(n * 100) / 100;
}

/** A whole number from min to max. */
export function wholeNumber(value: unknown, min: number, max: number): number | null {
  const n = Math.floor(Number(value));
  return n >= min && n <= max ? n : null;
}

/** One item by its `_id`. Throws bad-request (naming `what`, for example "line") when it is gone. */
export async function getRecord(ctx: Ctx, collection: string, id: unknown, what: string): Promise<Doc> {
  const row = typeof id === "string" && id ? (await ctx.data.queryIds(collection, [id]))[0] : undefined;
  if (!row) throw apiError("bad-request", `That ${what} doesn't exist any more. Reload the page.`);
  return row;
}

/** Hex SHA-256 of a text. */
export async function sha256Hex(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const subteamTitle = (name: string) => SUBTEAM_BADGE_PREFIX + name;
