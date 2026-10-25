// Validates a game module folder: schemas, cross-file references, timeline, scoring.
// Usage: npm run validate-game -- packages/game-rebuilt

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { GameModuleFiles } from "../game.js";
import { checkModule, validateModuleFiles } from "../game-checks.js";

const dir = resolve(process.argv[2] ?? "packages/game-rebuilt");
const files: Record<string, unknown> = {};
for (const name of Object.keys(GameModuleFiles)) {
  const path = join(dir, name);
  if (!existsSync(path)) continue;
  try {
    files[name] = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    console.error(`✗ ${name} is not valid JSON: ${(e as Error).message}`);
    process.exit(1);
  }
}

const { module, errors } = validateModuleFiles(files);
if (!module) {
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}

const report = checkModule(module);
console.log(`Game module: ${module.game.name} (${module.game.id} v${module.game.version}, manual ${module.game.manualVersion})`);
for (const s of report.summary) console.log(`  ${s}`);
for (const w of report.warnings) console.warn(`⚠ ${w}`);
for (const e of report.errors) console.error(`✗ ${e}`);
if (report.errors.length) {
  console.error(`\n${report.errors.length} error(s).`);
  process.exit(1);
}
console.log(`\n✓ Valid${report.warnings.length ? ` with ${report.warnings.length} warning(s)` : ""}.`);
