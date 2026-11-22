// Did I sign in? (every meeting you were expected at) and My hours (your hours and your attendance this season).
import { useEffect, useState } from "react";
import { attendance, type MyRow, type MyView } from "@team6220/data";
import { DataTable, Note, PageHeader, Pill, Screen, Section, Stats } from "@team6220/ui";
import { LineChart } from "./Chart";
import { errorMessage, formatTime, hoursText, monthLong, monthShort, shortDay } from "./util";

function useMine(): { mine: MyView | null; error: string } {
  const [mine, setMine] = useState<MyView | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    attendance.mine().then(setMine, (err) => setError(errorMessage(err, "We couldn't load your attendance.")));
  }, []);
  return { mine, error };
}

const NOT_LINKED = "We couldn't match your account to the team roster, so there is nothing to show yet. A lead or mentor can check that your student ID is on the roster.";

export function Mine() {
  const { mine, error } = useMine();
  if (error) return <Screen><PageHeader title="Did I sign in?" /><Note tone="bad">{error}</Note></Screen>;
  if (!mine) return <Screen><p className="k-hint" role="status">Loading…</p></Screen>;
  if (!mine.onRoster) return <Screen><PageHeader title="Did I sign in?" /><Note tone="warn">{NOT_LINKED}</Note></Screen>;
  return (
    <Screen>
      <PageHeader title="Did I sign in?" sub="Your sign-ins, newest first" />
      {mine.signedInToday
        ? <Note tone="ok"><strong>Yes:</strong> you signed in today at {formatTime(mine.signedInToday)}.</Note>
        : <Note>You haven't signed in today. Sign in at the kiosk when you get to a meeting.</Note>}
      <DataTable<MyRow>
        columns={[
          { key: "date", label: "Meeting", width: "minmax(0, 2fr)", menu: ["date"], render: (r) => <>{r.mandatory && "★ "}{shortDay(r.date)}</> },
          { key: "signedInAt", label: "Signed in", width: "minmax(0, 1.5fr)", render: (r) => (r.signedInAt ? <>{formatTime(r.signedInAt)}{r.signedOutAt && <span className="k-hint"> · left {formatTime(r.signedOutAt)}</span>}</> : "—") },
          { key: "status", label: "", width: "110px", value: (r) => (r.here ? "Here" : "Absent"), render: (r) => <Pill tone={r.here ? "ok" : "bad"}>{r.here ? "Here" : "Absent"}</Pill> },
        ]}
        rows={mine.rows}
        rowKey={(r) => r.date}
        sort={{ key: "date", dir: "desc" }}
        statusKey="status"
        empty="No meetings yet this season."
      />
    </Screen>
  );
}

export function Hours() {
  const { mine, error } = useMine();
  if (error) return <Screen><PageHeader title="My hours" /><Note tone="bad">{error}</Note></Screen>;
  if (!mine) return <Screen><p className="k-hint" role="status">Loading…</p></Screen>;
  if (!mine.onRoster) return <Screen><PageHeader title="My hours" /><Note tone="warn">{NOT_LINKED}</Note></Screen>;
  const month = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }).slice(0, 7);
  const below = mine.expected > 0 && mine.percent < mine.minPercent;
  return (
    <Screen>
      <PageHeader title="My hours" sub="Counted from when you sign in until the meeting ends, or until you sign out if you leave early" />
      <Stats items={[
        { label: "This season", value: hoursText(mine.seasonHours), note: "since Aug 1" },
        { label: "This month", value: hoursText(mine.monthHours), note: monthLong(month) },
        { label: "Your attendance", value: `${mine.percent}%`, note: `${mine.attended} of ${mine.expected} meetings` },
        { label: "Mandatory", value: `${mine.mandatoryAttended} of ${mine.mandatoryExpected}`, note: mine.mandatoryAttended === mine.mandatoryExpected ? "all attended" : "missed some" },
      ]} />
      {below && <Note tone="warn"><strong>Your attendance is {mine.percent}%, below the team's {mine.minPercent}% minimum.</strong> Come to the next meetings to get back above it. The minimum is set in Site Management.</Note>}
      {mine.months.length > 1 && (
        <Section title="Your attendance this season">
          <LineChart labels={mine.months.map((m) => monthShort(m.month))} series={[{ name: "You", color: "#ffa500", values: mine.months.map((m) => m.percent), thick: true }]} />
        </Section>
      )}
      <DataTable<MyView["months"][number]>
        columns={[
          { key: "month", label: "Month", width: "minmax(0, 2fr)", render: (r) => monthLong(r.month) },
          { key: "meetings", label: "Meetings", width: "minmax(0, 1fr)", menu: ["num"] },
          { key: "hours", label: "Hours", width: "minmax(0, 1fr)", menu: ["num"], render: (r) => hoursText(r.hours) },
        ]}
        rows={[...mine.months].reverse()}
        rowKey={(r) => r.month}
        empty="No meetings yet this season."
      />
    </Screen>
  );
}
