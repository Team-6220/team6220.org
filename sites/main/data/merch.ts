// The /merch grid: sites/main/content/merch.json (edited in the Site Manager, /apps/site).
// The file is validated here (and in CI), so a bad edit fails the build.
import { merch } from "@team6220/content";
import json from "../content/merch.json" with { type: "json" };

export const MERCH = merch.parse(json);
