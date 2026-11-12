// Generates docs/redirects.csv (copy-paste / import into Wix's URL Redirect Manager) and the redirect tables in
// docs/REDIRECTS.md from docs/redirects.json.   pnpm redirects:csv   (add --print to only show the CSV)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { CSV_PATH, MD_END, MD_PATH, MD_START, loadRedirects, toCsv, toMarkdown } from "./lib.mjs";

export function generate({ write = true } = {}) {
  const data = loadRedirects();
  const csv = toCsv(data);
  const md = readFileSync(MD_PATH, "utf8");
  const a = md.indexOf(MD_START);
  const b = md.indexOf(MD_END);
  if (a === -1 || b === -1) throw new Error(`docs/REDIRECTS.md needs the markers ${MD_START} and ${MD_END} around the generated table`);
  const nextMd = md.slice(0, a) + toMarkdown(data) + md.slice(b + MD_END.length);
  if (write) {
    writeFileSync(CSV_PATH, csv);
    writeFileSync(MD_PATH, nextMd);
  }
  return { csv, md: nextMd };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--print")) {
    process.stdout.write(generate({ write: false }).csv);
  } else {
    const { csv } = generate();
    console.log(`Wrote docs/redirects.csv (${csv.trim().split("\n").length - 1} redirects) and updated the tables in docs/REDIRECTS.md.`);
  }
}
