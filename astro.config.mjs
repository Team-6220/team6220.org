import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import wix from "@wix/astro";
import wixPages from "@wix/astro-pages";
import wixHostingAdapter from "@wix/astro-wix-hosting-adapter";
import syncMedia from "./integrations/sync-media.mjs";
import buildApps from "./integrations/build-apps.mjs";
import siteApi from "./integrations/site-api.mjs";

// Phase 2: served by Wix hosting (docs/PHASE-2.md). `output: "server"` is required by Wix; every page under
// src/pages is still built ahead of time (`export const prerender = true` in each), and only /api routes run as
// server code. siteApi() adds /api/site (docs/SITE-MANAGER.md). The shape matches Wix's own Astro template.
export default defineConfig({
  site: "https://www.team6220.org",
  output: "server",
  adapter: wixHostingAdapter(),
  // React 18 only: @wix/astro peers on react ^18.3. Apps under apps/* are React.
  integrations: [syncMedia(), wix(), wixPages(), react(), buildApps(), siteApi()],
  security: { checkOrigin: false },
  image: { domains: ["static.wixstatic.com"] },
});
