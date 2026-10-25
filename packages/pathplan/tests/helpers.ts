import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Observation } from "@goldsim/core";
import { parseAuto, parsePath, type PPAuto, type PPPath } from "../src/index.js";

const dir = (sub: string) => fileURLToPath(new URL(`./fixtures/${sub}/`, import.meta.url));

export function loadPath(name: string): PPPath {
  const r = parsePath(readFileSync(`${dir("paths")}${name}.path`, "utf8"), name);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.value;
}

export function loadAuto(name: string): PPAuto {
  const r = parseAuto(readFileSync(`${dir("autos")}${name}.auto`, "utf8"), name);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.value;
}

export function readFixture(sub: "paths" | "autos", file: string): string {
  return readFileSync(`${dir(sub)}${file}`, "utf8");
}

/** Minimal observation for command-tree tests that never drive. */
export function fakeObs(tick: number, hz = 100): Observation {
  return {
    tick,
    t: tick / hz,
    hz,
    phase: { id: "AUTO", label: "Auto", period: "auto", robotsEnabled: true, timeLeft: 10 },
    matchTimeLeft: 100,
    self: { x: 0, y: 0, theta: 0, vx: 0, vy: 0 } as Observation["self"],
    robots: [],
    pieces: [],
    elementActive: {},
    objectives: [],
    score: { blue: 0, red: 0 },
  };
}
