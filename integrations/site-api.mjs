// Adds the /api/site endpoint (src/server/site-route.ts) to the site, but only when Astro runs with
// `output: "server"` (Phase 2). The static Phase 1 build (GitHub Pages) can't host server routes, so there this
// integration does nothing and /apps/site works in demo mode ("no pull request is opened").
//
// Phase 2: set `output: "server"` and add the Wix adapter in astro.config.mjs; this integration needs no change.
// Also set PUBLIC_SITE_MANAGER_API=on in the build so /apps/site calls the endpoint instead of the demo.

/** @returns {import("astro").AstroIntegration} */
export default function siteApi() {
  return {
    name: "site-api",
    hooks: {
      "astro:config:setup": ({ config, injectRoute, logger }) => {
        if (config.output !== "server") return;
        injectRoute({ pattern: "/api/site", entrypoint: "./src/server/site-route.ts", prerender: false });
        logger.info("added /api/site (Site Manager)");
      },
    },
  };
}
