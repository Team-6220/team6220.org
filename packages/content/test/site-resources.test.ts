// Checks that the resources data module keeps the old shape: same list, same menu entries, apps stay out of the file.
import { describe, expect, it } from "vitest";
import { ARCHIVE, RESOURCES } from "../../../sites/main/data/resources";

describe("sites/main/data/resources", () => {
  it("keeps the cards in order, with external set for absolute links and menu labels for all but the last two", () => {
    expect(RESOURCES.map((r) => r.title)).toEqual([
      "Master link",
      "Team resources",
      "Design resources",
      "Operations resources",
      "CAD on Onshape",
      "GitHub",
      "The Blue Alliance",
      "Team history",
    ]);
    expect(RESOURCES.map((r) => r.external === true)).toEqual([true, true, true, true, true, true, true, false]);
    expect(RESOURCES.filter((r) => r.menuLabel).map((r) => r.menuLabel)).toEqual([
      "Master link",
      "Team resources",
      "Design resources",
      "Operations resources",
      "CAD on Onshape",
      "GitHub",
    ]);
    expect(ARCHIVE).toEqual([]);
  });
});
