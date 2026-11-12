// 1D planning for tube, shaft and extrusion: which stock length each cut comes from.
//
// First-fit decreasing: the longest parts first, each into the first stock length that still has room for it plus
// the saw blade. Stock is tried shortest first, so short offcuts get used before full lengths are started.
// This is simple, and for the dozen or so cuts a robot needs it is within a few percent of the best possible.

export interface LinearStock {
  /** A name or Inventory id. */
  id: string;
  /** Inches. */
  length: number;
  /** How many of this length there are. */
  quantity: number;
}

export interface LinearPart {
  key: string;
  name: string;
  /** Inches. */
  length: number;
}

export interface LinearOptions {
  /** Width of the saw cut, inches. Default 1/8". */
  kerf?: number;
  /** Trimmed off the factory end of each stock length before the first cut, inches. Default 0. */
  endTrim?: number;
}

export interface LinearBar {
  stock: LinearStock;
  /** Which of the identical lengths (0, 1, 2...). */
  copy: number;
  /** In cutting order, with where each cut starts from the end of the bar. */
  cuts: { part: LinearPart; at: number }[];
  /** What is left at the end of the bar after the last cut (and its kerf). */
  leftover: number;
}

export interface LinearPlan {
  bars: LinearBar[];
  unplaced: LinearPart[];
  /** Total length of stock cut into, inches. */
  used: number;
  /** Total length of parts, inches. */
  parts: number;
}

export function planLinear(stocks: LinearStock[], parts: LinearPart[], opts: LinearOptions = {}): LinearPlan {
  const kerf = opts.kerf ?? 0.125;
  const endTrim = opts.endTrim ?? 0;
  // Every physical stock length, shortest first.
  const pool = stocks
    .flatMap((stock) => Array.from({ length: Math.max(0, Math.floor(stock.quantity)) }, (_, copy) => ({ stock, copy })))
    .sort((a, b) => a.stock.length - b.stock.length);
  const open: (LinearBar & { next: number })[] = [];
  const unplaced: LinearPart[] = [];

  for (const part of [...parts].sort((a, b) => b.length - a.length)) {
    const fits = (bar: { stock: LinearStock; next: number }) => bar.next + part.length <= bar.stock.length + 1e-9;
    let bar = open.find(fits);
    if (!bar) {
      const fresh = pool.findIndex((p) => endTrim + part.length <= p.stock.length + 1e-9);
      if (fresh === -1) {
        unplaced.push(part);
        continue;
      }
      const { stock, copy } = pool.splice(fresh, 1)[0];
      bar = { stock, copy, cuts: [], leftover: 0, next: endTrim };
      open.push(bar);
    }
    bar.cuts.push({ part, at: round3(bar.next) });
    bar.next += part.length + kerf;
  }

  const bars = open.map(({ next, ...bar }) => ({ ...bar, leftover: round3(Math.max(0, bar.stock.length - next)) }));
  return {
    bars,
    unplaced,
    used: round3(bars.reduce((sum, b) => sum + b.stock.length, 0)),
    parts: round3(parts.reduce((sum, p) => sum + p.length, 0)),
  };
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;
