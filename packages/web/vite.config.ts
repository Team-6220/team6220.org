import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const pkg = (name: string) => fileURLToPath(new URL(`../${name}/src/index.ts`, import.meta.url));

// GitHub Pages project sites live under /GoldSim/; a custom domain serves from /. Override with BASE_PATH.
export default defineConfig(({ command }) => ({
  base: process.env.BASE_PATH ?? (command === "build" ? "/GoldSim/" : "/"),
  resolve: {
    alias: {
      "@goldsim/core": pkg("core"),
      "@goldsim/schema": pkg("schema"),
      "@goldsim/game-rebuilt": pkg("game-rebuilt"),
      "@goldsim/agents": pkg("agents"),
      "@goldsim/pathplan": pkg("pathplan"),
      "@goldsim/batch": pkg("batch"),
      "@goldsim/analytics": pkg("analytics"),
      "@goldsim/data-layer": pkg("data-layer"),
    },
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 4000,
  },
  worker: { format: "es" },
}));
