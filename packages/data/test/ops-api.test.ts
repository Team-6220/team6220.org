// Runs backend/apps-script/ops-api/*.gs in Node with fake Apps Script services (properties, cache, lock and
// UrlFetchApp standing in for Wix) to check the permission rules, numbering and subteam badges.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { beforeEach, describe, expect, it } from "vitest";

// Apps Script loads every file into one global scope, in this order.
const FILES = ["Code.gs", "Auth.gs", "WixData.gs", "Shared.gs"].map((name) =>
  readFileSync(fileURLToPath(new URL(`../../../backend/apps-script/ops-api/${name}`, import.meta.url)), "utf8"),
);
const CLIENT_ID = "38a0b75d-6959-4630-ac13-73004c094181";
const API_KEY = "server-wix-api-key";
const APOLLO_KEY = "apollo-key-0123456789abcdef0123456789abcdef";
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

const BADGE_TITLES: Record<string, string> = {
  "b-team": "Team Member",
  "b-mentor": "Mentor",
  "b-booster": "Booster",
  "b-supervisor": "Supervisor",
  "b-lead": "Lead",
  "b-design": "Subteam: Design",
  "b-programming": "Subteam: Programming",
};

interface Member {
  id: string;
  status: string;
  badges: string[]; // badge IDs
}
type Row = Record<string, unknown> & { _id: string };

function makeScript(members: Record<string, Member>) {
  const props = new Map<string, string>([
    ["WIX_API_KEY", API_KEY],
    ["WIX_SITE_ID", "site-1"],
    ["APOLLO_KEY_SHA256", sha(APOLLO_KEY)],
  ]);
  const cache = new Map<string, string>();
  const collections = new Map<string, Row[]>();
  const rows = (name: string) => collections.get(name) ?? collections.set(name, []).get(name)!;
  let nextId = 1;
  const res = (code: number, body: unknown) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
  const byId = (memberId: string) => Object.values(members).find((m) => m.id === memberId);

  const UrlFetchApp = {
    fetch(url: string, opts: { method?: string; headers?: Record<string, string>; payload?: string }) {
      const path = url.replace("https://www.wixapis.com", "");
      const auth = opts.headers?.Authorization;
      const payload = opts.payload ? JSON.parse(opts.payload) : {};
      // ----- checking who a member is (no secret needed) -----
      if (path === "/oauth2/token") return res(200, { access_token: "visitor-token", expires_in: 14400 });
      if (path === "/oauth2/token-info") {
        const m = members[payload.token];
        return res(200, m ? { active: true, subjectType: "MEMBER", clientId: CLIENT_ID } : { active: false });
      }
      if (path.startsWith("/members/v1/members/my")) {
        const m = auth ? members[auth] : undefined;
        return m ? res(200, { member: { id: m.id, status: m.status, contact: { firstName: "Pat", lastName: m.id } } }) : res(403, {});
      }
      if (path === "/badges/v4/badges/query") {
        return res(200, { badges: Object.entries(BADGE_TITLES).map(([id, title]) => ({ id, title })) });
      }
      if (path === "/badges/v4/assignments/query") {
        const m = byId(payload.query.filter.memberId);
        return res(200, {
          badgeAssignments: (m?.badges ?? []).map((badgeId) => ({ id: `${m!.id}:${badgeId}`, badgeId, memberId: m!.id })),
        });
      }
      // ----- everything below needs the server's API key -----
      if (auth !== API_KEY || opts.headers?.["wix-site-id"] !== "site-1") return res(403, {});
      if (path === "/badges/v4/assignments" && opts.method === "post") {
        byId(payload.badgeAssignment.memberId)!.badges.push(payload.badgeAssignment.badgeId);
        return res(200, {});
      }
      if (path.startsWith("/badges/v4/assignments/") && opts.method === "delete") {
        const [memberId, badgeId] = decodeURIComponent(path.split("/").pop()!).split(":");
        const m = byId(memberId)!;
        m.badges = m.badges.filter((b) => b !== badgeId);
        return res(200, {});
      }
      if (path === "/wix-data/v2/items/query") {
        const filter = Object.entries(payload.query.filter as Record<string, unknown>);
        const found = rows(payload.dataCollectionId).filter((r) => filter.every(([k, v]) => r[k] === v));
        return res(200, { dataItems: found.map((r) => ({ id: r._id, data: r })) });
      }
      if (path === "/wix-data/v2/items" || path === "/wix-data/v2/items/save") {
        const list = rows(payload.dataCollectionId);
        const row = { ...payload.dataItem.data, _id: payload.dataItem.id ?? `id-${nextId++}` } as Row;
        const at = list.findIndex((r) => r._id === row._id);
        if (at === -1) list.push(row);
        else list[at] = row;
        return res(200, { dataItem: { id: row._id, data: row } });
      }
      throw new Error("unexpected fetch " + opts.method + " " + path);
    },
  };

  const context = vm.createContext({
    console: { log() {}, error() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props.get(k) ?? null }) },
    CacheService: {
      getScriptCache: () => ({
        get: (k: string) => cache.get(k) ?? null,
        put: (k: string, v: string) => cache.set(k, v),
        remove: (k: string) => cache.delete(k),
      }),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    UrlFetchApp,
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" },
      Charset: { UTF_8: "utf8" },
      computeDigest: (_a: string, text: string) => [...createHash("sha256").update(text, "utf8").digest()].map((b) => (b > 127 ? b - 256 : b)),
    },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (s: string) => ({ setMimeType: () => ({ s }) }) },
  });
  for (const code of FILES) vm.runInContext(code, context);

  const post = (body: unknown) =>
    JSON.parse((context.doPost({ postData: { contents: JSON.stringify(body) } }) as { s: string }).s);
  return { post, rows, props, members };
}

const TOKENS = {
  member: "tok-member-0123456789abcdef",
  lead: "tok-lead-0123456789abcdef",
  mentor: "tok-mentor-0123456789abcdef",
  supervisor: "tok-supervisor-0123456789abcdef",
  nobadge: "tok-nobadge-0123456789abcdef",
  pending: "tok-pending-0123456789abcdef",
};

describe("ops-api", () => {
  let s: ReturnType<typeof makeScript>;
  beforeEach(() => {
    s = makeScript({
      [TOKENS.member]: { id: "m-member", status: "APPROVED", badges: ["b-team", "b-programming"] },
      [TOKENS.lead]: { id: "m-lead", status: "APPROVED", badges: ["b-team", "b-lead"] },
      [TOKENS.mentor]: { id: "m-mentor", status: "APPROVED", badges: ["b-mentor"] },
      [TOKENS.supervisor]: { id: "m-supervisor", status: "APPROVED", badges: ["b-supervisor"] },
      [TOKENS.nobadge]: { id: "m-new", status: "APPROVED", badges: [] },
      [TOKENS.pending]: { id: "m-pending", status: "PENDING", badges: ["b-team"] },
    });
  });

  it("refuses requests without a valid sign-in, and unknown actions", () => {
    expect(s.post({ action: "whoAmI" })).toMatchObject({ ok: false, error: "signed-out" });
    expect(s.post({ action: "whoAmI", token: "not-a-real-token-at-all" })).toMatchObject({ ok: false, error: "signed-out" });
    expect(s.post({ action: "constructor", token: TOKENS.lead })).toMatchObject({ ok: false, error: "bad-request" });
  });

  it("refuses members who are not approved or have no badge", () => {
    expect(s.post({ action: "whoAmI", token: TOKENS.pending })).toMatchObject({ ok: false, error: "pending" });
    expect(s.post({ action: "whoAmI", token: TOKENS.nobadge })).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("tells a member who they are and remembers them for the pickers", () => {
    const answer = s.post({ action: "whoAmI", token: TOKENS.member });
    expect(answer).toMatchObject({
      ok: true,
      me: { id: "m-member", subteams: ["Programming"], roles: { viewer: true, team: true, lead: false, approver: false } },
      subteams: ["Design", "Programming"],
    });
    expect(s.rows("ops_people")).toMatchObject([{ memberId: "m-member", subteams: ["Programming"], active: true }]);
  });

  it("lets a supervisor view and nothing else", () => {
    expect(s.post({ action: "whoAmI", token: TOKENS.supervisor })).toMatchObject({ ok: true, me: { roles: { viewer: true, team: false } } });
    expect(s.post({ action: "nextNumber", token: TOKENS.supervisor, kind: "task" })).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("hands out numbers that never repeat, one counter per kind", () => {
    expect(s.post({ action: "nextNumber", token: TOKENS.member, kind: "task" })).toMatchObject({ number: 1 });
    expect(s.post({ action: "nextNumber", token: TOKENS.member, kind: "task" })).toMatchObject({ number: 2 });
    expect(s.post({ action: "nextNumber", token: TOKENS.member, kind: "part" })).toMatchObject({ number: 1 });
    expect(s.post({ action: "nextNumber", token: TOKENS.member, kind: "nonsense" })).toMatchObject({ ok: false, error: "bad-request" });
  });

  it("only lets leads save projects, and numbers and logs them", () => {
    const project = { name: "Summer Bot", subteams: ["Design", "Not a subteam"] };
    expect(s.post({ action: "saveProject", token: TOKENS.member, project })).toMatchObject({ ok: false, error: "forbidden" });
    const saved = s.post({ action: "saveProject", token: TOKENS.lead, project });
    expect(saved).toMatchObject({ ok: true, project: { number: 1, name: "Summer Bot", subteams: ["Design"], status: "active" } });
    const renamed = s.post({ action: "saveProject", token: TOKENS.lead, project: { _id: saved.project._id, name: "Summer Bot 2" } });
    expect(renamed.project).toMatchObject({ number: 1, name: "Summer Bot 2" });
    expect(s.rows("ops_projects")).toHaveLength(1);
    expect(s.rows("ops_history").map((h) => [h.actorId, h.action])).toEqual([["m-lead", "created"], ["m-lead", "updated"]]);
  });

  it("records history under the verified member, not a name sent in the request", () => {
    const record = { kind: "task", id: "task-1" };
    s.post({ action: "logHistory", token: TOKENS.member, record, change: "status", summary: "Done", actorId: "m-lead", actorName: "Someone Else" });
    expect(s.rows("ops_history")).toMatchObject([{ recordId: "task-1", actorId: "m-member", actorIsAgent: false, summary: "Done" }]);
  });

  it("lets a member pick their own subteams by changing only subteam badges", () => {
    const answer = s.post({ action: "setMySubteams", token: TOKENS.member, subteams: ["Design"] });
    expect(answer).toMatchObject({ ok: true, subteams: ["Design"] });
    expect(s.members[TOKENS.member].badges.sort()).toEqual(["b-design", "b-team"]);
    expect(s.post({ action: "whoAmI", token: TOKENS.member }).me.subteams).toEqual(["Design"]);
    expect(s.post({ action: "setMySubteams", token: TOKENS.member, subteams: ["Lead"] })).toMatchObject({ ok: false, error: "bad-request" });
    expect(s.members[TOKENS.member].badges).not.toContain("b-lead");
  });

  it("lets leads and mentors set other people's subteams, but not ordinary members", () => {
    s.post({ action: "whoAmI", token: TOKENS.member }); // the member has opened the apps once
    const args = { memberIds: ["m-member"], subteams: ["Design", "Programming"] };
    expect(s.post({ action: "setSubteams", token: TOKENS.member, ...args })).toMatchObject({ ok: false, error: "forbidden" });
    expect(s.post({ action: "setSubteams", token: TOKENS.mentor, ...args })).toMatchObject({ ok: true, changed: 1 });
    expect(s.members[TOKENS.member].badges.sort()).toEqual(["b-design", "b-programming", "b-team"]);
    expect(s.rows("ops_people")[0].subteams).toEqual(["Design", "Programming"]);
  });

  it("lets Apollo call only the actions opened to it, under the Apollo user", () => {
    expect(s.post({ action: "nextNumber", apiKey: APOLLO_KEY, kind: "task" })).toMatchObject({ ok: true, number: 1 });
    expect(s.post({ action: "saveProject", apiKey: APOLLO_KEY, project: { name: "x" } })).toMatchObject({ ok: false, error: "forbidden" });
    expect(s.post({ action: "setSubteams", apiKey: APOLLO_KEY, memberIds: ["m-member"], subteams: [] })).toMatchObject({ ok: false, error: "forbidden" });
    expect(s.post({ action: "nextNumber", apiKey: "wrong-key-0123456789abcdef0123456789abcdef", kind: "task" })).toMatchObject({ ok: false, error: "signed-out" });
  });

  it("says not-configured when the server's Wix key is missing", () => {
    s.props.delete("WIX_API_KEY");
    expect(s.post({ action: "nextNumber", token: TOKENS.member, kind: "task" })).toMatchObject({ ok: false, error: "not-configured" });
  });
});
