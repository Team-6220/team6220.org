// Stats: the season's numbers, from everyone's sign-ins.
import { useEffect, useState } from "react";
import { attendance, type TeamStats } from "@team6220/data";
import { DataTable, Note, PageHeader, Screen, Section, Stats as StatCards } from "@team6220/ui";
import { LineChart, type Band, type Series } from "./Chart";
import { errorMessage, monthDay, shortDay } from "./util";

const COLORS = ["#b9b4ff", "#a8e6a3", "#ffb8b0", "#6fe3ee", "#d8d8e0", "#f0a8e6"];

export function Stats() {
  const [stats, setStats] = useState<TeamStats | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    attendance.stats().then(setStats, (err) => setError(errorMessage(err, "We couldn't load the stats.")));
  }, []);
  if (error) return <Screen><PageHeader title="Stats" /><Note tone="bad">{error}</Note></Screen>;
  if (!stats) return <Screen><p className="k-hint" role="status">Loading…</p></Screen>;
  if (!stats.meetings) return <Screen><PageHeader title="Stats" sub="This season, from everyone's sign-ins" /><Note>There are no past meetings yet this season.</Note></Screen>;

  const names = stats.subteams.map((s) => s.name);
  const series: Series[] = [
    ...names.map((name, i) => ({ name, color: COLORS[i % COLORS.length], values: stats.chart.map((c) => c.subteams[name] ?? 0) })),
    { name: "Team", color: "#ffa500", values: stats.chart.map((c) => c.percent), thick: true },
  ];
  // A competition on a meeting day is a band on the chart.
  const bands: Band[] = stats.chart.flatMap((c, i): Band[] => (c.competition ? [{ from: i, to: i, label: c.title }] : []));
  const every = Math.max(1, Math.ceil(stats.chart.length / 8));
  return (
    <Screen>
      <PageHeader title="Stats" sub="This season, from everyone's sign-ins" />
      <StatCards items={[
        { label: "Average per meeting", value: stats.averagePerMeeting, note: `of ${stats.members} members` },
        { label: "Season attendance", value: `${stats.seasonPercent}%`, note: "of all member-meetings" },
        { label: "Best day", value: stats.bestDay?.weekday ?? "—", note: stats.bestDay ? `${stats.bestDay.average} on average` : "" },
        { label: "Best meeting", value: stats.bestMeeting ? shortDay(stats.bestMeeting.date) : "—", note: stats.bestMeeting ? `${stats.bestMeeting.here} of ${stats.bestMeeting.expected} here · ${stats.bestMeeting.percent}%` : "" },
      ]} />
      <StatCards items={[
        { label: "Average individual attendance", value: `${stats.averageIndividual}%`, note: `across all ${stats.members} members` },
        { label: `Members above ${stats.minPercent}%`, value: `${stats.aboveMinimum} of ${stats.members}`, note: `${stats.minPercent}% is the minimum; change it in Site Management` },
      ]} />
      <Section title="Attendance at each meeting this season">
        <LineChart labels={stats.chart.map((c) => monthDay(c.date))} series={series} bands={bands} every={every} />
      </Section>
      <DataTable<TeamStats["subteams"][number]>
        columns={[
          { key: "name", label: "Subteam", width: "minmax(0, 2fr)" },
          { key: "members", label: "Members", width: "minmax(0, 1fr)", menu: ["num"] },
          { key: "average", label: "Average attendance", width: "minmax(0, 1fr)", menu: ["num"], render: (r) => `${r.average}%` },
        ]}
        rows={stats.subteams}
        rowKey={(r) => r.name}
        empty="No subteams yet."
      />
    </Screen>
  );
}
