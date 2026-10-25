// Seeded RNG (mulberry32). Labeled streams keep runs reproducible.
function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function makeRng(seed) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.int = (n) => Math.floor(f() * n);
  f.pick = (arr) => arr[f.int(arr.length)];
  f.chance = (p) => f() < p;
  f.range = (lo, hi) => lo + f() * (hi - lo);
  f.normal = (mean, sd) => {
    const u = Math.max(f(), 1e-9), v = f();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  f.shuffle = (arr) => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) { const j = f.int(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  };
  return f;
}
export function rngFor(seed, label) { return makeRng(hash(seed + ':' + label)); }
