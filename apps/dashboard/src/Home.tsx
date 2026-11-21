// Home: what needs you, your pins, and today at a glance. Each part reads the app it comes from; if one can't be
// loaded it is left out rather than breaking Home.
import { useEffect, useState } from "react";
import { bom, icarus, ops, production, type Task, type Part } from "@team6220/data";
import { Cards, DataTable, PageHeader, Pill, Screen, Section, type CardItem, type Tone } from "@team6220/ui";
import type { DashView } from "./Dashboard";
import { Pins } from "./Pins";

interface Need { id: string; what: string; app: string; status: string; tone: Tone; href: string }
interface Today { tasks: Task[] | null; openTasks: number; parts: Part[] | null }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

async function load(): Promise<{ needs: Need[]; today: Today }> {
  const viewer = await ops.getViewer();
  if (viewer.kind !== "member") return { needs: [], today: { tasks: null, openTasks: 0, parts: null } };
  const me = viewer.me;
  // Each app is asked on its own, so one that fails doesn't hide the others.
  const [tasks, lines, parts] = await Promise.all([
    icarus.needsMe(me, icarus.today()).catch(() => null),
    bom.needsMe(me).catch(() => null),
    production.needsMe(me).catch(() => null),
  ]);
  const needs: Need[] = [];
  if (me.roles.team && me.subteams.length === 0) needs.push({ id: "subteams", what: "Pick your subteams so the right meetings and tasks show up for you", app: "Account", status: "Pick", tone: "warn", href: "/apps/account" });
  if (lines?.toSign) needs.push({ id: "sign", what: `${plural(lines.toSign, "BOM line is", "BOM lines are")} waiting for your signature`, app: "BOM", status: "Sign", tone: "warn", href: "/apps/bom" });
  (tasks?.tasks ?? []).filter((t) => t.dueDate && t.dueDate < icarus.today()).forEach((t) =>
    needs.push({ id: "task-" + t._id, what: `${t.number} ${t.title} was due ${shortDate(t.dueDate!)}`, app: "Icarus", status: "Overdue", tone: "bad", href: "/apps/icarus" }));
  if (me.roles.team && lines?.toReceive) needs.push({ id: "receive", what: `${plural(lines.toReceive, "ordered item hasn't", "ordered items haven't")} been received yet`, app: "BOM", status: "Receive", tone: "warn", href: "/apps/bom" });
  if (me.roles.team && parts?.pendingSetup) needs.push({ id: "setup", what: `${plural(parts.pendingSetup, "Shapeoko part is", "Shapeoko parts are")} waiting for setup`, app: "Production", status: "Set up", tone: "warn", href: "/apps/production" });
  return { needs, today: { tasks: tasks?.tasks ?? null, openTasks: tasks?.open ?? 0, parts: parts?.unclaimed ?? null } };
}

function shortDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function Home({ view }: { view: Extract<DashView, { kind: "approved" | "guest" }> }) {
  const [data, setData] = useState<{ needs: Need[]; today: Today } | null>(null);
  useEffect(() => {
    if (view.kind !== "approved") return;
    load().then(setData, () => setData({ needs: [], today: { tasks: null, openTasks: 0, parts: null } }));
  }, [view.kind]);

  const first = view.member.name.split(" ")[0] || view.member.name;
  const date = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const needs = data?.needs ?? [];
  const cards: CardItem[] = [];
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
      <Pins />
      {cards.length > 0 && <Section title="Today"><Cards items={cards} /></Section>}
    </Screen>
  );
}
