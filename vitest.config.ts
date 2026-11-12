// Root tests: repo-level scripts (scripts/**). Each workspace (packages/*, apps/*) has its own `test` script.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["scripts/**/*.test.ts"] },
});
