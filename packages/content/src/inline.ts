// Tiny inline markup for text in content files, so editors never type HTML:
//   **bold**            ->  <b>bold</b>
//   [label](https://x)  ->  link; absolute http(s) links open in a new tab, paths like /about/contact do not
// Everything else is plain text. `& < >` are escaped, quotes and apostrophes are left alone.

const MAX_LABEL = 300;
const MAX_URL = 600;

interface Token {
  /** Index of the first character and the length of the whole match. */
  index: number;
  length: number;
  bold?: string;
  label?: string;
  href?: string;
}

/**
 * Finds `**bold**` and `[label](href)` in one left-to-right pass. Written as a scanner instead of a regular
 * expression so the work stays linear (labels and targets are length-capped; longer ones are plain text).
 */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let boldClosed = true; // false once we know no closing `**` is left
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "*" && boldClosed && text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 3);
      if (end === -1) boldClosed = false;
      else if (end > i + 2) {
        tokens.push({ index: i, length: end + 2 - i, bold: text.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    } else if (c === "[") {
      const t = linkAt(text, i);
      if (t) {
        tokens.push(t);
        i += t.length;
        continue;
      }
    }
    i++;
  }
  return tokens;
}

function linkAt(text: string, start: number): Token | null {
  let j = start + 1;
  const labelEnd = Math.min(text.length, start + 1 + MAX_LABEL);
  while (j < labelEnd && text[j] !== "]") j++;
  if (j === start + 1 || text[j] !== "]" || text[j + 1] !== "(") return null;
  const label = text.slice(start + 1, j);
  const urlStart = j + 2;
  const urlEnd = Math.min(text.length, urlStart + MAX_URL);
  let k = urlStart;
  while (k < urlEnd && text[k] !== ")" && !/\s/.test(text[k]!)) k++;
  if (k === urlStart || text[k] !== ")") return null;
  return { index: start, length: k + 1 - start, label, href: text.slice(urlStart, k) };
}

/** A link target we accept: an https/http URL or a path on this site. Never javascript: or protocol-relative. */
export function isSafeHref(href: string): boolean {
  if (/\s/.test(href)) return false;
  if (href.startsWith("/")) return !href.startsWith("//");
  return /^https?:\/\/[^\s/]+/i.test(href);
}

export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

export function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Attribute values keep `&` as typed (so URLs read the same as before) but can't close the attribute. */
export function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Every link target used in a piece of text (for validation). */
export function inlineHrefs(text: string): string[] {
  return tokenize(text).filter((t) => t.href !== undefined).map((t) => t.href!);
}

export function renderInline(text: string): string {
  let out = "";
  let last = 0;
  for (const t of tokenize(text)) {
    out += escapeText(text.slice(last, t.index));
    if (t.bold !== undefined) out += `<b>${escapeText(t.bold)}</b>`;
    else out += anchor(t.href!, escapeText(t.label!));
    last = t.index + t.length;
  }
  return out + escapeText(text.slice(last));
}

/** `<a>` markup for a link; `className` adds a class (used for buttons). */
export function anchor(href: string, labelHtml: string, className?: string): string {
  const cls = className ? ` class="${className}"` : "";
  const target = isExternalHref(href) ? ` target="_blank" rel="noopener"` : "";
  return `<a${cls} href="${escapeAttr(href)}"${target}>${labelHtml}</a>`;
}
