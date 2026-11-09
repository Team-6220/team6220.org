// Human-readable difference between two versions of a content file. Used by the editor's preview
// ("what will change") and by the pull request description.

export interface Change {
  /** e.g. `title` or `blocks[3].text` */
  path: string;
  kind: "added" | "removed" | "changed";
  before?: string;
  after?: string;
}

function leaves(value: unknown, path: string, out: Map<string, string>) {
  if (Array.isArray(value)) {
    if (value.length === 0) out.set(path, "[]");
    value.forEach((v, i) => leaves(v, `${path}[${i}]`, out));
  } else if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) out.set(path, "{}");
    for (const [k, v] of entries) leaves(v, path ? `${path}.${k}` : k, out);
  } else {
    out.set(path, typeof value === "string" ? value : JSON.stringify(value));
  }
}

/** Every leaf value that was added, removed or changed, in document order. Arrays compare by position. */
export function diffContent(before: unknown, after: unknown): Change[] {
  const a = new Map<string, string>();
  const b = new Map<string, string>();
  leaves(before, "", a);
  leaves(after, "", b);
  const changes: Change[] = [];
  for (const [path, value] of b) {
    if (!a.has(path)) changes.push({ path, kind: "added", after: value });
    else if (a.get(path) !== value) changes.push({ path, kind: "changed", before: a.get(path), after: value });
  }
  for (const [path, value] of a) {
    if (!b.has(path)) changes.push({ path, kind: "removed", before: value });
  }
  const order = [...new Set([...a.keys(), ...b.keys()])];
  return changes.sort((x, y) => order.indexOf(x.path) - order.indexOf(y.path));
}

export function clip(s: string | undefined, max = 160): string {
  if (s === undefined) return "";
  const one = s.replace(/\s+/g, " ");
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

/** One line of text per change, for the pull request body and the plain-text preview. */
export function describeChange(c: Change): string {
  if (c.kind === "added") return `${c.path}: added "${clip(c.after)}"`;
  if (c.kind === "removed") return `${c.path}: removed "${clip(c.before)}"`;
  return `${c.path}: "${clip(c.before)}" -> "${clip(c.after)}"`;
}
