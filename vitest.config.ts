import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const pkg = (name: string) => fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@goldsim/core": pkg("core"),
      "@goldsim/schema": pkg("schema"),
      "@goldsim/game-rebuilt": pkg("game-rebuilt"),
    },
  },
  test: {
    include: ["packages/*/src/**/*.test.ts", "packages/*/tests/**/*.test.ts"],
    testTimeout: 60000,
    environment: "node",
  },
});
