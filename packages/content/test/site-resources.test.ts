// Checks that the resources data module keeps the old shape: same list, same menu entries, apps stay out of the file.
import { describe, expect, it } from "vitest";
import { ARCHIVE, RESOURCES } from "../../../sites/main/data/resources";

describe("sites/main/data/resources", () => {
  it("keeps the four cards in order, with external set for absolute links and menu labels for two (The Blue Alliance is off the menu)", () => {
    expect(RESOURCES.map((r) => r.title)).toEqual(["CAD on Onshape", "GitHub", "The Blue Alliance", "Team history"]);
    expect(RESOURCES.map((r) => r.external === true)).toEqual([true, true, true, false]);
    expect(RESOURCES.filter((r) => r.menuLabel).map((r) => r.menuLabel)).toEqual(["CAD on Onshape", "GitHub"]);
    expect(ARCHIVE).toEqual([]);
  });
});
