// /apps/business/stats: sponsorship, grants and fundraising for a season. Operations, leads, mentors and boosters.
import { useEffect, useState } from "react";
import { business } from "@team6220/data";
import { Note, PageHeader, Screen, Section, Stats as StatTiles } from "@team6220/ui";
import { SeasonChips, money } from "./shared";

export function Stats() {
  const [data, setData] = useState<{ stats: business.BizStats; seasons: string[] } | null>(null);
  const [error, setError] = useState("");
  const load = (season?: string) => business.stats(season).then(setData, (e) => setError(e instanceof Error ? e.message : "We couldn't load the numbers."));
  useEffect(() => void load(), []);

  if (error) return <Screen><PageHeader title="Team stats" /><Note tone="bad">{error}</Note></Screen>;
  if (!data) return <Screen><p className="k-hint" role="status">Loading…</p></Screen>;
  const { stats } = data;
  const total = stats.raised.sponsors + stats.raised.grants;
  const decided = stats.pitches.accepted + stats.pitches.declined;
  const percent = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}% accepted` : "none decided yet");

  return (
    <Screen>
      <PageHeader title="Team stats" sub="Sponsorship, grants and fundraising for a season." />
      <SeasonChips seasons={data.seasons} value={stats.season} onChange={(s) => void load(s)} />
      <StatTiles items={[
        { label: "Money raised", value: money(total), note: `sponsors ${money(stats.raised.sponsors)} · grants ${money(stats.raised.grants)}` },
        { label: "Sponsor pitches", value: stats.sponsorStages.slice(2).reduce((a, b) => a + b, 0), note: percent(stats.pitches.accepted, decided) },
        { label: "Grants applied", value: stats.grants.applied, note: percent(stats.grants.accepted, stats.grants.applied) },
      ]} />
      <Section title="Where every sponsor is">
        <p className="k-hint">Number of companies at each stage</p>
        <Bars labels={business.SPONSOR_STAGES.map((n, i) => `${i}. ${n}`)} values={stats.sponsorStages} />
      </Section>
      <Section title="How decided pitches ended">
        <Bars labels={["Accepted", "Declined", "Still deciding"]} values={[stats.pitches.accepted, stats.pitches.declined, stats.pitches.deciding]} />
      </Section>
      <Section title="Where every grant is">
        <Bars labels={business.GRANT_STAGES.map((n, i) => `${i}. ${n}`)} values={stats.grantStages} />
      </Section>
    </Screen>
  );
}

/** A plain bar chart: a label, a bar as long as its number, the number. */
function Bars({ labels, values }: { labels: string[]; values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <ul className="biz-bars">
      {labels.map((label, i) => (
        <li key={label}>
          <span>{label}</span>
          <span className="biz-bar" role="img" aria-label={`${values[i]} of ${max}`}><span style={{ width: `${(values[i] / max) * 100}%` }} /></span>
          <strong>{values[i]}</strong>
        </li>
      ))}
    </ul>
  );
}
