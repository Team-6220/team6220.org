// Creates a new season's game module from templates/game-module (Stay Gold: kickoff is fill-in-the-blanks).
// Usage: npm run new-game -- <year> <name> [--out <dir>]
//   e.g. npm run new-game -- 2027 biocore   ->  packages/game-biocore/

import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const outFlag = args.indexOf("--out");
const outArg = outFlag >= 0 ? args.splice(outFlag, 2)[1] : undefined;
const [yearArg, nameArg] = args;

function fail(msg: string): never {
  console.error(`✗ ${msg}\nUsage: npm run new-game -- <year> <name>   (e.g. npm run new-game -- 2027 biocore)`);
  process.exit(1);
}

const year = Number(yearArg);
if (!Number.isInteger(year) || year < 1992 || year > 2100) fail(`"${yearArg ?? ""}" is not a season year.`);
const name = (nameArg ?? "").toLowerCase();
if (!/^[a-z][a-z0-9-]*$/.test(name)) fail(`"${nameArg ?? ""}" must be lowercase letters, digits and dashes, starting with a letter.`);

const target = resolve(outArg ?? join(repo, "packages", `game-${name}`));
if (existsSync(target)) fail(`${target} already exists.`);

cpSync(join(repo, "templates", "game-module"), target, { recursive: true });

const gamePath = join(target, "game.json");
const game = JSON.parse(readFileSync(gamePath, "utf8"));
game.id = `${name}-${year}`;
game.name = name.toUpperCase();
game.year = year;
writeFileSync(gamePath, JSON.stringify(game, null, 2) + "\n");

const sourcesPath = join(target, "SOURCES.md");
writeFileSync(
  sourcesPath,
  readFileSync(sourcesPath, "utf8").replace("TODO: game name (TODO: year)", `${name.toUpperCase()} (${year})`).replace("**TODO: year FIRST", `**${year} FIRST`),
);

writeFileSync(
  join(target, "package.json"),
  JSON.stringify(
    { name: `@goldsim/game-${name}`, version: "0.1.0", private: true, type: "module", main: "src/index.ts", types: "src/index.ts" },
    null,
    2,
  ) + "\n",
);

const rel = target.startsWith(repo) ? target.slice(repo.length + 1).replace(/\\/g, "/") : target;
console.log(`✓ Created ${rel} (${game.id})

Next:
  1. Follow docs/AUTHORING.md: give Claude the manual, docs/AUTHORING.md and packages/game-rebuilt as the example.
  2. Replace every TODO:            grep -rn TODO ${rel}
  3. Validate until clean:         npm run validate-game -- ${rel}
  4. Add manual examples as tests:  ${rel}/tests/, then npm test
  5. To use it in the app, add an "@goldsim/game-${name}" alias next to "@goldsim/game-rebuilt"
     in tsconfig.base.json, vitest.config.ts and packages/web/vite.config.ts.`);
