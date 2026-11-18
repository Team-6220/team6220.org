// Shared by every /api endpoint's handler (Site Manager, inventory, ops): a plain function from Request to Response,
// so it is tested directly and the Astro route stays a thin wrapper. SERVER ONLY.
import { SiteError } from "../site/types";

/** HTTP status for each error code. */
export const STATUS: Record<string, number> = {
  "signed-out": 401,
  pending: 403,
  forbidden: 403,
  "bad-request": 400,
  conflict: 409,
  busy: 429,
  "unknown-area": 400,
  invalid: 422,
  "invalid-image": 422,
  "no-changes": 422,
  "not-configured": 503,
  "wix-unavailable": 503,
  github: 502,
  network: 502,
  "server-error": 500,
};

/** The HTTP status for an error code. */
export const failureStatus = (code: string): number => STATUS[code] ?? 500;

export function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** An error as a JSON answer. Unexpected errors are logged by name only (never request bodies or tokens). */
export function failure(err: unknown, who = "api"): Response {
  if (err instanceof SiteError) {
    return reply(STATUS[err.code] ?? 500, { error: { code: err.code, message: err.message, issues: err.issues } });
  }
  console.error(`${who}: unexpected error`, err instanceof Error ? err.name : "unknown");
  return reply(500, { error: { code: "server-error", message: "Something went wrong on the server." } });
}

/**
 * Sign-in lives in a cookie, so refuse requests another website makes in a member's browser. Browsers mark every
 * request with Sec-Fetch-Site; callers that aren't browsers (scripts, Apollo) send no cookie, so they can't use a session.
 */
export function guardSameSite(request: Request): void {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") throw new SiteError("forbidden", "Requests must come from this website.");
}

/** The request body as a JSON object, or a bad-request error. `maxBytes` guards against huge bodies. */
export async function readJsonObject(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > maxBytes) throw new SiteError("bad-request", "That request is too large.");
  try {
    const parsed = JSON.parse(await request.text());
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return parsed as Record<string, unknown>;
  } catch {
    throw new SiteError("bad-request", "The request body must be a JSON object.");
  }
}
