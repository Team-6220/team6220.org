import { h } from "../ui/dom.js";
import { localSaveNotice } from "../ui/notice.js";

/** A small "?" that opens a plain-language explanation (works with keyboard and without JavaScript tricks). */
export function help(text: string): HTMLElement {
  return h("details", { class: "help" }, h("summary", { "aria-label": "What is this?" }, "?"), h("div", { class: "help-pop" }, text));
}

/** A control label with a "?" next to it. */
export function withHelp(label: string, text: string): HTMLElement {
  return h("span", { class: "row center", style: "gap:6px" }, label, help(text));
}

/** Reminder shown wherever Lab saves or exports results or runs; wording lives in ui/notice.ts. */
export const saveNotice = localSaveNotice;

export interface GlossaryEntry {
  term: string;
  text: string;
}

/** Every term the Lab uses, explained for someone who has never seen the code. */
export const GLOSSARY: GlossaryEntry[] = [
  {
    term: "Match",
    text: "One full simulated match: 3 robots against 3 robots, played by computer drivers from start to finish. Each takes a second or two to simulate.",
  },
  {
    term: "Seed",
    text: "A number that decides every \"random\" thing in a match (where pieces scatter, how drivers wobble). The same seed always plays out the same way. When you test several settings, each one is run on the same list of seeds, so differences come from the setting and not from luck.",
  },
  {
    term: "Setting",
    text: "One combination of values being tested, for example \"exit speed 12 m/s\". A sweep runs several settings.",
  },
  {
    term: "Matches per setting",
    text: "How many times each setting is played, each time with a different seed. More matches give narrower confidence ranges, but take longer.",
  },
  {
    term: "Test specific values",
    text: "You type the exact values to try, like 6, 9, 12. If you test two things at once, it tries every combination (also called a grid): 3 values × 3 values = 9 settings.",
  },
  {
    term: "Spread across a range (Latin hypercube)",
    text: "You give a lowest and highest value and a number of settings. The tool splits the range into that many equal slices and tests exactly one value from each slice, picked at random. Every part of the range gets covered evenly, with far fewer matches than testing every combination. It's most useful when you change several things at once.",
  },
  {
    term: "Fire rate vs exit speed",
    text: "They are independent. Exit speed is how hard each ball is thrown: it decides how far it can reach and how flat it flies. Fire rate (balls per second) is how many balls leave the shooter each second: it decides how quickly the hopper empties. A faster exit speed doesn't raise fire rate, and a faster fire rate doesn't add range.",
  },
  {
    term: "Test an archetype",
    text: "Puts the robot you're studying on a random alliance and station in every match, with random partners and opponents driven by random strategies. The result is how good the design is in general, not just against one fixed lineup.",
  },
  {
    term: "Driver strategy and skill",
    text: "Every computer driver has a strategy (scorer, defender, feeder) and a skill level (Rookie to Elite) that sets how fast it reacts, how well it aims, and how often it makes sloppy choices. \"Random\" mixes them the way a real event does.",
  },
  {
    term: "Average and 95% range (confidence interval)",
    text: "The average is the middle result over all the matches. The 95% range is where the true average very likely falls: if the experiment were repeated many times, about 95 of 100 ranges would contain the truth. When two ranges overlap a lot, there is no clear difference between them yet.",
  },
  {
    term: "Effect of a setting",
    text: "How much the result changed when a setting went from its lowest to its highest tested value, with its 95% range. If the range includes zero, the sim can't tell the effect apart from luck: \"no clear effect\".",
  },
  {
    term: "What matters most",
    text: "Ranks the tested settings by how strongly they move the result, and shows how much of the match-to-match variation each one explains. Settings near the bottom hardly matter for this result.",
  },
  {
    term: "Contribution (EPA-style)",
    text: "An estimate of how many points one robot of a design adds to its alliance, found by comparing many different alliance lineups (like Statbotics' EPA). It only works when lineups vary, so run it with random alliances.",
  },
  {
    term: "Win probability",
    text: "How often blue's alliance won across the matches. A tie counts as half a win.",
  },
  {
    term: "Bonus ranking points",
    text: "Extra ranking points an alliance earns for hitting the game's bonus goals. The thresholds (how many pieces or points are needed) depend on the event type you choose.",
  },
  {
    term: "Rule coverage",
    text: "Which game rules the sim checks. \"Implemented\" are enforced, \"approximated\" are roughly modeled, \"not implemented\" are ignored. The results only reflect the rules that are checked.",
  },
];

/** Collapsible "How this works" panel with the full glossary. */
export function glossaryPanel(intro: string): HTMLElement {
  return h(
    "details",
    { class: "panel glossary" },
    h("summary", null, "How this works (plain-English guide)"),
    h("p", { class: "small muted", style: "margin-top:8px" }, intro),
    h(
      "dl",
      null,
      GLOSSARY.flatMap((g) => [h("dt", null, g.term), h("dd", null, g.text)]),
    ),
  );
}
