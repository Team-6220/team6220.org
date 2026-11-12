// Made-up parts for demo mode, one in every stage. Production has no protected actions of its own (every Team
// Member can do everything), so there are no demo rules here: the rules are the pure functions in rules.ts.
import { seedMock } from "../ops/mock";
import { claim, handBack, markCut, newPart, release, type Who } from "./rules";
import type { Part, PartRequest } from "./types";

seedMock((db) => {
  const hedy: Who = { id: "p-hedy", name: "Hedy Lamarr" };
  const lead: Who = { id: "demo-lead", name: "Demo Lead" };
  const member: Who = { id: "demo-member", name: "Demo Member" };
  const soon = (days: number) => new Date(Date.now() + days * 864e5).toLocaleDateString("en-CA");
  const project = db.rows("ops_projects")[0]?._id ?? "";
  const request = (over: Partial<PartRequest>): PartRequest => ({
    partName: "Part", projectId: project, taskId: "", cadLink: "https://cad.onshape.com/documents/EXAMPLE", fileLinks: "",
    material: "Aluminum tube", thickness: '1/16"', length: 12, width: 1, quantity: 1, method: "handmade", accuracy: "±1/32",
    priority: "normal", dueDate: soon(7), details: "", ...over,
  });
  // Each demo part gets its own _id up front, so the steps in rules.ts (which work on saved parts) can be used.
  const add = (over: Partial<PartRequest>, designer = hedy): Part => {
    const number = db.takeNumber("part");
    return { ...newPart(request(over), number, designer), _id: `demo-part-${number}` };
  };
  const save = (part: Part) => db.save<Part>("production_parts", part);

  save(add({ partName: "Intake side plate", material: "Polycarbonate sheet", thickness: '1/4"', length: 14, width: 6, quantity: 2, method: "shapeoko", priority: "high" }));
  save(release(add({ partName: "Gearbox plate", material: "Aluminum sheet", thickness: '1/4"', length: 8, width: 5, method: "shapeoko" }), lead, "Stock 9 x 6 in, toolpath in Drive > CAM > gearbox-plate.c2d"));
  save(add({ partName: "Elevator upright", length: 38.5, quantity: 2, priority: "urgent", dueDate: soon(2), details: "Deburr the ends." }));
  save(claim(add({ partName: '1.484" black hex shaft', material: "Hex shaft", thickness: '1/2"', length: 1.484, width: 0, accuracy: "±0.005" }), member));
  const started = claim(add({ partName: "Bumper bracket", material: "Aluminum sheet", thickness: '1/8"', length: 4, width: 2, quantity: 4 }), hedy);
  save(handBack(started, "Two of four cut, the other two are marked out.", "Blue bin on the manufacturing bench"));
  save(markCut(claim(add({ partName: "Cross tube", length: 21, priority: "low" }), lead)));
  save(add({ partName: "Camera mount", material: "PETG", thickness: "", length: 3, width: 2, method: "print", fileLinks: "Drive > Prints > camera-mount.stl", print: { printer: "Printer 1", filament: "PETG", color: "Black", estMinutes: 95, estGrams: 42 } }));
  save(add({ partName: "Wire guide", material: "PLA", thickness: "", length: 1, width: 1, quantity: 6, method: "print", priority: "low", print: { printer: "", filament: "PLA", color: "Gold", estMinutes: 20, estGrams: 5 } }));
});
