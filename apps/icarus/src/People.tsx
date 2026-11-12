// Who is on which subteam. Every member picks their own; Leads and Mentors can change anyone's.
// Subteams are Wix badges ("Subteam: Design"); the ops API changes them, never the browser.
import { useState } from "react";
import { ops, type Me, type Person } from "@team6220/data";
import { SubteamPicker } from "@team6220/ui";

interface PeopleProps {
  me: Me;
  people: Person[];
  subteams: string[];
  /** Runs a change, shows the result and reloads. */
  run: (change: () => Promise<string | void>) => Promise<void>;
}

export function People({ me, people, subteams, run }: PeopleProps) {
  const [mine, setMine] = useState(me.subteams);
  const [chosen, setChosen] = useState<string[]>([]);
  const [forChosen, setForChosen] = useState<string[]>([]);
  const toggle = (id: string) => setChosen(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);

  return (
    <div className="icr__stack">
      <section className="t-panel">
        <h2>My subteams</h2>
        <SubteamPicker subteams={subteams} value={mine} onChange={setMine} />
        <button className="t-button" type="button" onClick={() => run(async () => `Saved: ${(await ops.setMySubteams(mine)).join(", ") || "no subteams"}.`)}>
          Save my subteams
        </button>
      </section>

      <section className="t-panel">
        <h2>Everyone</h2>
        <p className="t-muted">People appear here after they open a team app once.</p>
        {me.roles.peopleAdmin && chosen.length > 0 && (
          <div className="icr__bulk">
            <strong>
              Set {chosen.length} {chosen.length === 1 ? "person" : "people"} to:
            </strong>
            <SubteamPicker subteams={subteams} value={forChosen} onChange={setForChosen} />
            <button
              className="t-button"
              type="button"
              onClick={() =>
                run(async () => {
                  await ops.setSubteams(chosen, forChosen);
                  setChosen([]);
                  return "Subteams updated.";
                })
              }
            >
              Apply
            </button>
          </div>
        )}
        <div className="icr__scroll">
          <table className="t-table">
            <thead>
              <tr>
                {me.roles.peopleAdmin && <th aria-label="Choose" />}
                <th>Name</th>
                {subteams.map((s) => <th key={s}>{s}</th>)}
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person.memberId}>
                  {me.roles.peopleAdmin && (
                    <td>
                      <input type="checkbox" checked={chosen.includes(person.memberId)} onChange={() => toggle(person.memberId)} aria-label={`Choose ${person.name}`} />
                    </td>
                  )}
                  <td>{person.name}</td>
                  {subteams.map((subteam) => {
                    const on = person.subteams.includes(subteam);
                    return (
                      <td key={subteam}>
                        {me.roles.peopleAdmin ? (
                          <input
                            type="checkbox"
                            checked={on}
                            aria-label={`${person.name}: ${subteam}`}
                            onChange={() => run(() => ops.setSubteams([person.memberId], on ? person.subteams.filter((s) => s !== subteam) : [...person.subteams, subteam]))}
                          />
                        ) : on ? "✓" : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
