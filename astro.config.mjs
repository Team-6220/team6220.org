import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import wix from "@wix/astro";
import wixPages from "@wix/astro-pages";
import wixHostingAdapter from "@wix/astro-wix-hosting-adapter";
import syncMedia from "./integrations/sync-media.mjs";
import buildApps from "./integrations/build-apps.mjs";
import siteApi from "./integrations/site-api.mjs";

// Two builds of the same pages (docs/PHASE-2.md):
//   - Wix (the default; `pnpm build`, `wix build`): served by Wix hosting. Pages render on each request, so Wix's
//     middleware can add the dashboard's SEO tags, analytics and cookie consent. Needs the values from `wix env pull`.
//   - Static (SITE_BUILD=static; `pnpm build:static`): plain HTML in dist/, without Wix's parts. Used by the e2e
//     tests, the redirect check and CI, which need no Wix secrets.
// siteApi() adds /api/site only in the Wix build (docs/SITE-MANAGER.md).
const STATIC = process.env.SITE_BUILD === "static";

export default defineConfig(
  STATIC
    ? {
        site: "https://www.team6220.org",
        output: "static",
        // React 18 only: @wix/astro peers on react ^18.3. Apps under apps/* are React.
        integrations: [syncMedia(), react(), buildApps(), siteApi()],
      }
    : {
        site: "https://www.team6220.org",
        output: "server",
        adapter: wixHostingAdapter(),
        integrations: [syncMedia(), wix(), wixPages(), react(), buildApps(), siteApi()],
        // As in Wix's Astro template. Our /api endpoints check the request's origin themselves (docs/PHASE-2.md).
        security: { checkOrigin: false },
        image: { domains: ["static.wixstatic.com"] },
      },
);
