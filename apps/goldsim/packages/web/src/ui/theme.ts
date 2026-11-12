export type Theme = "dark" | "light";

// Shared with the other team apps (packages/ui/src/ThemeToggle.astro), so one choice applies everywhere.
const KEY = "team6220.theme";
const listeners: ((t: Theme) => void)[] = [];

// Drawn like the Inventory icon set (24px grid, 1.8 stroke). Static strings only.
const SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>';
const MOON = '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>';

/** The icon for the light/dark button: the sun in dark mode, the moon in light mode. */
export function themeIconSvg(t: Theme): string {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${t === "dark" ? SUN : MOON}</svg>`;
}

/** Saved choice, else dark. The device setting is ignored (team branding rule). */
export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function setTheme(t: Theme): void {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    // storage unavailable (private window); the theme still applies for this session
  }
  for (const l of listeners) l(t);
}

export function toggleTheme(): Theme {
  const next = currentTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

export function onThemeChange(fn: (t: Theme) => void): () => void {
  listeners.push(fn);
  return () => listeners.splice(listeners.indexOf(fn), 1);
}

export function initTheme(): void {
  document.documentElement.dataset.theme = currentTheme();
}
