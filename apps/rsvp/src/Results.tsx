// Who's coming: everyone on the team sees whether each person is coming; leads, mentors and boosters also see what people
// have to miss and the answers to the extra questions. Export answers makes a CSV.
import { useEffect, useMemo, useState } from "react";
import { calendar, rsvp, type Me, type ResultRow, type Results as ResultsData } from "@team6220/data";
import { Btn, Chips, DataTable, Note, PageHeader, Pill, Screen, Section, Stats, type Column } from "@team6220/ui";
import { eventDates, param, resultsHref } from "./shared";

type Filter = "all" | "coming" | "not" | "none";
const LABEL: Record<string, string> = { yes: "Yes", no: "No", maybe: "Maybe", available: "Available", not: "Not available", "": "·" };

const csv = (rows: string[][]) => rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");

export function Results({ me }: { me: Me }) {
  const [list, setList] = useState<{ id: string; label: string }[] | null>(null);
  const [data, setData] = useState<ResultsData | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState("");

  useEffect(() => {
    // Leads pick from every form; everyone else from the open ones.
    const forms = me.roles.lead ? rsvp.manage().then((rows) => rows.map((r) => ({ id: r.form._id, label: `${r.event.title} · ${eventDates(r.event)}`, ended: r.state === "ended" }))) : rsvp.openForms().then((all) => all.map((f) => ({ id: f.form._id, label: `${f.event.title} · ${eventDates(f.event)}`, ended: false })));
    forms.then((all) => {
      const sorted = [...all].sort((a, b) => Number(a.ended) - Number(b.ended));
      setList(sorted);
      const id = param("id") || sorted[0]?.id;
      if (id) rsvp.results(id).then(setData, (err) => setError(err instanceof Error ? err.message : "We couldn't load the results."));
    }, (err) => setError(err instanceof Error ? err.message : "We couldn't load the forms."));
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.rows.filter((r) => {
      const any = data.days.some((d) => r.days[d] === "yes");
      const anyNo = data.days.every((d) => r.days[d] === "no");
      return filter === "all" ? true : filter === "coming" ? any : filter === "not" ? r.finished && anyNo : !r.finished;
    });
  }, [data, filter]);

  if (error) return <Screen><PageHeader title="Who's coming" /><Note tone="bad">{error}</Note></Screen>;
  if (!list) return <Screen><p className="k-hint" role="status">Loading…</p></Screen>;
  if (!list.length) return <Screen><PageHeader title="Who's coming" /><Note>There are no forms yet.</Note></Screen>;
  if (!data) return <Screen><p className="k-hint" role="status">Loading…</p></Screen>;

  const exportCsv = () => {
    const extraCols = data.form.questions;
    const head = ["Name", "Subteam", ...(data.hasPit ? ["Pit setup"] : []), ...data.days.map((d) => calendar.shortDay(d)), ...(data.details ? ["What they have to miss", ...extraCols.map((q) => q.label)] : [])];
    const body = data.rows.map((r) => {
      const d = data.details?.find((x) => x.memberId === r.memberId);
      return [r.name, r.subteams.join(" · "), ...(data.hasPit ? [LABEL[r.pit]] : []), ...data.days.map((day) => LABEL[r.days[day] ?? ""]), ...(data.details ? [d?.misses ?? "", ...extraCols.map((q) => d?.extra[q.id] ?? "")] : [])];
    });
    const url = URL.createObjectURL(new Blob([csv([head, ...body])], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `rsvp-${data.event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const columns: Column<ResultRow>[] = [
    { key: "name", label: "Name", width: "minmax(0, 1.6fr)", menu: ["text"] },
    { key: "subteam", label: "Subteam", width: "minmax(0, 1.4fr)", value: (r) => r.subteams.join(" · "), render: (r) => r.subteams.join(" · ") || "—" },
    ...(data.hasPit ? [{ key: "pit", label: "Pit setup", width: "minmax(0, 1fr)", value: (r: ResultRow) => LABEL[r.pit], render: (r: ResultRow) => LABEL[r.pit] }] : []),
    ...data.days.map((d): Column<ResultRow> => ({ key: d, label: calendar.shortDay(d), width: "minmax(0, 1fr)", value: (r) => LABEL[r.days[d] ?? ""], render: (r) => LABEL[r.days[d] ?? ""] })),
  ];
  return (
    <Screen>
      <PageHeader
        title="Who's coming"
        sub={`${data.event.title} · ${eventDates(data.event)} · closes with the event`}
        actions={
          <>
            <select className="k-input rsvp-pick" aria-label="Form" value={data.form._id} onChange={(e) => location.assign(resultsHref(e.target.value))}>
              {list.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
            <Btn onClick={exportCsv}>Export answers</Btn>
          </>
        }
      />
      {data.form.status !== "published" && <Note tone="warn">This form is a draft: only leads can see these results.</Note>}
      <Stats items={[
        ...(data.hasPit ? [{ label: "Pit setup", value: data.pitAvailable, note: "available" }] : []),
        ...data.days.map((d) => ({ label: calendar.shortDay(d), value: data.coming[d] ?? 0, note: "coming" })),
        { label: "No answer yet", value: data.noAnswer, note: "haven't finished" },
      ]} />
      <Chips<Filter> items={[{ id: "all", label: "All" }, { id: "coming", label: "Coming any day" }, { id: "not", label: "Not coming" }, { id: "none", label: "No answer" }]} value={filter} onChange={setFilter} />
      <DataTable<ResultRow> columns={columns} rows={rows} rowKey={(r) => r.memberId} sort={{ key: "name", dir: "asc" }} empty="Nobody matches." />
      {data.details && (
        <Section title="What people have to miss (leads, mentors and boosters only)">
          <Note>You can see this because you are a {me.roles.lead ? "lead" : "mentor or booster"}. Members only see the table above.</Note>
          <DataTable<NonNullable<ResultsData["details"]>[number]>
            columns={[
              { key: "name", label: "Name", width: "minmax(0, 1.2fr)", menu: ["text"] },
              { key: "subteam", label: "Subteam", width: "minmax(0, 1fr)", value: (r) => r.subteams.join(" · "), render: (r) => r.subteams.join(" · ") || "—" },
              { key: "misses", label: "Days or parts of days they will miss", width: "minmax(0, 2fr)", wrap: true },
              ...data.form.questions.map((q): Column<NonNullable<ResultsData["details"]>[number]> => ({ key: q.id, label: q.label, width: "minmax(0, 1fr)", wrap: true, value: (r) => r.extra[q.id] ?? "", render: (r) => r.extra[q.id] ?? "·" })),
            ]}
            rows={data.details}
            rowKey={(r) => r.memberId}
            empty="Nobody has answered yet."
          />
        </Section>
      )}
      {data.rows.some((r) => !r.finished) && <p className="k-hint"><Pill tone="calm">Maybe</Pill> counts as not finished: that person still gets reminders.</p>}
    </Screen>
  );
}
