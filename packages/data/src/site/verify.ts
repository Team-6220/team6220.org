// Server-side check of a Wix member's access token and badges (the same steps as the attendance Apps Script,
// backend/apps-script/attendance-api/Code.gs):
//   1. POST /oauth2/token-info: the token must be active, belong to a MEMBER, and be issued to OUR headless client.
//   2. GET /members/v1/members/my with the token: the member's ID, name and approval status.
//   3. With a visitor token for OUR client, query our site's badges and that member's badge assignments.
// Nothing is cached: every request to /api/site is checked again.
import { BADGES, WIX_CLIENT_ID } from "../config";
import { SiteError } from "./types";

export interface Viewer {
  id: string;
  name: string;
  /** Approved by a Web Admin in Wix Site Members. */
  approved: boolean;
  /** Badge titles on our site. */
  badges: string[];
}

const WIX_API = "https://www.wixapis.com";

export type VerifyViewer = (authorization: string | null) => Promise<Viewer>;

export function createWixVerifier(options: { clientId?: string; fetch?: typeof fetch } = {}): VerifyViewer {
  const clientId = options.clientId ?? WIX_CLIENT_ID;
  const doFetch = options.fetch ?? ((...a) => fetch(...a));
  const signedOut = () => new SiteError("signed-out", "Your sign-in has expired. Sign in again.");
  const unavailable = () => new SiteError("wix-unavailable", "Couldn't reach Wix to check your sign-in. Try again.");

  async function call(url: string, init: RequestInit): Promise<Response> {
    try {
      return await doFetch(url, init);
    } catch {
      throw unavailable();
    }
  }

  return async (authorization) => {
    const token = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
    if (token.length < 20 || token.length > 8000) throw new SiteError("signed-out", "Sign in to use the Site Manager.");

    const infoRes = await call(`${WIX_API}/oauth2/token-info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (infoRes.status >= 500 || infoRes.status === 429) throw unavailable();
    const info: Record<string, unknown> = infoRes.status === 200 ? ((await infoRes.json().catch(() => ({}))) as Record<string, unknown>) : {};
    if (info.active !== true || (info.subjectType ?? info.subject_type) !== "MEMBER" || (info.clientId ?? info.client_id) !== clientId) {
      throw signedOut();
    }

    const meRes = await call(`${WIX_API}/members/v1/members/my?fieldSet=FULL`, { headers: { Authorization: token } });
    if ([400, 401, 403, 404].includes(meRes.status)) throw signedOut();
    if (!meRes.ok) throw unavailable();
    const member = ((await meRes.json().catch(() => ({}))) as { member?: Record<string, any> }).member;
    if (!member?.id) throw new SiteError("signed-out", "Sign in to use the Site Manager.");

    const visitor = await visitorToken(call, clientId);
    const siteQuery = async (path: string, payload: unknown) => {
      const res = await call(`${WIX_API}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: visitor },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw unavailable();
      return (await res.json()) as Record<string, any>;
    };
    const [badgeList, assignments] = await Promise.all([
      siteQuery("/badges/v4/badges/query", { query: { cursorPaging: { limit: 100 } } }),
      siteQuery("/badges/v4/assignments/query", { query: { filter: { memberId: member.id }, cursorPaging: { limit: 100 } } }),
    ]);
    const titles = new Map<string, string>((badgeList.badges ?? []).map((b: any) => [b.id, b.title ?? ""]));
    const badges = (assignments.badgeAssignments ?? [])
      .filter((a: any) => a.memberId === member.id && titles.has(a.badgeId))
      .map((a: any) => titles.get(a.badgeId)!);

    const contact = member.contact ?? {};
    const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
    return {
      id: member.id,
      name: fullName || member.profile?.nickname || "Web Admin",
      approved: member.status === "APPROVED",
      badges,
    };
  };
}

async function visitorToken(call: (url: string, init: RequestInit) => Promise<Response>, clientId: string): Promise<string> {
  const res = await call(`${WIX_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, grantType: "anonymous" }),
  });
  if (!res.ok) throw new SiteError("wix-unavailable", "Couldn't reach Wix. Try again.");
  const body = (await res.json()) as { access_token?: string; accessToken?: string };
  const token = body.access_token ?? body.accessToken;
  if (!token) throw new SiteError("wix-unavailable", "Couldn't reach Wix. Try again.");
  return token;
}

/** True only for an approved member holding the Web Admin badge. */
export function isWebAdmin(viewer: Viewer): boolean {
  return viewer.approved && viewer.badges.includes(BADGES.webAdmin);
}
