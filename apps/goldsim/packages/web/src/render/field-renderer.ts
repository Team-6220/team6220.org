import { shapePoints, type Match, type ResolvedElement, type RobotView, type Vec2 } from "@goldsim/core";
import type { Shape } from "@goldsim/schema";
import { cssVar } from "../ui/dom.js";

interface Palette {
  carpet: string;
  line: string;
  wall: string;
  gray2: string;
  gray3: string;
  gray5: string;
  text: string;
  gold: string;
  blue: string;
  red: string;
  green: string;
}

function readPalette(): Palette {
  return {
    carpet: cssVar("--carpet"),
    line: cssVar("--field-line"),
    wall: cssVar("--gray-4"),
    gray2: cssVar("--gray-2"),
    gray3: cssVar("--gray-3"),
    gray5: cssVar("--gray-5"),
    text: cssVar("--text"),
    gold: cssVar("--gold"),
    blue: cssVar("--blue"),
    red: cssVar("--red"),
    green: cssVar("--green"),
  };
}

export interface RenderOptions {
  highlight?: Set<number>;
  showShooterRange?: boolean;
  showZones?: boolean;
  /** Camera: center (field meters) and zoom (1 = whole field). Omit to fit the field. */
  view?: { cx: number; cy: number; zoom: number };
  /** Quarter turns counter-clockwise applied to the whole field view (0-3). Text stays upright. */
  rotation?: number;
  /** Short-lived markers (replay event overlays). */
  overlays?: Overlay[];
}

export interface Overlay {
  x: number;
  y: number;
  kind: "shot" | "score" | "foul" | "pickup" | "climb";
  label?: string;
  /** 0 = just happened, 1 = about to disappear. */
  age: number;
}

/** Top-down Canvas 2D view of a match. Colors come from the theme tokens. */
export class FieldRenderer {
  private ctx: CanvasRenderingContext2D;
  private pal: Palette = readPalette();
  private scale = 1;
  /** Quarter turns of view rotation (0-3). */
  private rot = 0;
  /** Field point shown at the canvas center (meters). */
  private centerX = 0;
  private centerY = 0;
  /** Canvas center in pixels. */
  private halfW = 0;
  private halfH = 0;
  private dpr = 1;

  constructor(
    private canvas: HTMLCanvasElement,
    private fieldLength: number,
    private fieldWidth: number,
  ) {
    this.ctx = canvas.getContext("2d")!;
  }

  refreshPalette(): void {
    this.pal = readPalette();
  }

  private fit(view?: RenderOptions["view"], rotation = 0): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(rect.width * this.dpr));
    const hgt = Math.max(1, Math.round(rect.height * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== hgt) {
      this.canvas.width = w;
      this.canvas.height = hgt;
    }
    this.rot = ((Math.round(rotation) % 4) + 4) % 4;
    const turned = this.rot % 2 === 1;
    const spanX = turned ? this.fieldWidth : this.fieldLength;
    const spanY = turned ? this.fieldLength : this.fieldWidth;
    const pad = 16 * this.dpr;
    this.scale = Math.min((w - 2 * pad) / (spanX + 0.4), (hgt - 2 * pad) / (spanY + 0.4));
    this.halfW = w / 2;
    this.halfH = hgt / 2;
    this.centerX = this.fieldLength / 2;
    this.centerY = this.fieldWidth / 2;
    if (view && view.zoom > 1) {
      this.scale *= view.zoom;
      this.centerX = view.cx;
      this.centerY = view.cy;
    }
  }

  /** Field meters -> canvas pixels (+y is up on screen at rotation 0). */
  private px(x: number, y: number): [number, number] {
    const fx = x - this.centerX;
    const fy = y - this.centerY;
    let rx = fx;
    let ry = fy;
    if (this.rot === 1) [rx, ry] = [-fy, fx];
    else if (this.rot === 2) [rx, ry] = [-fx, -fy];
    else if (this.rot === 3) [rx, ry] = [fy, -fx];
    return [this.halfW + rx * this.scale, this.halfH - ry * this.scale];
  }

  private path(pts: Vec2[]): void {
    const c = this.ctx;
    c.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = this.px(p.x, p.y);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    });
    c.closePath();
  }

  private shapePath(s: Shape): void {
    if (s.type === "circle") {
      const [x, y] = this.px(s.x, s.y);
      this.ctx.beginPath();
      this.ctx.arc(x, y, s.radius * this.scale, 0, Math.PI * 2);
    } else this.path(shapePoints(s));
  }

  private allianceColor(a: string | undefined): string {
    return a === "blue" ? this.pal.blue : a === "red" ? this.pal.red : this.pal.gray5;
  }

  render(match: Match, opts: RenderOptions = {}): void {
    this.fit(opts.view, opts.rotation ?? 0);
    const c = this.ctx;
    const p = this.pal;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Carpet
    c.fillStyle = p.carpet;
    this.path([
      { x: 0, y: 0 },
      { x: this.fieldLength, y: 0 },
      { x: this.fieldLength, y: this.fieldWidth },
      { x: 0, y: this.fieldWidth },
    ]);
    c.fill();

    for (const el of match.elements) this.drawElementBase(el, opts);

    // Center line
    const cl = match.game.field.centerLineX;
    c.strokeStyle = p.line;
    c.lineWidth = 2 * this.dpr;
    c.setLineDash([8 * this.dpr, 6 * this.dpr]);
    c.beginPath();
    c.moveTo(...this.px(cl, 0));
    c.lineTo(...this.px(cl, this.fieldWidth));
    c.stroke();
    c.setLineDash([]);

    for (const el of match.elements) this.drawElementTop(el, match);

    // Pieces
    const rad = Math.max(1.5 * this.dpr, (match.game.pieces.types[0]?.radius ?? 0.075) * this.scale);
    c.fillStyle = p.gold;
    for (const q of match.piecePositions()) {
      const [x, y] = this.px(q.x, q.y);
      c.beginPath();
      c.arc(x, y, rad, 0, Math.PI * 2);
      c.fill();
    }

    const views = match.robotViews();
    for (const r of views) this.drawRobot(r, opts);

    // Shots in flight
    for (const f of match.inFlightPieces()) {
      const x = f.fromX + (f.toX - f.fromX) * f.progress;
      const y = f.fromY + (f.toY - f.fromY) * f.progress;
      const [ax, ay] = this.px(f.fromX, f.fromY);
      const [bx, by] = this.px(x, y);
      c.strokeStyle = p.gold;
      c.globalAlpha = 0.25;
      c.lineWidth = 1 * this.dpr;
      c.beginPath();
      c.moveTo(ax, ay);
      c.lineTo(bx, by);
      c.stroke();
      c.globalAlpha = 1;
      const lift = 1 + 0.6 * Math.sin(Math.PI * f.progress);
      c.fillStyle = p.gold;
      c.beginPath();
      c.arc(bx, by, rad * lift, 0, Math.PI * 2);
      c.fill();
    }

    for (const o of opts.overlays ?? []) this.drawOverlay(o);
  }

  private drawOverlay(o: Overlay): void {
    const c = this.ctx;
    const p = this.pal;
    const [x, y] = this.px(o.x, o.y);
    const color = o.kind === "foul" ? p.red : o.kind === "climb" ? p.green : o.kind === "pickup" ? p.text : p.gold;
    const r = (8 + 18 * o.age) * this.dpr;
    c.globalAlpha = Math.max(0, 1 - o.age);
    c.strokeStyle = color;
    c.lineWidth = (o.kind === "score" || o.kind === "foul" ? 3 : 2) * this.dpr;
    c.beginPath();
    if (o.kind === "foul") {
      c.moveTo(x - r * 0.7, y - r * 0.7);
      c.lineTo(x + r * 0.7, y + r * 0.7);
      c.moveTo(x + r * 0.7, y - r * 0.7);
      c.lineTo(x - r * 0.7, y + r * 0.7);
    } else if (o.kind === "pickup") {
      c.rect(x - r * 0.5, y - r * 0.5, r, r);
    } else c.arc(x, y, r, 0, Math.PI * 2);
    c.stroke();
    if (o.label) {
      c.fillStyle = color;
      c.font = `${12 * this.dpr}px ${cssVar("--font-title")}`;
      c.textAlign = "center";
      c.textBaseline = "bottom";
      c.fillText(o.label, x, y - r - 2 * this.dpr);
    }
    c.globalAlpha = 1;
  }

  /** Canvas pixel -> field meters (for pointer input). Valid after the most recent render. */
  toField(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const sx = (clientX - rect.left) * this.dpr;
    const sy = (clientY - rect.top) * this.dpr;
    const rx = (sx - this.halfW) / this.scale;
    const ry = -(sy - this.halfH) / this.scale;
    let fx = rx;
    let fy = ry;
    if (this.rot === 1) [fx, fy] = [ry, -rx];
    else if (this.rot === 2) [fx, fy] = [-rx, -ry];
    else if (this.rot === 3) [fx, fy] = [-ry, rx];
    return { x: fx + this.centerX, y: fy + this.centerY };
  }

  private drawElementBase(el: ResolvedElement, opts: RenderOptions): void {
    const c = this.ctx;
    const p = this.pal;
    switch (el.kind) {
      case "zone":
        if (opts.showZones === false) return;
        if (el.alliance) {
          c.globalAlpha = el.baseId === "allianceZone" ? 0.07 : 0.12;
          c.fillStyle = this.allianceColor(el.alliance);
          this.shapePath(el.shape);
          c.fill();
          c.globalAlpha = 1;
          if (el.baseId !== "allianceZone") {
            c.strokeStyle = this.allianceColor(el.alliance);
            c.setLineDash([4 * this.dpr, 4 * this.dpr]);
            c.lineWidth = 1 * this.dpr;
            c.stroke();
            c.setLineDash([]);
          }
        }
        break;
      case "terrain": {
        c.fillStyle = p.gray3;
        this.shapePath(el.shape);
        c.fill();
        c.save();
        c.clip();
        c.strokeStyle = p.wall;
        c.lineWidth = 1 * this.dpr;
        const pts = shapePoints(el.shape);
        const minX = Math.min(...pts.map((q) => q.x));
        const maxX = Math.max(...pts.map((q) => q.x));
        const minY = Math.min(...pts.map((q) => q.y));
        const maxY = Math.max(...pts.map((q) => q.y));
        for (let x = minX - (maxY - minY); x < maxX; x += 0.15) {
          c.beginPath();
          c.moveTo(...this.px(x, minY));
          c.lineTo(...this.px(x + (maxY - minY), maxY));
          c.stroke();
        }
        c.restore();
        break;
      }
      case "pieceSource":
        if (el.baseId === "depot") {
          c.strokeStyle = p.gray5;
          c.lineWidth = 1 * this.dpr;
          this.shapePath(el.shape);
          c.stroke();
        }
        break;
      case "climbStructure":
        c.strokeStyle = this.allianceColor(el.alliance);
        c.setLineDash([3 * this.dpr, 3 * this.dpr]);
        c.lineWidth = 1 * this.dpr;
        this.shapePath(el.engageZone);
        c.stroke();
        c.setLineDash([]);
        break;
      default:
        break;
    }
  }

  private drawElementTop(el: ResolvedElement, match: Match): void {
    const c = this.ctx;
    const p = this.pal;
    switch (el.kind) {
      case "wall":
        c.fillStyle = p.wall;
        this.shapePath(el.shape);
        c.fill();
        break;
      case "gate": {
        c.strokeStyle = p.gray5;
        c.lineWidth = 2 * this.dpr;
        c.setLineDash([6 * this.dpr, 4 * this.dpr]);
        this.shapePath(el.shape);
        c.stroke();
        c.setLineDash([]);
        break;
      }
      case "sink": {
        const active = match.isActive(el.id);
        const scoring = match.isScoringActive(el.id);
        c.fillStyle = active ? this.allianceColor(el.scoresFor) : p.gray3;
        this.shapePath(el.shape);
        c.fill();
        c.strokeStyle = active ? p.gold : scoring ? p.gold : p.wall;
        c.lineWidth = (active ? 3 : 2) * this.dpr;
        c.setLineDash(scoring && !active ? [4 * this.dpr, 3 * this.dpr] : []);
        c.stroke();
        c.setLineDash([]);
        c.strokeStyle = active ? "#000" : p.gray5;
        c.lineWidth = 2 * this.dpr;
        this.shapePath(el.target.shape);
        c.stroke();
        break;
      }
      case "climbStructure":
        c.fillStyle = p.gray3;
        this.shapePath(el.shape);
        c.fill();
        c.strokeStyle = this.allianceColor(el.alliance);
        c.lineWidth = 2 * this.dpr;
        c.stroke();
        for (let i = 1; i <= 3; i++) {
          const pts = shapePoints(el.shape);
          const minY = Math.min(...pts.map((q) => q.y));
          const maxY = Math.max(...pts.map((q) => q.y));
          const minX = Math.min(...pts.map((q) => q.x));
          const maxX = Math.max(...pts.map((q) => q.x));
          const x = minX + ((maxX - minX) * i) / 4;
          c.beginPath();
          c.moveTo(...this.px(x, minY));
          c.lineTo(...this.px(x, maxY));
          c.stroke();
        }
        break;
      case "feeder": {
        c.fillStyle = this.allianceColor(el.alliance);
        this.shapePath(el.shape);
        c.fill();
        const stock = match.feederStock()[el.id] ?? 0;
        const [x, y] = this.px(el.exit.x + 0.35, el.exit.y);
        c.fillStyle = p.text;
        c.font = `${11 * this.dpr}px ${cssVar("--font-mono")}`;
        c.textAlign = "left";
        c.textBaseline = "middle";
        c.fillText(String(stock), x, y);
        break;
      }
      default:
        break;
    }
  }

  private drawRobot(r: RobotView, opts: RenderOptions): void {
    const c = this.ctx;
    const p = this.pal;
    const color = this.allianceColor(r.alliance);

    if (opts.showShooterRange)
      for (const s of r.shooterVectors) {
        const dx = Math.cos(s.heading);
        const dy = Math.sin(s.heading);
        c.strokeStyle = p.gold;
        c.globalAlpha = 0.6;
        c.lineWidth = 2 * this.dpr;
        c.setLineDash([5 * this.dpr, 5 * this.dpr]);
        c.beginPath();
        c.moveTo(...this.px(s.x + dx * s.rangeMin, s.y + dy * s.rangeMin));
        c.lineTo(...this.px(s.x + dx * s.rangeMax, s.y + dy * s.rangeMax));
        c.stroke();
        c.setLineDash([]);
        c.globalAlpha = 1;
      }

    for (const m of r.mechanisms)
      if (m.base === "intake" || m.base === "blocker") {
        this.path(m.polygon);
        c.fillStyle = m.active ? p.gold : p.gray5;
        c.globalAlpha = m.active ? 0.9 : 0.6;
        c.fill();
        c.globalAlpha = 1;
      }

    this.path(r.bumper);
    c.fillStyle = color;
    c.fill();
    if (opts.highlight?.has(r.index)) {
      c.strokeStyle = p.gold;
      c.lineWidth = 3 * this.dpr;
      c.stroke();
    }
    this.path(r.frame);
    c.fillStyle = p.gray2;
    c.fill();

    for (const m of r.mechanisms) {
      if (m.base === "intake" || m.base === "blocker" || m.base === "storage" || m.base === "transfer") continue;
      this.path(m.polygon);
      c.fillStyle = m.base === "shooter" ? (m.active ? p.gold : p.text) : p.gray5;
      c.fill();
    }

    // Heading tick
    const fx = r.pose.x + Math.cos(r.pose.theta) * 0.3;
    const fy = r.pose.y + Math.sin(r.pose.theta) * 0.3;
    c.strokeStyle = color;
    c.lineWidth = 3 * this.dpr;
    c.beginPath();
    c.moveTo(...this.px(r.pose.x, r.pose.y));
    c.lineTo(...this.px(fx, fy));
    c.stroke();

    const [cx, cy] = this.px(r.pose.x, r.pose.y);
    c.fillStyle = p.text;
    c.font = `${13 * this.dpr}px ${cssVar("--font-title")}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    const label = r.climbState !== "idle" ? `L${r.climbLevel}` : String(r.stored);
    c.fillText(label, cx, cy);
  }
}
