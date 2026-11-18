// Who is asking, and what are they allowed to do? SERVER ONLY.
//
// Members: the Wix session cookie, checked by the shared session verifier (site/verify.ts), which gives the member's
// name, approval and badges. Apollo (the team's Hermes agent): an API key whose SHA-256 is in the Wix secret
// APOLLO_KEY_SHA256. The timers have their own endpoint and secret (handler.ts).
import type { VerifyViewer } from "../../site/verify";
import { SiteError } from "../../site/types";
import { rolesFor } from "../roles";
import type { Roles } from "../types";
import { APOLLO, sha256Hex, type Actor } from "./context";
import { apiError, ApiError, type OpsEnv } from "./env";

/** The role an action needs (see rolesFor in ../roles.ts for who has each). */
export type Who = keyof Roles;

export function requireRole(actor: Actor, role: Who): void {
  if (!actor.approved) throw apiError("pending", "A web admin hasn't approved your account yet.");
  if (!rolesFor(actor.badges)[role]) throw apiError("forbidden", "Your account isn't allowed to do that.");
}

/** Apollo, when the key is right. */
async function verifyAgent(apiKey: string, env: OpsEnv): Promise<Actor> {
  const expected = await env.secret("APOLLO_KEY_SHA256");
  if (!expected || apiKey.length < 32 || apiKey.length > 200 || (await sha256Hex(apiKey)) !== expected.toLowerCase()) {
    throw apiError("signed-out", "That API key isn't valid.");
  }
  return APOLLO;
}

/** The member behind a request's session. */
async function verifyMember(verify: VerifyViewer): Promise<Actor> {
  try {
    const viewer = await verify(null);
    return { id: viewer.id, name: viewer.name, username: viewer.username, approved: viewer.approved, badges: viewer.badges };
  } catch (err) {
    // The shared verifier speaks the Site Manager's error type; the apps use the same codes.
    if (err instanceof SiteError) throw new ApiError(err.code === "wix-unavailable" ? "wix-unavailable" : "signed-out", err.message);
    throw err;
  }
}

/** Returns the member or agent behind a request. Throws signed-out when there is neither. */
export function actorFor(body: Record<string, unknown>, verify: VerifyViewer, env: OpsEnv): Promise<Actor> {
  if (typeof body.apiKey === "string" && body.apiKey) return verifyAgent(body.apiKey, env);
  return verifyMember(verify);
}
