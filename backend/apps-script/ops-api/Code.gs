/**
 * 6220 Operations API ("ops-api")
 *
 * One Apps Script web app shared by the Icarus (tasks), Production and BOM apps on team6220.org. It does the
 * things the browser must not be trusted with: checking badges, handing out numbers (t42, p10), writing the
 * history log, and changing subteam badges. The plan is docs/operations/ARCHITECTURE.md.
 *
 * Every request is a POST with a JSON body sent as Content-Type: text/plain (no CORS preflight):
 *   { "action": "...", "token": "<Wix member access token>", ... }      from the apps
 *   { "action": "...", "apiKey": "<Apollo's key>", ... }                 from Apollo, the team's Hermes agent
 * Every answer is { ok: true, ... } or { ok: false, error: "<code>", message: "..." }.
 *
 * Files (Apps Script loads them all into one global scope):
 *   Code.gs      entry points and the table of actions (this file)
 *   Auth.gs      who is asking: Wix member token or Apollo key, and what their badges allow
 *   WixData.gs   reading and writing Wix CMS collections with the server's Wix API key
 *   Shared.gs    numbers, history, projects, people and subteam badges
 *   Bom.gs       BOM: orders, lines, signatures, ordering, receiving
 *   Icarus.gs    Icarus: milestones, events, seasons and templates (tasks are written straight to Wix)
 *
 * Script Properties (Project Settings > Script Properties). See README.md for where each comes from.
 *   WIX_API_KEY         required. Wix API key with "Wix Data" and "Manage Badges" permissions. SECRET.
 *   WIX_SITE_ID         required. The site's ID.
 *   WIX_CLIENT_ID       optional. Headless client ID (public). Defaults to the team's.
 *   APOLLO_KEY_SHA256   optional. SHA-256 (hex) of Apollo's API key. Without it Apollo cannot call anything.
 *
 * Functions ending in "_" are private in Apps Script. The only entry points are doPost, doGet and checkSetup.
 */

/**
 * Every action the API answers. "who" is the role needed (see roles_ in Auth.gs); "run" does the work.
 * "agent: true" also lets Apollo call it. To add an action, add one line here and its function in another file.
 * (This is a function, not a constant, because the other files load after this one.)
 */
function actions_() {
  return {
    whoAmI: { who: "viewer", run: whoAmI_ },
    nextNumber: { who: "team", agent: true, run: nextNumber_ },
    logHistory: { who: "team", run: logHistory_ },
    saveProject: { who: "lead", run: saveProject_ },
    setMySubteams: { who: "team", run: setMySubteams_ },
    setSubteams: { who: "peopleAdmin", run: setSubteams_ },
    // BOM (Bom.gs)
    saveBom: { who: "lead", run: saveBom_ },
    createOrder: { who: "lead", run: createOrder_ },
    addSection: { who: "team", run: addSection_ },
    saveLine: { who: "team", agent: true, run: saveLine_ },
    addLines: { who: "team", agent: true, run: addLines_ },
    removeLine: { who: "team", run: removeLine_ },
    reopenLine: { who: "lead", run: reopenLine_ },
    signLines: { who: "approver", run: signLines_ },
    approveSection: { who: "approver", run: approveSection_ },
    markOrdered: { who: "approver", run: markOrdered_ },
    receiveLines: { who: "team", agent: true, run: receiveLines_ },
    linkLineToInventory: { who: "team", agent: true, run: linkLineToInventory_ },
    importOrder: { who: "lead", run: importOrder_ },
    // Icarus (Icarus.gs)
    saveIcarusRecord: { who: "lead", run: saveIcarusRecord_ },
    removeIcarusRecord: { who: "lead", run: removeIcarusRecord_ },
  };
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || "");
  } catch (err) {
    body = null;
  }
  if (!body || typeof body !== "object") {
    return json_({ ok: false, error: "bad-request", message: "The request wasn't valid JSON." });
  }
  try {
    return json_(handle_(body));
  } catch (err) {
    if (err && err.apiCode) return json_({ ok: false, error: err.apiCode, message: err.message });
    // Never log the request body: it holds tokens.
    console.error("ops-api " + String(body.action) + " failed: " + (err && err.stack ? err.stack : err));
    return json_({ ok: false, error: "server-error", message: "Something went wrong on the operations server." });
  }
}

/** Health check only. */
function doGet() {
  return json_({ ok: true, service: "6220 operations API", message: "Send POST requests." });
}

function handle_(body) {
  const actions = actions_();
  const action = Object.prototype.hasOwnProperty.call(actions, body.action) ? actions[body.action] : null;
  if (!action) throw apiError_("bad-request", "Unknown action.");
  const actor = actor_(body);
  if (actor.agent && !action.agent) throw apiError_("forbidden", "Apollo isn't allowed to do that.");
  if (!actor.agent) requireRole_(actor, action.who);
  return Object.assign({ ok: true }, action.run(body, actor));
}

/**
 * Run this once from the editor (select checkSetup, click Run) after setting the Script Properties.
 * It asks for the permission the web app needs and checks that Wix answers. It changes nothing.
 */
function checkSetup() {
  const badges = siteBadges_(true);
  const titles = Object.keys(badges).map(function (id) { return badges[id]; });
  REQUIRED_BADGES.forEach(function (t) {
    if (titles.indexOf(t) === -1) throw new Error("No Wix badge called '" + t + "' on the site.");
  });
  const subteams = titles.filter(function (t) { return t.indexOf(SUBTEAM_PREFIX) === 0; });
  if (!subteams.length) throw new Error("No subteam badges yet. Create badges named '" + SUBTEAM_PREFIX + "<name>'.");
  const collections = REQUIRED_COLLECTIONS.concat(BOM_COLLECTIONS, ICARUS_COLLECTIONS);
  collections.forEach(function (c) { wixQuery_(c, {}, 1); });
  console.log("OK. Badges: " + titles.join(", ") + ". Collections: " + collections.join(", ") + ".");
}

// ---------------------------------------------------------------------------------------------------------
// Small helpers used by every file
// ---------------------------------------------------------------------------------------------------------

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

function prop_(name) {
  return PropertiesService.getScriptProperties().getProperty(name);
}

/** Runs fn while holding the script lock, so two requests can't both take the same number. */
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw apiError_("busy", "The server is busy. Try again.");
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** A short text argument, trimmed. Throws bad-request when it is missing or too long. */
function text_(value, name, max, optional) {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s && !optional) throw apiError_("bad-request", "Missing " + name + ".");
  if (s.length > max) throw apiError_("bad-request", name + " is too long.");
  return s;
}
