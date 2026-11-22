// Adds a pull request's Wix preview to the headless app's allowed redirect list, so signing in works on the preview
// without anyone editing Headless Settings by hand. Run by .github/workflows/wix-preview.yml after the preview is made:
//   node scripts/wix-allow-preview.mjs https://abc123-losalteam6220.wixsite.com
// Needs WIX_API_KEY (with the "Manage OAuth Apps" permission) and WIX_CLIENT_ID in the environment.
//
// Wix lets an OAuth app hold 20 exact-match redirect URIs, and every push to a pull request makes a new preview address.
// So the newest previews are kept and the oldest dropped; the entries that are not previews (the live site, localhost)
// are never touched. This must never fail a pull request: any problem prints a warning and exits normally.
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Wix allows at most this many allowed redirect URIs on one app. */
export const MAX_URIS = 20;
/** How many previews to keep: enough for a few open pull requests, leaving room for the live entries. */
export const MAX_PREVIEWS = 12;

const PREVIEW_HOST = /\.(wixsite\.com|wix-site-host\.com)$/;

/** "https://abc-losalteam6220.wixsite.com/anything" -> "https://abc-losalteam6220.wixsite.com/api/auth/callback", or null. */
export function callbackFor(previewUrl) {
  try {
    const url = new URL(previewUrl);
    return url.protocol === "https:" && PREVIEW_HOST.test(url.hostname) ? `${url.origin}/api/auth/callback` : null;
  } catch {
    return null;
  }
}

const isPreviewCallback = (uri) => callbackFor(uri) === uri;

/** The list with this preview's callback added (newest last), old previews dropped, everything else kept. */
export function nextRedirectUris(current, callback) {
  const others = current.filter((uri) => !isPreviewCallback(uri));
  const previews = current.filter((uri) => isPreviewCallback(uri) && uri !== callback);
  const room = Math.max(0, Math.min(MAX_PREVIEWS, MAX_URIS - others.length) - 1);
  return [...others, ...previews.slice(previews.length - Math.min(previews.length, room)), callback];
}

const API = "https://www.wixapis.com/oauth-app/v1/oauth-apps";

async function main() {
  const callback = callbackFor(process.argv[2] ?? "");
  const clientId = process.env.WIX_CLIENT_ID;
  const key = (process.env.WIX_API_KEY ?? "").replace(/[^A-Za-z0-9._~+/=-]/g, "");
  if (!callback || !clientId || !key) {
    console.log("Not adding the preview to the redirect list: it needs a Wix preview address, WIX_CLIENT_ID and WIX_API_KEY.");
    return;
  }
  const siteId = JSON.parse(readFileSync(fileURLToPath(new URL("../wix.config.json", import.meta.url)), "utf8")).siteId;
  const headers = { Authorization: key, "wix-site-id": siteId, "Content-Type": "application/json" };
  const got = await fetch(`${API}/${clientId}`, { headers });
  if (!got.ok) throw new Error(`Reading the headless app failed (${got.status}). Does the API key have Manage OAuth Apps?`);
  const current = (await got.json()).oAuthApp?.allowedRedirectUris ?? [];
  const next = nextRedirectUris(current, callback);
  if (next.length === current.length && next.every((uri, i) => uri === current[i])) {
    console.log("The preview is already allowed.");
    return;
  }
  const put = await fetch(`${API}/${clientId}`, { method: "PATCH", headers, body: JSON.stringify({ oAuthApp: { allowedRedirectUris: next }, mask: { paths: ["allowedRedirectUris"] } }) });
  if (!put.ok) throw new Error(`Changing the redirect list failed (${put.status}).`);
  console.log(`Allowed ${callback} to sign in (${next.length} of ${MAX_URIS} redirect URIs used).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => console.log(`::warning::${err instanceof Error ? err.message : err}`));
}
