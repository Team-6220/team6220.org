// Home: what needs you, your inbox, your pins, and today at a glance. Each part reads the app it comes from; if one can't be
// loaded it is left out rather than breaking Home.
import { useEffect, useState } from "react";
import { bom, calendar, icarus, ops, production, type CalendarData, type Me, type Task, type Part } from "@team6220/data";
import { Cards, DataTable, Note, PageHeader, Pill, Screen, Section, type CardItem, type Tone } from "@team6220/ui";
import type { DashView } from "./Dashboard";
import { Inbox } from "./Inbox";
import { Pins } from "./Pins";

interface Need { id: string; what: string; app: string; status: string; tone: Tone; href: string }
interface Today { tasks: Task[] | null; openTasks: number; parts: Part[] | null; meetings: Card[]; supervision: Supervision | null }
type Card = Pick<CardItem, "key" | "title" | "pill" | "href" | "lines">;
/** What a supervisor has done this school year, and how far that is from the goal. */
interface Supervision { shifts: number; hours: number }
const NONE: Today = { tasks: null, openTasks: 0, parts: null, meetings: [], supervision: null };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The Calendar's part of Home: today's meetings, shifts nobody has taken, and a supervisor's hours so far. */
function fromCalendar(data: CalendarData, me: Me, now: string): { needs: Need[]; meetings: Card[]; supervision: Supervision | null } {
  const mine = calendar.supervisorFor(data.supervisors, me.id);
  const approved = mine?.status === "approved";
  const needs: Need[] = [];
  if (approved) {
    const soon = calendar.addDays(now, 13);
    const open = data.shifts.filter((s) => !s.name && !s.memberId).map((s) => ({ shift: s, event: data.events.find((e) => e._id === s.eventId) }))
      .filter((x) => x.event && x.event.startDate >= now && x.event.startDate <= soon).sort((a, b) => a.event!.startDate.localeCompare(b.event!.startDate) || a.shift.start.localeCompare(b.shift.start));
    if (open.length === 1) needs.push({ id: "open-shift", what: `${calendar.longDay(open[0].event!.startDate).split(",")[0]} ${calendar.compactRange(open[0].shift.start, open[0].shift.end)} has no supervisor`, app: "Calendar", status: "Open shift", tone: "warn", href: "/apps/calendar/open" });
    else if (open.length > 1) needs.push({ id: "open-shift", what: `${open.length} supervision shifts in the next two weeks have no supervisor`, app: "Calendar", status: "Open shifts", tone: "warn", href: "/apps/calendar/open" });
  }
  const meetings = calendar.eventsOn(data.events, now).filter((e) => e.type === "meeting" && calendar.isForMe(e, me)).map((e): Card => {
    const names = calendar.shiftsOf(data.shifts, e._id).map((s) => s.name).filter(Boolean).map((n) => n.replace(/^(\S+) (\S).*$/, "$1 $2."));
    const where = [e.location, names.length ? `supervisors ${names.join(" and ")}` : ""].filter(Boolean).join(" · ");
    return { key: `meeting-${e._id}`, title: calendar.titleOf(e), pill: { label: calendar.timeRange(e.startTime, e.endTime), tone: "calm" }, href: "/apps/calendar", lines: [where || "No supervisors yet"] };
  });
  const year = calendar.schoolYear(now);
  const events = data.events.filter((e) => e.startDate >= `${year[0]}-01` && e.startDate <= `${year[11]}-31`);
  const supervision = mine && approved ? calendar.supervised(mine, data.shifts, events, now) : null;
  return { needs, meetings, supervision };
}

async function load(): Promise<{ needs: Need[]; today: Today }> {
  const viewer = await ops.getViewer();
  if (viewer.kind !== "member") return { needs: [], today: NONE };
  const me = viewer.me;
  // Each app is asked on its own, so one that fails doesn't hide the others.
  const [tasks, lines, parts, cal] = await Promise.all([
    icarus.needsMe(me, icarus.today()).catch(() => null),
    bom.needsMe(me).catch(() => null),
    production.needsMe(me).catch(() => null),
    calendar.load().then((d) => fromCalendar(d, me, calendar.today()), () => null),
  ]);
  const needs: Need[] = [];
  if (me.roles.team && me.subteams.length === 0) needs.push({ id: "subteams", what: "Pick your subteams so the right meetings and tasks show up for you", app: "Account", status: "Pick", tone: "warn", href: "/apps/account" });
  if (lines?.toSign) needs.push({ id: "sign", what: `${plural(lines.toSign, "BOM line is", "BOM lines are")} waiting for your signature`, app: "BOM", status: "Sign", tone: "warn", href: "/apps/bom" });
  (tasks?.tasks ?? []).filter((t) => t.dueDate && t.dueDate < icarus.today()).forEach((t) =>
    needs.push({ id: "task-" + t._id, what: `${t.number} ${t.title} was due ${shortDate(t.dueDate!)}`, app: "Icarus", status: "Overdue", tone: "bad", href: "/apps/icarus" }));
  if (me.roles.team && lines?.toReceive) needs.push({ id: "receive", what: `${plural(lines.toReceive, "ordered item hasn't", "ordered items haven't")} been received yet`, app: "BOM", status: "Receive", tone: "warn", href: "/apps/bom" });
  if (me.roles.team && parts?.pendingSetup) needs.push({ id: "setup", what: `${plural(parts.pendingSetup, "Shapeoko part is", "Shapeoko parts are")} waiting for setup`, app: "Production", status: "Set up", tone: "warn", href: "/apps/production" });
  needs.push(...(cal?.needs ?? []));
  return { needs, today: { tasks: tasks?.tasks ?? null, openTasks: tasks?.open ?? 0, parts: parts?.unclaimed ?? null, meetings: cal?.meetings ?? [], supervision: cal?.supervision ?? null } };
}

function shortDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** A supervisor's hours this school year against the team's goal. */
function SupervisionProgress({ done }: { done: Supervision }) {
  const goal = calendar.SUPERVISION_GOAL_HOURS;
  const left = Math.max(0, goal - done.hours);
  return (
    <Section title="Your supervision this season">
      <Note tone={left ? undefined : "ok"}>
        <strong>{done.shifts} {done.shifts === 1 ? "shift" : "shifts"} / {done.hours} {done.hours === 1 ? "hour" : "hours"}</strong>
        {left ? ` · ${left} ${left === 1 ? "hour" : "hours"} to go. The goal is ${goal} hours of supervising per supervisor.` : ` · Goal reached. Thank you! You have passed the ${goal} hour goal.`}
      </Note>
    </Section>
  );
}

export function Home({ view }: { view: Extract<DashView, { kind: "approved" | "guest" }> }) {
  const [data, setData] = useState<{ needs: Need[]; today: Today } | null>(null);
  useEffect(() => {
    if (view.kind !== "approved") return;
    load().then(setData, () => setData({ needs: [], today: NONE }));
  }, [view.kind]);

  const first = view.member.name.split(" ")[0] || view.member.name;
  const date = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const needs = data?.needs ?? [];
  const cards: CardItem[] = [...(data?.today.meetings ?? [])];
  if (data?.today.tasks) {
    const t = data.today.tasks;
    cards.push({
      key: "tasks", title: "Your tasks", pill: { label: `${data.today.openTasks} open`, tone: "blue" }, href: "/apps/icarus",
      lines: t.length ? t.slice(0, 2).map((x) => `${x.number} ${x.title}${x.dueDate ? ` · due ${shortDate(x.dueDate)}` : ""}`) : ["Nothing assigned to you right now."],
    });
  }
  if (data?.today.parts) {
    const p = data.today.parts;
    cards.push({
      key: "parts", title: "Parts to make", pill: { label: `${p.length} unclaimed`, tone: "calm" }, href: "/apps/production",
      lines: p.length ? p.slice(0, 2).map((x) => x.partName) : ["Every part has someone on it."],
    });
  }

  return (
    <Screen>
      <PageHeader title={`Hi, ${first}`} sub={date} />
      {view.kind === "approved" && needs.length > 0 && (
        <Section title={`Needs you · ${needs.length}`}>
          <DataTable<Need>
            columns={[
              { key: "what", label: "What", width: "minmax(0, 3fr)", wrap: true, render: (n) => <a className="k-link" style={{ color: "inherit" }} href={n.href}>{n.what}</a> },
              { key: "app", label: "App", width: "120px", menu: ["text", "group"] },
              { key: "status", label: "", width: "140px", render: (n) => <Pill tone={n.tone}>{n.status}</Pill> },
            ]}
            rows={needs}
            rowKey={(n) => n.id}
            statusKey="status"
            onRowClick={(n) => location.assign(n.href)}
          />
        </Section>
      )}
      {view.kind === "approved" && <Inbox />}
      {data?.today.supervision && <SupervisionProgress done={data.today.supervision} />}
      <Pins />
      {cards.length > 0 && <Section title="Today"><Cards items={cards} /></Section>}
    </Screen>
  );
}
