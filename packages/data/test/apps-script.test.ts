// Runs backend/apps-script/attendance-api/Code.gs in Node with fake Apps Script services (Sheet, properties,
// cache, UrlFetchApp standing in for Wix) to check the permission rules and the Sheet row format.
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { beforeEach, describe, expect, it } from "vitest";

const CODE = readFileSync(
  fileURLToPath(new URL("../../../backend/apps-script/attendance-api/Code.gs", import.meta.url)),
  "utf8",
);
const CLIENT_ID = "38a0b75d-6959-4630-ac13-73004c094181";
const BADGES = { tm: "badge-team-member", aa: "badge-attendance-admin" };

interface Member {
  id: string;
  status: string;
  badges: string[];
  clientId?: string;
}

function makeScript(members: Record<string, Member>) {
  const data: unknown[][] = [["Timestamp", "Student ID"]];
  const lookup: unknown[][] = [
    ["Student ID", "First", "Last", "Subteam"],
    ["0001000001", "Ada", "Lovelace", ""],
    ["0001000002", "Grace", "Hopper", ""],
  ];
  const props = new Map<string, string>([["SHEET_ID", "sheet-123"]]);
  const cache = new Map<string, string>();
  const fetches: string[] = [];

  const sheet = (rows: unknown[][]) => ({
    getDataRange: () => ({ getValues: () => rows.map((r) => [...r]) }),
    appendRow: (row: unknown[]) => rows.push(row),
    getLastRow: () => rows.length,
  });
  const res = (code: number, body: unknown) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });

  const UrlFetchApp = {
    fetch(url: string, opts: { headers?: Record<string, string>; payload?: string }) {
      fetches.push(url.replace("https://www.wixapis.com", ""));
      const auth = opts.headers?.Authorization;
      const payload = opts.payload ? JSON.parse(opts.payload) : {};
      if (url.endsWith("/oauth2/token")) {
        return payload.clientId === CLIENT_ID ? res(200, { access_token: "visitor-token", expires_in: 14400 }) : res(400, {});
      }
      if (url.endsWith("/oauth2/token-info")) {
        const m = members[payload.token];
        if (!m) return res(200, { active: false });
        return res(200, { active: true, subjectType: "MEMBER", subjectId: m.id, clientId: m.clientId ?? CLIENT_ID });
      }
      if (url.includes("/members/v1/members/my")) {
        const m = auth ? members[auth] : undefined;
        return m ? res(200, { member: { id: m.id, status: m.status, contact: { firstName: "Pat", lastName: m.id } } }) : res(403, {});
      }
      if (url.endsWith("/badges/v4/badges/query")) {
        expect(auth).toBe("visitor-token");
        return res(200, { badges: [{ id: BADGES.tm, title: "Team Member" }, { id: BADGES.aa, title: "Attendance Admin" }] });
      }
      if (url.endsWith("/badges/v4/assignments/query")) {
        expect(auth).toBe("visitor-token");
        const memberId = payload.query.filter.memberId;
        const m = Object.values(members).find((x) => x.id === memberId);
        return res(200, { badgeAssignments: (m?.badges ?? []).map((badgeId) => ({ badgeId, memberId })) });
      }
      throw new Error("unexpected fetch " + url);
    },
  };

  const context = vm.createContext({
    console: { log() {}, error() {} },
    SpreadsheetApp: {
      openById: (id: string) => {
        expect(id).toBe("sheet-123");
        return { getName: () => "Attendance", getSheetByName: (n: string) => (n === "Data" ? sheet(data) : n === "MemberLookup" ? sheet(lookup) : null) };
      },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => props.get(k) ?? null,
        setProperty: (k: string, v: string) => props.set(k, v),
        deleteProperty: (k: string) => props.delete(k),
        getProperties: () => Object.fromEntries(props),
      }),
    },
    CacheService: {
      getScriptCache: () => ({ get: (k: string) => cache.get(k) ?? null, put: (k: string, v: string) => cache.set(k, v) }),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    UrlFetchApp,
    Utilities: {
      getUuid: () => randomUUID(),
      DigestAlgorithm: { SHA_256: "sha256" },
      Charset: { UTF_8: "utf8" },
      computeDigest: (_a: string, text: string) => [...createHash("sha256").update(text, "utf8").digest()].map((b) => (b > 127 ? b - 256 : b)),
      formatDate: (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    },
    Session: { getScriptTimeZone: () => "America/Los_Angeles" },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (s: string) => ({ setMimeType: () => ({ s }) }) },
  });
  vm.runInContext(CODE, context);

  const post = (body: unknown) =>
    JSON.parse((context.doPost({ postData: { contents: JSON.stringify(body) } }) as { s: string }).s);

  return { post, data, lookup, props, fetches };
}

describe("attendance-api Code.gs", () => {
  let s: ReturnType<typeof makeScript>;
  beforeEach(() => {
    s = makeScript({
      "tok-admin-0123456789abcdef": { id: "m-admin", status: "APPROVED", badges: [BADGES.aa] },
      "tok-member-0123456789abcdef": { id: "m-member", status: "APPROVED", badges: [BADGES.tm] },
      "tok-nobadge-0123456789abcdef": { id: "m-new", status: "APPROVED", badges: [] },
      "tok-pending-0123456789abcdef": { id: "m-pending", status: "PENDING", badges: [BADGES.tm] },
      "tok-othersite-0123456789abcdef": { id: "m-other", status: "APPROVED", badges: [BADGES.aa], clientId: "someone-elses-client" },
    });
  });

  it("refuses requests without a valid member token", () => {
    expect(s.post({ action: "today" })).toMatchObject({ ok: false, error: "signed-out" });
    expect(s.post({ action: "today", token: "not-a-real-token-at-all" })).toMatchObject({ ok: false, error: "signed-out" });
    expect(s.post({ action: "openKiosk", token: "tok-othersite-0123456789abcdef" })).toMatchObject({ ok: false, error: "signed-out" });
    expect(s.post({ action: "today", token: "tok-pending-0123456789abcdef" })).toMatchObject({ ok: false, error: "pending" });
    expect(s.post({ action: "today", token: "tok-nobadge-0123456789abcdef" })).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("only lets Attendance Admins open the kiosk", () => {
    expect(s.post({ action: "openKiosk", token: "tok-member-0123456789abcdef" })).toMatchObject({ ok: false, error: "forbidden" });
    const opened = s.post({ action: "openKiosk", token: "tok-admin-0123456789abcdef" });
    expect(opened.ok).toBe(true);
    expect(opened.kioskToken).toMatch(/^[0-9a-f]{64}$/);
    // Only a hash of the kiosk token is stored.
    expect([...s.props.keys()].some((k) => k.includes(opened.kioskToken))).toBe(false);
    expect(s.post({ action: "status", token: "tok-member-0123456789abcdef" })).toMatchObject({ ok: true, kioskOpen: true, isAdmin: false });
  });

  it("signs in only through an open kiosk, once per day, with the old row format", () => {
    expect(s.post({ action: "signIn", studentId: "0001000001" })).toMatchObject({ ok: false, error: "kiosk-closed" });
    expect(s.post({ action: "signIn", kioskToken: "x".repeat(64), studentId: "0001000001" })).toMatchObject({
      ok: false,
      error: "kiosk-closed",
    });
    const { kioskToken } = s.post({ action: "openKiosk", token: "tok-admin-0123456789abcdef" });

    const first = s.post({ action: "signIn", kioskToken, studentId: "0001000001" });
    expect(first.result).toMatchObject({ status: "signed-in", name: "Ada Lovelace", message: "Welcome, Ada Lovelace!" });
    expect(s.data).toHaveLength(2);
    expect(s.data[1]).toHaveLength(2);
    expect(s.data[1][0]).toBe(new Date(Date.parse(String(s.data[1][0]))).toLocaleString());
    expect(s.data[1][1]).toBe("0001000001");

    const again = s.post({ action: "signIn", kioskToken, studentId: "0001000001" });
    expect(again.result.status).toBe("duplicate");
    expect(again.result.message).toMatch(/^Ada Lovelace, you already signed in today at /);
    expect(s.data).toHaveLength(2);

    expect(s.post({ action: "signIn", kioskToken, studentId: "12345" }).result.status).toBe("invalid");
    expect(s.post({ action: "signIn", kioskToken, studentId: "0009999999" }).result.status).toBe("needs-registration");

    s.post({ action: "closeKiosk", kioskToken });
    expect(s.post({ action: "signIn", kioskToken, studentId: "0001000002" })).toMatchObject({ ok: false, error: "kiosk-closed" });
    expect(s.post({ action: "status", token: "tok-member-0123456789abcdef" }).kioskOpen).toBe(false);
  });

  it("registers unknown IDs like the old app", () => {
    const { kioskToken } = s.post({ action: "openKiosk", token: "tok-admin-0123456789abcdef" });
    expect(s.post({ action: "register", kioskToken, studentId: "0009999999", firstName: " ", lastName: "X" }).result.status).toBe("invalid");
    const r = s.post({ action: "register", kioskToken, studentId: "0009999999", firstName: " Sam ", lastName: "Lee" });
    expect(r.result).toMatchObject({ status: "signed-in", name: "Sam Lee" });
    expect(s.lookup.at(-1)).toEqual(["0009999999", "Sam", "Lee", ""]);
    expect(s.data.at(-1)?.[1]).toBe("0009999999");
    expect(s.post({ action: "register", kioskToken, studentId: "0009999999", firstName: "A", lastName: "B" }).result.message).toBe(
      "Student ID already exists in system",
    );
  });

  it("shows members names and times, never student IDs", () => {
    const { kioskToken } = s.post({ action: "openKiosk", token: "tok-admin-0123456789abcdef" });
    s.post({ action: "signIn", kioskToken, studentId: "0001000002" });
    const today = s.post({ action: "today", token: "tok-member-0123456789abcdef" });
    expect(today.entries).toHaveLength(1);
    expect(Object.keys(today.entries[0]).sort()).toEqual(["at", "name", "time"]);
    expect(JSON.stringify(today)).not.toContain("0001000002");

    const days = s.post({ action: "history", token: "tok-member-0123456789abcdef" });
    expect(days.days).toHaveLength(1);
    const day = s.post({ action: "history", token: "tok-member-0123456789abcdef", date: days.days[0].date });
    expect(day.entries[0].name).toBe("Grace Hopper");

    const mine = s.post({ action: "lookup", token: "tok-member-0123456789abcdef", studentId: "0001000002" });
    expect(mine).toMatchObject({ ok: true, signedInToday: true });
    expect(JSON.stringify(mine)).not.toContain("Grace");
  });

  it("caches the Wix check per token", () => {
    s.post({ action: "today", token: "tok-member-0123456789abcdef" });
    const n = s.fetches.length;
    s.post({ action: "today", token: "tok-member-0123456789abcdef" });
    expect(s.fetches.length).toBe(n);
  });

  it("rejects bad JSON and unknown actions", () => {
    expect(s.post({ action: "nope" })).toMatchObject({ ok: false, error: "bad-request" });
  });
});
