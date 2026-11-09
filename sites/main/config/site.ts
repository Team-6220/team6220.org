// Webmaster settings for the public site. Change a value, open a pull request, and the
// site rebuilds when it is merged.
//
// The summer camp values come from sites/main/content/summer-camp.json now; the exports below keep their old names.
import { summerCamp } from "@team6220/content";
import summerCampJson from "../content/summer-camp.json";

/**
 * Summer camp content: sites/main/content/summer-camp.json (edited in the Site Manager, /apps/site).
 * It holds the on/off switch, the title with the year, and the text and registration links of the page.
 * The file is validated here (and in CI), so a bad edit fails the build instead of reaching the site.
 */
export const SUMMER_CAMP = summerCamp.parse(summerCampJson);

/**
 * Summer camp switch.
 *
 * true:  "Summer Camp" appears in the main menu and the home page shows a summer camp banner.
 * false: both are hidden. The /summer-camp page still exists, so old links keep working.
 *
 * Turn it on when camp registration opens and off when camp is over (`enabled` in summer-camp.json).
 */
export const SUMMER_CAMP_ENABLED: boolean = SUMMER_CAMP.enabled;

/** Headline on the summer camp page and the home page banner (`title` in summer-camp.json). Update the year each season. */
export const SUMMER_CAMP_TITLE: string = SUMMER_CAMP.title;

/** The team store. The /merch page and the merch links point here (the Merch tab opens /merch). */
export const MERCH_STORE_URL = "https://dogaingear.com/collections/los-alamitos-high-school-robotics";

/** Where "Log In" goes: the team apps dashboard (sign-in happens there). */
export const LOGIN_URL = "/apps";
