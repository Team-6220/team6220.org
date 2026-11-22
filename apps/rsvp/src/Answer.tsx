// Answering one form. Your name and student ID come from your account. Everyone on the team can see whether you are
// coming; only leads, mentors and boosters see what you write in the boxes. A Maybe is saved but does not finish the form.
import { useEffect, useState } from "react";
import { calendar, rsvp, type OpenForm, type RsvpAnswer } from "@team6220/data";
import { Btn, Note, PageHeader, Screen, Section } from "@team6220/ui";
import { dayName, eventDates, param } from "./shared";

const DAY_CHOICES: [string, string][] = [["yes", "Yes, I'm coming"], ["no", "No"], ["maybe", "Maybe"]];

export function Answer() {
  const [open, setOpen] = useState<OpenForm | null | undefined>(undefined);
  const [days, setDays] = useState<Record<string, string>>({});
  const [pit, setPit] = useState("");
  const [misses, setMisses] = useState("");
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    rsvp.openForms().then((all) => {
      const f = all.find((x) => x.form._id === param("id")) ?? null;
      setOpen(f);
      const a: RsvpAnswer | null = f?.answer ?? null;
      if (a) {
        setDays({ ...a.days });
        setPit(a.pit);
        setMisses(a.misses);
        setExtra({ ...a.extra });
      }
    }, (err) => setError(err instanceof Error ? err.message : "We couldn't load the form."));
  }, []);

  const back = { label: "Open forms", href: "/apps/rsvp" };
  if (error && open === undefined) return <Screen><PageHeader title="RSVP" back={back} /><Note tone="bad">{error}</Note></Screen>;
  if (open === undefined) return <Screen><p className="k-hint" role="status">Loading…</p></Screen>;
  if (!open) return <Screen><PageHeader title="Not found" back={back} /><Note>That form isn't open any more. Forms disappear when their event ends.</Note></Screen>;

  const { form, event } = open;
  const asked = rsvp.askedDays(event);
  const multi = asked.length > 1;
  const pitDay = event.setupDate;
  const send = async () => {
    setBusy(true);
    setError("");
    try {
      const f = await rsvp.answer(form._id, { days, pit, misses, extra });
      setSaved(f.mine === "done" ? "Saved. Thank you!" : "Saved, but the form isn't finished: pick Yes or No for every day and fill in every box.");
      setOpen(f);
      if (f.mine === "done") setTimeout(() => location.assign("/apps/rsvp"), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
    }
    setBusy(false);
  };
  const radio = (name: string, value: string, current: string, set: (v: string) => void, label: string) => (
    <label key={value} className="k-toggle rsvp-radio"><input type="radio" name={name} checked={current === value} onChange={() => set(value)} />{label}</label>
  );

  return (
    <Screen>
      <PageHeader
        title={`${event.title} · RSVP`}
        sub={`${multi ? `${eventDates(event)}` : eventDates(event)} · Loaded from the calendar · please answer by ${dayName(form.answerBy)}`}
        back={back}
        actions={<Btn kind="primary" disabled={busy} onClick={send}>Send my answer</Btn>}
      />
      <Note>Your name and student ID are filled in from your account, so they are not on this form.</Note>
      <Note><strong>Everyone on the team can see that you are coming.</strong> Only leads, mentors and boosters can see the details you write below.</Note>
      <Note>Answering <strong>Maybe</strong> saves your answer, but the form is not marked complete. You will keep getting reminders until you pick Yes or No.</Note>
      {saved && <Note tone={saved.startsWith("Saved.") ? "ok" : "warn"}>{saved}</Note>}
      {error && <Note tone="bad">{error}</Note>}
      <Section title="Are you coming?">
        <div className="k-box k-form rsvp-questions">
          {pitDay && (
            <fieldset className="rsvp-q">
              <legend>Pit setup</legend>
              <span className="k-hint">{calendar.shortDay(pitDay)} · are you available?</span>
              <div className="rsvp-choices">{radio("pit", "available", pit, setPit, "Available")}{radio("pit", "not", pit, setPit, "Not available")}</div>
            </fieldset>
          )}
          {asked.map((d) => (
            <fieldset key={d} className="rsvp-q">
              <legend>{calendar.longDay(d)}</legend>
              <div className="rsvp-choices">{DAY_CHOICES.map(([v, label]) => radio(`day-${d}`, v, days[d] ?? "", (x) => setDays({ ...days, [d]: x }), label))}</div>
            </fieldset>
          ))}
          <p className="k-hint">{pitDay ? "Pit setup only asks if you are available, because we do not know who is going until forms like this are filled out. " : ""}Each day of a multi-day event is asked separately. A one-day event asks once.</p>
        </div>
      </Section>
      <Section title="Anything you have to miss?">
        <div className="k-box k-form">
          <p className="k-hint">We understand if there is an event or thing you have to do during the event. Please list which days/parts of days you will have to miss. Write N/A if you are completely free for the competition.</p>
          <textarea className="k-input" rows={3} aria-label="Anything you have to miss?" value={misses} onChange={(e) => setMisses(e.target.value)} maxLength={1000} />
        </div>
      </Section>
      {form.questions.length > 0 && (
        <Section title="Additional questions">
          <div className="k-box k-form rsvp-questions">
            {form.questions.map((q) => (
              <fieldset key={q.id} className="rsvp-q">
                <legend>{q.label}</legend>
                {q.type === "text" && <input className="k-input" aria-label={q.label} value={extra[q.id] ?? ""} maxLength={500} onChange={(e) => setExtra({ ...extra, [q.id]: e.target.value })} />}
                {q.type === "yesno" && <div className="rsvp-choices">{["Yes", "No"].map((v) => radio(q.id, v, extra[q.id] ?? "", (x) => setExtra({ ...extra, [q.id]: x }), v))}</div>}
                {q.type === "choice" && <div className="rsvp-choices">{q.options.map((v) => radio(q.id, v, extra[q.id] ?? "", (x) => setExtra({ ...extra, [q.id]: x }), v))}</div>}
              </fieldset>
            ))}
          </div>
        </Section>
      )}
    </Screen>
  );
}
