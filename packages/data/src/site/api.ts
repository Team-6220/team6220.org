// The /api/site request handler: a plain function from Request to Response, so it is tested directly and the
// Astro route (src/server/site-route.ts) is a thin wrapper. SERVER ONLY.
//
//   POST /api/site   (signed in through Wix's built-in login: the session cookie)   body: JSON
//     { "action": "status" }
//     { "action": "read",    "area": "summer-camp" }
//     { "action": "propose", "area": "summer-camp", "value": {...}, "images": [{ "path", "base64" }] }
//     { "action": "signups", "formId": "<one of SIGNUP_FORMS>", "since": "2026-08-01" }   (since is optional)
//
// EVERY request first proves who is asking (the session's member and badges) and refuses anyone who is not an approved
// Web Admin, before the body is even read.
import { AREAS, isAreaId } from "@team6220/content";
import { proposeChange, readArea } from "./propose";
import { failure, guardSameSite, readJsonObject, reply } from "../server/http";
import { isSignupFormId, type SignupReader } from "./signups";
import { isWebAdmin, type VerifyViewer } from "./verify";
import { SiteError, type ImageUpload, type SiteStore } from "./types";

export interface SiteApiDeps {
  verify: VerifyViewer;
  /** Null when the server has no GitHub credential: every call then answers "not-configured" (after the admin check). */
  getStore: () => Promise<SiteStore | null>;
  /** Null when signups can't be read: "signups" then answers "not-configured". */
  getSignups?: () => SignupReader | null;
  now?: () => Date;
}

const MAX_BODY_BYTES = 4_500_000; // ten 2 MB images in base64 would be bigger; the module also caps each image

export async function handleSiteRequest(request: Request, deps: SiteApiDeps): Promise<Response> {
  try {
    if (request.method !== "POST") return reply(405, { error: { code: "bad-request", message: "Use POST." } });
    guardSameSite(request);

    // 1. Who is asking? Checked on every request.
    const viewer = await deps.verify(request.headers.get("authorization"));
    if (!viewer.approved) throw new SiteError("pending", "A web admin hasn't approved your account yet.");
    if (!isWebAdmin(viewer)) throw new SiteError("forbidden", "Only Web Admins can use the Site Manager.");

    // 2. What do they want?
    const body = await readJsonObject(request, MAX_BODY_BYTES);

    // Form signups come from Wix, not GitHub, so they don't need the GitHub credential.
    if (body.action === "signups") {
      if (!isSignupFormId(body.formId)) throw new SiteError("bad-request", "Pick one of the website's forms.");
      const since = parseSince(body.since);
      const reader = deps.getSignups?.() ?? null;
      if (!reader) throw new SiteError("not-configured", "The server can't read form signups here (they need the Wix build).");
      return reply(200, { formId: body.formId, signups: await reader.list(body.formId, since) });
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
    return failure(err, "site api");
  }
}

function requireArea(value: unknown) {
  if (!isAreaId(value)) throw new SiteError("unknown-area", "That part of the site can't be edited here.");
  return value;
}

function parseSince(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const date = typeof value === "string" ? new Date(value) : new Date(NaN);
  if (Number.isNaN(date.getTime())) throw new SiteError("bad-request", "\"since\" must be a date like 2026-08-01.");
  return date;
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
