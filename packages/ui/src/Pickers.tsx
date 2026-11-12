// Dropdowns the operations apps share, so a person or a project is always chosen the same way.
// They take the list as a prop (load it once with ops.listPeople() / ops.listProjects()).

interface PersonOption {
  memberId: string;
  name: string;
}

interface PersonPickerProps {
  label: string;
  people: PersonOption[];
  /** The chosen member's ID, or "" for nobody. */
  value: string;
  onChange: (memberId: string) => void;
  /** The text of the "nobody" choice. */
  emptyLabel?: string;
}

export function PersonPicker({ label, people, value, onChange, emptyLabel = "Nobody yet" }: PersonPickerProps) {
  return (
    <label className="t-field">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{emptyLabel}</option>
        {people.map((p) => (
          <option key={p.memberId} value={p.memberId}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

interface ProjectOption {
  _id: string;
  number: number;
  name: string;
}

interface ProjectPickerProps {
  label?: string;
  projects: ProjectOption[];
  /** The chosen project's _id, or "" for none. */
  value: string;
  onChange: (projectId: string) => void;
}

export function ProjectPicker({ label = "Project", projects, value, onChange }: ProjectPickerProps) {
  return (
    <label className="t-field">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">No project</option>
        {projects.map((p) => (
          <option key={p._id} value={p._id}>
            p{p.number} {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

interface SubteamPickerProps {
  /** Every subteam, in the team's order. */
  subteams: string[];
  /** The ticked ones. */
  value: string[];
  onChange: (subteams: string[]) => void;
}

/** Tick boxes, one per subteam. */
export function SubteamPicker({ subteams, value, onChange }: SubteamPickerProps) {
  const toggle = (name: string) =>
    onChange(subteams.filter((s) => (s === name ? !value.includes(s) : value.includes(s))));
  return (
    <fieldset className="t-checks">
      <legend>Subteams</legend>
      {subteams.map((name) => (
        <label key={name}>
          <input type="checkbox" checked={value.includes(name)} onChange={() => toggle(name)} /> {name}
        </label>
      ))}
    </fieldset>
  );
}
