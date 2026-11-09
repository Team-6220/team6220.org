// Functions like auth.login() and inventory.listItems() live here.
// Phase 1: they call Wix from the browser. Phase 2: they call /api/* or the @wix/astro integration.
// App UIs never change between phases.
export { WIX_CLIENT_ID, APPS_HOME_PATH, LOGIN_CALLBACK_PATH, BADGES, type BadgeName } from "./config";
export * as auth from "./auth";
export type { Member, MemberStatus } from "./auth";
