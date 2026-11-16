/**
 * 6220 Ops Timer
 *
 * Wix hosting has no scheduler, so this tiny script is the clock: time triggers call the website's /api/ops-timer, which
 * does the work (docs/operations/SERVER.md). It holds one secret and no logic.
 *
 * Script Properties (Project Settings > Script Properties):
 *   OPS_TIMER_SECRET  required. The same value as the Wix secret OPS_TIMER_SECRET (20 or more random characters). SECRET.
 *   SITE_ADDRESS      optional. Defaults to https://www.team6220.org
 *
 * Triggers (Triggers > Add trigger), both time-driven:
 *   syncGithub     every 5 minutes   (sends task changes to GitHub; GitHub's own changes arrive at once by webhook)
 *   refreshEvents  once a day        (updates saved competition events' dates from The Blue Alliance)
 */

function syncGithub() {
  callJob_("syncGithub");
}

function refreshEvents() {
  callJob_("refreshEvents");
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
