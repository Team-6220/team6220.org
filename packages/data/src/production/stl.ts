// Reads an STL file (the 3D export from Onshape or any CAD program) just far enough to know the part's size:
// its bounding box. The request form uses this to fill in length, width and thickness.
// Nothing is uploaded: the file is read in the browser.
//
// STL comes in two kinds. Binary: an 80-byte header, a triangle count, then 50 bytes per triangle. Text (ASCII):
// lines like "vertex 1.0 2.0 3.0". STL has no units: the person says which unit the file was exported in.

export interface StlSize {
  /** The three sizes, longest first, in the unit the file was exported in. */
  dims: [number, number, number];
  triangles: number;
}

export function stlSize(bytes: ArrayBuffer): StlSize {
  const view = new DataView(bytes);
  if (bytes.byteLength >= 84) {
    const count = view.getUint32(80, true);
    if (84 + count * 50 === bytes.byteLength) return binarySize(view, count);
  }
  return textSize(new TextDecoder().decode(bytes));
}

function binarySize(view: DataView, count: number): StlSize {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let t = 0; t < count; t++) {
    for (let v = 0; v < 3; v++) {
      const at = 84 + t * 50 + 12 + v * 12; // skip the 12-byte normal, then three 12-byte corners
      for (let k = 0; k < 3; k++) {
        const value = view.getFloat32(at + k * 4, true);
        min[k] = Math.min(min[k], value);
        max[k] = Math.max(max[k], value);
      }
    }
  }
  return finish(min, max, count);
}

function textSize(text: string): StlSize {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let corners = 0;
  for (const match of text.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) {
    corners++;
    for (let k = 0; k < 3; k++) {
      const value = Number(match[k + 1]);
      min[k] = Math.min(min[k], value);
      max[k] = Math.max(max[k], value);
    }
  }
  if (!corners) throw new Error("This doesn't look like an STL file.");
  return finish(min, max, Math.floor(corners / 3));
}

function finish(min: number[], max: number[], triangles: number): StlSize {
  const dims = [0, 1, 2].map((k) => Math.round((max[k] - min[k]) * 1000) / 1000).sort((a, b) => b - a);
  if (dims.some((d) => !Number.isFinite(d))) throw new Error("This STL file has no shape in it.");
  return { dims: dims as [number, number, number], triangles };
}
