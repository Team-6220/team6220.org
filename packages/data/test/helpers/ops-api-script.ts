// Runs backend/apps-script/ops-api/*.gs in Node with fake Apps Script services (properties, cache, lock and
// UrlFetchApp standing in for Wix). Used by ops-api.test.ts and bom-rules.test.ts.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

// Apps Script loads every file into one global scope, in this order.
const FILES = ["Code.gs", "Auth.gs", "WixData.gs", "Shared.gs", "Bom.gs", "Icarus.gs"].map((name) =>
  readFileSync(fileURLToPath(new URL(`../../../../backend/apps-script/ops-api/${name}`, import.meta.url)), "utf8"),
);
const CLIENT_ID = "38a0b75d-6959-4630-ac13-73004c094181";
export const API_KEY = "server-wix-api-key";
export const APOLLO_KEY = "apollo-key-0123456789abcdef0123456789abcdef";
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

const BADGE_TITLES: Record<string, string> = {
  "b-team": "Team Member",
  "b-mentor": "Mentor",
  "b-booster": "Booster",
  "b-supervisor": "Supervisor",
  "b-lead": "Lead",
  "b-design": "Subteam: Design",
  "b-programming": "Subteam: Programming",
  "b-webadmin": "Web Admin",
};

export interface Member {
  id: string;
  status: string;
  badges: string[]; // badge IDs
}
type Row = Record<string, unknown> & { _id: string };

export function makeScript(members: Record<string, Member>) {
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
      if (path.startsWith("/wix-data/v2/items/") && opts.method === "delete") {
        const [id, query] = path.slice("/wix-data/v2/items/".length).split("?dataCollectionId=");
        const list = rows(decodeURIComponent(query));
        list.splice(list.findIndex((r) => r._id === decodeURIComponent(id)), 1);
        return res(200, {});
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

