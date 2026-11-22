// A small line chart in SVG: percents from 0 to 100 over a list of labels, with optional bands for competitions.
import type { ReactNode } from "react";

export interface Series {
  name: string;
  color: string;
  values: number[];
  thick?: boolean;
}

export interface Band {
  /** Index of the first and last point it covers. */
  from: number;
  to: number;
  label: string;
}

const W = 1000;
const H = 360;
const PAD = { left: 56, right: 24, top: 36, bottom: 44 };

export function LineChart({ labels, series, bands = [], every = 1 }: { labels: string[]; series: Series[]; bands?: Band[]; every?: number }) {
  const n = Math.max(labels.length, 2);
  const x = (i: number) => PAD.left + (i / (n - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / 100) * (H - PAD.top - PAD.bottom);
  const label: ReactNode[] = [];
  return (
    <div className="att-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Attendance over the season" preserveAspectRatio="xMidYMid meet">
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="att-grid" />
            <text x={PAD.left - 10} y={y(v) + 4} textAnchor="end" className="att-axis">{v}%</text>
          </g>
        ))}
        {bands.map((b) => (
          <g key={b.label + b.from}>
            <rect x={x(b.from) - 9} y={PAD.top} width={x(b.to) - x(b.from) + 18} height={H - PAD.top - PAD.bottom} className="att-band" />
            <text x={(x(b.from) + x(b.to)) / 2} y={PAD.top - 10} textAnchor="middle" className="att-band-label">{b.label}</text>
          </g>
        ))}
        {labels.map((l, i) => (i % every === 0 ? <text key={i} x={x(i)} y={H - 14} textAnchor="middle" className="att-axis">{l}</text> : null))}
        {series.map((s) => (
          <g key={s.name}>
            <polyline fill="none" stroke={s.color} strokeWidth={s.thick ? 5 : 2} strokeLinejoin="round" strokeLinecap="round" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
            {s.values.length === 1 && <circle cx={x(0)} cy={y(s.values[0])} r={5} fill={s.color} />}
          </g>
        ))}
        {label}
      </svg>
      <ul className="att-legend">
        {series.map((s) => <li key={s.name}><i style={{ background: s.color }} />{s.name}</li>)}
        {bands.length > 0 && <li><i className="att-band-key" />Competition</li>}
      </ul>
    </div>
  );
}
