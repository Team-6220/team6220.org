import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import syncMedia from "./integrations/sync-media.mjs";
import buildApps from "./integrations/build-apps.mjs";

// Phase 1 (prototype): static site on GitHub Pages at dev.team6220.org.
// Phase 2+: add the Wix Astro integration (@wix/astro) and delete pages.yml.
// See docs/PHASE-0.md and the Headless Migration Plan.
export default defineConfig({
  site: "https://dev.team6220.org",
  output: "static",
  // React renders the team apps under /apps (React 18: @wix/astro needs react ^18.3).
  integrations: [syncMedia(), buildApps(), react()],
});
