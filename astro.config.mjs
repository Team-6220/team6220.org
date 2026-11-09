import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import syncMedia from "./integrations/sync-media.mjs";

// Phase 1 (prototype): static site on GitHub Pages at dev.team6220.org.
// Phase 2+: add the Wix Astro integration (@wix/astro) and delete pages.yml.
// See docs/PHASE-0.md and the Headless Migration Plan.
export default defineConfig({
  site: "https://dev.team6220.org",
  output: "static",
  // React 18 only: @wix/astro (Phase 2) peers on react ^18.3. Apps under apps/* are React.
  integrations: [syncMedia(), react()],
});
