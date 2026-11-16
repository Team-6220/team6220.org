// Checks docs/redirects.json against the built site: every new address must exist (the page, and the anchor if
// the address has one). Also checks the map itself and that docs/redirects.csv and docs/REDIRECTS.md are up to date.
//
//   pnpm redirects:check                 uses dist/ (run `pnpm build` first); falls back to src/pages when there is no build
//   node scripts/redirects/check.mjs --require-dist [--dist path]   fail instead of falling back (used by the e2e workflow)
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CSV_PATH,
  JSON_PATH,
  MD_END,
  MD_PATH,
  MD_START,
  ROOT,
  builtPages,
  loadRedirects,
  pageHasAnchor,
  sourcePages,
  splitTarget,
  toCsv,
  toMarkdown,
} from "./lib.mjs";

const DECISIONS = ["confirmed", "owner", "proposed"];

/** The `#` map in sites/main/data/old-anchors.ts, read as text so this works on any Node version. */
export function readOldAnchors(root = ROOT) {
  const src = readFileSync(join(root, "sites/main/data/old-anchors.ts"), "utf8");
  const body = src.slice(src.indexOf("{", src.indexOf("OLD_ANCHORS")));
  const map = {};
  for (const m of body.matchAll(/^\s*"?([\w-]+)"?\s*:\s*"([^"]+)"\s*,?\s*$/gm)) map[m[1]] = m[2];
  return map;
}

/**
 * @returns {{ errors: string[], warnings: string[], notes: string[], mode: "dist" | "source" }}
 */
export function checkRedirects({ dist = join(ROOT, "dist"), requireDist = false, root = ROOT, jsonPath = JSON_PATH } = {}) {
  const errors = [];
  const warnings = [];
  const notes = [];
  const data = loadRedirects(jsonPath);

  const haveDist = existsSync(join(dist, "index.html"));
  if (!haveDist && requireDist) {
    errors.push(`no built site at ${dist} (run \`pnpm build\` first)`);
    return { errors, warnings, notes, mode: "dist" };
  }
  const mode = haveDist ? "dist" : "source";
  const pages = haveDist ? builtPages(dist) : sourcePages(root);
  if (!haveDist) notes.push("No dist/: new pages were checked against src/pages and anchors were NOT checked. Run `pnpm build` and check again.");

  // ---- the map itself
  if (!Array.isArray(data.pages) || !Array.isArray(data.anchors)) {
    errors.push("docs/redirects.json needs `pages` and `anchors` lists");
    return { errors, warnings, notes, mode };
  }
  const seen = new Set();
  for (const r of data.pages) {
    const where = `page ${r.from}`;
    if (typeof r.from !== "string" || !r.from.startsWith("/") || r.from.includes("#") || r.from.includes("?")) errors.push(`${where}: "from" must be a path starting with / and without # or ?`);
    if (r.status !== 301) errors.push(`${where}: status must be 301`);
    if (!DECISIONS.includes(r.decision)) errors.push(`${where}: decision must be one of ${DECISIONS.join(", ")}`);
    if (typeof r.to !== "string" || !r.to.startsWith("/")) errors.push(`${where}: "to" must start with /`);
    if (typeof r.note !== "string") errors.push(`${where}: "note" must be text (may be empty)`);
    if (seen.has(r.from)) errors.push(`${where}: listed twice`);
    seen.add(r.from);
    if (/\.[a-z0-9]+$/i.test(r.from)) warnings.push(`${where}: looks like a file, not a page`);
  }
  for (const r of data.pages) {
    const { path } = splitTarget(r.to ?? "");
    if (seen.has(path)) errors.push(`page ${r.from}: its new address ${r.to} is itself redirected (redirect chain)`);
  }

  // ---- every new address exists
  const targets = [...data.pages.map((r) => ({ label: `page ${r.from}`, to: r.to })), ...data.anchors.map((r) => ({ label: `anchor ${r.from}`, to: r.to }))];
  for (const { label, to } of targets) {
    if (typeof to !== "string") continue;
    const { path, hash } = splitTarget(to);
    const isPattern = /<[^>]+>/.test(to);
    const p = path.replace(/\/$/, "") || "/";
    if (!pages.has(p)) {
      errors.push(`${label}: new address ${to} has no page in the ${mode === "dist" ? "built site" : "source"}`);
      continue;
    }
    if (hash && !isPattern && mode === "dist" && !pageHasAnchor(dist, p, hash)) {
      errors.push(`${label}: new address ${to} - the page exists but has no element with id "${hash}"`);
    }
  }

  // ---- the # anchors equal sites/main/data/old-anchors.ts (the map the home page script really uses)
  const code = readOldAnchors(root);
  const listed = Object.fromEntries(data.anchors.filter((a) => !/<[^>]+>/.test(a.from)).map((a) => [a.from.replace(/^\/#/, ""), a.to]));
  for (const [k, v] of Object.entries(code)) {
    if (!(k in listed)) errors.push(`old-anchors.ts has "${k}" -> ${v}, which is missing from docs/redirects.json`);
    else if (listed[k] !== v) errors.push(`anchor /#${k}: docs/redirects.json says ${listed[k]}, old-anchors.ts says ${v}`);
  }
  for (const k of Object.keys(listed)) if (!(k in code)) errors.push(`anchor /#${k} is in docs/redirects.json but not in old-anchors.ts`);

  // ---- a page redirect that lands on /#x is caught by the home page script when x is an old address
  for (const r of data.pages) {
    const { path, hash } = splitTarget(r.to ?? "");
    if (path === "/" && hash && code[hash]) {
      warnings.push(`page ${r.from} -> ${r.to}: the home page script sends /#${hash} on to ${code[hash]}, so visitors end up there (see the note on that anchor in redirects.json)`);
    }
  }

  // ---- generated files are up to date
  if (!existsSync(CSV_PATH) || readFileSync(CSV_PATH, "utf8") !== toCsv(data)) errors.push("docs/redirects.csv is out of date: run `pnpm redirects:csv`");
  const md = existsSync(MD_PATH) ? readFileSync(MD_PATH, "utf8") : "";
  const a = md.indexOf(MD_START);
  const b = md.indexOf(MD_END);
  if (a === -1 || b === -1) errors.push("docs/REDIRECTS.md has no generated table markers: run `pnpm redirects:csv`");
  else if (md.slice(a, b + MD_END.length) !== toMarkdown(data)) errors.push("The table in docs/REDIRECTS.md is out of date: run `pnpm redirects:csv`");

  return { errors, warnings, notes, mode };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const di = args.indexOf("--dist");
  const { errors, warnings, notes, mode } = checkRedirects({ dist: di >= 0 ? resolve(args[di + 1]) : join(ROOT, "dist"), requireDist: args.includes("--require-dist") });
  for (const n of notes) console.log(`note: ${n}`);
  for (const w of warnings) console.log(`warning: ${w}`);
  for (const e of errors) console.error(`error: ${e}`);
  if (errors.length) {
    console.error(`\n${errors.length} problem(s) in docs/redirects.json (checked against the ${mode === "dist" ? "built site" : "source"}).`);
    process.exit(1);
  }
  console.log(`docs/redirects.json is OK (checked against the ${mode === "dist" ? "built site in dist/" : "source pages"}).`);
}
