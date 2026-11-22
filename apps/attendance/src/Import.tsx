// Import from the old Sheet (Attendance Admins, once): paste columns A and B of the Sheet's Data tab (Timestamp and
// Student ID). Nothing is saved until Import is pressed. Running it again skips what is already in.
import { useMemo, useState } from "react";
import { attendance } from "@team6220/data";
import { Btn, Note, PageHeader, Screen } from "@team6220/ui";
import { errorMessage } from "./util";

const CHUNK = 500;

export function Import() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");
  const parsed = useMemo(() => attendance.parseSheet(text), [text]);
  const days = new Set(parsed.rows.map((r) => r.date)).size;

  const run = async () => {
    setBusy(true);
    setError("");
    setDone("");
    let added = 0, skipped = 0, unknown = 0;
    try {
      for (let i = 0; i < parsed.rows.length; i += CHUNK) {
        const part = await attendance.importRows(parsed.rows.slice(i, i + CHUNK));
        added += part.added;
        skipped += part.skipped;
        unknown += part.unknown;
        setDone(`${Math.min(i + CHUNK, parsed.rows.length)} of ${parsed.rows.length} read…`);
      }
      setDone(`Imported ${added} sign-ins. ${skipped} were already in, and ${unknown} had a student ID that isn't on the roster.`);
      setText("");
    } catch (err) {
      setError(errorMessage(err, "The import stopped. Running it again skips what is already in."));
    }
    setBusy(false);
  };

  return (
    <Screen>
      <PageHeader title="Import from the Sheet" sub="Bring in the old attendance Sheet's sign-ins" back={{ label: "Attendance", href: "/apps/attendance" }} />
      <Note>In the old Sheet's <strong>Data</strong> tab, select columns A and B (Timestamp and Student ID), copy them, and paste here. A sign-in with no time (typed by hand) starts when that day's meeting did. Someone with two sign-ins in a day is counted once. It is safe to run twice.</Note>
      <textarea className="k-input att-paste" rows={10} placeholder="Timestamp, Student ID" aria-label="Rows copied from the Sheet" value={text} onChange={(e) => setText(e.target.value)} />
      {text.trim() && <Note>{parsed.rows.length} sign-ins on {days} days. {parsed.skipped} lines skipped (the header, blank lines, or an ID that isn't a student ID).</Note>}
      {done && <Note tone="ok">{done}</Note>}
      {error && <Note tone="bad">{error}</Note>}
      <div><Btn kind="primary" disabled={busy || !parsed.rows.length} onClick={run}>{busy ? "Importing…" : "Import"}</Btn></div>
    </Screen>
  );
}
