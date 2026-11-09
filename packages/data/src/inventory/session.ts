// Who is using the inventory, from the site login (packages/data/src/auth.ts).
// Loaded on demand so the mock build (dev, tests) doesn't pull in the Wix SDK.
import type { MemberSession } from "./types.ts";

/**
 * The real session: the signed-in Wix member, whether a Web Admin approved them (status APPROVED and the
 * `Team Member` badge, same rule as the /apps dashboard), their badges, and the shared Wix client that
 * carries their tokens (used by the Wix adapter).
 */
export async function wixMemberSession(): Promise<MemberSession> {
  const [auth, { wix }] = await Promise.all([import("../auth"), import("../wix")]);
  const member = await auth.getMember();
  if (!member) return { loggedIn: false, approved: false, badges: [] };
  const [access, badges] = await Promise.all([auth.getAccess(), auth.getBadges()]);
  return {
    loggedIn: true,
    approved: access === "approved",
    name: member.name,
    badges,
    wixClient: wix(),
  };
}
