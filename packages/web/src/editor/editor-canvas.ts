import { bumperPolygon, framePolygon, mechanismFootprint, resolveMechanism, type ResolvedMechanism, type Vec2 } from "@goldsim/core";
import type { MechanismsDef, RobotDesign } from "@goldsim/schema";
import { cssVar } from "../ui/dom.js";

const ROTATE_HANDLE = 0.22; // meters from the mount

type Drag = { kind: "move"; index: number; dx: number; dy: number } | { kind: "rotate"; index: number } | null;

/**
 * Top-down chassis view for the robot editor. Chassis frame: +x forward (screen right), +y left (screen up).
 * Mount handles drag to move; the outer handle rotates. Alt disables snapping, Shift snaps rotation to 15°.
 */
export class EditorCanvas {
  selected = -1;
  deploy = 1;
  private ctx: CanvasRenderingContext2D;
  private scale = 200;
  private cx = 0;
  private cy = 0;
  private dpr = 1;
  private drag: Drag = null;
  private resolved: (ResolvedMechanism | null)[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private getDesign: () => RobotDesign,
    private custom: MechanismsDef,
    private onSelect: (index: number) => void,
    private onEdit: () => void,
  ) {
    this.ctx = canvas.getContext("2d")!;
    canvas.addEventListener("pointerdown", (e) => this.down(e));
    canvas.addEventListener("pointermove", (e) => this.move(e));
    canvas.addEventListener("pointerup", (e) => this.up(e));
    canvas.addEventListener("pointercancel", (e) => this.up(e));
  }

  private resolve(): void {
    this.resolved = this.getDesign().mechanisms.map((m) => {
      try {
        return resolveMechanism(m, this.custom);
      } catch {
        return null;
      }
    });
  }

  private fit(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(rect.width * this.dpr));
    const h = Math.max(1, Math.round(rect.height * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const d = this.getDesign();
    let reach = 0.5;
    try {
      for (const p of bumperPolygon(d)) reach = Math.max(reach, Math.hypot(p.x, p.y));
    } catch {
      // invalid frame while typing; keep the default view
    }
    for (const m of this.resolved) if (m) reach = Math.max(reach, Math.hypot(m.mount.x, m.mount.y) + 0.4);
    this.scale = Math.min(w, h) / (2 * reach * 1.25);
    this.cx = w / 2;
    this.cy = h / 2;
  }

  private px(x: number, y: number): [number, number] {
    return [this.cx + x * this.scale, this.cy - y * this.scale];
  }

  private toLocal(e: PointerEvent): Vec2 {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * this.dpr - this.cx) / this.scale, y: -((e.clientY - r.top) * this.dpr - this.cy) / this.scale };
  }

  private poly(pts: Vec2[]): void {
    const c = this.ctx;
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(...this.px(p.x, p.y)) : c.moveTo(...this.px(p.x, p.y))));
    c.closePath();
  }

  render(): void {
    this.resolve();
    this.fit();
    const c = this.ctx;
    const d = this.getDesign();
    const col = {
      bg: cssVar("--gray-1"),
      grid: cssVar("--gray-3"),
      axis: cssVar("--gray-4"),
      text: cssVar("--text"),
      muted: cssVar("--gray-5"),
      gold: cssVar("--gold"),
      blue: cssVar("--blue"),
      green: cssVar("--green"),
      frame: cssVar("--gray-2"),
    };
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = col.bg;
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Grid: 0.1 m minor, 0.5 m major
    const half = Math.max(this.canvas.width, this.canvas.height) / this.scale / 2 + 0.5;
    for (let g = -Math.ceil(half * 10); g <= Math.ceil(half * 10); g++) {
      const v = g / 10;
      c.strokeStyle = g % 5 === 0 ? col.axis : col.grid;
      c.lineWidth = (g === 0 ? 2 : 1) * this.dpr;
      c.beginPath();
      c.moveTo(...this.px(v, -half));
      c.lineTo(...this.px(v, half));
      c.moveTo(...this.px(-half, v));
      c.lineTo(...this.px(half, v));
      c.stroke();
    }

    let bumper: Vec2[] = [];
    let frame: Vec2[] = [];
    try {
      bumper = bumperPolygon(d);
      frame = framePolygon(d);
    } catch {
      // frame invalid mid-edit
    }
    if (bumper.length >= 3) {
      this.poly(bumper);
      c.fillStyle = col.blue;
      c.fill();
    }
    if (frame.length >= 3) {
      this.poly(frame);
      c.fillStyle = col.frame;
      c.fill();
      c.strokeStyle = col.axis;
      c.lineWidth = 1 * this.dpr;
      c.stroke();
    }

    // Front marker
    const front = Math.max(0.3, ...bumper.map((p) => p.x));
    c.fillStyle = col.muted;
    c.font = `${12 * this.dpr}px ${cssVar("--font-body")}`;
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillText("FRONT →", ...this.px(front + 0.04, 0));

    // Mechanisms
    this.resolved.forEach((m, i) => {
      if (!m) return;
      const sel = i === this.selected;
      const poly = mechanismFootprint(m, this.deploy);
      this.poly(poly);
      const fill = m.base === "intake" ? col.gold : m.base === "shooter" ? col.text : m.base === "climber" ? col.green : col.muted;
      c.globalAlpha = m.base === "intake" ? 0.55 : 0.85;
      c.fillStyle = fill;
      c.fill();
      c.globalAlpha = 1;
      c.strokeStyle = sel ? col.gold : col.axis;
      c.lineWidth = (sel ? 3 : 1) * this.dpr;
      c.stroke();

      // Interaction overlays
      if (m.base === "shooter") this.shooterOverlay(m, col.gold);
      if (m.base === "intake") {
        const [lx, ly] = this.px(m.mount.x + Math.cos(m.mount.theta) * (m.p.rollerDepth! * this.deploy + 0.05), m.mount.y + Math.sin(m.mount.theta) * (m.p.rollerDepth! * this.deploy + 0.05));
        c.fillStyle = col.gold;
        c.font = `${11 * this.dpr}px ${cssVar("--font-body")}`;
        c.textAlign = "center";
        c.fillText("contact", lx, ly);
      }

      // Handles
      const [hx, hy] = this.px(m.mount.x, m.mount.y);
      c.fillStyle = sel ? col.gold : col.text;
      c.fillRect(hx - 5 * this.dpr, hy - 5 * this.dpr, 10 * this.dpr, 10 * this.dpr);
      if (sel) {
        const rx = m.mount.x + Math.cos(m.mount.theta) * ROTATE_HANDLE;
        const ry = m.mount.y + Math.sin(m.mount.theta) * ROTATE_HANDLE;
        c.strokeStyle = col.gold;
        c.lineWidth = 2 * this.dpr;
        c.beginPath();
        c.moveTo(hx, hy);
        c.lineTo(...this.px(rx, ry));
        c.stroke();
        const [qx, qy] = this.px(rx, ry);
        c.beginPath();
        c.arc(qx, qy, 7 * this.dpr, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = col.text;
      c.font = `${11 * this.dpr}px ${cssVar("--font-mono")}`;
      c.textAlign = "left";
      c.textBaseline = "top";
      c.fillText(m.id, hx + 7 * this.dpr, hy + 5 * this.dpr);
    });
  }

  private shooterOverlay(m: ResolvedMechanism, gold: string): void {
    const c = this.ctx;
    const dx = Math.cos(m.mount.theta);
    const dy = Math.sin(m.mount.theta);
    const [ax, ay] = this.px(m.mount.x, m.mount.y);
    const far = Math.max(this.canvas.width, this.canvas.height) / this.scale;
    const [bx, by] = this.px(m.mount.x + dx * far, m.mount.y + dy * far);
    c.strokeStyle = gold;
    c.lineWidth = 2 * this.dpr;
    c.setLineDash([6 * this.dpr, 5 * this.dpr]);
    c.beginPath();
    c.moveTo(ax, ay);
    c.lineTo(bx, by);
    c.stroke();
    c.setLineDash([]);
    if (m.p.turretRange! > 0) {
      c.globalAlpha = 0.15;
      c.fillStyle = gold;
      c.beginPath();
      c.moveTo(ax, ay);
      const r = 0.45 * this.scale;
      // Canvas angles grow clockwise because screen y is flipped.
      c.arc(ax, ay, r, -(m.mount.theta + m.p.turretRange!), -(m.mount.theta - m.p.turretRange!));
      c.closePath();
      c.fill();
      c.globalAlpha = 1;
    }
    const [lx, ly] = this.px(m.mount.x + dx * 0.32, m.mount.y + dy * 0.32);
    c.fillStyle = gold;
    c.font = `${11 * this.dpr}px ${cssVar("--font-body")}`;
    c.textAlign = "center";
    c.textBaseline = "bottom";
    c.fillText(`exit · scores ${m.p.rangeMin!.toFixed(1)}–${m.p.rangeMax!.toFixed(1)} m`, lx, ly - 6 * this.dpr);
  }

  private hit(p: Vec2): Drag {
    const tol = 9 / this.scale * this.dpr;
    const sel = this.resolved[this.selected];
    if (sel) {
      const rx = sel.mount.x + Math.cos(sel.mount.theta) * ROTATE_HANDLE;
      const ry = sel.mount.y + Math.sin(sel.mount.theta) * ROTATE_HANDLE;
      if (Math.hypot(p.x - rx, p.y - ry) < tol) return { kind: "rotate", index: this.selected };
    }
    for (let i = this.resolved.length - 1; i >= 0; i--) {
      const m = this.resolved[i];
      if (m && Math.hypot(p.x - m.mount.x, p.y - m.mount.y) < tol) return { kind: "move", index: i, dx: p.x - m.mount.x, dy: p.y - m.mount.y };
    }
    for (let i = this.resolved.length - 1; i >= 0; i--) {
      const m = this.resolved[i];
      if (m && inside(p, mechanismFootprint(m, this.deploy))) return { kind: "move", index: i, dx: p.x - m.mount.x, dy: p.y - m.mount.y };
    }
    return null;
  }

  private down(e: PointerEvent): void {
    const p = this.toLocal(e);
    this.drag = this.hit(p);
    const idx = this.drag ? this.drag.index : -1;
    if (idx !== this.selected) {
      this.selected = idx;
      this.onSelect(idx);
    }
    if (this.drag) this.canvas.setPointerCapture(e.pointerId);
    this.render();
  }

  private move(e: PointerEvent): void {
    const p = this.toLocal(e);
    if (!this.drag) {
      const over = this.hit(p);
      this.canvas.style.cursor = over ? (over.kind === "rotate" ? "crosshair" : "grab") : "default";
      return;
    }
    const mech = this.getDesign().mechanisms[this.drag.index];
    if (!mech) return;
    if (this.drag.kind === "move") {
      const snap = e.altKey ? 0 : 0.005;
      const s = (v: number) => (snap ? Math.round(v / snap) * snap : v);
      mech.mount.x = s(p.x - this.drag.dx);
      mech.mount.y = s(p.y - this.drag.dy);
    } else {
      let theta = Math.atan2(p.y - mech.mount.y, p.x - mech.mount.x);
      if (!e.altKey) {
        const step = ((e.shiftKey ? 15 : 5) * Math.PI) / 180;
        theta = Math.round(theta / step) * step;
      }
      mech.mount.theta = +theta.toFixed(5);
    }
    this.onEdit();
    this.render();
  }

  private up(e: PointerEvent): void {
    if (this.drag && this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    this.drag = null;
  }
}

function inside(p: Vec2, pts: Vec2[]): boolean {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) ins = !ins;
  }
  return ins;
}
