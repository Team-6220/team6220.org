import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import wix from "@wix/astro";
import wixPages from "@wix/astro-pages";
import wixHostingAdapter from "@wix/astro-wix-hosting-adapter";
import syncMedia from "./integrations/sync-media.mjs";
import buildApps from "./integrations/build-apps.mjs";
import siteApi from "./integrations/site-api.mjs";

// Two builds of the same pages (https://github.com/Team-6220/team6220.org/wiki/History-Phase-2):
//   - Wix (the default; `pnpm build`, `wix build`): served by Wix hosting. Pages render on each request, so Wix's
//     middleware can add the dashboard's SEO tags, analytics and cookie consent. Needs the values from `wix env pull`.
//   - Static (SITE_BUILD=static; `pnpm build:static`): plain HTML in dist/, without Wix's parts. Used by the e2e
//     tests, the redirect check and CI, which need no Wix secrets.
// siteApi() adds /api/site only in the Wix build (https://github.com/Team-6220/team6220.org/wiki/Site-Manager-Plan).
const STATIC = process.env.SITE_BUILD === "static";
// Tells the browser code it is on the Wix build, where /api exists (read by packages/data/src/site/client.ts).
if (!STATIC) process.env.PUBLIC_WIX_BUILD ??= "on";

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
        // As in Wix's Astro template. Our /api endpoints check the request's origin themselves (https://github.com/Team-6220/team6220.org/wiki/History-Phase-2).
        security: { checkOrigin: false },
        // GoldSim and WingIt are plain files copied in by buildApps(). Wix hosting doesn't serve a folder's
        // index.html at the folder's address, so send the folder address there.
        redirects: {
          "/apps/goldsim": "/apps/goldsim/index.html",
          "/apps/wingit": "/apps/wingit/index.html",
        },
        image: { domains: ["static.wixstatic.com"] },
      },
);
