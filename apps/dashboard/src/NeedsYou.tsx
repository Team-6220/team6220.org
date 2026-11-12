// "Needs you": what is waiting for this person in Icarus, BOM and Production, with a link to each.
// It is extra: if any of it can't be loaded (an app isn't set up yet, the network is down), it shows nothing
// instead of an error, so the dashboard itself always works.
import { useEffect, useState } from "react";
import { bom, icarus, ops, production } from "@team6220/data";

interface Row {
  text: string;
  href: string;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

async function loadRows(): Promise<Row[]> {
  // On demo data the counts would be made up, and this is the real dashboard: show nothing.
  if (ops.isDemo()) return [];
  const viewer = await ops.getViewer();
  if (viewer.kind !== "member") return [];
  const me = viewer.me;
  // Each app is asked separately, so one that fails doesn't hide the others.
  const [tasks, lines, parts] = await Promise.all([
    icarus.needsMe(me, icarus.today()).catch(() => null),
    bom.needsMe(me).catch(() => null),
    production.needsMe(me).catch(() => null),
  ]);
  const rows: Row[] = [];
  if (tasks?.open) {
    const overdue = tasks.overdue ? `, ${tasks.overdue} overdue` : "";
    rows.push({ text: `${plural(tasks.open, "task is", "tasks are")} assigned to you${overdue}`, href: "/apps/icarus" });
  }
  if (me.roles.team && me.subteams.length === 0) rows.push({ text: "Pick your subteams", href: "/apps/icarus" });
  if (lines?.toSign) rows.push({ text: `${plural(lines.toSign, "BOM line is", "BOM lines are")} waiting for your signature`, href: "/apps/bom" });
  if (me.roles.team && lines?.toReceive) rows.push({ text: `${plural(lines.toReceive, "ordered item hasn't", "ordered items haven't")} been received yet`, href: "/apps/bom" });
  if (parts?.claimed) rows.push({ text: `You have claimed ${plural(parts.claimed, "part", "parts")} in Production`, href: "/apps/production" });
  if (me.roles.team && parts?.pendingSetup) rows.push({ text: `${plural(parts.pendingSetup, "Shapeoko part is", "Shapeoko parts are")} waiting for setup`, href: "/apps/production" });
  return rows;
}

export function NeedsYou() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    loadRows().then(setRows, () => setRows([]));
  }, []);
  if (!rows.length) return null;
  return (
    <section className="t-panel dash__needs" aria-label="Needs you">
      <h2>Needs you</h2>
      <ul>
        {rows.map((row) => (
          <li key={row.text}>
            <a href={row.href}>{row.text}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}
