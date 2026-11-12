// A link to a record in any operations app, shown as a chip: "t42 Wire the elevator · In progress".
// The app looks the record up and passes what to show; this component only draws it.
import { StatusPill, type StatusTone } from "./StatusPill";

interface RecordChipProps {
  /** The short code people say out loud: "t42", "p10", "PR-0123". */
  code?: string;
  name: string;
  /** Where clicking goes, for example "/apps/icarus?task=42". Leave out for a chip that isn't a link. */
  href?: string;
  status?: string;
  statusTone?: StatusTone;
}

export function RecordChip({ code, name, href, status, statusTone }: RecordChipProps) {
  const inside = (
    <>
      {code && <strong className="t-chip__code">{code}</strong>}
      <span>{name}</span>
      {status && <StatusPill tone={statusTone}>{status}</StatusPill>}
    </>
  );
  return href ? (
    <a className="t-chip" href={href}>
      {inside}
    </a>
  ) : (
    <span className="t-chip">{inside}</span>
  );
}
