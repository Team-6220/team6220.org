// New form (leads): pick the Calendar event and the form builds itself from it. Add the extra questions you need; their
// answers are private to leads, mentors and boosters. Save as a draft, or publish to the whole team.
import { useEffect, useState } from "react";
import { calendar, rsvp, type CalEvent, type RsvpForm } from "@team6220/data";
import { Btn, Field, Fields, Note, PageHeader, Screen, Section, Toggle } from "@team6220/ui";
import { editHref, eventDates, param } from "./shared";

type Q = { id?: string; label: string; type: "yesno" | "text" | "choice"; options: string; };

export function FormEditor() {
  const id = param("id");
  const [events, setEvents] = useState<CalEvent[] | null>(null);
  const [existing, setExisting] = useState<RsvpForm | null>(null);
  const [eventId, setEventId] = useState(param("event"));
  const [answerBy, setAnswerBy] = useState("");
  const [questions, setQuestions] = useState<Q[]>([]);
  const [remind, setRemind] = useState(true);
  const [remindAfter, setRemindAfter] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [used, setUsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([calendar.load(), rsvp.manage()]).then(([data, rows]) => {
      setEvents(data.events);
      setUsed(new Set(rows.map((r) => r.form.eventId)));
      const row = rows.find((r) => r.form._id === id);
      if (row) {
        setExisting(row.form);
        setEventId(row.form.eventId);
        setAnswerBy(row.form.answerBy);
        setQuestions(row.form.questions.map((q) => ({ id: q.id, label: q.label, type: q.type, options: q.options.join(", ") })));
        setRemind(row.form.remind !== false);
        setRemindAfter(row.form.remindAfter !== false);
      }
    }, (err) => setError(err instanceof Error ? err.message : "We couldn't load the calendar."));
  }, []);

  if (!events) return <Screen><p className="k-hint" role="status">{error || "Loading…"}</p></Screen>;
  const today = calendar.today();
  const choices = rsvp.formableEvents(events, today).filter((e) => !used.has(e._id) || e._id === eventId);
  const event = events.find((e) => e._id === eventId);
  const days = event ? rsvp.askedDays(event) : [];

  const save = async (status: "draft" | "published") => {
    setBusy(true);
    setError("");
    try {
      const saved = await rsvp.saveForm({
        ...(existing ? { _id: existing._id } : {}), eventId, status, answerBy, remind, remindAfter,
        questions: questions.map((q) => ({ id: q.id, label: q.label, type: q.type, options: q.options.split(",").map((o) => o.trim()).filter(Boolean) })),
      });
      location.assign(status === "published" ? "/apps/rsvp/manage" : editHref(saved._id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
      setBusy(false);
    }
  };
  const change = (i: number, next: Partial<Q>) => setQuestions(questions.map((q, n) => (n === i ? { ...q, ...next } : q)));

  return (
    <Screen>
      <PageHeader
        title={existing ? "Change RSVP form" : "New RSVP form"}
        sub="Pick the event and the form builds itself from the calendar"
        back={{ label: "Manage forms", href: "/apps/rsvp/manage" }}
        actions={<><Btn disabled={busy || !eventId || !answerBy} onClick={() => save("draft")}>Save as draft</Btn><Btn kind="primary" disabled={busy || !eventId || !answerBy} onClick={() => save("published")}>{existing?.status === "published" ? "Save changes" : "Publish to the whole team"}</Btn></>}
      />
      {error && <Note tone="bad">{error}</Note>}
      <div className="k-box k-form">
        <Fields cols={2}>
          <Field label="Calendar event" hint="Dates, times and location load from the calendar, so they stay right if the event moves. The form joins that event's season.">
            <select className="k-input" value={eventId} disabled={!!existing} onChange={(e) => setEventId(e.target.value)}>
              <option value="">Pick an event…</option>
              {choices.map((e) => <option key={e._id} value={e._id}>{calendar.titleOf(e)} · {eventDates(e)}</option>)}
            </select>
          </Field>
          <Field label="Answer by" hint="People get reminders until this date. They can still answer after it, until the event ends.">
            <input className="k-input" type="date" value={answerBy} min={today} max={event?.endDate} onChange={(e) => setAnswerBy(e.target.value)} />
          </Field>
        </Fields>
      </div>
      {choices.length === 0 && !existing && <Note>Every competition and event on the calendar already has a form, or none is coming up. Add the event on the Calendar first.</Note>}
      <Section title="Standard questions (every form)">
        <div className="k-box rsvp-standard">
          <p><strong>Are you coming?</strong> Asked for each day of a multi-day competition{days.length > 1 ? ` (${days.length} days here)` : ""}. Pit setup only asks <strong>Are you available?</strong>, because we do not know who is going until people fill this out.</p>
          <p><strong>Anything you have to miss?</strong> We understand if there is an event or thing you have to do during the event. Please list which days/parts of days you will have to miss. Write N/A if you are completely free for the competition.</p>
        </div>
      </Section>
      <Section title="Additional questions">
        <Note>Answers to additional questions are private. Only leads, mentors and boosters can see them.</Note>
        <div className="k-box k-form rsvp-extra">
          {questions.map((q, i) => (
            <div key={q.id ?? i} className="rsvp-extra-row">
              <input className="k-input" aria-label="Question" placeholder="Question" value={q.label} onChange={(e) => change(i, { label: e.target.value })} />
              <select className="k-input" aria-label="Type" value={q.type} onChange={(e) => change(i, { type: e.target.value as Q["type"] })}>
                <option value="yesno">Yes / No</option>
                <option value="text">Short text</option>
                <option value="choice">Pick one</option>
              </select>
              {q.type === "choice" && <input className="k-input" aria-label="Choices, separated by commas" placeholder="Choices, separated by commas" value={q.options} onChange={(e) => change(i, { options: e.target.value })} />}
              <Btn icon="remove" title="Remove" onClick={() => setQuestions(questions.filter((_, n) => n !== i))} />
            </div>
          ))}
          <div><Btn onClick={() => setQuestions([...questions, { label: "", type: "yesno", options: "" }])}>+ Add a question</Btn></div>
        </div>
      </Section>
      <Section title="Publishing">
        <div className="k-box k-form">
          <Toggle label="Send reminders on the schedule in Reminders" checked={remind} onChange={setRemind} />
          <Toggle label="Remind again after the deadline for people who have not answered" checked={remindAfter} onChange={setRemindAfter} />
          <p className="k-hint">The form shows up on every member's Open forms page and in the badge on this app and on Apps home. It disappears for members when the event ends. It is never deleted.</p>
        </div>
      </Section>
    </Screen>
  );
}
