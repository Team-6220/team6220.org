import { pointInShape, shapePoints, type ResolvedElement, type Vec2 } from "@goldsim/core";
import type { FieldDef } from "@goldsim/schema";

/** Occupancy grid for one robot size. Static obstacles only; robots are avoided locally. */
export class NavGrid {
  readonly cell = 0.15;
  readonly cols: number;
  readonly rows: number;
  readonly blocked: Uint8Array;
  readonly cost: Float32Array;

  constructor(
    readonly field: FieldDef,
    elements: ResolvedElement[],
    readonly radius: number,
    readonly height: number,
  ) {
    this.cols = Math.ceil(field.length / this.cell);
    this.rows = Math.ceil(field.width / this.cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
    this.cost = new Float32Array(this.cols * this.rows).fill(1);
    const solids = elements
      .filter(
        (e) =>
          e.kind === "wall" ||
          ((e.kind === "sink" || e.kind === "climbStructure") && e.solid) ||
          (e.kind === "gate" && height > e.clearance),
      )
      .map((e) => shapePoints(e.shape));
    const terrains = elements.filter((e): e is Extract<ResolvedElement, { kind: "terrain" }> => e.kind === "terrain");
    const margin = radius + 0.04;
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        const p = this.center(c, r);
        const i = r * this.cols + c;
        if (p.x < margin || p.y < margin || p.x > field.length - margin || p.y > field.width - margin) {
          this.blocked[i] = 1;
          continue;
        }
        for (const poly of solids)
          if (distToPolygon(p, poly) < margin) {
            this.blocked[i] = 1;
            break;
          }
        for (const t of terrains) if (pointInShape(p.x, p.y, t.shape)) this.cost[i] = Math.max(this.cost[i]!, 1 / Math.max(0.2, t.speedFactor));
      }
  }

  center(c: number, r: number): Vec2 {
    return { x: (c + 0.5) * this.cell, y: (r + 0.5) * this.cell };
  }

  cellOf(p: Vec2): [number, number] {
    return [
      Math.min(this.cols - 1, Math.max(0, Math.floor(p.x / this.cell))),
      Math.min(this.rows - 1, Math.max(0, Math.floor(p.y / this.cell))),
    ];
  }

  /** Temporary obstacles (e.g. parked robots) used during one plan() call. */
  private dyn: Uint8Array | null = null;

  private isBlocked(i: number): boolean {
    return !!this.blocked[i] || (this.dyn !== null && !!this.dyn[i]);
  }

  isFree(p: Vec2): boolean {
    const [c, r] = this.cellOf(p);
    return !this.isBlocked(r * this.cols + c);
  }

  private markObstacles(obstacles: { x: number; y: number; r: number }[]): void {
    if (!obstacles.length) {
      this.dyn = null;
      return;
    }
    const dyn = new Uint8Array(this.cols * this.rows);
    for (const o of obstacles) {
      const rr = o.r + this.radius;
      const [c0, r0] = this.cellOf({ x: o.x - rr, y: o.y - rr });
      const [c1, r1] = this.cellOf({ x: o.x + rr, y: o.y + rr });
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) {
          const p = this.center(c, r);
          if ((p.x - o.x) ** 2 + (p.y - o.y) ** 2 < rr * rr) dyn[r * this.cols + c] = 1;
        }
    }
    this.dyn = dyn;
  }

  /** Nearest free cell center to p (spiral search). */
  nearestFree(p: Vec2): Vec2 {
    if (this.isFree(p)) return p;
    const [c0, r0] = this.cellOf(p);
    for (let d = 1; d < 40; d++)
      for (let dc = -d; dc <= d; dc++)
        for (const dr of [-d, d]) {
          for (const [c, r] of [
            [c0 + dc, r0 + dr],
            [c0 + dr, r0 + dc],
          ] as const) {
            if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
            if (!this.isBlocked(r * this.cols + c)) return this.center(c, r);
          }
        }
    return p;
  }

  /** Straight segment stays in free cells. */
  lineFree(a: Vec2, b: Vec2): boolean {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(d / (this.cell * 0.5)));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      if (!this.isFree({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
    }
    return true;
  }

  /** A* over the grid, then line-of-sight smoothing. Returns waypoints from start (exclusive) to goal. */
  plan(start: Vec2, goal: Vec2, obstacles: { x: number; y: number; r: number }[] = []): Vec2[] | null {
    this.markObstacles(obstacles);
    try {
      return this.search(start, goal);
    } finally {
      this.dyn = null;
    }
  }

  private search(start: Vec2, goal: Vec2): Vec2[] | null {
    const g = this.nearestFree(goal);
    const s = this.isFree(start) ? start : this.nearestFree(start);
    if (this.lineFree(s, g)) return [g];
    const [sc, sr] = this.cellOf(s);
    const [gc, gr] = this.cellOf(g);
    const N = this.cols * this.rows;
    const startI = sr * this.cols + sc;
    const goalI = gr * this.cols + gc;
    const gScore = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = new MinHeap();
    gScore[startI] = 0;
    heap.push(startI, 0);
    const h = (i: number) => {
      const c = i % this.cols;
      const r = (i - c) / this.cols;
      return Math.hypot(c - gc, r - gr);
    };
    const DIRS = [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, Math.SQRT2],
      [1, -1, Math.SQRT2],
      [-1, 1, Math.SQRT2],
      [-1, -1, Math.SQRT2],
    ] as const;
    let found = false;
    while (heap.size) {
      const cur = heap.pop();
      if (cur === goalI) {
        found = true;
        break;
      }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const c = cur % this.cols;
      const r = (cur - c) / this.cols;
      for (const [dc, dr, w] of DIRS) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
        const ni = nr * this.cols + nc;
        if (this.isBlocked(ni) || closed[ni]) continue;
        if (dc && dr && (this.isBlocked(r * this.cols + nc) || this.isBlocked(nr * this.cols + c))) continue;
        const tentative = gScore[cur]! + w * this.cost[ni]!;
        if (tentative < gScore[ni]!) {
          gScore[ni] = tentative;
          came[ni] = cur;
          heap.push(ni, tentative + h(ni));
        }
      }
    }
    if (!found) return null;
    const cells: Vec2[] = [];
    for (let i = goalI; i !== -1 && i !== startI; i = came[i]!) cells.push(this.center(i % this.cols, Math.floor(i / this.cols)));
    cells.reverse();
    cells[cells.length - 1] = g;
    // Smooth: skip waypoints while the straight line stays free.
    const out: Vec2[] = [];
    let from = s;
    let k = 0;
    while (k < cells.length) {
      let far = k;
      for (let j = cells.length - 1; j > k; j--)
        if (this.lineFree(from, cells[j]!)) {
          far = j;
          break;
        }
      out.push(cells[far]!);
      from = cells[far]!;
      k = far + 1;
    }
    return out;
  }
}

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distToPolygon(p: Vec2, poly: Vec2[]): number {
  let inside = false;
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    d = Math.min(d, distToSegment(p, a, b));
  }
  return inside ? 0 : d;
}

class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];
  get size() {
    return this.items.length;
  }
  push(item: number, p: number) {
    this.items.push(item);
    this.prio.push(p);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent]! <= this.prio[i]!) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): number {
    const top = this.items[0]!;
    const lastI = this.items.pop()!;
    const lastP = this.prio.pop()!;
    if (this.items.length) {
      this.items[0] = lastI;
      this.prio[0] = lastP;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.prio[l]! < this.prio[m]!) m = l;
        if (r < this.items.length && this.prio[r]! < this.prio[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.items[a], this.items[b]] = [this.items[b]!, this.items[a]!];
    [this.prio[a], this.prio[b]] = [this.prio[b]!, this.prio[a]!];
  }
}

const cache = new Map<string, NavGrid>();

/** Grids are static per field and robot size, so they are shared between agents. */
export function navGridFor(field: FieldDef, elements: ResolvedElement[], radius: number, height: number): NavGrid {
  const tall = elements.some((e) => e.kind === "gate" && height > e.clearance);
  const key = `${field.length}x${field.width}:${radius.toFixed(3)}:${tall}:${elements.length}`;
  let g = cache.get(key);
  if (!g) {
    g = new NavGrid(field, elements, radius, height);
    cache.set(key, g);
  }
  return g;
}
