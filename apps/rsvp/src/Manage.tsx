// Manage forms (leads): every form, newest event first. A form belongs to one Calendar event and stays in that event's
// season. Forms are never deleted: when the event ends a form disappears from members' lists and its answers stay here.
import { useEffect, useMemo, useState } from "react";
import { rsvp, type ManageRow } from "@team6220/data";
import { Btn, Chips, DataTable, Note, PageHeader, Pill, Screen } from "@team6220/ui";
import { dayName, editHref, eventDates, resultsHref } from "./shared";

const STATE = { draft: { label: "Draft", tone: "calm" }, open: { label: "Published", tone: "ok" }, ended: { label: "Ended", tone: "calm" } } as const;

export function Manage() {
  const [rows, setRows] = useState<ManageRow[] | null>(null);
  const [season, setSeason] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");

  useEffect(() => {
    rsvp.manage().then((r) => {
      setRows(r);
      setSeason(r[0]?.season ?? "");
    }, (err) => setError(err instanceof Error ? err.message : "We couldn't load the forms."));
  }, []);
  const seasons = useMemo(() => [...new Set((rows ?? []).map((r) => r.season))], [rows]);

  const remind = async (r: ManageRow) => {
    setSent("");
    try {
      const n = await rsvp.remind(r.form._id);
      setSent(n ? `Reminded ${n} ${n === 1 ? "person" : "people"} who haven't finished the ${r.event.title} form.` : "Everyone has finished that form.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't send.");
    }
  };

  if (error && !rows) return <Screen><PageHeader title="Manage forms" /><Note tone="bad">{error}</Note></Screen>;
  if (!rows) return <Screen><p className="k-hint" role="status">Loading…</p></Screen>;
  const shown = rows.filter((r) => r.season === season);
  return (
    <Screen>
      <PageHeader title="Manage forms" sub="Leads only. Each form belongs to one calendar event and stays in that event's season." actions={<Btn kind="primary" href="/apps/rsvp/new">New form</Btn>} />
      {error && <Note tone="bad">{error}</Note>}
      {sent && <Note tone="ok">{sent}</Note>}
      {seasons.length > 1 && <Chips<string> items={seasons.map((s) => ({ id: s, label: s }))} value={season} onChange={setSeason} />}
      <DataTable<ManageRow>
        columns={[
          { key: "form", label: "Form", width: "minmax(0, 2.2fr)", value: (r) => r.event.title, render: (r) => (
            <a className="k-link rsvp-form-link" href={resultsHref(r.form._id)}>{r.event.title}<span className="k-hint">{r.state === "ended" ? `Ended ${dayName(r.event.endDate)} · kept in ${r.season}` : `Linked to the calendar · ${eventDates(r.event)}`}</span></a>
          ) },
          { key: "season", label: "Season", width: "minmax(0, 1fr)", menu: ["group"] },
          { key: "eventDate", label: "Event date", width: "minmax(0, 1fr)", menu: ["date"], value: (r) => r.event.startDate, render: (r) => (r.event.startDate === r.event.endDate ? dayName(r.event.startDate) : `${dayName(r.event.startDate)}–${r.event.endDate.slice(8).replace(/^0/, "")}`) },
          { key: "status", label: "Status", width: "minmax(0, 1fr)", menu: ["group"], value: (r) => STATE[r.state].label, render: (r) => <Pill tone={STATE[r.state].tone}>{STATE[r.state].label}</Pill> },
          { key: "answerBy", label: "Answer by", width: "minmax(0, 1fr)", menu: ["date"], value: (r) => r.form.answerBy, render: (r) => dayName(r.form.answerBy) },
          { key: "answers", label: "Answers", width: "minmax(0, 1fr)", menu: ["num"], value: (r) => r.finished, render: (r) => (r.state === "draft" ? "·" : `${r.finished} of ${r.asked}`) },
        ]}
        rows={shown}
        rowKey={(r) => r.form._id}
        statusKey="status"
        actions={(r) => (
          // The same width on every row, so the columns line up.
          <span className="rsvp-actions">
            {r.state === "open" && <Btn small onClick={() => remind(r)}>Send reminder</Btn>}
            {r.state !== "ended" && <Btn icon="edit" title="Edit" href={editHref(r.form._id)} />}
          </span>
        )}
        empty="No forms yet. Make one with New form."
      />
      <Note>Forms are never deleted. When an event ends the form disappears from members' lists, and its answers stay here, in that event's season, so you can look back. Switch seasons with the buttons above the table.</Note>
    </Screen>
  );
}
