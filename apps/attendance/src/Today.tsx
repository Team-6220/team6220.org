// Today: who is here and who isn't. Everyone on the team sees it; Attendance Admins also get Open kiosk.
import { useEffect, useState } from "react";
import { attendance, type DayView, type HereRow, type AbsentRow, type Me } from "@team6220/data";
import { Btn, DataTable, Icon, Note, PageHeader, Screen, Section, Stats } from "@team6220/ui";
import { errorMessage, formatTime, hoursText, longDay, subteamText } from "./util";

export function Today({ me }: { me: Me }) {
  const [day, setDay] = useState<DayView | null>(null);
  const [error, setError] = useState("");
  const [find, setFind] = useState("");

  useEffect(() => {
    attendance.today().then((r) => setDay(r.day), (err) => setError(errorMessage(err, "We couldn't load today's attendance.")));
  }, []);

  if (error) return <Screen><PageHeader title="Today" /><Note tone="bad">{error}</Note></Screen>;
  if (!day) return <Screen><p className="k-hint" role="status">Loading…</p></Screen>;

  const meeting = day.meetings[0];
  const sub = [
    longDay(day.date),
    meeting ? (day.meetings.some((m) => m.mandatory) ? "mandatory" : "") : "no meeting today",
    meeting ? `for ${meeting.subteams.length ? meeting.subteams.join(", ") : "everyone"}` : "",
    "newest first",
  ].filter(Boolean).join(" · ");
  const match = (name: string) => name.toLowerCase().includes(find.trim().toLowerCase());
  const here = day.here.filter((r) => match(r.name));
  const absent = day.absent.filter((r) => match(r.name));

  return (
    <Screen>
      <PageHeader title="Today" sub={sub} actions={me.roles.attendanceAdmin && <Btn kind="primary" href="/apps/attendance/kiosk">Open kiosk</Btn>} />
      <Stats items={[
        { label: "Here today", value: day.here.length, note: `of ${day.expected} members` },
        { label: "This month", value: day.monthAverage, note: "average per meeting" },
        { label: "Absent", value: day.absent.length, note: "expected, not signed in" },
        ...(day.myHours !== null ? [{ label: "You", value: hoursText(day.myHours), note: "this season" }] : []),
      ]} />
      <label className="att-find">
        <Icon name="search" />
        <input className="k-input" type="search" placeholder="Find a name" aria-label="Find a name" value={find} onChange={(e) => setFind(e.target.value)} autoComplete="off" />
      </label>
      <DataTable<HereRow>
        columns={[
          { key: "name", label: "Name", width: "minmax(0, 2fr)", menu: ["text"] },
          { key: "subteam", label: "Subteam", width: "minmax(0, 1.6fr)", value: (r) => subteamText(r.subteams), render: (r) => subteamText(r.subteams) },
          { key: "signedInAt", label: "Signed in", width: "minmax(0, 1.2fr)", menu: ["date"], render: (r) => <>{formatTime(r.signedInAt)}{r.signedOutAt && <span className="k-hint"> · left {formatTime(r.signedOutAt)}</span>}</> },
          { key: "hours", label: "This season", width: "minmax(0, 1fr)", menu: ["num"], render: (r) => hoursText(r.hours) },
          { key: "absences", label: "Absences", width: "minmax(0, 1fr)", menu: ["num"] },
        ]}
        rows={here}
        rowKey={(r) => r.name}
        sort={{ key: "signedInAt", dir: "desc" }}
        empty={find ? "No one here by that name." : "Nobody has signed in yet today."}
      />
      {meeting && (
        <Section title={`Absent · ${day.absent.length}`}>
          <Note>Shown for every meeting, mandatory or not. Only members whose subteam is assigned to this meeting are listed (everyone, when no subteams are ticked).</Note>
          <DataTable<AbsentRow>
            columns={[
              { key: "name", label: "Name", width: "minmax(0, 2fr)", menu: ["text"] },
              { key: "subteam", label: "Subteam", width: "minmax(0, 2fr)", value: (r) => subteamText(r.subteams), render: (r) => subteamText(r.subteams) },
              { key: "absences", label: "Absences this season", width: "minmax(0, 1.4fr)", menu: ["num"] },
            ]}
            rows={absent}
            rowKey={(r) => r.name}
            empty={find ? "No one absent by that name." : "Everyone expected is here."}
          />
        </Section>
      )}
    </Screen>
  );
}
