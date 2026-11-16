// Which build this is. The Wix build (Wix hosting, `pnpm build`) has /api endpoints and a session cookie; the static
// build (tests, `pnpm build:static`) has neither. astro.config.mjs sets PUBLIC_WIX_BUILD on the Wix build.

/** True on the Wix build, where /api exists and the member's sign-in is a session cookie. */
export function onWixBuild(): boolean {
  const v = String(import.meta.env?.PUBLIC_WIX_BUILD ?? "").toLowerCase();
  return v === "on" || v === "1" || v === "true";
}
