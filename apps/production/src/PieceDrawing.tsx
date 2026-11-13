// A stock piece drawn to scale, with the parts placed on it. Sizes are inches; y goes down like the screen.
import { bbox, formatInches, placementPoly, type Placement, type Polygon } from "@team6220/cut-engine";

export interface DrawnPart {
  placement: Placement;
  label: string;
  /** "new": placed by this plan. "reserved": already taken by an earlier plan. */
  kind: "new" | "reserved";
}

interface PieceDrawingProps {
  /** The piece's outline in inches. */
  points: Polygon;
  parts: DrawnPart[];
  /** Shown above the drawing. */
  title: string;
}

export function PieceDrawing({ points, parts, title }: PieceDrawingProps) {
  const box = bbox(points);
  const pad = Math.max(box.w, box.h) * 0.06;
  const text = Math.max(0.35, Math.min(box.w, box.h) / 14); // label size, in inches on the drawing
  const path = (poly: Polygon) => poly.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ") + " Z";
  return (
    <figure className="prod__piece">
      <figcaption>{title}</figcaption>
      <svg viewBox={`${box.x0 - pad} ${box.y0 - pad} ${box.w + pad * 2} ${box.h + pad * 2 + text * 1.6}`} role="img" aria-label={title}>
        <path d={path(points)} className="prod__piece-stock" />
        {parts.map((p, i) => {
          const poly = placementPoly(p.placement);
          const cx = poly.reduce((s, q) => s + q[0], 0) / 4, cy = poly.reduce((s, q) => s + q[1], 0) / 4;
          // Shrink the label until it fits inside its rectangle (a character is about 0.6 of the font size wide).
          const size = Math.min(text, (p.placement.w * 0.9) / (0.6 * Math.max(4, p.label.length)), p.placement.h * 0.45);
          return (
            <g key={i} className={`prod__piece-part prod__piece-part--${p.kind}`}>
              <title>{p.label}</title>
              <path d={path(poly)} />
              <text x={cx} y={cy} fontSize={size} textAnchor="middle" dominantBaseline="middle">
                {p.label}
              </text>
            </g>
          );
        })}
        <text x={box.x0} y={box.y1 + pad + text} fontSize={text} className="prod__piece-size">
          {formatInches(box.w)} × {formatInches(box.h)}
        </text>
      </svg>
    </figure>
  );
}
