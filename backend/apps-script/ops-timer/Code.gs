/**
 * 6220 Ops Timer
 *
 * Wix hosting has no scheduler, so this tiny script is the clock: time triggers call the website's /api/ops-timer, which
 * does the work (https://github.com/Team-6220/team6220.org/wiki/Operations-Server). It holds one secret and no logic.
 *
 * Script Properties (Project Settings > Script Properties):
 *   OPS_TIMER_SECRET  required. The same value as the Wix secret OPS_TIMER_SECRET (20 or more random characters). SECRET.
 *   SITE_ADDRESS      optional. Defaults to https://www.team6220.org
 *
 * Triggers: run setupTriggers once from the editor (it makes all five; running it again replaces them, never doubles):
 *   syncGithub     every 5 minutes   (sends task changes to GitHub; GitHub's own changes arrive at once by webhook)
 *   refreshEvents  once a day        (updates saved competition events' dates from The Blue Alliance)
 *   sendDeliveries every 5 minutes   (sends the Discord notifications that are waiting, and the morning bundle after quiet hours)
 *   runReminders   every 15 minutes  (tasks due tomorrow or overdue, BOM lines waiting for signatures, late orders)
 *   runRsvpReminders once a day, 8 am (RSVP forms: the people who have not finished, and the leads' summary the morning a form is due)
 *   runBizReminders  once a day, 8 am (1-2-3-100: students who are not done, on the schedule in its settings, and sponsor pitch follow-ups that are due)
 */

function syncGithub() {
  callJob_("syncGithub");
}

function refreshEvents() {
  callJob_("refreshEvents");
}

function sendDeliveries() {
  callJob_("sendDeliveries");
}

function runReminders() {
  callJob_("runReminders");
}

function runRsvpReminders() {
  callJob_("runRsvpReminders");
}

function runBizReminders() {
  callJob_("runBizReminders");
}

/** Creates the five time triggers, replacing any this script already has for them. Run it once after each push. */
function setupTriggers() {
  const every = { syncGithub: 5, sendDeliveries: 5, runReminders: 15 };
  const names = Object.keys(every).concat(["refreshEvents", "runRsvpReminders", "runBizReminders"]);
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return names.indexOf(t.getHandlerFunction()) !== -1; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  Object.keys(every).forEach(function (name) {
    ScriptApp.newTrigger(name).timeBased().everyMinutes(every[name]).create();
  });
  ScriptApp.newTrigger("refreshEvents").timeBased().everyDays(1).atHour(4).create();
  ScriptApp.newTrigger("runRsvpReminders").timeBased().everyDays(1).atHour(8).create();
  ScriptApp.newTrigger("runBizReminders").timeBased().everyDays(1).atHour(8).create();
  console.log("Triggers: " + ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); }).join(", "));
}

function callJob_(job) {
  const props = PropertiesService.getScriptProperties();
  const secret = props.getProperty("OPS_TIMER_SECRET");
  if (!secret) throw new Error("Set the Script Property OPS_TIMER_SECRET first.");
  const site = props.getProperty("SITE_ADDRESS") || "https://www.team6220.org";
  const res = UrlFetchApp.fetch(site + "/api/ops-timer", {
    method: "post",
    contentType: "application/json",
    headers: { "x-timer-secret": secret },
    payload: JSON.stringify({ job: job }),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  console.log(job + ": " + code + " " + res.getContentText().slice(0, 300));
  // A failure is thrown so Apps Script lists it under Executions and can email the owner.
  if (code !== 200) throw new Error(job + " answered " + code);
}
