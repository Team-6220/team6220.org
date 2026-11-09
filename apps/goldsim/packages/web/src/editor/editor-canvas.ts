import { bumperPolygon, framePolygon, mechanismFootprint, resolveMechanism, type ResolvedMechanism, type Vec2 } from "@goldsim/core";
import type { MechanismsDef, RobotDesign } from "@goldsim/schema";
import { cssVar } from "../ui/dom.js";

const ROTATE_HANDLE = 0.22; // meters from the mount

type Drag = { kind: "move"; index: number; dx: number; dy: number } | { kind: "rotate"; index: number } | null;

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 14;

/**
 * Top-down chassis view for the robot editor. Chassis frame: +x forward (screen right), +y left (screen up).
 * Mount handles drag to move; the outer handle rotates. Alt disables snapping, Shift snaps rotation to 15°.
 * View: pan with Ctrl+drag, middle-mouse drag, or Space+drag; zoom with the mouse wheel, + / - keys, or the buttons.
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
  /** View zoom (1 = fit the robot) and pan in CSS pixels. */
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private panning: { startX: number; startY: number; panX: number; panY: number } | null = null;
  private spaceHeld = false;
  /** Called when the view zoom changes (for the zoom label). */
  onViewChange: (() => void) | null = null;

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
    // Non-passive so the wheel zooms the canvas instead of scrolling the page.
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("auxclick", (e) => e.preventDefault());
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  dispose(): void {
    this.canvas.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code !== "Space" || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) return;
    this.spaceHeld = true;
    if (!this.drag) this.canvas.style.cursor = "grab";
    e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code !== "Space") return;
    this.spaceHeld = false;
    if (!this.panning) this.canvas.style.cursor = "default";
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    // Normalize line / page deltas, then zoom about the cursor.
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 100 : e.deltaY;
    const r = this.canvas.getBoundingClientRect();
    this.zoomAt(Math.exp(-dy * 0.0015), (e.clientX - r.left) * (window.devicePixelRatio || 1), (e.clientY - r.top) * (window.devicePixelRatio || 1));
  };

  /** Zooms by `factor`, keeping the point under (mx, my) (device pixels) fixed. Omit the point to zoom about the center. */
  zoomBy(factor: number, mx?: number, my?: number): void {
    this.resolve();
    this.fit();
    this.zoomAt(factor, mx ?? this.canvas.width / 2, my ?? this.canvas.height / 2);
  }

  private zoomAt(factor: number, mx: number, my: number): void {
    this.resolve();
    this.fit();
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    const f = next / this.zoom;
    if (f === 1) return;
    const ncx = mx - (mx - this.cx) * f;
    const ncy = my - (my - this.cy) * f;
    this.panX = (ncx - this.canvas.width / 2) / this.dpr;
    this.panY = (ncy - this.canvas.height / 2) / this.dpr;
    this.zoom = next;
    this.render();
    this.onViewChange?.();
  }

  resetView(): void {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.render();
    this.onViewChange?.();
  }

  get zoomPercent(): number {
    return Math.round(this.zoom * 100);
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
    this.scale = (Math.min(w, h) / (2 * reach * 1.25)) * this.zoom;
    this.cx = w / 2 + this.panX * this.dpr;
    this.cy = h / 2 + this.panY * this.dpr;
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
    // Cover the whole visible area, including after panning.
    const panMeters = Math.max(Math.abs(this.cx - this.canvas.width / 2), Math.abs(this.cy - this.canvas.height / 2)) / this.scale;
    const half = Math.max(this.canvas.width, this.canvas.height) / this.scale / 2 + 0.5 + panMeters;
    const lines = Math.min(Math.ceil(half * 10), 400);
    for (let g = -lines; g <= lines; g++) {
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
    // Pan: middle mouse, Ctrl+drag, or Space+drag. Never selects or drags a mount.
    if (e.button === 1 || (e.button === 0 && (e.ctrlKey || this.spaceHeld))) {
      e.preventDefault();
      this.panning = { startX: e.clientX, startY: e.clientY, panX: this.panX, panY: this.panY };
      this.canvas.setPointerCapture(e.pointerId);
      this.canvas.style.cursor = "grabbing";
      return;
    }
    if (e.button !== 0) return;
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
    if (this.panning) {
      this.panX = this.panning.panX + (e.clientX - this.panning.startX);
      this.panY = this.panning.panY + (e.clientY - this.panning.startY);
      this.render();
      return;
    }
    const p = this.toLocal(e);
    if (!this.drag) {
      const over = this.hit(p);
      this.canvas.style.cursor = e.ctrlKey || this.spaceHeld ? "grab" : over ? (over.kind === "rotate" ? "crosshair" : "grab") : "default";
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
    if (this.panning) {
      this.panning = null;
      this.canvas.style.cursor = this.spaceHeld ? "grab" : "default";
    }
    if ((this.drag || this.canvas.hasPointerCapture(e.pointerId)) && this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
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
