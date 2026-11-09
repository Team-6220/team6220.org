/**
 * 6220 Attendance API
 *
 * A small, separate Apps Script web app that lets /apps/attendance on team6220.org write the SAME Google Sheet
 * as the old "QR Code Scanner" app (backend/apps-script/attendance/), in exactly the same row format:
 *   Data:          [timestamp text, student ID]        (one sign-in per student per day)
 *   MemberLookup:  [student ID, first, last, ""]       (self-registration of unknown IDs)
 * The old project and its deployment are not touched and stay the fallback.
 *
 * Every request is a POST with a JSON body sent as Content-Type: text/plain (no CORS preflight):
 *   { "action": "...", "token": "<Wix member access token>", "kioskToken": "...", ... }
 *
 * Who can do what (checked here, on every request; hiding buttons in the browser is only cosmetic):
 *   status, today, history, lookup   approved Wix member with the "Team Member" or "Attendance Admin" badge
 *   openKiosk                        approved Wix member with the "Attendance Admin" badge
 *   signIn, register                 only with a kiosk token from openKiosk that hasn't expired or been closed
 *   closeKiosk                       anyone holding that kiosk token (closing only takes access away)
 *
 * How the Wix token is checked (see README.md for the doc links):
 *   1. POST https://www.wixapis.com/oauth2/token-info { token } -> must be active, subjectType MEMBER and
 *      clientId = our headless client ID (so a token from another Wix site or app is refused).
 *   2. GET https://www.wixapis.com/members/v1/members/my?fieldSet=FULL with "Authorization: <member token>"
 *      -> the member's ID and status (must be APPROVED).
 *   3. With a visitor token minted for OUR headless client ID (POST /oauth2/token, grantType "anonymous"),
 *      query our site's badges (POST /badges/v4/badges/query) and that member's badge assignments
 *      (POST /badges/v4/assignments/query, filter memberId). This runs against our own site, so even
 *      without step 1 a member of some other Wix site would have no badges here.
 *
 * Script Properties (Project Settings > Script Properties):
 *   SHEET_ID        required. The ID of the attendance Google Sheet (from its URL).
 *   WIX_CLIENT_ID   optional. Wix headless client ID (public, not a secret). Defaults to the team's client ID.
 *   KIOSK_HOURS     optional. How long an opened kiosk stays open at most. Default 6.
 * The script also keeps open kiosk sessions in Script Properties under "kiosk:<sha256 of token>".
 *
 * Functions ending in "_" are private in Apps Script. The only entry points are doPost, doGet and checkSetup.
 */

// Sheet layout (same as backend/apps-script/attendance/Code.gs)
const DATASHEET = "Data";
const LOOKUPSHEET = "MemberLookup";

const WIX_API = "https://www.wixapis.com";
const DEFAULT_WIX_CLIENT_ID = "38a0b75d-6959-4630-ac13-73004c094181";
const BADGE_TEAM_MEMBER = "Team Member";
const BADGE_ATTENDANCE_ADMIN = "Attendance Admin";

const KIOSK_PREFIX = "kiosk:";
const DEFAULT_KIOSK_HOURS = 6;
const MEMBER_CACHE_SECONDS = 300; // a removed badge stops working within 5 minutes
const BADGE_CACHE_SECONDS = 3600;
const HISTORY_DAYS = 60;
const LOOKUP_LIMIT = 200;

// ---------------------------------------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------------------------------------

function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || "");
  } catch (err) {
    return json_({ ok: false, error: "bad-request", message: "The request wasn't valid JSON." });
  }
  if (!body || typeof body !== "object") {
    return json_({ ok: false, error: "bad-request", message: "The request wasn't valid JSON." });
  }
  try {
    return json_(handle_(body));
  } catch (err) {
    if (err && err.apiCode) return json_({ ok: false, error: err.apiCode, message: err.message });
    // Never log the request body: it holds tokens and student IDs.
    console.error("attendance-api " + String(body.action) + " failed: " + (err && err.stack ? err.stack : err));
    return json_({ ok: false, error: "server-error", message: "Something went wrong on the attendance server." });
  }
}

/** Health check only. Returns nothing about the Sheet. */
function doGet() {
  return json_({ ok: true, service: "6220 attendance API", message: "Send POST requests." });
}

/**
 * Run this once from the editor (select checkSetup, click Run) after setting the Script Properties.
 * It asks for the permissions the web app needs and checks the Sheet and Wix settings. Read-only.
 */
function checkSetup() {
  const ss = openSheet_();
  const data = ss.getSheetByName(DATASHEET);
  const lookup = ss.getSheetByName(LOOKUPSHEET);
  if (!data || !lookup) throw new Error("The Sheet needs tabs named '" + DATASHEET + "' and '" + LOOKUPSHEET + "'.");
  const badges = siteBadges_(true);
  const titles = Object.keys(badges).map(function (id) { return badges[id]; });
  [BADGE_TEAM_MEMBER, BADGE_ATTENDANCE_ADMIN].forEach(function (t) {
    if (titles.indexOf(t) === -1) throw new Error("No Wix badge called '" + t + "' on the site.");
  });
  console.log("OK: Sheet '" + ss.getName() + "' (" + (data.getLastRow() - 1) + " sign-in rows, " +
    (lookup.getLastRow() - 1) + " students). Wix badges found: " + titles.join(", ") + ". Time zone: " +
    Session.getScriptTimeZone());
}

// ---------------------------------------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------------------------------------

function handle_(body) {
  switch (body.action) {
    case "status": {
      const m = requireViewer_(body.token);
      return { ok: true, name: m.name, isMember: m.isMember, isAdmin: m.isAdmin, kioskOpen: anyKioskOpen_() };
    }
    case "openKiosk": {
      const m = verifyMember_(body.token);
      if (!m.isAdmin) throw apiError_("forbidden", "Only Attendance Admins can open the kiosk.");
      return Object.assign({ ok: true }, openKiosk_(m));
    }
    case "closeKiosk":
      closeKiosk_(body.kioskToken);
      return { ok: true };
    case "signIn":
      requireKiosk_(body.kioskToken);
      return { ok: true, result: withLock_(function () { return processSignIn_(String(body.studentId || "")); }) };
    case "register":
      requireKiosk_(body.kioskToken);
      return {
        ok: true,
        result: withLock_(function () {
          return registerNewStudent_(String(body.studentId || ""), body.firstName, body.lastName);
        }),
      };
    case "today":
      requireViewer_(body.token);
      return { ok: true, entries: todayAttendance_() };
    case "history":
      requireViewer_(body.token);
      return Object.assign({ ok: true }, history_(body.date));
    case "lookup":
      requireViewer_(body.token);
      return Object.assign({ ok: true }, lookup_(String(body.studentId || "")));
    default:
      throw apiError_("bad-request", "Unknown action.");
  }
}

// ---------------------------------------------------------------------------------------------------------
// Sign-in logic, ported from backend/apps-script/attendance/Code.gs (processForm, registerNewStudent,
// getTodayAttendance). Keep the rules and the row format identical to the old app until it is retired.
// ---------------------------------------------------------------------------------------------------------

/** processForm(formObject) in the old app. Returns { status, name?, time?, message }. */
function processSignIn_(studentId) {
  const ss = openSheet_();
  const dataSheet = ss.getSheetByName(DATASHEET);
  const lookupSheet = ss.getSheetByName(LOOKUPSHEET);

  // Validate student ID is exactly 10 digits
  if (!/^\d{10}$/.test(studentId)) {
    return { status: "invalid", message: "Invalid Student ID: Must be exactly 10 digits" };
  }

  // Look up student name (skip header row)
  const lookupData = lookupSheet.getDataRange().getValues();
  let studentName = null;
  for (let i = 1; i < lookupData.length; i++) {
    if (lookupData[i][0] && lookupData[i][0].toString() === studentId) {
      const firstName = lookupData[i][1] || "";
      const lastName = lookupData[i][2] || "";
      studentName = `${firstName} ${lastName}`.trim();
      break;
    }
  }

  // If student ID not found in lookup table
  if (!studentName) {
    return { status: "needs-registration", message: "Student ID not found in system" };
  }

  // Check if student has already signed in today (skip header row)
  const dataRange = dataSheet.getDataRange().getValues();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 1; i < dataRange.length; i++) {
    const timestamp = new Date(dataRange[i][0]);
    timestamp.setHours(0, 0, 0, 0);

    if (timestamp.getTime() === today.getTime() && dataRange[i][1].toString() === studentId) {
      const previousSignInTime = new Date(dataRange[i][0]).toLocaleTimeString();
      return {
        status: "duplicate",
        name: studentName,
        time: previousSignInTime,
        message: `${studentName}, you already signed in today at ${previousSignInTime}`,
      };
    }
  }

  // Record attendance (only if not a duplicate)
  const now = new Date();
  dataSheet.appendRow([now.toLocaleString(), studentId]);

  return { status: "signed-in", name: studentName, time: now.toLocaleTimeString(), message: `Welcome, ${studentName}!` };
}

/** registerNewStudent(studentId, firstName, lastName) in the old app. */
function registerNewStudent_(studentId, firstName, lastName) {
  const ss = openSheet_();
  const lookupSheet = ss.getSheetByName(LOOKUPSHEET);
  const dataSheet = ss.getSheetByName(DATASHEET);

  // Validate inputs
  if (typeof firstName !== "string" || typeof lastName !== "string" ||
      firstName.trim() === "" || lastName.trim() === "") {
    return { status: "invalid", message: "First name and last name are required" };
  }
  // Names end up in the Sheet; keep them to a sensible length.
  if (firstName.trim().length > 50 || lastName.trim().length > 50) {
    return { status: "invalid", message: "Names must be 50 characters or fewer" };
  }

  // Validate student ID format
  if (!/^\d{10}$/.test(studentId)) {
    return { status: "invalid", message: "Invalid Student ID: Must be exactly 10 digits" };
  }

  // Check if student already exists
  const lookupData = lookupSheet.getDataRange().getValues();
  for (let i = 1; i < lookupData.length; i++) {
    if (lookupData[i][0] && lookupData[i][0].toString() === studentId) {
      return { status: "invalid", message: "Student ID already exists in system" };
    }
  }

  // Add new student to MemberLookup: Student ID #, First Name, Last Name, Main Subteam (empty)
  lookupSheet.appendRow([studentId, firstName.trim(), lastName.trim(), ""]);

  // Record attendance
  const now = new Date();
  dataSheet.appendRow([now.toLocaleString(), studentId]);

  const fullName = `${firstName.trim()} ${lastName.trim()}`;
  return {
    status: "signed-in",
    name: fullName,
    time: now.toLocaleTimeString(),
    message: `Welcome, ${fullName}! You've been added to the system.`,
  };
}

/** getTodayAttendance() in the old app, WITHOUT the student IDs: [{ name, time, at }]. */
function todayAttendance_() {
  const rows = readAttendance_();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return rows
    .filter(function (r) { return sameDay_(r.date, today); })
    .map(function (r) { return entry_(r); });
}

// ---------------------------------------------------------------------------------------------------------
// Viewing (new): history by day, and "did this ID sign in" for a member checking their own ID
// ---------------------------------------------------------------------------------------------------------

/** No date: the last HISTORY_DAYS days that have sign-ins, with counts. With "yyyy-MM-dd": that day's list. */
function history_(date) {
  const rows = readAttendance_();
  const tz = Session.getScriptTimeZone();
  if (date !== undefined && date !== null && date !== "") {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw apiError_("bad-request", "Dates look like 2026-11-09.");
    }
    return {
      date: date,
      entries: rows
        .filter(function (r) { return Utilities.formatDate(r.date, tz, "yyyy-MM-dd") === date; })
        .map(function (r) { return entry_(r); }),
    };
  }
  const counts = {};
  rows.forEach(function (r) {
    const key = Utilities.formatDate(r.date, tz, "yyyy-MM-dd");
    counts[key] = (counts[key] || 0) + 1;
  });
  const days = Object.keys(counts).sort().reverse().slice(0, HISTORY_DAYS)
    .map(function (d) { return { date: d, count: counts[d] }; });
  return { days: days };
}

/**
 * Sign-ins for one student ID, newest first: [{ date, time, at }]. Used by a member to check their OWN ID.
 * Returns no name, so it can't be used to find out whose ID a number is.
 */
function lookup_(studentId) {
  if (!/^\d{10}$/.test(studentId)) throw apiError_("bad-request", "Student IDs are exactly 10 digits.");
  const tz = Session.getScriptTimeZone();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const mine = readAttendance_().filter(function (r) { return r.studentId === studentId; }).reverse();
  return {
    signedInToday: mine.some(function (r) { return sameDay_(r.date, today); }),
    signIns: mine.slice(0, LOOKUP_LIMIT).map(function (r) {
      return { date: Utilities.formatDate(r.date, tz, "yyyy-MM-dd"), time: r.date.toLocaleTimeString(), at: r.date.toISOString() };
    }),
  };
}

/** Every Data row with a readable timestamp, oldest first: { date, studentId, name }. */
function readAttendance_() {
  const ss = openSheet_();
  const dataRange = ss.getSheetByName(DATASHEET).getDataRange().getValues();
  const lookupData = ss.getSheetByName(LOOKUPSHEET).getDataRange().getValues();

  // Map of student IDs to names, as in getTodayAttendance()
  const studentMap = {};
  for (let i = 1; i < lookupData.length; i++) {
    if (lookupData[i][0]) {
      const id = lookupData[i][0].toString();
      const firstName = lookupData[i][1] || "";
      const lastName = lookupData[i][2] || "";
      studentMap[id] = `${firstName} ${lastName}`.trim();
    }
  }

  const rows = [];
  for (let i = 1; i < dataRange.length; i++) {
    const date = new Date(dataRange[i][0]);
    if (isNaN(date.getTime())) continue;
    const studentId = String(dataRange[i][1]);
    rows.push({ date: date, studentId: studentId, name: studentMap[studentId] || "Unknown" });
  }
  return rows;
}

function entry_(r) {
  return { name: r.name, time: r.date.toLocaleTimeString(), at: r.date.toISOString() };
}

function sameDay_(date, midnight) {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  return d.getTime() === midnight.getTime();
}

function openSheet_() {
  const id = PropertiesService.getScriptProperties().getProperty("SHEET_ID");
  if (!id) throw apiError_("not-configured", "The attendance server isn't set up yet (SHEET_ID is missing).");
  return SpreadsheetApp.openById(id);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw apiError_("busy", "Lots of people are signing in. Try again.");
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------------------------------------
// Kiosk sessions
// ---------------------------------------------------------------------------------------------------------

function openKiosk_(member) {
  const props = PropertiesService.getScriptProperties();
  const hours = Number(props.getProperty("KIOSK_HOURS")) || DEFAULT_KIOSK_HOURS;
  const kioskToken = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
  const now = Date.now();
  const session = { memberId: member.id, name: member.name, openedAt: now, expiresAt: now + hours * 3600 * 1000 };
  withLock_(function () {
    removeExpiredKiosks_(props);
    props.setProperty(KIOSK_PREFIX + sha256_(kioskToken), JSON.stringify(session));
  });
  return { kioskToken: kioskToken, expiresAt: new Date(session.expiresAt).toISOString() };
}

function requireKiosk_(kioskToken) {
  const closed = apiError_("kiosk-closed", "The kiosk is closed. An Attendance Admin has to open it.");
  if (typeof kioskToken !== "string" || kioskToken.length < 32 || kioskToken.length > 200) throw closed;
  const props = PropertiesService.getScriptProperties();
  const key = KIOSK_PREFIX + sha256_(kioskToken);
  const raw = props.getProperty(key);
  if (!raw) throw closed;
  const session = JSON.parse(raw);
  if (!(session.expiresAt > Date.now())) {
    props.deleteProperty(key);
    throw closed;
  }
  return session;
}

function closeKiosk_(kioskToken) {
  if (typeof kioskToken !== "string" || kioskToken.length > 200) return;
  PropertiesService.getScriptProperties().deleteProperty(KIOSK_PREFIX + sha256_(kioskToken));
}

function anyKioskOpen_() {
  const all = PropertiesService.getScriptProperties().getProperties();
  const now = Date.now();
  return Object.keys(all).some(function (k) {
    if (k.indexOf(KIOSK_PREFIX) !== 0) return false;
    try {
      return JSON.parse(all[k]).expiresAt > now;
    } catch (err) {
      return false;
    }
  });
}

function removeExpiredKiosks_(props) {
  const all = props.getProperties();
  const now = Date.now();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(KIOSK_PREFIX) !== 0) return;
    let expired = true;
    try {
      expired = !(JSON.parse(all[k]).expiresAt > now);
    } catch (err) {
      // unreadable: remove
    }
    if (expired) props.deleteProperty(k);
  });
}

// ---------------------------------------------------------------------------------------------------------
// Wix member and badge checks
// ---------------------------------------------------------------------------------------------------------

/** Team Member or Attendance Admin. */
function requireViewer_(token) {
  const m = verifyMember_(token);
  if (!m.approved) throw apiError_("pending", "A web admin hasn't approved your account yet.");
  if (!m.isMember && !m.isAdmin) throw apiError_("forbidden", "You need the Team Member badge to see attendance.");
  return m;
}

/**
 * Checks a Wix member access token with Wix and returns { id, name, approved, isMember, isAdmin }.
 * Results are cached for a few minutes per token (keyed by its SHA-256, never the token itself).
 */
function verifyMember_(token) {
  if (typeof token !== "string" || token.length < 20 || token.length > 8000) {
    throw apiError_("signed-out", "Sign in to use attendance.");
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
  if (!member || !member.id) throw apiError_("signed-out", "Sign in to use attendance.");

  const titles = memberBadgeTitles_(member.id);
  const approved = member.status === "APPROVED";
  const contact = member.contact || {};
  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  const result = {
    id: member.id,
    name: fullName || (member.profile && member.profile.nickname) || "Team member",
    approved: approved,
    isMember: approved && titles.indexOf(BADGE_TEAM_MEMBER) !== -1,
    isAdmin: approved && titles.indexOf(BADGE_ATTENDANCE_ADMIN) !== -1,
  };
  cache.put(cacheKey, JSON.stringify(result), MEMBER_CACHE_SECONDS);
  return result;
}

/** Titles of the badges a member has on OUR site (queried with our own visitor token). */
function memberBadgeTitles_(memberId) {
  const badges = siteBadges_(false);
  // Query Badge Assignments: https://dev.wix.com/docs/api-reference/crm/members-contacts/members/activity/badge-assignments/query-badge-assignments
  const res = siteQuery_("/badges/v4/assignments/query", {
    query: { filter: { memberId: memberId }, cursorPaging: { limit: 100 } },
  });
  return (res.badgeAssignments || [])
    .filter(function (a) { return a.memberId === memberId && badges[a.badgeId]; })
    .map(function (a) { return badges[a.badgeId]; });
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

/**
 * Visitor access token for our headless client (no secret needed). Cached until shortly before it expires.
 * Token endpoint: https://dev.wix.com/docs/go-headless/authentication/visitors/authenticate-visitors-rest
 */
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

// ---------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------

function wixClientId_() {
  return PropertiesService.getScriptProperties().getProperty("WIX_CLIENT_ID") || DEFAULT_WIX_CLIENT_ID;
}

function apiError_(code, message) {
  const err = new Error(message);
  err.apiCode = code;
  return err;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sha256_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ((b + 256) % 256).toString(16).padStart(2, "0"); }).join("");
}
