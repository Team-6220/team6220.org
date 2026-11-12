import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAttendanceClient } from "../src/attendance/client";
import { httpTransport } from "../src/attendance/http";
import { mockTransport } from "../src/attendance/mock";
import { AttendanceError } from "../src/attendance/types";

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

function clientAs(token: string | null) {
  const transport = mockTransport({ now: () => new Date(2026, 10, 9, 18, 0).getTime() });
  return createAttendanceClient({ transport: () => transport, getToken: async () => token, kioskStorage: memoryStorage() });
}

describe("attendance client with the mock", () => {
  // The mock runs on a fixed clock (2026-11-09 18:00) and the client checks kiosk expiry against Date.now(),
  // so pin the real clock to the same moment or the kiosk looks expired once that day has passed.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 9, 18, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs the kiosk flow for an Attendance Admin", async () => {
    const a = clientAs("mock:admin");
    expect(a.currentKiosk()).toBeNull();
    await expect(a.signIn("0001000001")).rejects.toMatchObject({ code: "kiosk-closed" });

    const k = await a.openKiosk();
    expect(a.currentKiosk()).toEqual(k);
    expect(await a.signIn("0001000001")).toMatchObject({ status: "signed-in", name: "Ada Lovelace" });
    expect(await a.signIn("0001000001")).toMatchObject({ status: "duplicate" });
    expect(await a.signIn("123")).toMatchObject({ status: "invalid" });
    expect(await a.signIn("0005550000")).toMatchObject({ status: "needs-registration" });
    expect(await a.register("0005550000", "New", "Person")).toMatchObject({ status: "signed-in", name: "New Person" });

    await a.closeKiosk();
    expect(a.currentKiosk()).toBeNull();
    await expect(a.signIn("0001000003")).rejects.toBeInstanceOf(AttendanceError);
  });

  it("lets members view but not open the kiosk", async () => {
    const m = clientAs("mock:member");
    await expect(m.openKiosk()).rejects.toMatchObject({ code: "forbidden" });
    const today = await m.today();
    expect(today.length).toBeGreaterThan(0);
    expect(JSON.stringify(today)).not.toMatch(/\d{10}/);
    const days = await m.historyDays();
    expect(days[0].date).toBe("2026-11-09");
    expect((await m.historyFor(days[1].date)).length).toBe(days[1].count);
    expect(await m.lookup("0001000002")).toMatchObject({ signedInToday: true });
    expect(await m.lookup("0001000006")).toMatchObject({ signedInToday: false, signIns: [] });
  });

  it("refuses signed-out and pending viewers", async () => {
    await expect(clientAs(null).today()).rejects.toMatchObject({ code: "signed-out" });
    await expect(clientAs("mock:pending").today()).rejects.toMatchObject({ code: "pending" });
  });

  it("reports a missing server", async () => {
    const c = createAttendanceClient({ transport: () => null, getToken: async () => "t" });
    await expect(c.today()).rejects.toMatchObject({ code: "not-configured" });
  });
});

describe("httpTransport", () => {
  it("sends a simple text/plain POST with the JSON body and no cookies", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true, entries: [] })));
    const send = httpTransport("https://script.google.com/macros/s/abc/exec", fetchImpl as unknown as typeof fetch);
    expect(await send({ action: "today", token: "t" })).toEqual({ ok: true, entries: [] });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://script.google.com/macros/s/abc/exec");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "text/plain;charset=utf-8" });
    expect(init.credentials).toBe("omit");
    expect(JSON.parse(String(init.body))).toEqual({ action: "today", token: "t" });
  });

  it("turns server errors into AttendanceError", async () => {
    const send = httpTransport("u", (async () => new Response(JSON.stringify({ ok: false, error: "forbidden", message: "No" }))) as typeof fetch);
    const c = createAttendanceClient({ transport: () => send, getToken: async () => "t" });
    await expect(c.today()).rejects.toMatchObject({ code: "forbidden", message: "No" });
    const html = httpTransport("u", (async () => new Response("<html>")) as typeof fetch);
    await expect(html({ action: "today" })).rejects.toMatchObject({ code: "server-error" });
    const down = httpTransport("u", (async () => {
      throw new TypeError("offline");
    }) as typeof fetch);
    await expect(down({ action: "today" })).rejects.toMatchObject({ code: "network" });
  });
});
