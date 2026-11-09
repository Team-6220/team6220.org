import { defineConfig } from "astro/config";
import syncMedia from "./integrations/sync-media.mjs";

// Phase 1 (prototype): static site on GitHub Pages at dev.team6220.org.
// Phase 2+: add the Wix Astro integration (@wix/astro) and delete pages.yml.
// See docs/PHASE-0.md and the Headless Migration Plan.
export default defineConfig({
  site: "https://dev.team6220.org",
  output: "static",
  // Pages are built as about.html, about/history.html, ... so GitHub Pages serves team6220.org/about
  // without redirecting to /about/ (page addresses have no trailing slash).
  build: { format: "file" },
  integrations: [syncMedia()],
});
