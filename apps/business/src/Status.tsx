// /apps/business/status: where every team member is with 1-2-3-100. Leads, Operations, mentors and boosters.
import { useEffect, useState } from "react";
import { business, calendar, type Me } from "@team6220/data";
import { Btn, DataTable, Note, PageHeader, Pill, Screen, Stats, Tabs, type Column, type Tone } from "@team6220/ui";
import { ErrorNote, shortDate } from "./student";

type Tab = "all" | business.StatusRow["standing"];
const LABEL: Record<business.StatusRow["standing"], string> = { done: "Done", waiting: "Waiting on Operations", inProgress: "In progress", notStarted: "Not started", exempt: "Exempt" };
const TONE: Record<business.StatusRow["standing"], Tone> = { done: "ok", waiting: "blue", inProgress: "warn", notStarted: "calm", exempt: "calm" };
const OPTION: Record<string, string> = { restaurant: "Restaurant day", grant: "Grants", sponsor: "Sponsor pitches", merch: "Merch" };

export function Status({ me }: { me: Me }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof business.status>> | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const load = () => business.status().then(setData, (e) => setError(e instanceof Error ? e.message : "We couldn't load everyone's status."));
  useEffect(() => void load(), []);

  if (!data) return <Screen><PageHeader title="Everyone's status" />{error ? <ErrorNote message={error} /> : <p className="k-hint" role="status">Loading…</p>}</Screen>;
  const n = (s: business.StatusRow["standing"]) => data.rows.filter((r) => r.standing === s).length;
  const weeks = data.deadline ? Math.round(calendar.daysBetween(calendar.today(), data.deadline) / 7) : null;
  const rows = tab === "all" ? data.rows : data.rows.filter((r) => r.standing === tab);
  const canRemind = me.roles.bizApprover;
  const remind = (ids?: string[]) => business.remind(ids).then((sent) => setNote(`Reminded ${sent} ${sent === 1 ? "person" : "people"}.`), (e) => setError(e instanceof Error ? e.message : "That didn't send."));
  const columns: Column<business.StatusRow>[] = [
    { key: "name", label: "Student", width: "minmax(0, 1.3fr)", menu: ["text"] },
    { key: "subteam", label: "Subteam", width: "minmax(0, 1fr)", menu: ["group"], value: (r) => r.subteams[0] ?? "" },
    { key: "option", label: "Option", width: "minmax(0, 1.2fr)", menu: ["group"], value: (r) => OPTION[r.option] ?? "Not chosen yet", render: (r) => OPTION[r.option] ?? <span className="k-hint">Not chosen yet</span> },
    { key: "detail", label: "Progress", width: "minmax(0, 1.2fr)" },
    { key: "standing", label: "Status", width: "190px", menu: ["group"], value: (r) => LABEL[r.standing], render: (r) => <Pill tone={TONE[r.standing]}>{LABEL[r.standing]}</Pill> },
    { key: "lastActivity", label: "Last activity", width: "110px", menu: ["date"], render: (r) => (r.lastActivity ? shortDate(r.lastActivity) : "·") },
  ];
  return (
    <Screen>
      <PageHeader title="Everyone's status" sub={`Leads and Operations${data.deadline ? ` · due ${new Date(`${data.deadline}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}${weeks != null ? ` · ${Math.max(0, weeks)} weeks left` : ""}` : ""}`} actions={canRemind ? <Btn onClick={() => void remind()}>Send a reminder to everyone not done</Btn> : undefined} />
      <ErrorNote message={error} />
      {note && <Note tone="ok">{note}</Note>}
      <Stats items={[
        { label: "Done", value: `${n("done")} of ${data.rows.length}` },
        { label: "Waiting on Operations", value: n("waiting"), note: `${n("waiting")} need an approval` },
        { label: "In progress", value: n("inProgress") },
        { label: "Not started", value: n("notStarted") },
        { label: "Exempt", value: n("exempt") },
      ]} />
      <Tabs items={[{ id: "all", label: `All ${data.rows.length}` }, ...(["done", "waiting", "inProgress", "notStarted", "exempt"] as const).map((s) => ({ id: s, label: `${LABEL[s].replace(" on Operations", "")} ${n(s)}` }))]} value={tab} onChange={setTab} />
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.memberId} statusKey="standing" actions={canRemind ? (r) => (r.standing === "done" || r.standing === "exempt" ? null : <Btn small onClick={() => void remind([r.memberId])}>Send reminder</Btn>) : undefined} />
      <Note>Students who are exempt are not counted and are not reminded. Each student picks one option. Mark someone exempt, or give them a later date, in the 1-2-3-100 settings.</Note>
    </Screen>
  );
}
