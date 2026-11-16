import { describe, expect, it } from "vitest";
import { AREAS, jsonSchemaOf, matchesPlayed, parseContent, recordText, type Robots } from "../src/index";

const file = () => structuredClone(AREAS.robots.initial) as Robots;

describe("robots content", () => {
  it("the file in the repo is valid", () => {
    expect(parseContent("robots", file()).ok).toBe(true);
  });

  it("refuses negative or fractional match counts", () => {
    for (const wins of [-1, 2.5]) {
      const f = file();
      f.robots[0]!.wins = wins;
      const r = parseContent("robots", f);
      expect(r.ok, String(wins)).toBe(false);
      if (!r.ok) expect(r.issues[0]!.path).toBe("robots.0.wins");
    }
  });

  it("needs a four-digit season", () => {
    const f = file();
    f.robots[0]!.year = "26";
    expect(parseContent("robots", f).ok).toBe(false);
  });

  it("allows a robot without a photo", () => {
    const f = file();
    f.robots[0]!.image = "";
    expect(parseContent("robots", f).ok).toBe(true);
  });

  it("prints the record and adds up matches played", () => {
    const r = { wins: 26, losses: 38, ties: 1 };
    expect(recordText(r)).toBe("26-38-1");
    expect(matchesPlayed(r)).toBe(65);
  });

  it("gives the editor integer fields for the counts", () => {
    const schema = jsonSchemaOf("robots") as { properties: { robots: { items: { properties: Record<string, { type: string }> } } } };
    expect(schema.properties.robots.items.properties.wins!.type).toBe("integer");
  });
});
