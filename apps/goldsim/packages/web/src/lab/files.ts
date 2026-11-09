import { RobotDesign, validate, type MatchRobot } from "@goldsim/schema";
import { jobsFromFile, type BatchResultsFile } from "@goldsim/batch";
import { session } from "../app-state.js";
import { toast } from "../ui/dom.js";
import { downloadText, pickFiles, readFiles, safeName } from "./util.js";

/** Checks the shape of an imported results file. Designs inside are validated against the robot schema. */
export function checkResultsFile(data: unknown): { file?: BatchResultsFile; error?: string } {
  const f = data as Partial<BatchResultsFile> | null;
  if (!f || typeof f !== "object" || f.kind !== "goldsim.batch" || f.schemaVersion !== 1) return { error: "Not a GoldSim batch results file (kind goldsim.batch, schemaVersion 1)." };
  if (!Array.isArray(f.results) || !Array.isArray(f.errors) || !f.settings || !Array.isArray(f.settings.seeds) || !Array.isArray(f.settings.configs) || !Array.isArray(f.settings.params))
    return { error: "Results file is missing required sections (settings, results, errors)." };
  const robots = f.settings.base?.robots;
  if (!Array.isArray(robots)) return { error: "Results file has no robots." };
  for (const [i, r] of robots.entries()) {
    const v = validate(RobotDesign, (r as MatchRobot).design);
    if (!v.ok) return { error: `Robot ${i} design is invalid: ${v.issues[0]?.path} ${v.issues[0]?.message}` };
  }
  const random = f.settings.random;
  if (random) {
    for (const [k, list] of [["subjects", random.subjects], ["pool", random.pool]] as const) {
      if (!Array.isArray(list) || !list.length) return { error: `Results file's random-alliance ${k} are missing.` };
      for (const d of list) {
        const v = validate(RobotDesign, d);
        if (!v.ok) return { error: `A ${k} design is invalid: ${v.issues[0]?.path} ${v.issues[0]?.message}` };
      }
    }
  }
  if (typeof f.name !== "string" || !f.name.trim()) f.name = "Imported run";
  if (f.settings.base.game !== session.game.game.id) return { error: `File is for game "${f.settings.base.game}", but the loaded game is "${session.game.game.id}".` };
  for (const r of f.results) if (!r || typeof r.jobId !== "string" || !r.result || !r.summary) return { error: "A result row is malformed." };
  return { file: f as BatchResultsFile };
}

export function importResultsFile(onFile: (file: BatchResultsFile) => void): void {
  pickFiles(".json,application/json", false, async (files) => {
    try {
      const [first] = await readFiles(files, 50_000_000);
      if (!first) return;
      const { name, text } = first;
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`${name} is not valid JSON.`);
      }
      const { file, error } = checkResultsFile(data);
      if (!file) throw new Error(error);
      onFile(file);
    } catch (e) {
      toast((e as Error).message, 6000);
    }
  });
}

export function exportResultsFile(file: BatchResultsFile): void {
  downloadText(`${safeName(file.name)}-${file.createdAt.slice(0, 10)}.goldsim-batch.json`, JSON.stringify(file));
}

const planned = new WeakMap<BatchResultsFile, number>();

/** Number of matches a run was planned to have (finished or not). */
export function plannedMatches(file: BatchResultsFile): number {
  let n = planned.get(file);
  if (n === undefined) {
    try {
      n = jobsFromFile(file).length;
    } catch {
      n = file.results.length;
    }
    planned.set(file, n);
  }
  return n;
}
