// The public calendar (anyone, signed in or not), the .ics feed and the .ics files.
import { describe, expect, it } from "vitest";
import { eventItems, googleLink, icsText, shiftItems } from "../src/calendar/ics";
import { eventLinks } from "../src/calendar/links";
import type { CalEvent, Shift } from "../src/calendar/types";
import { handleCalendarFeed } from "../src/ops/server";
import { makeOps } from "./helpers/ops-server";

const lead = "tok-lead-0123456789abcdef";
const event = (over: Partial<CalEvent>): CalEvent => ({
  _id: "e1", type: "meeting", title: "", startDate: "2026-11-21", endDate: "2026-11-21", startTime: "10:00", endTime: "14:00",
  location: "Workshop", notes: "", mandatory: false, subteams: [], public: true, cancelled: false, ...over,
});

function team() {
  const s = makeOps({ [lead]: { id: "m-lead", status: "APPROVED", badges: ["b-team", "b-lead"] } });
  s.rows("cal_events").push(
    event({ _id: "pub", notes: "Door code 1234", subteams: ["Design"] }),
    event({ _id: "private", title: "Parent meeting", public: false }),
    event({ _id: "gone", cancelled: true }),
    event({ _id: "part", type: "part", title: "Fall" }),
    event({ _id: "comp", type: "competition", title: "Beach Blitz", startDate: "2026-10-31", endDate: "2026-11-01", setupDate: "2026-10-30", startTime: "07:45", endTime: "18:00" }),
  );
  s.rows("cal_shifts").push({ _id: "shift", eventId: "pub", start: "10:00", end: "12:00", memberId: "m-lead", name: "Lee Lead", signedUpAt: "" });
  return s;
}

describe("the public calendar", () => {
  it("is open to someone who isn't signed in, and shows only public events", async () => {
    const answer = await team().post({ action: "publicCalendar" });
    expect(answer.ok).toBe(true);
    expect(answer.events.map((e: CalEvent) => e._id).sort()).toEqual(["comp", "pub"]);
  });

  it("leaves out notes, subteams and shifts", async () => {
    const answer = await team().post({ action: "publicCalendar" });
    const pub = answer.events.find((e: CalEvent) => e._id === "pub");
    expect(pub).toMatchObject({ notes: "", subteams: [], startTime: "10:00", location: "Workshop" });
    expect(JSON.stringify(answer)).not.toMatch(/Door code|Lee Lead|shift/);
  });

  it("does not open anything else to someone who isn't signed in", async () => {
    const s = team();
    expect((await s.post({ action: "listRecords", collection: "cal_events" })).error).toBe("signed-out");
    expect((await s.post({ action: "saveCalEvent", event: { type: "event", startDate: "2026-12-01" } })).error).toBe("signed-out");
  });
});

describe("the calendar feed", () => {
  it("is an .ics file of the public calendar", async () => {
    const s = team();
    const res = await s.get("/api/calendar.ics", undefined, (request, deps) => handleCalendarFeed(request, { env: deps.env }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    const text = await res.text();
    expect(text).toContain("BEGIN:VCALENDAR");
    expect(text).toContain("SUMMARY:Beach Blitz");
    expect(text).not.toMatch(/Parent meeting|Door code|Lee Lead/);
  });
});

describe(".ics files", () => {
  const now = new Date("2026-11-22T20:00:00Z");

  it("writes meetings in team time, and a competition's set-up day", () => {
    const text = icsText(eventItems([event({ _id: "m", mandatory: true }), event({ _id: "c", type: "competition", title: "Beach Blitz", startDate: "2026-10-31", endDate: "2026-11-01", setupDate: "2026-10-30", startTime: "07:45", endTime: "18:00" })]), "Team 6220", now);
    expect(text).toContain("DTSTART;TZID=America/Los_Angeles:20261121T100000");
    expect(text).toContain("DTEND;TZID=America/Los_Angeles:20261121T140000");
    expect(text).toContain("SUMMARY:★ Team meeting");
    // A competition over several days is all-day days (ending the day after its last), with its daily times in the description.
    expect(text).toContain("Each day 7:45–6:00.");
    expect(text).toContain("DTSTART;VALUE=DATE:20261031");
    expect(text).toContain("DTEND;VALUE=DATE:20261102");
    expect(text).toContain("SUMMARY:Beach Blitz set-up");
    expect(text).toContain("BEGIN:VTIMEZONE");
    expect(text).toContain("The schedule is subject to change.");
    expect(text.endsWith("\r\n")).toBe(true);
  });

  it("escapes text and folds long lines", () => {
    const text = icsText(eventItems([event({ title: "Kickoff, with; pizza", notes: "x".repeat(200) })]), "Team 6220", now);
    expect(text).toContain("SUMMARY:Kickoff\\, with\; pizza");
    expect(text.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
  });

  it("leaves out removed events and season parts", () => {
    expect(eventItems([event({ cancelled: true }), event({ type: "part" })])).toEqual([]);
  });

  it("makes a shift an item on its meeting's day", () => {
    const shift: Shift = { _id: "s1", eventId: "e1", start: "12:00", end: "14:00", memberId: "m", name: "Pat", signedUpAt: "" };
    const [item] = shiftItems([shift], [event({})]);
    expect(item).toMatchObject({ id: "s1", startDate: "2026-11-21", startTime: "12:00", endTime: "14:00" });
    expect(item.title).toBe("Supervise Team meeting 12:00–2:00");
    expect(shiftItems([shift], [])).toEqual([]);
  });

  it("links one item into Google Calendar", () => {
    const link = new URL(googleLink({ id: "x", title: "Team meeting", startDate: "2026-11-21", endDate: "2026-11-21", startTime: "10:00", endTime: "14:00", location: "Workshop" }));
    expect(link.origin + link.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(link.searchParams.get("dates")).toBe("20261121T100000/20261121T140000");
    expect(link.searchParams.get("ctz")).toBe("America/Los_Angeles");
  });
});

describe("competition links", () => {
  const saved = [{ _id: "x", code: "2027casd", displayName: "SD", officialName: "San Diego Regional", startDate: "2027-03-04", endDate: "2027-03-07", location: "", source: "tba" as const }];
  it("uses the event Icarus saved for the same days", () => {
    expect(eventLinks({ startDate: "2027-03-04", endDate: "2027-03-07" }, saved)).toMatchObject({ code: "2027casd", tba: "https://www.thebluealliance.com/event/2027casd", first: "https://frc-events.firstinspires.org/2027/casd" });
  });
  it("falls back to The Blue Alliance's list", () => {
    expect(eventLinks({ startDate: "2027-04-01", endDate: "2027-04-02" }, saved)).toMatchObject({ code: "", tba: "https://www.thebluealliance.com/events" });
  });
});
