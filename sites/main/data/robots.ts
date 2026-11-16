// Robots: sites/main/content/robots.json (edited in the Site Manager, /apps/site). Newest first; the first robot is
// also the "Latest robot" on the home page. The file is validated here (and in CI), so a bad edit fails the build.
//
// The stats (wins, losses, ties, awards) are typed in by hand in the Site Manager. Nothing loads from
// The Blue Alliance or match13 (team decision, issue #159).
import { matchesPlayed, mediaUrl, recordText, robots } from "@team6220/content";
import json from "../content/robots.json" with { type: "json" };

/** Shown when a robot has no photo or render yet. */
const NO_PHOTO = "/assets/shared/logos/6220WingsAndLogoVectorGold.svg";

const list = robots.parse(json).robots;

/** Everything the /robots showcase and the home page card show, ready to print. */
export interface Robot {
  /** Unique id for the tab and the link: the year, or year-name when one season has two robots (/robots#2025-sbaghettio). */
  key: string;
  year: string;
  game: string;
  name: string;
  note: string;
  finish: string;
  homeFinish: string;
  events: string[];
  /** "26-38-0" */
  record: string;
  matches: number;
  awards: string[];
  img: string;
  alt: string;
  /** Album slug on /resources/media, or "" for "See all photos" */
  album: string;
  cad: string;
  quip: string;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const ROBOTS: Robot[] = list.map((r, i) => {
  const sharedYear = list.findIndex((x) => x.year === r.year) !== i;
  return {
    key: sharedYear ? `${r.year}-${slug(r.name)}` : r.year,
    year: r.year,
    game: r.game,
    name: r.name,
    note: r.note,
    finish: r.finish,
    homeFinish: r.homeFinish || r.finish,
    events: r.events,
    record: recordText(r),
    matches: matchesPlayed(r),
    awards: r.awards,
    img: r.image ? mediaUrl(r.image) : NO_PHOTO,
    alt: r.image ? r.alt || `Photo of ${r.name}` : "Team 6220 logo",
    album: r.album,
    cad: r.cad,
    quip: r.quip,
  };
});
