import { randomProfile, DEFAULT_PROFILE, type DriverProfile, type SkillLevel } from "@goldsim/agents";
import { resolveMechanisms, Rng, type GameModule } from "@goldsim/core";
import type { Alliance, MatchRobot, RobotDesign } from "@goldsim/schema";
import { resolveGame } from "./registry.js";
import type { DriverSpec, MatchSpec } from "./run-match.js";
import { seedsFrom, setAtPath, type Job, type SweepConfig, type SweepParam } from "./sweep.js";

/** How the other robots on the field are driven. */
export type ProfileMode =
  | { kind: "random"; /** Force one skill tier instead of mixing. */ skill?: SkillLevel }
  | { kind: "fixed"; profile: DriverProfile };

/**
 * "Test an archetype": every match puts a robot under test on a random alliance and station, with random
 * partners and opponents (drawn from `pool`) driven by random strategies. Serializable, so a results file can
 * rebuild exactly the same jobs.
 */
export interface RandomAllianceSettings {
  /** Designs under test; each gets `matches` matches. */
  subjects: RobotDesign[];
  /** Designs the partners and opponents are drawn from (with replacement). */
  pool: RobotDesign[];
  matches: number;
  baseSeed: number;
  /** Strategies of the other robots. */
  others: ProfileMode;
  /** Strategy of the robot under test (default: the standard "Balanced" driver). */
  subjectProfile?: DriverProfile;
  /** Game module id (resolved from the registry). */
  game: string;
  profile?: string;
  /** Optional sweep on the robot under test. Targets use `robot: 0`; the value is applied to the subject. */
  params?: SweepParam[];
  configs?: SweepConfig[];
}

function capabilities(design: RobotDesign, game: GameModule) {
  const bases = new Set(resolveMechanisms(design, game.mechanisms).map((m) => m.base));
  return { shooter: bases.has("shooter"), intake: bases.has("intake"), climber: bases.has("climber") };
}

/** Applies one configuration's swept values to the subject's design and profile. */
function applyToSubject(design: RobotDesign, profile: DriverProfile, params: SweepParam[], config: SweepConfig) {
  let d = design;
  let p = profile;
  for (const param of params) {
    const v = config.values[param.id];
    if (v === undefined) continue;
    if (param.target.kind === "design") d = setAtPath(d, param.target.path, v);
    else p = { ...p, [param.target.knob]: v };
  }
  return { design: d, profile: p };
}

/** One match's lineup: subject placed randomly, the other 2n-1 slots filled from the pool. Depends only on (baseSeed, subject, match). */
function lineup(s: RandomAllianceSettings, game: GameModule, subjectIndex: number, matchIndex: number) {
  const rng = new Rng((s.baseSeed ^ Math.imul(subjectIndex + 1, 0x9e3779b1) ^ Math.imul(matchIndex + 1, 0x85ebca6b)) >>> 0);
  const n = game.game.robotsPerAlliance;
  const subjectAlliance: Alliance = rng.next() < 0.5 ? "blue" : "red";
  const subjectStation = rng.int(n);
  const slots: { alliance: Alliance; station: number; subject: boolean; design: RobotDesign | null; profile: DriverProfile | null }[] = [];
  for (const alliance of ["blue", "red"] as const)
    for (let station = 0; station < n; station++) {
      const isSubject = alliance === subjectAlliance && station === subjectStation;
      if (isSubject) {
        slots.push({ alliance, station, subject: true, design: null, profile: null });
        continue;
      }
      const design = s.pool[rng.int(s.pool.length)]!;
      const profile = s.others.kind === "fixed" ? s.others.profile : randomProfile(rng, { capabilities: capabilities(design, game), skill: s.others.skill });
      slots.push({ alliance, station, subject: false, design, profile });
    }
  return slots;
}

/**
 * Jobs for a random-alliance run: for each configuration (one if there is no sweep), subject design, and match number,
 * one match. Every configuration sees the same lineups and seeds so sweep values are compared fairly.
 */
export function randomAllianceJobs(s: RandomAllianceSettings): Job[] {
  if (!s.subjects.length) throw new Error("Pick at least one robot to test.");
  if (!s.pool.length) throw new Error("The pool of other robots is empty.");
  const game = resolveGame(s.game);
  const params = s.params ?? [];
  const configs = s.configs?.length ? s.configs : [{ id: "c0", values: {} }];
  const seeds = seedsFrom(Math.max(1, s.matches), s.baseSeed);
  const baseSubjectProfile = s.subjectProfile ?? DEFAULT_PROFILE;
  const jobs: Job[] = [];
  s.subjects.forEach((subject, si) => {
    for (const config of configs) {
      const applied = applyToSubject(subject, baseSubjectProfile, params, config);
      seeds.forEach((seed, mi) => {
        const slots = lineup(s, game, si, mi);
        const robots: MatchRobot[] = [];
        const drivers: DriverSpec[] = [];
        let subjectRobot = 0;
        for (const slot of slots) {
          if (slot.subject) subjectRobot = robots.length;
          robots.push({ design: structuredClone(slot.subject ? applied.design : slot.design!), alliance: slot.alliance, station: slot.station });
          drivers.push({ kind: "agent", profile: slot.subject ? applied.profile : slot.profile! });
        }
        const spec: MatchSpec = { game: s.game, robots, drivers, seed, profile: s.profile };
        jobs.push({ id: `${config.id}-t${si}-m${mi}`, configId: `${config.id}-t${si}`, values: config.values, seed, spec, subject: subjectRobot });
      });
    }
  });
  return jobs;
}
