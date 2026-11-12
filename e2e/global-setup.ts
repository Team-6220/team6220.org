import { existsSync } from "node:fs";
import { resolve } from "node:path";

export default function globalSetup() {
  const root = resolve(import.meta.dirname, "..");
  for (const [dir, how] of [
    ["dist", "pnpm build"],
    ["dist-mock", "pnpm build:e2e-mock"],
  ]) {
    if (!existsSync(resolve(root, dir, "index.html"))) {
      throw new Error(`${dir}/ not found. The e2e tests run against the built site: run \`${how}\` first (or \`pnpm test:e2e:build\` to do everything).`);
    }
  }
}
