// The one Wix SDK client for the browser (Phase 1). Internal to @team6220/data: apps never import this.
//
// Tokens live in localStorage so a member stays signed in across tabs and reloads. The SDK refreshes an
// expired access token with the refresh token by itself and writes the new tokens back through
// `tokenStorage`. If the refresh fails, it silently falls back to anonymous visitor tokens, which makes
// `loggedIn()` false (the member just signs in again).
//
// Phase 2 (@wix/astro): the integration keeps the session in a cookie and creates the client for us,
// so this file goes away and the functions in auth.ts call the integration instead.
import { createClient, EMPTY_TOKENS, OAuthStrategy, type Tokens, type TokenStorage } from "@wix/sdk";
import { badgeAssignments, badgesV2, members } from "@wix/members";
import { WIX_CLIENT_ID } from "./config";

const TOKENS_KEY = "team6220.wix.tokens";

function readTokens(): Tokens {
  try {
    const raw = window.localStorage.getItem(TOKENS_KEY);
    return raw ? (JSON.parse(raw) as Tokens) : EMPTY_TOKENS;
  } catch {
    return EMPTY_TOKENS;
  }
}

const localStorageTokens: TokenStorage = {
  getTokens: readTokens,
  setTokens(tokens) {
    try {
      window.localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
    } catch {
      // Storage blocked (private mode etc.): the session only lasts for this page.
    }
  },
};

function makeClient() {
  return createClient({
    modules: { members, badgesV2, badgeAssignments },
    auth: OAuthStrategy({ clientId: WIX_CLIENT_ID, tokenStorage: localStorageTokens }),
  });
}

let client: ReturnType<typeof makeClient> | undefined;

/** The shared browser client. Throws if called during the static build (there is no window). */
export function wix() {
  if (typeof window === "undefined") {
    throw new Error("@team6220/data: Wix calls only run in the browser in Phase 1 (use client:only).");
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

export function clearStoredTokens() {
  try {
    window.localStorage.removeItem(TOKENS_KEY);
    window.localStorage.removeItem(MEMBER_HINT_KEY);
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
