// Member login for every app. Apps call these functions and never see Wix tokens or the Wix SDK.
//
// Phase 1 (GitHub Pages, no server): the browser runs the Wix "login page" OAuth flow with PKCE.
//   login()  -> generateOAuthData + getAuthUrl -> Wix-hosted login page (Sign in with Google)
//   Wix      -> redirects back with #code=...&state=...  -> handleLoginCallback() exchanges it for
//               member tokens (getMemberTokens) and stores them in localStorage.
//   Docs: https://dev.wix.com/docs/go-headless/authentication/members/wix-login-page/add-a-wix-login-page-js-sdk
//
// Phase 2 (@wix/astro): the integration owns /api/auth/login and /api/auth/logout and keeps the session
// in a cookie. Only the bodies below change (login() links to /api/auth/login?returnToUrl=..., logout()
// POSTs /api/auth/logout, getMember()/getBadges() call /api/me or the SDK with the integration's auth).
//   Docs: https://dev.wix.com/docs/go-headless/authentication/members/wix-login-page/add-member-login-with-the-astro-integration
//
// Badge checks here are COSMETIC (they hide buttons). Real enforcement is Wix CMS collection permissions
// in Phase 1 and badge checks inside /api endpoints in Phase 2.
import { APPS_HOME_PATH, BADGES, LOGIN_REDIRECT_PATH, type BadgeName } from "./config";
import { clearStoredTokens, wix } from "./wix";

const OAUTH_DATA_KEY = "team6220.wix.oauthData";

export type MemberStatus = "APPROVED" | "PENDING" | "BLOCKED" | "OFFLINE" | "UNKNOWN";

export interface Member {
  id: string;
  /** Best display name: first + last name, else nickname, else login email. */
  name: string;
  email?: string;
  photoUrl?: string;
  /** Wix site access status. "PENDING" means a Web Admin hasn't approved the signup yet. */
  status: MemberStatus;
}

/** True when this browser holds member (not visitor) tokens. Doesn't call Wix. */
export function isLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  return wix().auth.loggedIn();
}

/**
 * Sends the browser to the Wix login page. After signing in, the member comes back to `returnTo`
 * (a path on this site, default: the current page).
 */
export async function login(returnTo?: string): Promise<never> {
  const client = wix();
  const origin = window.location.origin;
  const back = safeLocalPath(returnTo ?? window.location.pathname + window.location.search);
  const data = client.auth.generateOAuthData(origin + LOGIN_REDIRECT_PATH, origin + back);
  try {
    window.sessionStorage.setItem(OAUTH_DATA_KEY, JSON.stringify(data));
  } catch {
    throw new Error("Sign-in needs browser storage. Turn off private browsing or allow site data.");
  }
  const { authUrl } = await client.auth.getAuthUrl(data);
  window.location.assign(authUrl);
  return new Promise<never>(() => {}); // the page is navigating away
}

/**
 * Finishes a login on the callback page. Returns the path to send the member to next.
 * Throws an Error with a readable message if Wix reported a problem.
 */
export async function handleLoginCallback(): Promise<string> {
  const client = wix();
  const returned = client.auth.parseFromUrl();
  let stored: ReturnType<typeof client.auth.generateOAuthData> | null = null;
  try {
    const raw = window.sessionStorage.getItem(OAUTH_DATA_KEY);
    stored = raw ? JSON.parse(raw) : null;
    window.sessionStorage.removeItem(OAUTH_DATA_KEY);
  } catch {
    // fall through to the error below
  }
  // Remove #code=... from the address bar so it isn't bookmarked or shared.
  window.history.replaceState(null, "", window.location.pathname);

  if (returned.error) {
    throw new Error(returned.errorDescription || returned.error);
  }
  if (!returned.code || !returned.state) {
    throw new Error("This page finishes signing in. Start from the Sign in button.");
  }
  if (!stored) {
    throw new Error("The sign-in started in another browser or tab. Please sign in again.");
  }
  const tokens = await client.auth.getMemberTokens(returned.code, returned.state, stored);
  client.auth.setTokens(tokens);
  clearMemberCache();

  const original = stored.originalUri ? new URL(stored.originalUri, window.location.origin) : null;
  return original && original.origin === window.location.origin
    ? safeLocalPath(original.pathname + original.search)
    : APPS_HOME_PATH;
}

/** Signs the member out of this site and Wix, then returns to `returnTo` (default: the dashboard). */
export async function logout(returnTo: string = APPS_HOME_PATH): Promise<never> {
  const client = wix();
  const back = window.location.origin + safeLocalPath(returnTo);
  let logoutUrl = back;
  try {
    if (client.auth.loggedIn()) ({ logoutUrl } = await client.auth.logout(back));
  } catch {
    // Wix couldn't create the logout session; local sign-out below still works.
  }
  clearStoredTokens();
  clearMemberCache();
  window.location.assign(logoutUrl);
  return new Promise<never>(() => {});
}

let memberPromise: Promise<Member | null> | undefined;
let badgesPromise: Promise<string[]> | undefined;

function clearMemberCache() {
  memberPromise = undefined;
  badgesPromise = undefined;
}

/** The signed-in member, or null when signed out. Cached for the page. */
export function getMember(): Promise<Member | null> {
  if (typeof window === "undefined" || !isLoggedIn()) return Promise.resolve(null);
  memberPromise ??= (async () => {
    const { members } = wix();
    const { member: m } = await members.getCurrentMember({ fieldsets: ["FULL"] });
    if (!m?._id) return null;
    const fullName = [m.contact?.firstName, m.contact?.lastName].filter(Boolean).join(" ").trim();
    return {
      id: m._id,
      name: fullName || m.profile?.nickname || m.loginEmail || "Team member",
      email: m.loginEmail ?? undefined,
      photoUrl: m.profile?.photo?.url ?? undefined,
      status: (m.status as MemberStatus) ?? "UNKNOWN",
    };
  })().catch((err) => {
    memberPromise = undefined;
    throw err;
  });
  return memberPromise;
}

/** Titles of the badges the signed-in member has (e.g. "Team Member"). Empty when signed out. */
export function getBadges(): Promise<string[]> {
  badgesPromise ??= (async () => {
    const member = await getMember();
    if (!member) return [];
    const { badgesV2, badgeAssignments } = wix();
    const [assigned, all] = await Promise.all([
      badgeAssignments.queryBadgeAssignments().eq("memberId", member.id).limit(100).find(),
      badgesV2.queryBadges().limit(100).find(),
    ]);
    const titles = new Map(all.items.map((b) => [b._id, b.title ?? ""]));
    return assigned.items.map((a) => titles.get(a.badgeId ?? "") ?? "").filter(Boolean);
  })().catch((err) => {
    badgesPromise = undefined;
    throw err;
  });
  return badgesPromise;
}

/** Cosmetic check for showing or hiding UI. Never rely on it for security. */
export async function hasBadge(name: BadgeName): Promise<boolean> {
  return (await getBadges()).includes(name);
}

/**
 * Whether a signed-in member may use team apps: approved by a Web Admin and given the Team Member badge.
 * Returns "approved", "pending" (signed in but not yet approved/badged) or "signed-out".
 */
export async function getAccess(): Promise<"approved" | "pending" | "signed-out"> {
  const member = await getMember();
  if (!member) return "signed-out";
  if (member.status !== "APPROVED") return "pending";
  return (await hasBadge(BADGES.teamMember)) ? "approved" : "pending";
}

/** Only allow same-site paths like "/apps/x?y" as return targets (no open redirects). */
function safeLocalPath(path: string): string {
  return path.startsWith("/") && !path.startsWith("//") ? path : APPS_HOME_PATH;
}
