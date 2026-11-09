// Local search that runs in the browser (instant, no server calls). Ported from JsSearch.html.
//   - case-insensitive, ignores punctuation:  "hex-shaft" = "hex shaft"
//   - partial words:                          "spac" finds "Spacer"
//   - simple plurals:                         "bearings" finds "Bearing"
//   - small typos (words of 5+ letters):      "bearng" finds "Bearing"
// Every word typed must match something. Fields with a higher weight (name, aliases) rank higher.

export type SearchField = [text: string | null | undefined, weight: number];

interface IndexedField {
  text: string;
  words: string[];
  stems: string[];
  weight: number;
}

export function normalize(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/(\d)\s*\/\s*(\d)/g, "$1/$2") // keep fractions like 1/2 together
    .replace(/[^a-z0-9/.#]+/g, " ")
    .trim();
}

/** Rough singular form so plurals match: bearings->bearing, pulleys->pulley, boxes->box. */
export function stem(w: string): string {
  if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + "y";
  if (w.length > 4 && /(s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
  return w;
}

export function tokens(s: string): string[] {
  const n = normalize(s);
  return n ? n.split(" ").filter(Boolean) : [];
}

/** Edit distance <= max, giving up early. */
export function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev: number[] = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

function scoreTerm(term: string, fields: IndexedField[]): number {
  const st = stem(term);
  // Short words must match exactly ("gear" must not find "bear").
  const maxEdits = term.length >= 9 ? 2 : term.length >= 5 ? 1 : 0;
  let best = 0;
  for (const f of fields) {
    if (!f.text) continue;
    let s = 0;
    for (let w = 0; w < f.words.length; w++) {
      const word = f.words[w];
      if (word === term || f.stems[w] === st) {
        s = Math.max(s, 10);
        break;
      }
      if (word.indexOf(term) === 0 || f.stems[w].indexOf(st) === 0) s = Math.max(s, 7);
    }
    if (!s && f.text.indexOf(term) >= 0) s = 4; // inside a word
    if (!s && maxEdits) {
      for (let w = 0; w < f.words.length; w++) {
        const word = f.words[w];
        if (within(st, f.stems[w], maxEdits) || (word.length > term.length && within(term, word.slice(0, term.length), maxEdits))) {
          s = 2;
          break;
        }
      }
    }
    if (s) best = Math.max(best, s * f.weight);
  }
  return best;
}

export interface SearchIndex<T> {
  size: number;
  query(q: string): { rec: T; score: number }[];
}

export function buildIndex<T>(records: T[], fieldsFn: (rec: T) => SearchField[]): SearchIndex<T> {
  const docs = records.map((rec) => ({
    rec,
    fields: fieldsFn(rec).map(([raw, weight]) => {
      const text = normalize(raw);
      const words = text ? text.split(" ") : [];
      return { text, words, stems: words.map(stem), weight };
    }),
  }));
  return {
    size: docs.length,
    query(q) {
      const terms = tokens(q);
      if (!terms.length) return docs.map((d) => ({ rec: d.rec, score: 0 }));
      const out: { rec: T; score: number }[] = [];
      for (const d of docs) {
        let total = 0;
        let ok = true;
        for (const t of terms) {
          const s = scoreTerm(t, d.fields);
          if (!s) {
            ok = false;
            break;
          }
          total += s;
        }
        if (ok) out.push({ rec: d.rec, score: total });
      }
      return out.sort((a, b) => b.score - a.score);
    },
  };
}
