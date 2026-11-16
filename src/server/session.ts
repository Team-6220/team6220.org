// Who is asking, for every /api endpoint: the member of the request's session (Wix's built-in login), with their badges.
// Wix's middleware sets the session up, so these @wix/members calls run as that member.
import { badgeAssignments, badgesV2, members } from "@wix/members";
import { createSessionVerifier } from "@team6220/data/site-server";

export const verifySession = createSessionVerifier(
  {
    getCurrentMember: async () => (await members.getCurrentMember({ fieldsets: ["FULL"] })).member,
    listBadges: async () => (await badgesV2.queryBadges().limit(100).find()).items,
    listBadgeIds: async (memberId) =>
      (await badgeAssignments.queryBadgeAssignments().eq("memberId", memberId).limit(100).find()).items.map((a) => a.badgeId ?? ""),
  },
  "Team member",
);
