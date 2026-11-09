export type Theme = "dark" | "light";

const KEY = "goldsim.theme";
const listeners: ((t: Theme) => void)[] = [];

function systemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Saved choice, else the system setting. localStorage is a convenience copy; the account copy arrives in Phase 2. */
export function currentTheme(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return systemTheme();
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
  if (!document.documentElement.dataset.theme) document.documentElement.dataset.theme = systemTheme();
  window.matchMedia?.("(prefers-color-scheme: light)").addEventListener("change", () => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {
      saved = null;
    }
    if (!saved) {
      document.documentElement.dataset.theme = systemTheme();
      for (const l of listeners) l(currentTheme());
    }
  });
}
