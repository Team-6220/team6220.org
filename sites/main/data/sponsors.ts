// Sponsors: sites/main/content/sponsors.json (edited in the Site Manager, /apps/site).
// Used by the Sponsors page and the home page marquee. The file is validated here (and in CI), so a bad edit fails the build.
import { sponsors } from "@team6220/content";
import json from "../content/sponsors.json";

export const SPONSORS = sponsors.parse(json).sponsors;
