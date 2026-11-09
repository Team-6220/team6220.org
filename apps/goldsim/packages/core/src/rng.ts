/**
 * Seeded PRNG (xoshiro128**) owned by a match. All simulation randomness goes through it,
 * so the same seed and inputs reproduce the same match (PRD §6.3, §6.4).
 * State is four uint32 words, so it can be saved in snapshots.
 */
export class Rng {
  private s: Uint32Array;

  constructor(seed: number) {
    this.s = new Uint32Array(4);
    // splitmix32 to spread the seed across the state
    let x = seed >>> 0;
    for (let i = 0; i < 4; i++) {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      this.s[i] = (z ^ (z >>> 16)) >>> 0;
    }
    if (this.s.every((v) => v === 0)) this.s[0] = 1;
  }

  /** Uniform uint32. */
  nextU32(): number {
    const s = this.s;
    const result = Math.imul(rotl(Math.imul(s[1]!, 5) >>> 0, 7), 9) >>> 0;
    const t = (s[1]! << 9) >>> 0;
    s[2]! ^= s[0]!;
    s[3]! ^= s[1]!;
    s[1]! ^= s[2]!;
    s[0]! ^= s[3]!;
    s[2]! ^= t;
    s[3] = rotl(s[3]!, 11);
    return result;
  }

  /** Uniform in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  /** Standard normal sample (Box-Muller). */
  normal(): number {
    let u = this.next();
    if (u < 1e-12) u = 1e-12;
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  getState(): number[] {
    return Array.from(this.s);
  }

  setState(state: number[]): void {
    this.s = Uint32Array.from(state);
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}
