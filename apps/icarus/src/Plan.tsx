// The planning screen (Leads): seasons, starting a season from a template, target dates and events.
// Everyone can see it; only a Lead gets the forms and buttons.
import { useState, type FormEvent } from "react";
import { icarus, type IcarusData, type Me, type Season } from "@team6220/data";
import { SubteamPicker } from "@team6220/ui";

interface PlanProps {
  me: Me;
  data: IcarusData;
  season: Season | null;
  subteams: string[];
  onChooseSeason: (id: string) => void;
  run: (change: () => Promise<string | void>) => Promise<void>;
}

export function Plan({ me, data, season, subteams, onChooseSeason, run }: PlanProps) {
  const lead = me.roles.lead;
  return (
    <div className="icr__stack">
      {!lead && <p className="t-muted">Leads set the seasons, target dates and events. You can look.</p>}
      {lead && <NewSeason onCreate={(s) => run(async () => onChooseSeason((await icarus.savePlanning("season", s))._id))} />}
      {season && lead && <StartFromTemplate me={me} data={data} season={season} run={run} />}
      {season && <Milestones lead={lead} data={data} season={season} subteams={subteams} run={run} />}
      <Events lead={lead} data={data} season={season} run={run} />
    </div>
  );
}

function NewSeason({ onCreate }: { onCreate: (season: { name: string; startDate: string; endDate: string; eventIds: string[] }) => Promise<void> }) {
  const [name, setName] = useState("");
  const [startDate, setStart] = useState("");
  const [endDate, setEnd] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void onCreate({ name, startDate, endDate, eventIds: [] }).then(() => setName(""));
  };
  return (
    <form className="t-panel" onSubmit={submit}>
      <h2>New season</h2>
      <p className="t-muted">A season is one Gantt chart. The countdown rows count down to its end date.</p>
      <div className="icr__fields">
        <label className="t-field">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="2027 Competition" required />
        </label>
        <label className="t-field">
          Starts (for example kickoff)
          <input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} required />
        </label>
        <label className="t-field">
          Ends (for example the last event)
          <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEnd(e.target.value)} required />
        </label>
      </div>
      <button className="t-button" type="submit">Create season</button>
    </form>
  );
}

function StartFromTemplate({ me, data, season, run }: Pick<PlanProps, "me" | "data" | "run"> & { season: Season }) {
  const templates = [...icarus.BUILT_IN_TEMPLATES, ...data.templates];
  const [index, setIndex] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const template = templates[index];
  const plan = icarus.previewTemplate(template, season);
  const existing = data.tasks.filter((t) => t.seasonId === season._id).length;

  return (
    <section className="t-panel">
      <h2>Templates</h2>
      <div className="icr__fields">
        <label className="t-field">
          Template
          <select value={index} onChange={(e) => (setIndex(Number(e.target.value)), setPreviewing(false))}>
            {templates.map((t, i) => <option key={i} value={i}>{t.name}</option>)}
          </select>
        </label>
      </div>
      <div className="icr__buttons">
        <button className="t-button t-button--quiet" type="button" onClick={() => setPreviewing(!previewing)}>
          {previewing ? "Hide preview" : `Preview on ${season.name}`}
        </button>
        <button
          className="t-button t-button--quiet"
          type="button"
          onClick={() => {
            const name = window.prompt("Name for the new template", `${season.name} template`);
            if (name) void run(async () => {
              await icarus.savePlanning("template", { name, ...icarus.seasonToTemplate(season, data.tasks, data.milestones) });
              return `Saved "${name}" from this season's scheduled tasks and target dates.`;
            });
          }}
        >
          Save this season as a template
        </button>
      </div>
      {previewing && (
        <>
          <p>
            This will add {plan.tasks.length} tasks and {plan.milestones.length} target dates to <strong>{season.name}</strong>
            {existing > 0 && `, which already has ${existing} tasks`}. Nothing is created until you press the button.
          </p>
          <ul className="icr__preview">
            {plan.tasks.map((t) => (
              <li key={t.key} className={t.parentKey ? "icr__preview-sub" : undefined}>
                {t.title} <span className="t-muted">({t.subteams.join(", ") || "General"}) {t.startDate} to {t.dueDate}</span>
              </li>
            ))}
            {plan.milestones.map((m) => (
              <li key={m.name}>◆ {m.name} <span className="t-muted">({m.subteams.join(", ") || "whole team"}) {m.date}</span></li>
            ))}
          </ul>
          <button
            className="t-button"
            type="button"
            onClick={() => run(async () => (setPreviewing(false), `Created ${await icarus.startSeasonFromTemplate(template, season, me)} tasks.`))}
          >
            Create these in {season.name}
          </button>
        </>
      )}
    </section>
  );
}

function Milestones({ lead, data, season, subteams, run }: Pick<PlanProps, "data" | "subteams" | "run"> & { lead: boolean; season: Season }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [forSubteams, setForSubteams] = useState<string[]>([]);
  const mine = data.milestones.filter((m) => m.seasonId === season._id);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => void (await icarus.savePlanning("milestone", { name, date, subteams: forSubteams, seasonId: season._id, eventId: "" }))).then(() => setName(""));
  };
  return (
    <section className="t-panel">
      <h2>Target dates in {season.name}</h2>
      <ul className="icr__plain">
        {mine.length === 0 && <li className="t-muted">None yet.</li>}
        {mine.map((m) => (
          <li key={m._id}>
            {m.date} · <strong>{m.name}</strong> · {m.subteams.join(", ") || "Whole team"}
            {lead && (
              <button className="t-button t-button--quiet icr__small" type="button" onClick={() => run(() => icarus.removePlanning("milestone", m._id))}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {lead && (
        <form onSubmit={submit}>
          <div className="icr__fields">
            <label className="t-field">
              New target date
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Design review" required />
            </label>
            <label className="t-field">
              Date
              <input type="date" value={date} min={season.startDate} max={season.endDate} onChange={(e) => setDate(e.target.value)} required />
            </label>
          </div>
          <SubteamPicker subteams={subteams} value={forSubteams} onChange={setForSubteams} />
          <p className="t-hint">Tick no subteam for a whole-team date such as a scrimmage.</p>
          <button className="t-button" type="submit">Add target date</button>
        </form>
      )}
    </section>
  );
}

function Events({ lead, data, season, run }: Pick<PlanProps, "data" | "season" | "run"> & { lead: boolean }) {
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [startDate, setStart] = useState("");
  const [endDate, setEnd] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const created = await icarus.savePlanning("event", { code, displayName, officialName: "", startDate, endDate: endDate || startDate, location: "", source: "manual" });
      if (season) await icarus.savePlanning("season", { ...season, eventIds: [...season.eventIds, created._id] });
    }).then(() => (setCode(""), setDisplayName("")));
  };
  /** Shows or hides an event on the chosen season's chart. */
  const toggle = (eventId: string) =>
    season && run(async () => void (await icarus.savePlanning("season", {
      ...season,
      eventIds: season.eventIds.includes(eventId) ? season.eventIds.filter((id) => id !== eventId) : [...season.eventIds, eventId],
    })));
  return (
    <section className="t-panel">
      <h2>Events</h2>
      <p className="t-muted">Events are known by their code and shown by the name the team gives them. Looking codes up automatically comes later; for now type the dates.</p>
      <ul className="icr__plain">
        {data.events.length === 0 && <li className="t-muted">None yet.</li>}
        {data.events.map((event) => (
          <li key={event._id}>
            {season && lead && (
              <input type="checkbox" checked={season.eventIds.includes(event._id)} onChange={() => toggle(event._id)} aria-label={`Show ${event.displayName} on ${season.name}`} />
            )}{" "}
            <strong>{event.displayName}</strong> <span className="t-muted">({event.code})</span> · {event.startDate}
            {event.endDate !== event.startDate && ` to ${event.endDate}`}
            {lead && (
              <button className="t-button t-button--quiet icr__small" type="button" onClick={() => run(() => icarus.removePlanning("event", event._id))}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {lead && (
        <form onSubmit={submit}>
          <div className="icr__fields">
            <label className="t-field">
              Event code
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="2027casd, or a made-up one" required />
            </label>
            <label className="t-field">
              Display name
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Beach Blitz" required />
            </label>
            <label className="t-field">
              First day
              <input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} required />
            </label>
            <label className="t-field">
              Last day
              <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
          <button className="t-button" type="submit">Add event{season ? ` to ${season.name}` : ""}</button>
        </form>
      )}
    </section>
  );
}
