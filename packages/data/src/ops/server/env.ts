// What the operations server needs from the outside world, as small interfaces. SERVER ONLY.
//
// On Wix hosting src/server/ops-env.ts fills these in with the real Wix SDK (elevated, so the server can write
// collections that members can only read); tests fill them in with an in-memory fake (test/helpers/ops-fake.ts).
// Every call here is one of the 20 sub-requests Wix allows per request, so the actions keep their calls few
// (bulk reads and writes) and budget.ts counts them.

/** A stored item: its fields, plus `_id` once saved. */
export type Doc = Record<string, any> & { _id?: string };

/** The codes the apps understand (OpsErrorCode in ../types.ts, minus "network", which the browser makes up). */
export type ApiErrorCode =
  | "signed-out"
  | "pending"
  | "forbidden"
  | "not-configured"
  | "bad-request"
  | "busy"
  | "conflict"
  | "wix-unavailable"
  | "server-error";

/** An error with a code and a message that is safe to show to the person using the app. */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const apiError = (code: ApiErrorCode, message: string) => new ApiError(code, message);

/** Wix CMS collections. Missing `_id`s are made up on insert. */
export interface OpsData {
  /** Items whose fields equal the filter's (up to `limit`, default 1000). */
  query(collection: string, filter?: Record<string, unknown>, limit?: number, sort?: { field: string; descending?: boolean }): Promise<Doc[]>;
  /** Items with these `_id`s, in one request. */
  queryIds(collection: string, ids: string[]): Promise<Doc[]>;
  insert(collection: string, doc: Doc): Promise<Doc>;
  insertMany(collection: string, docs: Doc[]): Promise<Doc[]>;
  /** Adds the item, or replaces the one with the same `_id`. */
  save(collection: string, doc: Doc): Promise<Doc>;
  saveMany(collection: string, docs: Doc[]): Promise<Doc[]>;
  remove(collection: string, id: string): Promise<void>;
  /** Adds `delta` to a number field in one step, so two requests can't take the same value. Null when the item doesn't exist. */
  increment(collection: string, id: string, field: string, delta: number): Promise<Doc | null>;
}

/** The site's member badges. The bulk calls take up to 100 at a time. */
export interface OpsBadges {
  list(): Promise<{ id: string; title: string }[]>;
  /** Which of `badgeIds` these members hold. */
  assignmentsOf(memberIds: string[], badgeIds: string[]): Promise<{ id: string; badgeId: string; memberId: string }[]>;
  assign(pairs: { badgeId: string; memberId: string }[]): Promise<void>;
  removeAssignments(assignmentIds: string[]): Promise<void>;
}

/** A Wix member, as much of it as the server reads. */
export interface WixMember {
  id: string;
  status?: string;
  contact?: { firstName?: string; lastName?: string };
  profile?: { nickname?: string; slug?: string };
}

export interface OpsEnv {
  data: OpsData;
  badges: OpsBadges;
  members: {
    /** Up to 100 members, starting at `offset`. */
    list(offset: number): Promise<WixMember[]>;
    /** Approves a pending member (a student who matched the roster). */
    approve(memberId: string): Promise<void>;
    /** Sets the member's profile picture (a Wix Media URL). */
    setPhoto(memberId: string, url: string): Promise<void>;
    /** Deletes the member from the site (Delete my account). */
    remove(memberId: string): Promise<void>;
  };
  /** The site's Media Manager. Profile pictures now; Inventory's photos later. */
  media: {
    /** Uploads an image into `folder` and returns its public URL. */
    uploadImage(image: { folder: string; fileName: string; mimeType: string; bytes: Uint8Array }): Promise<string>;
  };
  /** A secret from Wix's Secrets Manager (TBA_KEY, GITHUB_TOKEN, ...), or undefined when it isn't set. Costs one call. */
  secret(name: string): Promise<string | undefined>;
  /** For The Blue Alliance and GitHub. */
  fetch: typeof fetch;
  /** Remembers answers for a while (The Blue Alliance's, a day). Kept in memory by the running server, so it may be empty at any time. */
  cache: { get(key: string): string | undefined; put(key: string, value: string, seconds: number): void; remove(key: string): void };
  now(): Date;
  /** How many more calls this request may make. Infinity when nothing counts them (see budget.ts). */
  callsLeft(): number;
}

/** Makes `_id`s up for items that have none, so a bulk insert can refer to them straight away (an order's sections). */
export function withId(doc: Doc): Doc & { _id: string } {
  return { ...doc, _id: doc._id ?? crypto.randomUUID() };
}
