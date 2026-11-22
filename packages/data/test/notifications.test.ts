// Notifications (ops/server/notify and inbox.ts): who hears about what, the inbox, Discord delivery with quiet hours,
// reminders, and linking a Discord account both ways (/link code from Apollo, and "Link with Discord").
import { beforeEach, describe, expect, it } from "vitest";
import { handleDiscordLinkCallback, handleDiscordLinkStart } from "../src/ops/server";
import { isQuiet } from "../src/ops/server/notify/outbox";
import { waysFor, type NotificationKind } from "../src/notifications/catalog";
import { APOLLO_KEY, makeOps, TIMER_SECRET } from "./helpers/ops-server";

const lead = "tok-lead-0123456789abcdef";
const member = "tok-member-0123456789abcdef";
const other = "tok-other-0123456789abcdef";
const admin = "tok-admin-0123456789abcdef";
const newbie = "tok-newbie-0123456789abcdef";
const NOON = new Date("2027-01-12T20:00:00Z"); // 12:00 in Los Angeles
const NIGHT = new Date("2027-01-13T07:00:00Z"); // 23:00 in Los Angeles
const MORNING = new Date("2027-01-13T16:00:00Z"); // 08:00 in Los Angeles

function team() {
  const s = makeOps({
    [lead]: { id: "m-lead", status: "APPROVED", badges: ["b-team", "b-lead"] },
    [member]: { id: "m-member", status: "APPROVED", badges: ["b-team"] },
    [other]: { id: "m-other", status: "APPROVED", badges: ["b-team"] },
    [admin]: { id: "m-admin", status: "APPROVED", badges: ["b-webadmin"] },
    [newbie]: { id: "m-new", status: "PENDING", badges: [] },
  });
  s.rows("ops_people").push(
    { _id: "p1", memberId: "m-lead", name: "Lee Lead", username: "lee", active: true },
    { _id: "p2", memberId: "m-member", name: "Max Member", username: "max", discordId: "111111111111111111", discordName: "max", active: true },
    { _id: "p3", memberId: "m-other", name: "Oli Other", username: "oli", discordId: "222222222222222222", discordName: "oli", active: true },
    { _id: "p4", memberId: "m-admin", name: "Ada Admin", username: "ada", discordId: "333333333333333333", discordName: "ada", active: true },
  );
  s.setNow(NOON);
  return s;
}

const inboxOf = (s: ReturnType<typeof team>, memberId: string) => s.rows("ops_notifications").filter((n) => n.recipientId === memberId);

describe("who hears about a change", () => {
  let s: ReturnType<typeof team>;
  beforeEach(() => {
    s = team();
  });

  it("tells the people added to a task, by inbox and Discord, but not the person who added them", async () => {
    await s.post({ action: "saveRecord", token: lead, collection: "icarus_tasks", item: { number: "7", title: "CAD the arm", ownerIds: ["m-lead", "m-member"], status: "not-started", dueDate: "2027-01-20" } });
    expect(inboxOf(s, "m-member")).toMatchObject([{ kind: "task.assigned", title: "You were added to t7 CAD the arm", discord: "sent" }]);
    expect(inboxOf(s, "m-lead")).toEqual([]);
    expect(s.discord.sent).toHaveLength(1);
    expect(s.discord.sent[0].content).toContain("https://www.team6220.org/apps/icarus?task=");
  });

  it("keeps it in the inbox only for someone without Discord linked", async () => {
    await s.post({ action: "saveRecord", token: member, collection: "icarus_tasks", item: { number: "8", title: "Wire it", ownerIds: ["m-lead"], status: "not-started" } });
    expect(inboxOf(s, "m-lead")).toMatchObject([{ discord: "no-link" }]);
    expect(s.discord.sent).toEqual([]);
  });

  it("sends a mention to the person mentioned and a comment note to the rest of the task, never both", async () => {
    await s.post({ action: "saveRecord", token: lead, collection: "icarus_tasks", item: { _id: "task-1", number: "9", title: "Intake", ownerIds: ["m-member", "m-other"], status: "in-progress" } });
    s.rows("ops_notifications").length = 0;
    await s.post({ action: "saveRecord", token: lead, collection: "icarus_comments", item: { taskId: "task-1", authorId: "m-lead", authorName: "Lee Lead", body: "@oli can you check the rollers?", at: "x" } });
    expect(inboxOf(s, "m-other")).toMatchObject([{ kind: "task.mentioned" }]);
    expect(inboxOf(s, "m-member")).toMatchObject([{ kind: "task.comment", title: "Lee Lead commented on t9 Intake" }]);
  });

  it("tells the people waiting on a task when it's done", async () => {
    s.rows("icarus_tasks").push({ _id: "a", number: "1", title: "Frame", ownerIds: ["m-lead"], status: "in-progress" }, { _id: "b", number: "2", title: "Paint", ownerIds: ["m-member"], status: "not-started", blockedBy: ["a"] });
    await s.post({ action: "saveRecord", token: lead, collection: "icarus_tasks", item: { _id: "a", number: "1", title: "Frame", ownerIds: ["m-lead"], status: "done" } });
    expect(inboxOf(s, "m-member")).toMatchObject([{ kind: "task.unblocked", title: "t1 Frame is done" }]);
  });

  it("tells the designer a part is being made", async () => {
    s.rows("production_parts").push({ _id: "part-1", partName: "Gusset", designerId: "m-member", status: "ready", work: [] });
    await s.post({ action: "saveRecord", token: other, collection: "production_parts", item: { _id: "part-1", partName: "Gusset", designerId: "m-member", status: "in-progress", work: [] } });
    expect(inboxOf(s, "m-member")).toMatchObject([{ kind: "part.progress", title: "Your part Gusset is being made" }]);
  });

  it("tells the Web Admins when someone signs up and waits for approval", async () => {
    await s.post({ action: "finishProfile", token: newbie, form: { role: "mentor", firstName: "Mo", lastName: "Mentor" } });
    expect(inboxOf(s, "m-admin")).toMatchObject([{ kind: "account.newMember", title: "Mo Mentor is waiting for approval" }]);
  });
});

describe("settings, quiet hours and Discord delivery", () => {
  let s: ReturnType<typeof team>;
  beforeEach(() => {
    s = team();
  });
  const addToTask = (n: string) => s.post({ action: "saveRecord", token: lead, collection: "icarus_tasks", item: { number: n, title: `Task ${n}`, ownerIds: ["m-member"], status: "not-started" } });

  it("respects a kind turned off for Discord (still in the inbox)", async () => {
    const prefs = { ways: { "task.assigned": { discord: false, push: false } }, quietHours: { on: true, from: "22:00", to: "07:00" } };
    expect((await s.post({ action: "saveNotificationPrefs", token: member, prefs })).ok).toBe(true);
    await addToTask("1");
    expect(inboxOf(s, "m-member")).toMatchObject([{ discord: "off" }]);
    expect(s.discord.sent).toEqual([]);
  });

  it("holds messages in quiet hours and sends them as one message in the morning", async () => {
    s.setNow(NIGHT);
    await addToTask("1");
    await addToTask("2");
    expect(inboxOf(s, "m-member").map((n) => n.discord)).toEqual(["held", "held"]);
    expect((await s.job("sendDeliveries")).body).toMatchObject({ ok: true, bundled: 0 });
    s.setNow(MORNING);
    expect((await s.job("sendDeliveries")).body).toMatchObject({ ok: true, bundled: 1 });
    expect(s.discord.sent).toHaveLength(1);
    expect(s.discord.sent[0].content).toContain("While you were away (2)");
    expect(inboxOf(s, "m-member").map((n) => n.discord)).toEqual(["sent", "sent"]);
  });

  it("gives up on closed DMs, and retries later when Discord is down", async () => {
    s.discord.closed.add("111111111111111111");
    await addToTask("1");
    expect(inboxOf(s, "m-member")).toMatchObject([{ discord: "failed" }]);
    s.discord.closed.clear();
    s.rows("ops_people").find((p) => p.memberId === "m-member")!.discordDmChannelId = "";
    s.discord.down = true;
    await addToTask("2");
    expect(inboxOf(s, "m-member")[1]).toMatchObject({ discord: "pending", discordTries: 1 });
    s.discord.down = false;
    await s.job("sendDeliveries");
    expect(inboxOf(s, "m-member")[1]).toMatchObject({ discord: "sent" });
  });

  it("opens a DM channel once and keeps it", async () => {
    await addToTask("1");
    await addToTask("2");
    expect(s.discord.dmsOpened).toEqual(["111111111111111111"]);
  });

  it("works out quiet hours across midnight, in team time", () => {
    expect(isQuiet(NIGHT, undefined)).toBe(true);
    expect(isQuiet(NOON, undefined)).toBe(false);
    expect(isQuiet(NIGHT, { quietHours: { on: false, from: "22:00", to: "07:00" } })).toBe(false);
  });

  it("keeps one way on for a ★ kind", () => {
    const kind: NotificationKind = { id: "x", app: "Icarus", label: "x", who: "x", discord: true, push: true, mandatory: true };
    expect(waysFor(kind, { ways: { x: { discord: false, push: false } } })).toEqual({ discord: true, push: false });
  });
});

describe("the inbox", () => {
  let s: ReturnType<typeof team>;
  beforeEach(async () => {
    s = team();
    await s.post({ action: "saveRecord", token: lead, collection: "icarus_tasks", item: { number: "1", title: "A", ownerIds: ["m-member", "m-other"], status: "not-started" } });
  });

  it("shows only your own notifications, newest first, and marks them read", async () => {
    const mine = await s.post({ action: "myInbox", token: member });
    expect(mine).toMatchObject({ ok: true, unread: 1 });
    expect(mine.items[0]).toMatchObject({ kind: "task.assigned", readAt: "" });
    expect((await s.post({ action: "markRead", token: member, ids: [mine.items[0]._id] })).marked).toBe(1);
    expect((await s.post({ action: "myInbox", token: member })).unread).toBe(0);
    // Marking someone else's does nothing.
    const theirs = inboxOf(s, "m-other")[0];
    expect((await s.post({ action: "markRead", token: member, ids: [theirs._id] })).marked).toBe(0);
  });
});

describe("timed reminders", () => {
  it("reminds people of a task due tomorrow, once", async () => {
    const s = team();
    s.rows("icarus_tasks").push({ _id: "t", number: "4", title: "Bumpers", ownerIds: ["m-member"], status: "in-progress", dueDate: "2027-01-13" });
    expect((await s.job("runReminders")).body).toMatchObject({ ok: true, reminders: 1 });
    expect((await s.job("runReminders")).body).toMatchObject({ ok: true, reminders: 0 });
    expect(inboxOf(s, "m-member")).toMatchObject([{ kind: "task.due", title: "t4 Bumpers is due tomorrow" }]);
  });

  it("refuses a timer call without the secret", async () => {
    const s = team();
    expect((await s.job("runReminders", "wrong-secret-wrong-secret")).status).toBe(401);
    expect(TIMER_SECRET.length).toBeGreaterThan(19);
  });
});

describe("linking Discord", () => {
  let s: ReturnType<typeof team>;
  beforeEach(() => {
    s = team();
  });

  it("links with a /link code sent by Apollo", async () => {
    const { code } = await s.post({ action: "startDiscordLink", token: lead });
    expect(code).toMatch(/^\d{6}$/);
    expect(s.rows("ops_link_codes")[0].hash).not.toContain(code);
    const answer = await s.post({ action: "linkDiscordCode", apiKey: APOLLO_KEY, code, discordId: "777777777777777777", discordName: "lee.d" });
    expect(answer).toMatchObject({ ok: true, name: "Lee Lead" });
    expect(s.rows("ops_people").find((p) => p.memberId === "m-lead")).toMatchObject({ discordId: "777777777777777777", discordName: "lee.d" });
    expect(inboxOf(s, "m-lead")).toMatchObject([{ kind: "account.changed", title: "Discord linked: @lee.d" }]);
    // A code works once.
    expect((await s.post({ action: "linkDiscordCode", apiKey: APOLLO_KEY, code, discordId: "777777777777777777", discordName: "x" })).error).toBe("bad-request");
  });

  it("refuses an expired code, and refuses people calling linkDiscordCode themselves", async () => {
    const { code } = await s.post({ action: "startDiscordLink", token: lead });
    expect((await s.post({ action: "linkDiscordCode", token: member, code, discordId: "888888888888888888", discordName: "x" })).error).toBe("forbidden");
    s.setNow(new Date(NOON.getTime() + 11 * 60_000));
    expect((await s.post({ action: "linkDiscordCode", apiKey: APOLLO_KEY, code, discordId: "888888888888888888", discordName: "x" })).error).toBe("bad-request");
  });

  it("moves a Discord account that was linked to someone else", async () => {
    const { code } = await s.post({ action: "startDiscordLink", token: lead });
    await s.post({ action: "linkDiscordCode", apiKey: APOLLO_KEY, code, discordId: "111111111111111111", discordName: "max" });
    expect(s.rows("ops_people").find((p) => p.memberId === "m-member")!.discordId).toBe("");
  });

  it("links with Discord's sign-in, only for the member who started it", async () => {
    const start = await s.get("/api/discord-link", lead, handleDiscordLinkStart);
    expect(start.status).toBe(302);
    const to = new URL(start.headers.get("location")!);
    expect(to.origin + to.pathname).toBe("https://discord.com/oauth2/authorize");
    expect(to.searchParams.get("scope")).toBe("identify");
    const state = to.searchParams.get("state")!;
    // Someone else can't finish it.
    const stolen = await s.get(`/api/discord-link/callback?code=good-code&state=${state}`, member, handleDiscordLinkCallback);
    expect(stolen.headers.get("location")).toContain("discord=failed");
    const done = await s.get(`/api/discord-link/callback?code=good-code&state=${state}`, lead, handleDiscordLinkCallback);
    expect(done.headers.get("location")).toBe("https://www.team6220.org/apps/account?discord=linked#notifications");
    expect(s.rows("ops_people").find((p) => p.memberId === "m-lead")).toMatchObject({ discordId: "555000111", discordName: "pat.discord" });
  });

  it("unlinks", async () => {
    await s.post({ action: "unlinkDiscord", token: member });
    expect(s.rows("ops_people").find((p) => p.memberId === "m-member")!.discordId).toBe("");
  });
});
