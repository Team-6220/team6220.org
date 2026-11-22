// /apps/business/my: pick one of the four 1-2-3-100 options, and see your progress. Plan: https://github.com/Team-6220/team6220.org/wiki/Operations-Business
import { useEffect, useState } from "react";
import { business, calendar, type Me } from "@team6220/data";
import { Btn, DataTable, Note, PageHeader, Pill, Screen, Section, type Column, type Tone } from "@team6220/ui";
import { ErrorNote, useAct, useMy } from "./student";
import { businessHref } from "./shared";

const OPTIONS: { id: business.Option; mark: string; title: string; page: string }[] = [
  { id: "restaurant", mark: "1", title: "Restaurant day", page: "restaurant" },
  { id: "grant", mark: "2", title: "Grants", page: "grants" },
  { id: "sponsor", mark: "3", title: "Sponsor pitches", page: "pitches" },
  { id: "merch", mark: "$100", title: "Merch", page: "merch" },
];

const STATUS_TONE: Record<business.ProgressRow["status"], Tone> = { Done: "ok", Approved: "ok", Waiting: "blue", "Sent back": "bad", "Due now": "warn", "Your turn": "warn", "Not started": "calm" };

/** "Sat Jan 10 (8 weeks)" */
function dueText(deadline: string): string {
  if (!deadline) return "no due date yet";
  const weeks = Math.round(calendar.daysBetween(calendar.today(), deadline) / 7);
  const day = new Date(`${deadline}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return weeks > 0 ? `due ${day} (${weeks} ${weeks === 1 ? "week" : "weeks"})` : weeks === 0 ? `due ${day}` : `was due ${day}`;
}

export function My({ me }: { me: Me }) {
  const { my, error, reload, setError } = useMy();
  const { act, busy } = useAct(reload, setError);
  const [pick, setPick] = useState<business.Option | "">("");
  useEffect(() => setPick(my?.records.choice?.option ?? ""), [my?.records.choice?.option]);
  void me;

  if (!my) return <Screen><PageHeader title="My 1-2-3-100" />{error ? <ErrorNote message={error} /> : <p className="k-hint" role="status">Loading…</p>}</Screen>;
  const saved = my.records.choice?.option ?? "";
  const left = my.settings.restaurantLimit - my.restaurantUsed;
  const blurb: Record<business.Option, string> = {
    restaurant: `Set up one restaurant fundraiser day with a partner. ${my.restaurantUsed} of ${my.settings.restaurantLimit} days are used this year. ${left > 0 ? `${left} left.` : "None left."}`,
    grant: "Apply for two grants.",
    sponsor: `Send three pitches (email, in person or phone), plus ${my.settings.followUps} follow-ups if there is no reply.`,
    merch: `Sell $${business.MERCH_GOAL} of merch to friends, teachers and parents.`,
  };
  const columns: Column<business.ProgressRow>[] = [
    { key: "step", label: "Step", width: "minmax(0, 3fr)", menu: ["text"] },
    { key: "status", label: "Status", width: "160px", menu: ["group"], render: (r) => <Pill tone={STATUS_TONE[r.status]}>{r.status}</Pill> },
  ];
  const current = OPTIONS.find((o) => o.id === saved);

  return (
    <Screen>
      <PageHeader title="My 1-2-3-100" sub={`Offseason fundraising · ${dueText(my.settings.deadline)}`} />
      <Note tone="blue"><b>Pick one.</b> You only need to do <b>one</b> of these four, not all of them. Pick yours, then follow its steps. Everything is recorded here, so there is no separate form. Operations approves your plan before you start. Your name and student ID come from your account.</Note>
      <ErrorNote message={error} />
      <Section title="Which one are you doing?">
        <div className="biz-options" role="radiogroup" aria-label="Which one are you doing?">
          {OPTIONS.map((o) => (
            <label key={o.id} className={`biz-option${pick === o.id ? " is-on" : ""}`}>
              <input type="radio" name="option" checked={pick === o.id} onChange={() => setPick(o.id)} />
              <span className="biz-option-top"><b>{o.mark}</b><strong>{o.title}</strong>{saved === o.id && <Pill tone="ok">Your choice</Pill>}</span>
              <span className="k-hint">{blurb[o.id]}</span>
            </label>
          ))}
        </div>
        <div className="biz-row">
          <Btn kind="primary" disabled={busy || !pick || pick === saved} onClick={() => void act(() => business.pick(pick as business.Option))}>Save my choice</Btn>
          <span className="k-hint">You can switch until Operations approves your plan.</span>
        </div>
      </Section>
      {current && (
        <Section title={`Your progress · ${current.title}`}>
          <DataTable columns={columns} rows={my.rows} rowKey={(r) => r.step} statusKey="status" />
          <div><Btn href={businessHref(current.page)}>Continue my {current.title.toLowerCase()}</Btn></div>
        </Section>
      )}
    </Screen>
  );
}
