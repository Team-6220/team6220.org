// The change log of one record: who did what, and when. Entries come from ops.listHistory(record).

interface HistoryRow {
  _id: string;
  actorName: string;
  actorIsAgent: boolean;
  action: string;
  summary: string;
  /** ISO date and time. */
  at: string;
}

export function HistoryList({ entries }: { entries: HistoryRow[] }) {
  if (!entries.length) return <p className="t-muted">No changes recorded yet.</p>;
  return (
    <ol className="t-history">
      {entries.map((entry) => (
        <li key={entry._id}>
          <span className="t-history__when">{new Date(entry.at).toLocaleString()}</span>
          <span>
            <strong>{entry.actorName}</strong>
            {entry.actorIsAgent && " (agent)"} {entry.action}
            {entry.summary && `: ${entry.summary}`}
          </span>
        </li>
      ))}
    </ol>
  );
}
