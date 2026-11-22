// Which apps the frame's rail, the top bar and the main site's Apps menu show a person (packages/assets/scripts/account.js:
// canOpen). Cosmetic: each app and the server check for themselves.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../packages/assets/scripts/account.js", import.meta.url), "utf8");

/** account.js as a browser runs it, for someone with these cookies and saved hint. */
function accountFor(opts: { signedIn: boolean; hint?: Record<string, unknown> | null }) {
  const win: Record<string, any> = {};
  const session = opts.signedIn ? `wixSession=${encodeURIComponent(JSON.stringify({ tokens: { refreshToken: { role: "member" } } }))}` : "";
  const storage = { getItem: (k: string) => (k === "team6220.member" && opts.hint ? JSON.stringify(opts.hint) : null) };
  new Function("window", "document", "localStorage", source)(win, { cookie: session }, storage);
  return win.team6220Account as { access(): { level: string; webAdmin: boolean }; canOpen(app: Record<string, unknown>): boolean };
}

const teamApp = { access: "team", status: "live" };
const publicApp = { access: "public", status: "live" };
const calendar = { access: "team", status: "live", publicView: true };
const guestApp = { access: "team", status: "live", guests: true };
const planned = { access: "team", status: "planned" };
const admin = { access: "web-admin", status: "live" };

describe("which apps a person is shown", () => {
  it("shows a signed-out visitor only the public apps and the Calendar", () => {
    const who = accountFor({ signedIn: false });
    expect(who.access()).toEqual({ level: "visitor", webAdmin: false });
    expect([publicApp, calendar].every((a) => who.canOpen(a))).toBe(true);
    expect([teamApp, guestApp, planned, admin].some((a) => who.canOpen(a))).toBe(false);
  });

  it("treats someone waiting for approval (or an alumnus) like a visitor", () => {
    const who = accountFor({ signedIn: true, hint: { name: "Pat", access: "visitor" } });
    expect(who.canOpen(calendar)).toBe(true);
    expect(who.canOpen(teamApp)).toBe(false);
  });

  it("shows a guest the guest apps too", () => {
    const who = accountFor({ signedIn: true, hint: { name: "Pat", access: "guest" } });
    expect(who.canOpen(guestApp)).toBe(true);
    expect(who.canOpen(teamApp)).toBe(false);
  });

  it("shows a team member every app but the Web Admin ones", () => {
    const who = accountFor({ signedIn: true, hint: { name: "Pat", access: "member" } });
    expect([teamApp, publicApp, calendar, planned].every((a) => who.canOpen(a))).toBe(true);
    expect(who.canOpen(admin)).toBe(false);
  });

  it("shows a Web Admin the Web Admin apps", () => {
    expect(accountFor({ signedIn: true, hint: { name: "Pat", access: "member", webAdmin: true } }).canOpen(admin)).toBe(true);
  });

  it("shows someone signed in but not looked up yet the team apps, until the apps find out", () => {
    const who = accountFor({ signedIn: true, hint: { name: "Pat" } });
    expect(who.access().level).toBe("unknown");
    expect(who.canOpen(teamApp)).toBe(true);
    expect(who.canOpen(admin)).toBe(false);
  });

  it("is signed out when the session cookie is gone, whatever was saved", () => {
    expect(accountFor({ signedIn: false, hint: { name: "Pat", access: "member" } }).canOpen(teamApp)).toBe(false);
  });
});
