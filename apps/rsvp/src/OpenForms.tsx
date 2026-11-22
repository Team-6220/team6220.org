// Open forms: the forms you can answer, with what you said. A form leaves this list when its event ends.
import { useEffect, useState } from "react";
import { rsvp, type OpenForm } from "@team6220/data";
import { Btn, Note, PageHeader, Pill, Screen, type Tone } from "@team6220/ui";
import { answerHref, dayName, eventWhen } from "./shared";

function pill(f: OpenForm): { label: string; tone: Tone } {
  if (f.mine === "done") return { label: `Answered: ${f.summary}`, tone: "ok" };
  if (f.mine === "maybe") return { label: "You said Maybe: still needs a yes or no", tone: "warn" };
  return { label: "Needs your answer", tone: "warn" };
}

export function OpenForms() {
  const [forms, setForms] = useState<OpenForm[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    rsvp.openForms().then(setForms, (err) => setError(err instanceof Error ? err.message : "We couldn't load the forms."));
  }, []);
  if (error) return <Screen><PageHeader title="Open forms" /><Note tone="bad">{error}</Note></Screen>;
  if (!forms) return <Screen><p className="k-hint" role="status">Loading…</p></Screen>;
  return (
    <Screen>
      <PageHeader title="Open forms" sub="Fill these out so the team knows who is coming. You can change an answer until the event ends." />
      <Note>Reminders come by Discord, a badge on this app and on Apps home, and push notifications, for forms you have not finished. A Maybe is saved, but it does not finish the form, so you keep getting reminders until you pick Yes or No. Change this in Account.</Note>
      {forms.length === 0 && <Note>No forms are open right now.</Note>}
      <div className="rsvp-cards">
        {forms.map((f) => {
          const p = pill(f);
          return (
            <article key={f.form._id} className="k-box rsvp-card" onClick={() => location.assign(answerHref(f.form._id))}>
              <div className="rsvp-card-head">
                <h3><a href={answerHref(f.form._id)} className="rsvp-title" onClick={(e) => e.stopPropagation()}>{f.event.title}</a></h3>
                <Pill tone={p.tone}>{p.label}</Pill>
              </div>
              <p>{eventWhen(f.event)}</p>
              <p className="k-hint">Please answer by {dayName(f.form.answerBy)}</p>
              <p className="k-hint">Disappears when the event ends</p>
              <div className="rsvp-card-foot"><Btn kind={f.mine === "done" ? "quiet" : "primary"} href={answerHref(f.form._id)}>{f.mine === "done" ? "Change my answer" : "Answer now"}</Btn></div>
            </article>
          );
        })}
      </div>
    </Screen>
  );
}
