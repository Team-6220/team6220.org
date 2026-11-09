// Webmaster settings for the public site. Change a value, open a pull request, and the
// site rebuilds when it is merged.

/**
 * Summer camp switch.
 *
 * true:  "Summer Camp" appears in the main menu and the home page shows a summer camp banner.
 * false: both are hidden. The /summer-camp page still exists, so old links keep working.
 *
 * Turn it on when camp registration opens and off when camp is over.
 */
export const SUMMER_CAMP_ENABLED = false;

/** Headline on the summer camp page and the home page banner. Update the year each season. */
export const SUMMER_CAMP_TITLE = "2026 Robotics Summer Camps";

/** The team store. The /merch page and the merch links point here (the Merch tab opens /merch). */
export const MERCH_STORE_URL = "https://dogaingear.com/collections/los-alamitos-high-school-robotics";

/** Where "Log In" goes: the team apps dashboard (sign-in happens there). */
export const LOGIN_URL = "/apps";
