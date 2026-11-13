// Competition events from The Blue Alliance, for Icarus. The read key stays here (Script Property TBA_KEY), never in
// the browser. Answers are cached for a day, and refreshEvents (a daily time trigger) keeps saved events' dates current.
//
// API: https://www.thebluealliance.com/apidocs/v3  (base https://www.thebluealliance.com/api/v3, header X-TBA-Auth-Key)
//   /event/{event_key}/simple                    one event: key, name, event_code, city, state_prov, start_date, end_date
//   /team/{team_key}/events/{year}/simple        every event a team is registered for that year

const TBA_API = "https://www.thebluealliance.com/api/v3";
const DEFAULT_TEAM_NUMBER = "6220";
const EVENT_CACHE_SECONDS = 24 * 3600;

/** GET from The Blue Alliance. Returns the parsed answer, or null for "no such thing" (404). */
function tbaGet_(path) {
  const key = prop_("TBA_KEY");
  if (!key) throw apiError_("not-configured", "Looking up events isn't set up yet (TBA_KEY is missing). Type the event in by hand.");
  const cache = CacheService.getScriptCache();
  const hit = cache.get("tba:" + path);
  if (hit) return JSON.parse(hit);
  const res = UrlFetchApp.fetch(TBA_API + path, { method: "get", headers: { "X-TBA-Auth-Key": key }, muteHttpExceptions: true });
  const code = res.getResponseCode();
  if (code === 404) return null;
  if (code !== 200) throw apiError_("wix-unavailable", "The Blue Alliance didn't answer. Try again later, or type the event in by hand.");
  const text = res.getContentText();
  if (text.length < 90000) cache.put("tba:" + path, text, EVENT_CACHE_SECONDS); // the cache refuses bigger values
  return JSON.parse(text);
}

/** A Blue Alliance event as Icarus stores it. */
function toTeamEvent_(e) {
  return {
    code: e.key,
    officialName: e.name || "",
    displayName: e.name || e.key,
    startDate: e.start_date || "",
    endDate: e.end_date || e.start_date || "",
    location: [e.city, e.state_prov].filter(Boolean).join(", "),
    source: "tba",
  };
}

/** { code: "2027casd" } -> { event }. */
function lookupEvent_(body) {
  const code = text_(body.code, "event code", 20).toLowerCase();
  if (!/^\d{4}[a-z0-9]+$/.test(code)) throw apiError_("bad-request", "Event codes look like 2027casd: the year, then the event's short code.");
  const found = tbaGet_("/event/" + encodeURIComponent(code) + "/simple");
  if (!found) throw apiError_("bad-request", "The Blue Alliance has no event called " + code + ".");
  return { event: toTeamEvent_(found) };
}

/** { year } -> { events }. Every event the team is registered for that year, earliest first. */
function listTeamEvents_(body) {
  const year = Math.floor(Number(body.year));
  if (!(year >= 1992 && year <= 2100)) throw apiError_("bad-request", "Choose a year.");
  const team = "frc" + (prop_("TEAM_NUMBER") || DEFAULT_TEAM_NUMBER);
  const found = tbaGet_("/team/" + team + "/events/" + year + "/simple") || [];
  const events = found.map(toTeamEvent_).sort(function (a, b) { return a.startDate < b.startDate ? -1 : 1; });
  return { events: events };
}

/**
 * Run by a daily time trigger (Triggers > Add trigger > refreshEvents > Time-driven > Day timer). Updates the official
 * name and dates of every saved event that came from The Blue Alliance. When dates change, the history line says so,
 * so a lead can move the tasks that depend on them. It never moves tasks itself.
 */
function refreshEvents() {
  const saved = wixQuery_("icarus_events", { source: "tba" });
  let changed = 0;
  saved.forEach(function (event) {
    CacheService.getScriptCache().remove("tba:/event/" + encodeURIComponent(event.code) + "/simple");
    const found = tbaGet_("/event/" + encodeURIComponent(event.code) + "/simple");
    if (!found) return;
    const fresh = toTeamEvent_(found);
    if (fresh.startDate === event.startDate && fresh.endDate === event.endDate && fresh.officialName === event.officialName) return;
    // The team's own display name is kept.
    wixSave_("icarus_events", Object.assign({}, event, { officialName: fresh.officialName, startDate: fresh.startDate, endDate: fresh.endDate }));
    writeHistory_({ id: "tba", name: "The Blue Alliance", agent: true }, { kind: "event", id: event._id }, "dates changed",
      event.displayName + ": " + event.startDate + " to " + fresh.startDate);
    changed++;
  });
  console.log("refreshEvents: " + saved.length + " events checked, " + changed + " changed.");
}
