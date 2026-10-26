import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { allianceObservations, analyzeContributions, effectHeadline, outcomeById, parameterEffect, type Sample } from "@goldsim/analytics";
import type { BatchResultsFile } from "../src/index.js";

// Local sanity check against a real exported sweep. Skipped when the file is not on this machine.
const FILE = process.env.GOLDSIM_SWEEP_FILE ?? "C:\\Users\\hosse\\Downloads\\Sweep-2026-10-25.goldsim-batch.json";

describe.skipIf(!existsSync(FILE))("user's exit-speed sweep (Sweep-2026-10-25)", () => {
  // Read lazily: describe bodies still run at collection time, even when the suite is skipped.
  const load = () => JSON.parse(readFileSync(FILE, "utf8")) as BatchResultsFile;

  it("exit speed has no clear effect on the swept robot's points", () => {
    const file = load();
    const param = file.settings.params[0]!;
    const target = param.target as { robot: number };
    const outcome = outcomeById("robotPoints");
    const samples: Sample[] = file.results.map((r) => ({ params: r.values, outcome: outcome.value(r.summary, target.robot) ?? NaN }));
    const e = parameterEffect(samples, param.id)!;
    const text = effectHeadline(e, { paramLabel: "Exit speed", unit: "m/s", outcome, subject: "Blue 1" });
    console.log(text);
    expect(e.clear).toBe(false);
    expect(text).toContain("no clear effect");
  });

  it("the EPA-style contribution is reported as not enough variety", () => {
    const file = load();
    const a = analyzeContributions(allianceObservations(file.results.map((r) => r.result)));
    console.log(a.status, "-", a.message);
    expect(a.status).toBe("unidentifiable");
    expect(a.message).toMatch(/not enough variety/i);
  });
});
