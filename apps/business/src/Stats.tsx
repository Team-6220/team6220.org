// /apps/business/stats: sponsorship, grants and fundraising for a season. Everyone on the team can see it.
import { useEffect, useState, type ReactNode } from "react";
import { business } from "@team6220/data";
import { Note, PageHeader, Screen } from "@team6220/ui";
import { ExportMenu, SeasonPicker, savedSeason, money } from "./shared";

const BLUE = "#4054e4";
const GOLD = "var(--color-gold)";
const GREEN = "#7fb38a";
const RED = "#e5484d";
const MONTHS = ["Aug", "Sep", "Oct", "Nov", "Dec", "Jan"];
const SHORT_KIND: Record<string, string> = { "FIRST / FRC-specific": "FIRST", "Local (school, city)": "local", Corporate: "corporate", Foundation: "foundation", Government: "government" };

export function Stats() {
  const [data, setData] = useState<{ stats: business.BizStats; seasons: string[] } | null>(null);
  const [error, setError] = useState("");
  const load = (season?: string) => business.stats(season).then(setData, (e) => setError(e instanceof Error ? e.message : "We couldn't load the numbers."));
  useEffect(() => void load(savedSeason()), []);

  if (error) return <Screen><PageHeader title="Team stats" /><Note tone="bad">{error}</Note></Screen>;
  if (!data) return <Screen><p className="k-hint" role="status">Loading…</p></Screen>;
  const { stats } = data;
  const raised = stats.raised.sponsors + stats.raised.grants;
  const pitches = stats.sponsorStages.slice(2).reduce((a, b) => a + b, 0);
  const percent = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}% accepted` : "none decided yet");
  const accepted = stats.kinds.filter((k) => k.filled > 0).map((k) => `${SHORT_KIND[k.kind]} ${k.accepted} of ${k.filled}`).join(" · ");

  const exportRows = () => [
    ["Season", stats.season],
    ["Money raised", String(raised)], ["Sponsor pitches", String(pitches)], ["Grants applied", String(stats.grants.applied)],
    ...business.SPONSOR_STAGES.map((name, i) => [`Sponsors at stage ${i}: ${name}`, String(stats.sponsorStages[i])]),
    ...stats.seasonsRaised.map((s) => [`Money raised ${s.season}`, String(s.raised)]),
  ];

  return (
    <Screen>
      <PageHeader title="Team stats" sub="Sponsorship, grants and fundraising for the season chosen at the top of the sidebar" actions={<ExportMenu filename={`business-stats-${stats.season}.csv`} rows={exportRows} />} />
      <SeasonPicker seasons={data.seasons} value={stats.season} onChange={(s) => void load(s)} />
      <div className="biz-tiles">
        <Tile label="Money raised" value={money(raised)} note={`sponsors ${money(stats.raised.sponsors)} · grants ${money(stats.raised.grants)}`} />
        <Tile label="Sponsor pitches" value={String(pitches)} note={percent(stats.pitches.accepted, pitches)} />
        <Tile label="Grants applied" value={String(stats.grants.applied)} note={percent(stats.grants.accepted, stats.grants.applied)} />
        <Tile label="Restaurant days" value={`${stats.restaurant.used} of ${stats.restaurant.limit}`} note={stats.restaurant.used >= stats.restaurant.limit ? `limit reached at ${stats.restaurant.limit}` : `${stats.restaurant.limit - stats.restaurant.used} left`} />
      </div>
      <div className="biz-panels">
        <Panel title="Where every sponsor is" sub="Number of companies at each stage">
          <Bars color={BLUE} labels={business.SPONSOR_STAGES.map((n, i) => `${i}. ${n}`)} values={stats.sponsorStages} />
        </Panel>
        <Panel title="How decided pitches ended" sub="All sponsor pitches this season">
          <Donut parts={[{ label: "Accepted", value: stats.pitches.accepted, color: GREEN }, { label: "Declined", value: stats.pitches.declined, color: RED }, { label: "Still deciding", value: stats.pitches.deciding, color: GOLD }]} center={stats.pitches.accepted + stats.pitches.declined} />
        </Panel>
        <Panel title="Grants by kind" sub="How many of each kind we filled out">
          <Bars color={GOLD} labels={stats.kinds.map((k) => k.kind)} values={stats.kinds.map((k) => k.filled)} />
          {accepted && <p className="k-hint">Filled out, with how many were accepted: {accepted}</p>}
        </Panel>
        <Panel title="Money raised each season" sub="Sponsors and grants together">
          <Bars color={GOLD} labels={stats.seasonsRaised.map((s) => s.season)} values={stats.seasonsRaised.map((s) => s.raised)} format={money} />
        </Panel>
        <Panel title="Pitches sent each month" sub="Running total of sponsor pitches">
          <Line labels={MONTHS} values={stats.pitchesByMonth} />
        </Panel>
        <Panel title="1-2-3-100 progress" sub="Students by status">
          <Bars color={GREEN} labels={["Done", "Waiting on Operations", "In progress", "Not started"]} values={[stats.progress.done, stats.progress.waiting, stats.progress.inProgress, stats.progress.notStarted]} />
        </Panel>
      </div>
    </Screen>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="k-box biz-tile"><span className="biz-tile-label">{label}</span><strong>{value}</strong><span className="k-hint">{note}</span></div>;
}

function Panel({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return <section className="k-box biz-panel"><h3>{title}</h3><p className="k-hint">{sub}</p>{children}</section>;
}

/** A label, a bar as long as its number (the biggest fills the track), and the number. */
function Bars({ labels, values, color, format = String }: { labels: string[]; values: number[]; color: string; format?: (n: number) => string }) {
  const max = Math.max(1, ...values);
  return (
    <ul className="biz-bars">
      {labels.map((label, i) => (
        <li key={label}>
          <span>{label}</span>
          <span className="biz-bar" role="img" aria-label={`${format(values[i])}`}><span style={{ width: `${(values[i] / max) * 100}%`, background: color }} /></span>
          <strong>{format(values[i])}</strong>
        </li>
      ))}
    </ul>
  );
}

/** A ring split into parts, the total in the middle, and a legend. */
function Donut({ parts, center }: { parts: { label: string; value: number; color: string }[]; center: number }) {
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="biz-donut">
      <svg viewBox="0 0 160 160" width="160" height="160" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")}>
        <circle cx="80" cy="80" r={radius} fill="none" stroke="var(--color-border)" strokeWidth="22" />
        {total > 0 && parts.map((p) => {
          const length = (p.value / total) * circumference;
          const circle = <circle key={p.label} cx="80" cy="80" r={radius} fill="none" stroke={p.color} strokeWidth="22" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} transform="rotate(-90 80 80)" />;
          offset += length;
          return circle;
        })}
        <text x="80" y="82" textAnchor="middle" className="biz-donut-n">{center}</text>
        <text x="80" y="100" textAnchor="middle" className="biz-donut-l">decided</text>
      </svg>
      <ul>{parts.map((p) => <li key={p.label}><span style={{ background: p.color }} />{p.label} <strong>{p.value}</strong></li>)}</ul>
    </div>
  );
}

/** A line with a dot for each month. */
function Line({ labels, values }: { labels: string[]; values: number[] }) {
  const width = 460, height = 180, left = 24, right = 24, top = 14, bottom = 34;
  const max = Math.max(1, ...values);
  const x = (i: number) => left + (i * (width - left - right)) / (labels.length - 1);
  const y = (v: number) => top + (1 - v / max) * (height - top - bottom);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="biz-line" role="img" aria-label={labels.map((l, i) => `${l} ${values[i]}`).join(", ")}>
      <polyline fill="none" stroke={GOLD} strokeWidth="3" points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
      {values.map((v, i) => <circle key={labels[i]} cx={x(i)} cy={y(v)} r="4.5" fill={GOLD} />)}
      {labels.map((l, i) => <text key={l} x={x(i)} y={height - 8} textAnchor="middle" className="biz-line-l">{l}</text>)}
    </svg>
  );
}
