/** A screen renders into #main and may return a cleanup function. */
export type Screen = (main: HTMLElement) => void | (() => void);

let reroute: () => void = () => {};

export function setRerouter(fn: () => void): void {
  reroute = fn;
}

/** Hash routing works the same under the GitHub Pages sub-path and at a domain root. */
export function navigate(path: string): void {
  if (location.hash === `#${path}`) reroute();
  else location.hash = path;
}
