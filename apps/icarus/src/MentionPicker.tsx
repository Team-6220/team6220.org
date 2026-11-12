// Choosing people by typing "@" and part of their name or username, like assigning someone on GitHub.
// The list comes from the site's members (ops.listPeople, kept in step with Wix by ops.syncPeople).
import { useState, type KeyboardEvent } from "react";
import type { Person } from "@team6220/data";

interface MentionPickerProps {
  label: string;
  people: Person[];
  /** The chosen members' IDs. */
  value: string[];
  onChange: (memberIds: string[]) => void;
  disabled?: boolean;
}

const MAX_SUGGESTIONS = 8;

export function MentionPicker({ label, people, value, onChange, disabled }: MentionPickerProps) {
  const [typed, setTyped] = useState("");
  const [highlight, setHighlight] = useState(0);
  const words = typed.replace(/^@/, "").trim().toLowerCase();
  const suggestions = people
    .filter((p) => !value.includes(p.memberId))
    .filter((p) => !words || p.name.toLowerCase().includes(words) || (p.username ?? "").includes(words))
    .slice(0, MAX_SUGGESTIONS);
  const chosen = value.map((id) => people.find((p) => p.memberId === id) ?? { memberId: id, name: "(no longer a member)", username: "" });

  const add = (person: Pick<Person, "memberId">) => {
    onChange([...value, person.memberId]);
    setTyped("");
    setHighlight(0);
  };

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    else if (event.key === "ArrowUp") setHighlight((h) => Math.max(h - 1, 0));
    else if (event.key === "Enter" && typed && suggestions[highlight]) add(suggestions[highlight]);
    else if (event.key === "Backspace" && !typed && value.length) onChange(value.slice(0, -1));
    else return;
    event.preventDefault();
  }

  return (
    <div className="icr__mentions">
      <span className="icr__side-label">{label}</span>
      <div className="icr__chips">
        {chosen.length === 0 && <span className="t-muted">No one yet</span>}
        {chosen.map((p) => (
          <span key={p.memberId} className="t-chip">
            @{p.username || p.name}
            <span className="t-muted"> {p.username ? p.name : ""}</span>
            {!disabled && (
              <button type="button" className="icr__chip-x" aria-label={`Remove ${p.name}`} onClick={() => onChange(value.filter((id) => id !== p.memberId))}>
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <div className="icr__mention-box">
          <input
            value={typed}
            onChange={(e) => (setTyped(e.target.value), setHighlight(0))}
            onKeyDown={onKeyDown}
            placeholder="Type @ and a name"
            aria-label={`Add to ${label.toLowerCase()}`}
            role="combobox"
            aria-expanded={!!typed && suggestions.length > 0}
          />
          {typed && (
            <ul className="icr__suggestions" role="listbox">
              {suggestions.length === 0 && <li className="t-muted">Nobody matches. Ask a lead to update the people list.</li>}
              {suggestions.map((p, i) => (
                <li key={p.memberId} role="option" aria-selected={i === highlight}>
                  <button type="button" className={i === highlight ? "icr__suggestion icr__suggestion--on" : "icr__suggestion"} onMouseDown={(e) => (e.preventDefault(), add(p))}>
                    <strong>@{p.username || p.name}</strong> <span className="t-muted">{p.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
