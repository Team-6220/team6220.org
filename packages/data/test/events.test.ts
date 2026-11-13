// Looking events up on The Blue Alliance (ops-api Events.gs against a fake TBA), and the same actions in demo mode.
import { beforeEach, describe, expect, it } from "vitest";
import { icarus, ops } from "../src/index";
import { makeScript } from "./helpers/ops-api-script";

const member = "tok-member-0123456789abcdef";
const lead = "tok-lead-0123456789abcdef";

describe("ops-api: events from The Blue Alliance", () => {
  let s: ReturnType<typeof makeScript>;
  beforeEach(() => {
    s = makeScript({
      [member]: { id: "m-member", status: "APPROVED", badges: ["b-team"] },
      [lead]: { id: "m-lead", status: "APPROVED", badges: ["b-team", "b-lead"] },
    });
  });

  it("looks an event up by its code, with the key sent in the TBA header", () => {
    expect(s.post({ action: "lookupEvent", token: member, code: "2027CASD" })).toMatchObject({
      ok: true,
      event: { code: "2027casd", officialName: "San Diego Regional", startDate: "2027-03-04", endDate: "2027-03-07", location: "Del Mar, CA", source: "tba" },
    });
    expect(s.post({ action: "lookupEvent", token: member, code: "2027nope" })).toMatchObject({ ok: false, error: "bad-request" });
    expect(s.post({ action: "lookupEvent", token: member, code: "San Diego" })).toMatchObject({ ok: false, error: "bad-request" });
  });

  it("lists the team's events for a year, and remembers answers for a day", () => {
    const first = s.post({ action: "listTeamEvents", token: member, year: 2027 });
    expect(first.events.map((e: { code: string }) => e.code)).toEqual(["2027casd", "2027cala"]);
    s.post({ action: "listTeamEvents", token: member, year: 2027 });
    expect(s.tbaCalls.filter((u) => u.includes("/team/frc6220/events/2027"))).toHaveLength(1);
  });

  it("says plainly when the TBA key isn't set up", () => {
    s.props.delete("TBA_KEY");
    expect(s.post({ action: "lookupEvent", token: member, code: "2027casd" })).toMatchObject({ ok: false, error: "not-configured" });
  });

  it("refreshes saved events' dates every day, keeps the team's name for them, and logs the change", () => {
    const saved = s.post({
      action: "saveIcarusRecord", token: lead, kind: "event",
      record: { code: "2027casd", displayName: "San Diego", officialName: "San Diego Regional", startDate: "2027-03-04", endDate: "2027-03-07", location: "", source: "tba" },
    });
    expect(saved).toMatchObject({ ok: true });
    s.tbaEvents[0].start_date = "2027-03-11";
    s.tbaEvents[0].end_date = "2027-03-14";
    (s.context as unknown as { refreshEvents: () => void }).refreshEvents();
    expect(s.rows("icarus_events")[0]).toMatchObject({ displayName: "San Diego", startDate: "2027-03-11", endDate: "2027-03-14" });
    expect(s.rows("ops_history").at(-1)).toMatchObject({ action: "dates changed", actorName: "The Blue Alliance" });
  });
});

describe("events in demo mode", () => {
  beforeEach(() => ops.resetMock());

  it("looks up made-up events, so the screens can be tried without a key", async () => {
    expect(await icarus.lookupEvent("2027demosd")).toMatchObject({ displayName: "San Diego Regional (demo)", source: "tba" });
    await expect(icarus.lookupEvent("2027casd")).rejects.toThrow(/no event called/);
    expect((await icarus.teamEvents(2027)).map((e) => e.code)).toEqual(["2027demosd", "2027demola"]);
  });
});
