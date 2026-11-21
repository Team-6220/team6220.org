// The operations server (packages/data/src/ops/server) against an in-memory fake of Wix, GitHub and The Blue Alliance.
// Used by ops-api.test.ts, bom-rules.test.ts, icarus.test.ts, events.test.ts, github-sync.test.ts and apollo.test.ts.
//
// `post` behaves like the browser: it sends the request to /api/ops, and `token` chooses which member's session the
// request carries (the real server reads the session cookie instead). Every call the server makes to Wix, GitHub
// or The Blue Alliance is counted, and a request that makes more than the 17 Wix allows fails like it would live.
import { createHash } from "node:crypto";
import { handleGithubWebhook, handleOpsRequest, handleTimerRequest, type Doc, type OpsEnv } from "../../src/ops/server";
import { SiteError } from "../../src/site/types";
import type { Viewer } from "../../src/site/verify";

export const APOLLO_KEY = "apollo-key-0123456789abcdef0123456789abcdef";
export const TIMER_SECRET = "timer-secret-0123456789abcdef";
export const WEBHOOK_SECRET = "webhook-secret-0123456789";
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

const BADGE_TITLES: Record<string, string> = {
  "b-team": "Team Member",
  "b-mentor": "Mentor",
  "b-booster": "Booster",
  "b-supervisor": "Supervisor",
  "b-lead": "Lead",
  "b-guest": "Guest",
  "b-design": "Subteam: Design",
  "b-programming": "Subteam: Programming",
  "b-webadmin": "Web Admin",
};

export interface Member {
  id: string;
  status: string;
  badges: string[]; // badge IDs
}

/** Made-up events, in The Blue Alliance's "simple" shape. Tests can change them (for example a date) to see a refresh. */
export interface TbaEvent {
  key: string;
  name: string;
  event_code: string;
  city: string;
  state_prov: string;
  start_date: string;
  end_date: string;
  year: number;
}

export interface GithubIssue {
  number: number;
  title: string;
  body: string;
  state: string;
  state_reason: string | null;
  labels: { name: string }[];
  assignees: { login: string }[];
  html_url: string;
  updated_at: string;
  pull_request?: unknown;
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export function makeOps(members: Record<string, Member>) {
  /** The Wix secrets. Tests delete one to see "not configured". */
  const secrets = new Map<string, string>([
    ["APOLLO_KEY_SHA256", sha(APOLLO_KEY)],
    ["TBA_KEY", "tba-read-key"],
    ["GITHUB_TOKEN", "gh-token"],
    ["OPS_TIMER_SECRET", TIMER_SECRET],
    ["GITHUB_WEBHOOK_SECRET", WEBHOOK_SECRET],
  ]);
  const cache = new Map<string, string>();
  const tbaEvents: TbaEvent[] = [
    { key: "2027casd", name: "San Diego Regional", event_code: "casd", city: "Del Mar", state_prov: "CA", start_date: "2027-03-04", end_date: "2027-03-07", year: 2027 },
    { key: "2027cala", name: "Los Angeles Regional", event_code: "cala", city: "Los Angeles", state_prov: "CA", start_date: "2027-03-25", end_date: "2027-03-28", year: 2027 },
  ];
  const tbaCalls: string[] = [];
  /** The fake GitHub: issues per repository, and what the sync sent. Tests edit issues to act as someone on GitHub. */
  const github = {
    clock: 0,
    repos: {} as Record<string, GithubIssue[]>,
    patches: [] as Record<string, unknown>[],
    comments: [] as { repo: string; number: number; body: string }[],
    gets: [] as string[],
  };
  const collections = new Map<string, Doc[]>();
  const rows = (name: string) => collections.get(name) ?? collections.set(name, []).get(name)!;
  let nextId = 1;
  let clock: Date | undefined;
  /** Wix calls made by the latest request, by name. */
  const calls: string[] = [];
  const memberById = (id: string) => Object.values(members).find((m) => m.id === id);
  const keep = (doc: Doc) => structuredClone(doc);
  const store = (collection: string, doc: Doc): Doc => {
    const row = { ...keep(doc), _id: doc._id ?? `id-${nextId++}` };
    const list = rows(collection);
    const at = list.findIndex((r) => r._id === row._id);
    if (at === -1) list.push(row);
    else list[at] = row;
    return keep(row);
  };

  const fakeFetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    const headers = (init.headers ?? {}) as Record<string, string>;
    const method = (init.method ?? "GET").toUpperCase();
    // ----- GitHub (a tiny fake of the issues API) -----
    if (url.startsWith("https://api.github.com/")) {
      if (headers.Authorization !== "Bearer gh-token") return json(401, {});
      const [path, query = ""] = url.slice("https://api.github.com".length).split("?");
      const m = path.match(/^\/repos\/([^/]+\/[^/]+)\/issues(?:\/(\d+))?(\/comments)?$/);
      if (!m) return json(404, {});
      const issues = github.repos[m[1]] ?? (github.repos[m[1]] = []);
      const payload = init.body ? JSON.parse(String(init.body)) : {};
      const stamp = () => new Date(Date.parse("2027-01-10T00:00:00Z") + ++github.clock * 1000).toISOString();
      if (m[3]) {
        github.comments.push({ repo: m[1], number: Number(m[2]), body: payload.body });
        return json(201, {});
      }
      if (m[2] && method === "PATCH") {
        const issue = issues.find((i) => i.number === Number(m[2]))!;
        Object.assign(issue, {
          title: payload.title,
          body: payload.body,
          state: payload.state,
          state_reason: payload.state === "closed" ? payload.state_reason : null,
          assignees: payload.assignees.map((login: string) => ({ login })),
          updated_at: stamp(),
        });
        github.patches.push({ repo: m[1], number: issue.number, ...payload });
        return json(200, issue);
      }
      if (method === "POST") {
        const issue = {
          number: issues.length + 1,
          title: payload.title,
          body: payload.body,
          state: "open",
          state_reason: null,
          labels: [],
          assignees: (payload.assignees ?? []).map((login: string) => ({ login })),
          html_url: `https://github.com/${m[1]}/issues/${issues.length + 1}`,
          updated_at: stamp(),
        };
        issues.push(issue);
        return json(201, issue);
      }
      const params = new URLSearchParams(query);
      const since = params.get("since") ?? "";
      const page = Number(params.get("page")) || 1;
      github.gets.push(m[1]);
      const matching = issues.filter((i) => i.updated_at >= since).sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1));
      return json(200, matching.slice((page - 1) * 100, page * 100));
    }
    // ----- The Blue Alliance (made-up answers in its real shape) -----
    if (url.startsWith("https://www.thebluealliance.com/api/v3/")) {
      tbaCalls.push(url);
      if (headers["X-TBA-Auth-Key"] !== "tba-read-key") return json(401, {});
      const tbaPath = url.slice("https://www.thebluealliance.com/api/v3".length);
      const found = tbaEvents.find((e) => tbaPath === `/event/${e.key}/simple`);
      if (found) return json(200, found);
      if (tbaPath.startsWith("/team/frc6220/events/")) {
        const year = Number(tbaPath.split("/")[4]);
        return json(200, tbaEvents.filter((e) => e.year === year));
      }
      return json(404, { Errors: [{ event_key: "not found" }] });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  }) as typeof fetch;

  const env: OpsEnv = {
    data: {
      async query(collection, filter = {}, limit = 1000) {
        calls.push("query");
        return rows(collection).filter((r) => Object.entries(filter).every(([k, v]) => r[k] === v)).slice(0, limit).map(keep);
      },
      async queryIds(collection, ids) {
        calls.push("queryIds");
        return rows(collection).filter((r) => ids.includes(String(r._id))).map(keep);
      },
      async insert(collection, doc) {
        calls.push("insert");
        if (doc._id && rows(collection).some((r) => r._id === doc._id)) throw new Error("duplicate _id");
        return store(collection, doc);
      },
      async insertMany(collection, docs) {
        calls.push("insertMany");
        return docs.map((d) => store(collection, d));
      },
      async save(collection, doc) {
        calls.push("save");
        return store(collection, doc);
      },
      async saveMany(collection, docs) {
        calls.push("saveMany");
        return docs.map((d) => store(collection, d));
      },
      async remove(collection, id) {
        calls.push("remove");
        const list = rows(collection);
        const at = list.findIndex((r) => r._id === id);
        if (at !== -1) list.splice(at, 1);
      },
      async increment(collection, id, field, delta) {
        calls.push("increment");
        const row = rows(collection).find((r) => r._id === id);
        if (!row) return null;
        row[field] = Number(row[field] ?? 0) + delta;
        return keep(row);
      },
    },
    badges: {
      async list() {
        calls.push("badges.list");
        return Object.entries(BADGE_TITLES).map(([id, title]) => ({ id, title }));
      },
      async assignmentsOf(memberIds, badgeIds) {
        calls.push("badges.assignmentsOf");
        return memberIds.flatMap((memberId) =>
          (memberById(memberId)?.badges ?? []).filter((b) => badgeIds.includes(b)).map((badgeId) => ({ id: `${memberId}:${badgeId}`, badgeId, memberId })),
        );
      },
      async assign(pairs) {
        calls.push("badges.assign");
        for (const { badgeId, memberId } of pairs) memberById(memberId)!.badges.push(badgeId);
      },
      async removeAssignments(ids) {
        calls.push("badges.removeAssignments");
        for (const id of ids) {
          const [memberId, badgeId] = id.split(":");
          const m = memberById(memberId)!;
          m.badges = m.badges.filter((b) => b !== badgeId);
        }
      },
    },
    members: {
      async list(offset) {
        calls.push("members.list");
        const all = Object.values(members).map((m) => ({ id: m.id, status: m.status, contact: { firstName: "Pat", lastName: m.id }, profile: { slug: `pat-${m.id}` } }));
        return all.slice(offset, offset + 100);
      },
      async approve(memberId) {
        calls.push("members.approve");
        memberById(memberId)!.status = "APPROVED";
      },
    },
    async secret(name) {
      calls.push(`secret:${name}`);
      return secrets.get(name);
    },
    fetch: (async (...args: Parameters<typeof fetch>) => {
      calls.push("fetch");
      return fakeFetch(...args);
    }) as typeof fetch,
    cache: {
      get: (key) => cache.get(key),
      put: (key, value) => void cache.set(key, value),
      remove: (key) => void cache.delete(key),
    },
    now: () => clock ?? new Date(),
    callsLeft: () => Infinity,
  };

  /** Who is asking, as the session says: the member whose token the request carries. */
  const verifyFor = (token: unknown) => async (): Promise<Viewer> => {
    const m = typeof token === "string" ? members[token] : undefined;
    if (!m) throw new SiteError("signed-out", "Sign in to continue.");
    return {
      id: m.id,
      name: `Pat ${m.id}`,
      approved: m.status === "APPROVED",
      badges: m.badges.map((b) => BADGE_TITLES[b]).filter(Boolean),
      username: `pat-${m.id}`,
    };
  };

  /** Sends an action like the apps do. The answer is the JSON the server sent. */
  async function post(body: Record<string, unknown>, headers: Record<string, string> = {}) {
    calls.length = 0;
    const { token, ...rest } = body;
    const request = new Request("https://www.team6220.org/api/ops", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(rest) });
    const res = await handleOpsRequest(request, { verify: verifyFor(token), env });
    return (await res.json()) as any;
  }

  /** The timer calls a job, with the shared secret unless told otherwise. */
  async function job(name: string, secret: string | null = TIMER_SECRET) {
    calls.length = 0;
    const request = new Request("https://www.team6220.org/api/ops-timer", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(secret ? { "x-timer-secret": secret } : {}) },
      body: JSON.stringify({ job: name }),
    });
    const res = await handleTimerRequest(request, { env });
    return { status: res.status, body: (await res.json()) as any };
  }

  /** GitHub sends an event. The signature is right unless told otherwise. */
  async function webhook(event: string, payload: unknown, signature?: string) {
    calls.length = 0;
    const raw = JSON.stringify(payload);
    const { createHmac } = await import("node:crypto");
    const signed = signature ?? `sha256=${createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex")}`;
    const request = new Request("https://www.team6220.org/api/github-hook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-github-event": event, "x-hub-signature-256": signed },
      body: raw,
    });
    const res = await handleGithubWebhook(request, { env });
    return { status: res.status, body: (await res.json()) as any };
  }

  return {
    post,
    job,
    webhook,
    rows,
    secrets,
    members,
    tbaEvents,
    tbaCalls,
    github,
    /** The Wix calls the latest request made. */
    calls,
    /** Makes "now" a fixed time. */
    setNow: (date: Date) => void (clock = date),
  };
}
