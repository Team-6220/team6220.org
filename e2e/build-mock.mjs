// Builds the site a second time into dist-mock/ with the inventory on made-up data (PUBLIC_INVENTORY_BACKEND=mock).
// The deployed build uses Wix, so ?demo=signed-out / ?demo=pending on /apps/inventory only work on this one
// (see apps/inventory/README.md). The e2e tests use it for the inventory demo modes.
import { spawnSync } from "node:child_process";

const res = spawnSync("pnpm", ["exec", "astro", "build", "--outDir", "dist-mock"], {
  stdio: "inherit",
  env: { ...process.env, PUBLIC_INVENTORY_BACKEND: "mock" },
  shell: process.platform === "win32",
});
process.exit(res.status ?? 1);
