// What each badge allows in the operations apps. The same rules are in backend/apps-script/ops-api/Auth.gs
// (roles_), which is where they are actually enforced. Change both together.
//
// A person with several badges gets everything any of them allows (team decision, Nov 12, 2026).
import { BADGES, SUBTEAM_BADGE_PREFIX } from "../config";
import type { Roles } from "./types";

export function rolesFor(badges: readonly string[]): Roles {
  const has = (badge: string) => badges.includes(badge);
  const team = has(BADGES.teamMember) || has(BADGES.mentor) || has(BADGES.booster) || has(BADGES.lead);
  return {
    viewer: team || has(BADGES.supervisor),
    team,
    lead: has(BADGES.lead),
    approver: has(BADGES.mentor) || has(BADGES.booster),
    peopleAdmin: has(BADGES.lead) || has(BADGES.mentor) || has(BADGES.webAdmin),
  };
}

/** ["Subteam: Design", "Team Member"] -> ["Design"] */
export function subteamsOf(badges: readonly string[]): string[] {
  return badges.filter((b) => b.startsWith(SUBTEAM_BADGE_PREFIX)).map((b) => b.slice(SUBTEAM_BADGE_PREFIX.length));
}
