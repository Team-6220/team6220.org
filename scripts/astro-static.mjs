// Runs an Astro command on the static build (SITE_BUILD=static, see astro.config.mjs): plain pages, no Wix hosting,
// so no Wix values are needed. `pnpm build:static` and `pnpm check` use it, and so do the e2e tests and CI.
// Usage: node scripts/astro-static.mjs <astro command> [arguments], e.g. `build --outDir dist-mock`.
import { spawnSync } from "node:child_process";

const res = spawnSync("pnpm", ["exec", "astro", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, SITE_BUILD: "static" },
  shell: process.platform === "win32",
});
process.exit(res.status ?? 1);
