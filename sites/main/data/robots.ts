// Every robot shown on /robots (newest first). The first entry is also the "Latest robot" on the home page.
//
// To add next season's robot: put its CAD render in sites/main/media/ (served at /assets/main/<file>)
// and add ONE entry at the top of this list. Nothing else needs to change.

export interface Robot {
  /** Season year, also used as the in-page link: /robots#2026 */
  year: string;
  /** FRC game name */
  game: string;
  /** Robot name (plain text) */
  name: string;
  /** Best finish, shown on /robots. Format: "Event · 3rd place" (place in the playoffs), or "Event · Rank 25" (qualification rank) if we did not reach the playoffs. Source: match13.com/team/6220?year=YYYY */
  finish: string;
  /** Shorter best-finish line for the home page card (defaults to `finish`) */
  homeFinish?: string;
  events: string[];
  /** Photo album slug on /resources/media, or null for "See all photos" */
  album: string | null;
  /** CAD render, e.g. "/assets/main/1256dd39df.webp" */
  img: string;
  alt: string;
  /** Onshape (or other) CAD link for this robot; the "View CAD" button is hidden when null */
  cad: string | null;
  /** Optional teammate quote */
  quip: string | null;
}

export const ROBOTS: Robot[] = [
  {
    year: "2026",
    game: "REBUILT",
    name: "Goober",
    finish: "CA District Los Angeles Event · 3rd place",
    events: [
      "CA District Orange County Event",
      "CA District Los Angeles Event",
      "FIRST California Southern State Championship",
      "SoCal Showdown",
      "Beach Blitz",
    ],
    album: null,
    img: "/assets/main/1256dd39df.webp",
    alt: "CAD render of Goober, Team 6220's 2026 robot",
    cad: "https://cad.onshape.com/documents/cfcf30c88841d74e4322e2ee/w/0293e4f8d98a6db63dfa9e5e/e/e391d6c1d5b644ac4d583e63",
    quip: null,
  },
  {
    year: "2025",
    game: "REEFSCAPE",
    name: "Nessie",
    finish: "SoCal Showdown · 7th place",
    events: ["Los Angeles Regional", "SoCal Showdown", "Beach Blitz"],
    album: "socal-showdown-2025",
    img: "/assets/main/29c743c6a0.webp",
    alt: "CAD render of Nessie, Team 6220's 2025 robot",
    cad: null,
    quip: null,
  },
  {
    year: "2024",
    game: "CRESCENDO",
    name: "George",
    finish: "Orange County Regional · 5th place",
    events: ["Orange County Regional", "Beach Blitz"],
    album: "oc-regional-2024",
    img: "/assets/main/750ea7b708.webp",
    alt: "CAD render of George, Team 6220's 2024 robot",
    cad: null,
    quip: null,
  },
  {
    year: "2019",
    game: "DESTINATION: DEEP SPACE",
    name: "2019 robot",
    finish: "Beach Blitz · Rank 25",
    events: ["Orange County Regional", "Beach Blitz"],
    album: "oc-regional-2019",
    img: "/assets/main/fc1361c0d9.webp",
    alt: "CAD render of Team 6220's 2019 robot",
    cad: null,
    quip: null,
  },
];
