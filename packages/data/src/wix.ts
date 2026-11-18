// The one Wix SDK client for the browser. Internal to @team6220/data: apps never import this.
//
// Sign-in is Wix's built-in login from the Astro integration (docs/PHASE-2.md): /api/auth/login signs the member in
// and keeps the session in the `wixSession` cookie, which the server reads on every request. This client reads and
// refreshes the same cookie, in the same format as Wix's own browser setup (@wix/astro's astro-auth), so the
// browser and the server share one sign-in. The SDK refreshes an expired access token by itself and writes the new
// tokens back; if that fails it falls back to visitor tokens, which makes `loggedIn()` false (sign in again).
import { createClient, EMPTY_TOKENS, OAuthStrategy, type Tokens, type TokenStorage } from "@wix/sdk";
import { badgeAssignments, badgesV2, members } from "@wix/members";
import { WIX_CLIENT_ID } from "./config";

const SESSION_COOKIE = "wixSession";

/** The tokens in the session cookie, when the cookie belongs to our login client. */
export function readSessionTokens(cookie: string = document.cookie): Tokens | null {
  const row = cookie.split("; ").find((r) => r.startsWith(SESSION_COOKIE + "="));
  if (!row) return null;
  try {
    const value = JSON.parse(decodeURIComponent(row.slice(SESSION_COOKIE.length + 1)));
    if (value?.clientId !== WIX_CLIENT_ID || !value.tokens?.accessToken || !value.tokens?.refreshToken) return null;
    return value.tokens as Tokens;
  } catch {
    return null;
  }
}

const cookieTokens: TokenStorage = {
  getTokens: () => readSessionTokens() ?? EMPTY_TOKENS,
  setTokens(tokens) {
    const value = encodeURIComponent(JSON.stringify({ clientId: WIX_CLIENT_ID, tokens }));
    document.cookie = `${SESSION_COOKIE}=${value}; path=/; secure`;
  },
};

function makeClient() {
  return createClient({
    modules: { members, badgesV2, badgeAssignments },
    auth: OAuthStrategy({ clientId: WIX_CLIENT_ID, tokenStorage: cookieTokens }),
  });
}

let client: ReturnType<typeof makeClient> | undefined;

/** The shared browser client. Throws if called during the static build (there is no window). */
export function wix() {
  if (typeof window === "undefined") {
    throw new Error("@team6220/data: browser Wix calls only run in the browser (use client:only).");
  }
  client ??= makeClient();
  return client;
}

// The member's name and picture, kept so page chrome (the sidebar, the main site's Log In button) can show
// who is signed in without calling Wix. Read by packages/assets/scripts/account.js. Cosmetic only.
const MEMBER_HINT_KEY = "team6220.member";

export function saveMemberHint(hint: { name: string; photoUrl?: string }) {
  try {
    window.localStorage.setItem(MEMBER_HINT_KEY, JSON.stringify(hint));
  } catch {
    // ignore
  }
}

/** Forgets what this browser shows about the member. The session cookie itself is ended by /api/auth/logout. */
export function clearMemberHint() {
  try {
    window.localStorage.removeItem(MEMBER_HINT_KEY);
    window.localStorage.removeItem("team6220.wix.tokens"); // left over from the Phase 1 login
  } catch {
    // ignore
  }
}

/**
 * The signed-in member's current Wix access token (refreshed first if it expired), or null when signed out.
 * Internal: only @team6220/data sends it, and only to our own backends (the attendance Apps Script), which
 * check it with Wix. Apps never see it.
 */
export async function memberAccessToken(): Promise<string | null> {
  const client = wix();
  if (!client.auth.loggedIn()) return null;
  const { headers } = await client.auth.getAuthHeaders();
  // If the refresh failed, the SDK fell back to visitor tokens: that is "signed out".
  if (!client.auth.loggedIn()) return null;
  return headers.Authorization || null;
}
