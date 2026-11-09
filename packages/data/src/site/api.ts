// The /api/site request handler: a plain function from Request to Response, so it is tested directly and the
// Astro route (src/server/site-route.ts) is a thin wrapper. SERVER ONLY.
//
//   POST /api/site   Authorization: <Wix member access token>   body: JSON
//     { "action": "status" }
//     { "action": "read",    "area": "summer-camp" }
//     { "action": "propose", "area": "summer-camp", "value": {...}, "images": [{ "path", "base64" }] }
//
// EVERY request first proves who is asking (Wix token -> member -> badges) and refuses anyone who is not an approved
// Web Admin, before the body is even read.
import { AREAS, isAreaId } from "@team6220/content";
import { proposeChange, readArea } from "./propose";
import { isWebAdmin, type VerifyViewer } from "./verify";
import { SiteError, type ImageUpload, type SiteStore } from "./types";

export interface SiteApiDeps {
  verify: VerifyViewer;
  /** Null when the server has no GitHub credential: every call then answers "not-configured" (after the admin check). */
  getStore: () => Promise<SiteStore | null>;
  now?: () => Date;
}

const STATUS: Record<string, number> = {
  "signed-out": 401,
  pending: 403,
  forbidden: 403,
  "bad-request": 400,
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

const MAX_BODY_BYTES = 4_500_000; // ten 2 MB images in base64 would be bigger; the module also caps each image

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function failure(err: unknown): Response {
  if (err instanceof SiteError) {
    return reply(STATUS[err.code] ?? 500, { error: { code: err.code, message: err.message, issues: err.issues } });
  }
  console.error("site api: unexpected error", err instanceof Error ? err.name : "unknown"); // never log request bodies or tokens
  return reply(500, { error: { code: "server-error", message: "Something went wrong on the server." } });
}

export async function handleSiteRequest(request: Request, deps: SiteApiDeps): Promise<Response> {
  try {
    if (request.method !== "POST") return reply(405, { error: { code: "bad-request", message: "Use POST." } });

    // 1. Who is asking? Checked on every request.
    const viewer = await deps.verify(request.headers.get("authorization"));
    if (!viewer.approved) throw new SiteError("pending", "A web admin hasn't approved your account yet.");
    if (!isWebAdmin(viewer)) throw new SiteError("forbidden", "Only Web Admins can use the Site Manager.");

    // 2. What do they want?
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > MAX_BODY_BYTES) throw new SiteError("bad-request", "That request is too large.");
    let body: Record<string, unknown>;
    try {
      const parsed = JSON.parse(await request.text());
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      body = parsed as Record<string, unknown>;
    } catch {
      throw new SiteError("bad-request", "The request body must be a JSON object.");
    }

    const store = await deps.getStore();
    if (!store) throw new SiteError("not-configured", "The Site Manager has no GitHub credential on the server yet.");

    switch (body.action) {
      case "status":
        return reply(200, { ok: true, store: store.kind, repoUrl: store.repoUrl });
      case "read": {
        const area = requireArea(body.area);
        return reply(200, { area, path: AREAS[area].path, value: await readArea(store, area) });
      }
      case "propose": {
        const area = requireArea(body.area);
        const result = await proposeChange(store, {
          area,
          value: body.value,
          images: parseImages(body.images),
          requestedBy: { name: viewer.name, id: viewer.id },
          now: deps.now?.(),
        });
        return reply(200, { ok: true, pullRequest: result.pullRequest, changes: result.changes });
      }
      default:
        throw new SiteError("bad-request", "Unknown action.");
    }
  } catch (err) {
    return failure(err);
  }
}

function requireArea(value: unknown) {
  if (!isAreaId(value)) throw new SiteError("unknown-area", "That part of the site can't be edited here.");
  return value;
}

function parseImages(value: unknown): ImageUpload[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new SiteError("invalid-image", "Images must be a list.");
  return value.map((v) => {
    if (!v || typeof v !== "object" || typeof (v as ImageUpload).path !== "string" || typeof (v as ImageUpload).base64 !== "string") {
      throw new SiteError("invalid-image", "Each image needs a path and base64 data.");
    }
    return { path: (v as ImageUpload).path, base64: (v as ImageUpload).base64 };
  });
}
