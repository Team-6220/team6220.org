// Fails (exit 1) when a file in sites/main/content/ is invalid, has no schema, or isn't formatted the way the
// Site Manager writes it. Run by CI through `pnpm content:check`.
//   pnpm content:check          check
//   pnpm content:check --write  rewrite files in the canonical format (they must still be valid)
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AREAS, isAreaId, parseContent, toFileText } from "../src/index.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const write = process.argv.includes("--write");
const problems: string[] = [];

const dir = join(root, "sites/main/content");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

for (const file of files) {
  const id = file.replace(/\.json$/, "");
  if (!isAreaId(id)) {
    problems.push(`${file}: no schema registered. Add the area to AREAS in packages/content/src/index.ts.`);
    continue;
  }
  const text = readFileSync(join(dir, file), "utf8");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    problems.push(`${file}: not valid JSON (${(err as Error).message})`);
    continue;
  }
  const parsed = parseContent(id, raw);
  if (!parsed.ok) {
    for (const issue of parsed.issues) problems.push(`${file}: ${issue.path || "(file)"}: ${issue.message}`);
    continue;
  }
  const canonical = toFileText(parsed.value);
  if (canonical !== text) {
    if (write) writeFileSync(join(dir, file), canonical);
    else problems.push(`${file}: not in the canonical format. Run \`pnpm content:check --write\`.`);
  }
}

for (const id of Object.keys(AREAS)) {
  if (!existsSync(join(root, AREAS[id as keyof typeof AREAS].path))) problems.push(`${id}: ${AREAS[id as keyof typeof AREAS].path} is missing.`);
}

if (problems.length) {
  console.error(`Content check failed:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`Content check passed (${files.length} file${files.length === 1 ? "" : "s"}).`);
