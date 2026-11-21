// React's window onto the shared frame (packages/assets/scripts/app-sidebar.js): the person's layout, pins, hidden apps
// and keybinds, and the hooks an app uses to fill the frame's menu (counts, the context picker, in-app navigation).
// Everything here is optional: outside the browser, or before the frame has loaded, it does nothing.
import { useEffect, useState } from "react";

export interface FramePin { id: string; name: string; url: string; key: string; ext: boolean }
export interface FrameLink { kind: string; title: string; href: string }
export interface FrameApp {
  id: string; name: string; description?: string; href?: string; status: string; access?: string; guests?: boolean; note?: string;
  category?: string | null; icon?: string; filledIcon?: boolean; ready?: boolean; hiddenByDefault?: boolean;
  sections?: { label: string | null; items: { name: string; icon: string; view: string }[] }[];
}
export interface FramePrefs {
  layout: "rail" | "split" | "top";
  railHidden: boolean;
  panelHidden: boolean;
  listCollapsed: boolean;
  hidden: string[];
  catOrder: string[];
  appOrder: Record<string, string[]>;
  pins: string[];
  own: { name: string; url: string }[];
  pinKeys: Record<string, string>;
  keys: Record<string, string>;
  arrows: boolean;
  showArrow: boolean;
}
export interface FrameContext {
  label: string;
  options?: { label: string; current?: boolean }[];
  onPick?: (label: string) => void;
  newLabel?: string;
  onNew?: () => void;
  countdown?: string;
}
interface FrameApi {
  prefs(): FramePrefs;
  setPrefs(p: Partial<FramePrefs>): void;
  defaultKeys(): Record<string, string>;
  keyName(e: KeyboardEvent): string;
  pins(): FramePin[];
  links(): FrameLink[];
  apps(): FrameApp[];
  openSearch(): void;
  setContext(c: FrameContext | null): void;
  setCount(view: string, text: string | number | null): void;
  onNavigate(fn: (view: string) => boolean): void;
  addSearch(fn: (q: string) => { group: string; label: string; meta?: string; href: string }[]): void;
  on(action: string, fn: (e: KeyboardEvent) => boolean | void): void;
}
declare global {
  interface Window { team6220Frame?: Partial<FrameApi> }
}

export function frame(): Partial<FrameApi> {
  return typeof window === "undefined" ? {} : (window.team6220Frame ?? {});
}

/** The person's frame choices, kept up to date when they change anywhere (the account menu, Account page, another tab). */
export function useFramePrefs(): [FramePrefs | null, (p: Partial<FramePrefs>) => void] {
  const [prefs, setPrefs] = useState<FramePrefs | null>(() => frame().prefs?.() ?? null);
  useEffect(() => {
    const update = () => setPrefs(frame().prefs?.() ?? null);
    update();
    window.addEventListener("team6220:frame-prefs", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("team6220:frame-prefs", update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return [prefs, (p) => frame().setPrefs?.(p)];
}
