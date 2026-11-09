// Before/after comparison of the robot's numbers so every decision shows what it changed.
import { derive } from './robotModel.js';

export function snapshot(run) {
  const s = derive(run);
  const ready = !!(s.picks.drivetrain && s.picks.intake && s.picks.scorer);
  return {
    ready, bulk: s.bulk, perf: s.bulk ? s.throughput : s.effCycle, weight: s.weight, complexity: s.complexity,
    reliability: s.cycleSuccess, practice: Math.max(0, s.budget.practice), issues: run.flaws.filter((f) => f.found && !f.fixed).length,
    hidden: run.flaws.filter((f) => !f.found && !f.fixed).length > 0,
  };
}

export function deltaLines(a, b) {
  const out = [];
  const add = (text, good) => out.push({ text, good });
  if (a.ready && b.ready && Math.abs(b.perf - a.perf) >= 0.05) {
    const d = b.perf - a.perf;
    if (b.bulk) add(`Throughput ${a.perf.toFixed(1)} → ${b.perf.toFixed(1)} points per second`, d > 0);
    else add(`Cycle time ${a.perf.toFixed(1)} → ${b.perf.toFixed(1)} s`, d < 0);
  } else if (!a.ready && b.ready) add(b.bulk ? `Throughput now ${b.perf.toFixed(1)} points per second` : `Cycle time now ${b.perf.toFixed(1)} s`, true);
  if (Math.abs(b.weight - a.weight) >= 0.5) add(`Weight ${b.weight > a.weight ? '+' : ''}${(b.weight - a.weight).toFixed(0)} lb`, b.weight < a.weight);
  if (Math.abs(b.complexity - a.complexity) >= 0.4) add(`Complexity ${b.complexity > a.complexity ? '+' : ''}${(b.complexity - a.complexity).toFixed(1)}`, b.complexity < a.complexity);
  if (Math.abs(b.reliability - a.reliability) >= 0.01) add(`Reliability ${Math.round(a.reliability * 100)}% → ${Math.round(b.reliability * 100)}%`, b.reliability > a.reliability);
  if (Math.abs(b.practice - a.practice) >= 0.5) add(`Driver practice ${Math.round(a.practice)} → ${Math.round(b.practice)} h`, b.practice > a.practice);
  if (b.issues !== a.issues) add(`Known issues ${a.issues} → ${b.issues}`, b.issues < a.issues);
  return out;
}
