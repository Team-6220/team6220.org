import { z } from "zod";
import { isSafeHref } from "./inline.ts";
import { imageField } from "./image.ts";

const text = (title: string, max: number, description?: string) =>
  z.string().trim().min(1, "Can't be empty").max(max).meta({ title, ...(description ? { description } : {}) });

const optionalText = (title: string, max: number, description: string) => z.string().trim().max(max).meta({ title, description });

const count = (title: string, description?: string) =>
  z.number({ error: "Enter a number (0 if none)" }).int("Whole numbers only").min(0, "Can't be negative").max(999).meta({ title, ...(description ? { description } : {}) });

export const robot = z.object({
  year: z.string().trim().regex(/^\d{4}$/, "A four-digit year, e.g. 2026").meta({ title: "Season", description: "Also the link to this robot: /robots#2026." }),
  game: text("Game", 60, "The FRC game, e.g. REBUILT."),
  name: text("Robot name", 60, "Use \"2019 robot\" when it had no name."),
  note: optionalText("Note", 200, "Optional line under the name, e.g. what the robot was built for."),
  finish: text("Best finish", 120, "\"Event · 3rd place\" (playoff place), or \"Event · Rank 25\" (qualification rank) if we did not reach the playoffs."),
  homeFinish: optionalText("Best finish on the home page", 80, "Optional shorter version for the home page card. Leave empty to use Best finish."),
  events: z.array(text("Event", 120)).max(20).meta({ title: "Events", description: "Every event this robot played, in order." }),
  wins: count("Wins", "All matches this robot played that season (official and offseason, qualifications and playoffs). Typed in by hand: nothing loads from The Blue Alliance or match13."),
  losses: count("Losses"),
  ties: count("Ties"),
  awards: z.array(text("Award", 120)).max(20).meta({ title: "Awards", description: "e.g. \"Regional Finalist · Orange County Regional\". Leave the list empty if none." }),
  image: imageField("Photo or CAD render", { optional: true, description: "png, jpg, webp, gif or avif up to 2 MB. Leave empty to show the team logo." }),
  alt: optionalText("Photo description", 200, "What the photo shows, for screen readers. Not needed when there is no photo."),
  album: z
    .string()
    .trim()
    .max(80)
    .regex(/^[a-z0-9-]*$/, "Only lowercase letters, digits and -")
    .meta({ title: "Photo album", description: "Album name on /resources/media, e.g. oc-regional-2024. Leave empty for \"See all photos\"." }),
  cad: z
    .string()
    .trim()
    .max(1000)
    .refine((v) => v === "" || isSafeHref(v), "Use a full https:// link")
    .meta({ title: "CAD link", description: "Optional Onshape link. The View CAD button is hidden when empty." }),
  quip: optionalText("Teammate quote", 300, "Optional."),
});
export type Robot = z.infer<typeof robot>;

/** sites/main/content/robots.json. Newest first; the first robot is also the "Latest robot" on the home page. */
export const robots = z.object({
  robots: z.array(robot).min(1).max(60).meta({ title: "Robots" }),
});
export type Robots = z.infer<typeof robots>;

/** "26-38-0" */
export const recordText = (r: Pick<Robot, "wins" | "losses" | "ties">) => `${r.wins}-${r.losses}-${r.ties}`;

/** Wins + losses + ties. */
export const matchesPlayed = (r: Pick<Robot, "wins" | "losses" | "ties">) => r.wins + r.losses + r.ties;

/** Every image a robots file points to (CI checks that each exists in sites/main/media/). */
export function robotImages(value: Robots): string[] {
  return value.robots.map((r) => r.image).filter(Boolean);
}
