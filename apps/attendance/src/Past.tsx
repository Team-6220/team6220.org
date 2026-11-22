// Past meetings: every meeting this season with who came and who missed it. Attendance Admins can copy a month's
// sign-ins (names and student IDs) to paste into a Google Sheet.
import { useEffect, useState } from "react";
import { attendance, type Me, type PastMeeting } from "@team6220/data";
import { Btn, DataTable, Note, PageHeader, Pill, Screen } from "@team6220/ui";
import { errorMessage, monthLong, shortDay } from "./util";

/** "2026-11-14" -> "11/14/2026" (a spreadsheet date). */
const sheetDate = (date: string) => `${date.slice(5, 7)}/${date.slice(8, 10)}/${date.slice(0, 4)}`;

/** The text to paste: headers once, then each date as a row followed by who signed in that day. */
export function sheetText(rows: { date: string; firstName: string; lastName: string; studentId: string }[]): string {
  const lines = ["First name\tLast name\tStudent ID"];
  let last = "";
  for (const r of rows) {
    if (r.date !== last) lines.push(sheetDate(r.date));
    last = r.date;
    lines.push(`${r.firstName}\t${r.lastName}\t${r.studentId}`);
  }
  return lines.join("\n");
}

export function Past({ me }: { me: Me }) {
  const [meetings, setMeetings] = useState<PastMeeting[] | null>(null);
  const [error, setError] = useState("");
  const [month, setMonth] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }).slice(0, 7));
  const [copied, setCopied] = useState("");

  useEffect(() => {
    attendance.past().then(setMeetings, (err) => setError(errorMessage(err, "We couldn't load past meetings.")));
  }, []);

  const copy = async () => {
    setCopied("");
    try {
      const rows = await attendance.copyMonth(month);
      await navigator.clipboard.writeText(sheetText(rows));
      setCopied(`Copied ${rows.length} sign-ins for ${monthLong(month)}.`);
    } catch (err) {
      setError(errorMessage(err, "We couldn't copy that month."));
    }
  };

  if (error) return <Screen><PageHeader title="Past meetings" /><Note tone="bad">{error}</Note></Screen>;
  if (!meetings) return <Screen><p className="k-hint" role="status">Loading…</p></Screen>;
  const months = [...new Set(meetings.map((m) => m.date.slice(0, 7)))];
  const names = (m: PastMeeting) => (m.absent.length > 2 ? `${m.absent.slice(0, 2).join(", ")}, +${m.absent.length - 2}` : m.absent.join(", "));
  return (
    <Screen>
      <PageHeader
        title="Past meetings"
        sub="Every meeting this season"
        actions={me.roles.attendanceAdmin && (
          <>
            <select className="k-input att-month" aria-label="Month to copy" value={month} onChange={(e) => setMonth(e.target.value)}>
              {(months.includes(month) ? months : [month, ...months]).map((m) => <option key={m} value={m}>{monthLong(m)}</option>)}
            </select>
            <Btn onClick={copy}>Copy this month's data</Btn>
          </>
        )}
      />
      {me.roles.attendanceAdmin && <Note>"Copy this month's data" copies, for pasting into Google Sheets or Excel: the headers once at the top, then each date as a row followed by the first name, last name, and student ID of everyone who signed in that day. It does not include times, subteams, or sign-outs.</Note>}
      {copied && <Note tone="ok">{copied}</Note>}
      <DataTable<PastMeeting>
        columns={[
          { key: "date", label: "Meeting", width: "minmax(0, 1.4fr)", menu: ["date"], render: (r) => <>{r.mandatory && "★ "}{shortDay(r.date)}</> },
          { key: "for", label: "For", width: "minmax(0, 1.4fr)", value: (r) => r.subteams.join(", ") || "Everyone", render: (r) => r.subteams.join(", ") || "Everyone" },
          { key: "signedIn", label: "Signed in", width: "minmax(0, 0.9fr)", menu: ["num"] },
          { key: "mandatory", label: "Mandatory", width: "minmax(0, 0.9fr)", value: (r) => (r.mandatory ? "Yes" : "No"), render: (r) => (r.mandatory ? "Yes" : "No") },
          { key: "absent", label: "Absent", width: "minmax(0, 2fr)", value: (r) => r.absent.length, render: (r) => (r.absent.length ? <>{names(r)} <Pill tone="calm">{r.absent.length} absent</Pill></> : <Pill tone="ok">Done</Pill>) },
        ]}
        rows={meetings}
        rowKey={(r) => r.id}
        sort={{ key: "date", dir: "desc" }}
        empty="No past meetings yet this season."
      />
    </Screen>
  );
}
