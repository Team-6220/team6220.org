// Competition events from The Blue Alliance, for Icarus. SERVER ONLY.
// Ported from backend/apps-script/ops-api/Events.gs. The read key stays in the Wix secret TBA_KEY, never in the
// browser. Answers are cached for a day, and refreshEvents (run by the timer) keeps saved events' dates current.
//
// API: https://www.thebluealliance.com/apidocs/v3  (base https://www.thebluealliance.com/api/v3, header X-TBA-Auth-Key)
//   /event/{event_key}/simple                    one event: key, name, event_code, city, state_prov, start_date, end_date
//   /team/{team_key}/events/{year}/simple        every event a team is registered for that year
import { BLUE_ALLIANCE, text, type Ctx } from "./context";
import { apiError, type Doc } from "./env";
import { COLLECTION_EVENTS } from "./icarus";

const TBA_API = "https://www.thebluealliance.com/api/v3";
const DEFAULT_TEAM_NUMBER = "6220";
const EVENT_CACHE_SECONDS = 24 * 3600;

/** GET from The Blue Alliance. Returns the parsed answer, or null for "no such thing" (404). */
async function tbaGet(ctx: Ctx, path: string): Promise<any> {
  const hit = ctx.env.cache.get(`tba:${path}`);
  if (hit) return JSON.parse(hit);
  const key = await ctx.secret("TBA_KEY");
  if (!key) throw apiError("not-configured", "Looking up events isn't set up yet (TBA_KEY is missing). Type the event in by hand.");
  let res: Response;
  try {
    res = await ctx.env.fetch(TBA_API + path, { headers: { "X-TBA-Auth-Key": key } });
  } catch {
    throw apiError("wix-unavailable", "The Blue Alliance didn't answer. Try again later, or type the event in by hand.");
  }
  if (res.status === 404) return null;
  if (res.status !== 200) throw apiError("wix-unavailable", "The Blue Alliance didn't answer. Try again later, or type the event in by hand.");
  const body = await res.text();
  ctx.env.cache.put(`tba:${path}`, body, EVENT_CACHE_SECONDS);
  return JSON.parse(body);
}

/** A Blue Alliance event as Icarus stores it. */
function toTeamEvent(e: Doc) {
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
export async function lookupEvent(ctx: Ctx, body: Doc) {
  const code = text(body.code, "event code", 20).toLowerCase();
  if (!/^\d{4}[a-z0-9]+$/.test(code)) throw apiError("bad-request", "Event codes look like 2027casd: the year, then the event's short code.");
  const found = await tbaGet(ctx, `/event/${encodeURIComponent(code)}/simple`);
  if (!found) throw apiError("bad-request", `The Blue Alliance has no event called ${code}.`);
  return { event: toTeamEvent(found) };
}

/** { year } -> { events }. Every event the team is registered for that year, earliest first. */
export async function listTeamEvents(ctx: Ctx, body: Doc) {
  const year = Math.floor(Number(body.year));
  if (!(year >= 1992 && year <= 2100)) throw apiError("bad-request", "Choose a year.");
  const team = `frc${(await ctx.secret("TEAM_NUMBER")) || DEFAULT_TEAM_NUMBER}`;
  const found: Doc[] = (await tbaGet(ctx, `/team/${team}/events/${year}/simple`)) ?? [];
  return { events: found.map(toTeamEvent).sort((a, b) => (a.startDate < b.startDate ? -1 : 1)) };
}

/** How long after an event ends the timer keeps checking its dates. */
const KEEP_CHECKING_DAYS = 7;

/**
 * Run by the daily timer. Updates the official name and dates of every saved event that came from The Blue Alliance.
 * When dates change, the history line says so, so a lead can move the tasks that depend on them. It never moves tasks
 * itself. Events that ended more than a week ago are left alone, and each event costs one call, so a very long list
 * is finished over several runs (`left` says how many are still waiting).
 */
export async function refreshEvents(ctx: Ctx) {
  const as = ctx.as(BLUE_ALLIANCE);
  const cutoff = new Date(ctx.env.now().getTime() - KEEP_CHECKING_DAYS * 86_400_000).toISOString().slice(0, 10);
  const saved = (await ctx.data.query(COLLECTION_EVENTS, { source: "tba" })).filter((e) => !e.endDate || e.endDate >= cutoff);
  const changed: Doc[] = [];
  let checked = 0;
  for (const event of saved) {
    if (ctx.env.callsLeft() < 4) break; // leave room to save and write the history
    ctx.env.cache.remove(`tba:/event/${encodeURIComponent(event.code)}/simple`);
    checked++;
    const found = await tbaGet(ctx, `/event/${encodeURIComponent(event.code)}/simple`);
    if (!found) continue;
    const fresh = toTeamEvent(found);
    if (fresh.startDate === event.startDate && fresh.endDate === event.endDate && fresh.officialName === event.officialName) continue;
    // The team's own display name is kept.
    changed.push({ ...event, officialName: fresh.officialName, startDate: fresh.startDate, endDate: fresh.endDate });
    as.log({ kind: "event", id: String(event._id) }, "dates changed", `${event.displayName}: ${event.startDate} to ${fresh.startDate}`);
  }
  await ctx.data.saveMany(COLLECTION_EVENTS, changed);
  return { checked, changed: changed.length, left: saved.length - checked };
}
