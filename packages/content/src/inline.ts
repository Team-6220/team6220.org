// Tiny inline markup for text in content files, so editors never type HTML:
//   **bold**            ->  <b>bold</b>
//   [label](https://x)  ->  link; absolute http(s) links open in a new tab, paths like /about/contact do not
// Everything else is plain text. `& < >` are escaped, quotes and apostrophes are left alone.

const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

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
  return [...text.matchAll(INLINE)].filter((m) => m[3] !== undefined).map((m) => m[3]!);
}

export function renderInline(text: string): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    out += escapeText(text.slice(last, m.index));
    if (m[1] !== undefined) out += `<b>${escapeText(m[1])}</b>`;
    else out += anchor(m[3]!, escapeText(m[2]!));
    last = m.index + m[0].length;
  }
  return out + escapeText(text.slice(last));
}

/** `<a>` markup for a link; `className` adds a class (used for buttons). */
export function anchor(href: string, labelHtml: string, className?: string): string {
  const cls = className ? ` class="${className}"` : "";
  const target = isExternalHref(href) ? ` target="_blank" rel="noopener"` : "";
  return `<a${cls} href="${escapeAttr(href)}"${target}>${labelHtml}</a>`;
}
