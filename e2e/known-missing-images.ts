// Images that are KNOWN to be missing from the built site, so the smoke tests don't fail on them.
//
// Every photo under /gal/ is missing on purpose in a fresh checkout / CI build: gallery photos are not stored in git
// (see .gitignore: /public/gal/*) and are served from /gal/<album>/NN.webp (and NN-t.webp thumbnails) once added.
// Tracked in issue #8: https://github.com/Team-6220/team6220.org/issues/8
//
// This is an allow-list, not an excuse: it is matched by path, anything outside it that fails still fails the test,
// and the tests print how many allow-listed images were missing so the number is visible. When #8 is done (photos
// are in place for the build), delete the entry below and the tests will start enforcing that every gallery image loads.
//
// To allow one more image, add its exact site path (starting with "/") to KNOWN_MISSING_IMAGES with a comment
// saying why and which issue tracks it. Keep this list explicit; do not widen the prefix rule.

/** Exact paths of known-missing images. */
export const KNOWN_MISSING_IMAGES: string[] = [];

/** Prefixes whose files are all known missing. Only the gallery photos folder (issue #8). */
export const KNOWN_MISSING_PREFIXES: string[] = ["/gal/"];

export function isKnownMissingImage(sitePath: string): boolean {
  return KNOWN_MISSING_IMAGES.includes(sitePath) || KNOWN_MISSING_PREFIXES.some((p) => sitePath.startsWith(p));
}
