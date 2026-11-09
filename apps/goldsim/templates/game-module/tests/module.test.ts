import { describe, expect, it } from "vitest";
import { checkModule, validateModuleFiles } from "@goldsim/schema";
import { Match } from "@goldsim/core";
import { gameModule, moduleFiles } from "../src/index.js";

// Conformance tests. Turn every worked example in the manual into a test here.
// See packages/game-rebuilt/tests/ for scoring-rule, timeline, gate, climb and foul examples.

describe("module files", () => {
  it("match their schemas and pass cross-file checks", () => {
    const { module, errors } = validateModuleFiles(moduleFiles);
    expect(errors).toEqual([]);
    expect(checkModule(module!).errors).toEqual([]);
  });

  it.todo("match length equals the manual's (sum of robot-enabled phases)");
  it.todo("each scoring example in the manual produces the right points");
});

describe("match", () => {
  it("an empty match runs to the end", async () => {
    const m = await Match.create({ game: gameModule, robots: [], seed: 1 });
    m.runToEnd();
    expect(m.isOver).toBe(true);
    m.dispose();
  });
});
