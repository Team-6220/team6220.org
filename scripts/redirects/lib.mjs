// Shared code for the old-address redirect map (docs/redirects.json).
//   check.mjs  - checks the map (and every new address) against the built site
//   csv.mjs    - writes docs/redirects.csv (for the Wix URL Redirect Manager) and the table in docs/REDIRECTS.md
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const JSON_PATH = join(ROOT, "docs/redirects.json");
export const CSV_PATH = join(ROOT, "docs/redirects.csv");
export const MD_PATH = join(ROOT, "docs/REDIRECTS.md");

export function loadRedirects(path = JSON_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// ---------- CSV for Wix: Marketing & SEO > SEO tools > URL Redirect Manager > Import ----------
// Wix wants a header row and exactly two columns (old address, new address), one redirect per row, at most 500 rows.
export const CSV_HEADER = "Old URL,New URL";

const q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function toCsv(data) {
  const rows = data.pages.map((r) => `${q(r.from)},${q(r.to)}`);
  return [CSV_HEADER, ...rows].join("\n") + "\n";
}

// ---------- the table in docs/REDIRECTS.md ----------
export const MD_START = "<!-- redirects:start (generated from docs/redirects.json by `pnpm redirects:csv`; do not edit by hand) -->";
export const MD_END = "<!-- redirects:end -->";

const cell = (s) => s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
const code = (s) => "`" + s + "`";

export function toMarkdown(data) {
  const label = { confirmed: "agreed", owner: "owner decision", proposed: "**proposed**" };
  const pages = [
    "| Old address (team6220.org) | New address | Status | Decision | Notes |",
    "| --- | --- | --- | --- | --- |",
    ...data.pages.map((r) => `| ${code(r.from)} | ${code(r.to)} | ${r.status} | ${label[r.decision] ?? r.decision} | ${cell(r.note)} |`),
  ];
  const anchors = [
    "| Old | New | Notes |",
    "| --- | --- | --- |",
    ...data.anchors.map((r) => `| ${code(r.from)} | ${code(r.to)} | ${cell(r.note)} |`),
  ];
  return [MD_START, "", "### Old Wix pages (301 redirects, Phase 3 step 2)", "", ...pages, "", "### Old one-page addresses (`#`, handled by a script)", "", ...anchors, "", MD_END].join("\n");
}

// ---------- what the built site contains ----------

/** Page paths in a built site, from dist/**\/index.html: "/", "/about", "/apps/inventory" (no trailing slash). */
export function builtPages(dist) {
  const out = new Set();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === "index.html") out.add("/" + relative(dist, dir).split(sep).join("/"));
    }
  };
  walk(dist);
  // "/" came out as "/" + "" = "/"; the others have no trailing slash.
  return out;
}

/** Page paths from the source (src/pages), for when there is no build yet: "/about" from src/pages/about/index.astro. */
export function sourcePages(root = ROOT) {
  const base = join(root, "src/pages");
  const out = new Set();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(astro|md|mdx|html)$/.test(name)) {
        let route = "/" + relative(base, p).split(sep).join("/").replace(/\.(astro|md|mdx|html)$/, "");
        route = route.replace(/\/index$/, "") || "/";
        if (!/[[\]]/.test(route)) out.add(route);
      }
    }
  };
  walk(base);
  return out;
}

/** Does this built page have an element with this id (or an <a name>)? Only finds anchors written in the HTML. */
export function pageHasAnchor(dist, pagePath, id) {
  const file = join(dist, pagePath === "/" ? "" : pagePath, "index.html");
  if (!existsSync(file)) return false;
  const html = readFileSync(file, "utf8");
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\s(?:id|name)=["']${esc}["']`).test(html);
}

export function splitTarget(to) {
  const i = to.indexOf("#");
  return i === -1 ? { path: to, hash: "" } : { path: to.slice(0, i) || "/", hash: to.slice(i + 1) };
}
