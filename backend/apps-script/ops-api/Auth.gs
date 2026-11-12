// Who is asking, and what are they allowed to do?
//
// Members: the Wix access token is checked with Wix on every request (cached a few minutes), the same three
// steps as backend/apps-script/attendance-api (token-info, "my member", badge assignments on OUR site).
// Apollo: an API key whose SHA-256 is stored in the APOLLO_KEY_SHA256 Script Property.

const WIX_API = "https://www.wixapis.com";
const DEFAULT_WIX_CLIENT_ID = "38a0b75d-6959-4630-ac13-73004c094181";

// Badge titles, exactly as created in Wix. Keep in step with BADGES in packages/data/src/config.ts.
const BADGE_TEAM_MEMBER = "Team Member";
const BADGE_MENTOR = "Mentor";
const BADGE_BOOSTER = "Booster";
const BADGE_SUPERVISOR = "Supervisor";
const BADGE_LEAD = "Lead";
const BADGE_WEB_ADMIN = "Web Admin";
const SUBTEAM_PREFIX = "Subteam: ";
const REQUIRED_BADGES = [BADGE_TEAM_MEMBER, BADGE_MENTOR, BADGE_BOOSTER, BADGE_SUPERVISOR, BADGE_LEAD];

const MEMBER_CACHE_SECONDS = 300; // a removed badge stops working within 5 minutes
const BADGE_CACHE_SECONDS = 3600;

/** The Apollo user. Everything Apollo does is recorded under this ID and name. */
const APOLLO = { id: "apollo", name: "Apollo", agent: true, approved: true, badges: [] };

/** Returns the member or agent behind a request. Throws signed-out when there is neither. */
function actor_(body) {
  if (typeof body.apiKey === "string" && body.apiKey) return verifyAgent_(body.apiKey);
  return verifyMember_(body.token);
}

/**
 * What a set of badges allows. A person with several badges gets everything any of them allows
 * (team decision, Nov 12, 2026). Keep in step with packages/data/src/ops/roles.ts.
 *   viewer       may open the apps (Supervisors can view and nothing else)
 *   team         may do everyday work: tasks, parts, BOM lines
 *   lead         may plan: projects, milestones, templates, BOMs
 *   approver     may sign BOM lines and buy
 *   peopleAdmin  may change anyone's subteams
 */
function roles_(badges) {
  const has = function (title) { return badges.indexOf(title) !== -1; };
  const team = has(BADGE_TEAM_MEMBER) || has(BADGE_MENTOR) || has(BADGE_BOOSTER) || has(BADGE_LEAD);
  return {
    viewer: team || has(BADGE_SUPERVISOR),
    team: team,
    lead: has(BADGE_LEAD),
    approver: has(BADGE_MENTOR) || has(BADGE_BOOSTER),
    peopleAdmin: has(BADGE_LEAD) || has(BADGE_MENTOR) || has(BADGE_WEB_ADMIN),
  };
}

function requireRole_(member, role) {
  if (!member.approved) throw apiError_("pending", "A web admin hasn't approved your account yet.");
  if (!roles_(member.badges)[role]) throw apiError_("forbidden", "Your account isn't allowed to do that.");
}

function verifyAgent_(apiKey) {
  const expected = prop_("APOLLO_KEY_SHA256");
  if (!expected || apiKey.length < 32 || apiKey.length > 200 || sha256_(apiKey) !== expected.toLowerCase()) {
    throw apiError_("signed-out", "That API key isn't valid.");
  }
  return APOLLO;
}

/** Checks a Wix member access token with Wix and returns { id, name, approved, badges: [titles] }. */
function verifyMember_(token) {
  if (typeof token !== "string" || token.length < 20 || token.length > 8000) {
    throw apiError_("signed-out", "Sign in to continue.");
  }
  const cache = CacheService.getScriptCache();
  const cacheKey = "member:" + sha256_(token);
  const hit = cache.get(cacheKey);
  if (hit) return JSON.parse(hit);

  // Token Info: https://dev.wix.com/docs/api-reference/app-management/oauth-2/token-info
  // The token must be live, belong to a site MEMBER, and have been issued to OUR headless client.
  const infoRes = UrlFetchApp.fetch(WIX_API + "/oauth2/token-info", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ token: token }),
    muteHttpExceptions: true,
  });
  const infoCode = infoRes.getResponseCode();
  if (infoCode >= 500 || infoCode === 429) {
    throw apiError_("wix-unavailable", "Couldn't reach Wix to check your sign-in. Try again.");
  }
  let info = {};
  try {
    info = infoCode === 200 ? JSON.parse(infoRes.getContentText()) || {} : {};
  } catch (err) {
    info = {};
  }
  const infoClient = info.clientId || info.client_id;
  const infoSubject = info.subjectType || info.subject_type;
  if (info.active !== true || infoSubject !== "MEMBER" || infoClient !== wixClientId_()) {
    throw apiError_("signed-out", "Your sign-in has expired. Sign in again.");
  }

  // Get My Member: https://dev.wix.com/docs/api-reference/crm/members-contacts/members/member-management/members/get-my-member
  const res = UrlFetchApp.fetch(WIX_API + "/members/v1/members/my?fieldSet=FULL", {
    method: "get",
    headers: { Authorization: token },
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code === 400 || code === 401 || code === 403 || code === 404) {
    throw apiError_("signed-out", "Your sign-in has expired. Sign in again.");
  }
  if (code !== 200) throw apiError_("wix-unavailable", "Couldn't reach Wix to check your sign-in. Try again.");
  const member = (JSON.parse(res.getContentText()) || {}).member;
  if (!member || !member.id) throw apiError_("signed-out", "Sign in to continue.");

  const contact = member.contact || {};
  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  const result = {
    id: member.id,
    name: fullName || (member.profile && member.profile.nickname) || "Team member",
    approved: member.status === "APPROVED",
    badges: memberBadgeAssignments_(member.id).map(function (a) { return a.title; }),
  };
  cache.put(cacheKey, JSON.stringify(result), MEMBER_CACHE_SECONDS);
  return result;
}

/** Forget what we cached about a member's token, after their badges changed. */
function forgetMember_(token) {
  if (typeof token === "string") CacheService.getScriptCache().remove("member:" + sha256_(token));
}

/** [{ assignmentId, badgeId, title }] for the badges a member has on OUR site. */
function memberBadgeAssignments_(memberId) {
  const badges = siteBadges_(false);
  // Query Badge Assignments: https://dev.wix.com/docs/api-reference/crm/members-contacts/members/activity/badge-assignments/query-badge-assignments
  const res = siteQuery_("/badges/v4/assignments/query", {
    query: { filter: { memberId: memberId }, cursorPaging: { limit: 100 } },
  });
  return (res.badgeAssignments || [])
    .filter(function (a) { return a.memberId === memberId && badges[a.badgeId]; })
    .map(function (a) { return { assignmentId: a.id, badgeId: a.badgeId, title: badges[a.badgeId] }; });
}

/** { badgeId: title } for every badge on our site. Cached for an hour. */
function siteBadges_(fresh) {
  const cache = CacheService.getScriptCache();
  const hit = fresh ? null : cache.get("site-badges");
  if (hit) return JSON.parse(hit);
  // Query Badges: https://dev.wix.com/docs/api-reference/crm/members-contacts/members/activity/badges-v4/query-badges
  const res = siteQuery_("/badges/v4/badges/query", { query: { cursorPaging: { limit: 100 } } });
  const map = {};
  (res.badges || []).forEach(function (b) { if (b.id) map[b.id] = b.title || ""; });
  cache.put("site-badges", JSON.stringify(map), BADGE_CACHE_SECONDS);
  return map;
}

/** POST to Wix as an anonymous visitor of OUR site. Retries once with a fresh token on 401/403. */
function siteQuery_(path, payload) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = UrlFetchApp.fetch(WIX_API + path, {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: siteToken_(attempt > 0) },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    if (code === 200) return JSON.parse(res.getContentText());
    if (code !== 401 && code !== 403) break;
  }
  throw apiError_("wix-unavailable", "Couldn't reach Wix to check badges. Try again.");
}

/** Visitor access token for our headless client (no secret needed). Cached until shortly before it expires. */
function siteToken_(fresh) {
  const cache = CacheService.getScriptCache();
  const hit = fresh ? null : cache.get("wix-visitor-token");
  if (hit) return hit;
  const res = UrlFetchApp.fetch(WIX_API + "/oauth2/token", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ clientId: wixClientId_(), grantType: "anonymous" }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw apiError_("wix-unavailable", "Couldn't reach Wix. Try again.");
  const body = JSON.parse(res.getContentText());
  const seconds = Math.min(21600, Math.max(60, (Number(body.expires_in) || 3600) - 600));
  cache.put("wix-visitor-token", body.access_token, seconds);
  return body.access_token;
}

function wixClientId_() {
  return prop_("WIX_CLIENT_ID") || DEFAULT_WIX_CLIENT_ID;
}
