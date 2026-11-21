// Shared brand styles and React pieces for the site and every app.
// Tokens: import "@team6220/ui/tokens.css" from an Astro layout. Shared classes: "@team6220/ui/app.css".
export { Icon } from "./Icon";
// Pieces the operations apps (Icarus, Production, BOM) share. See https://github.com/Team-6220/team6220.org/wiki/Operations-Architecture.
export { AppShell, type AppShellState } from "./AppShell";
export { StatusPill, type StatusTone } from "./StatusPill";
export { RecordChip } from "./RecordChip";
export { PersonPicker, ProjectPicker, SubteamPicker } from "./Pickers";
export { HistoryList } from "./HistoryList";
// The screen building blocks from the apps redesign (styles: "@team6220/ui/kit.css"). See src/kit/index.tsx.
export * from "./kit";
export { frame, useFramePrefs, type FramePrefs, type FramePin, type FrameLink, type FrameApp, type FrameContext } from "./frame";
