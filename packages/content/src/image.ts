// Images in content files: a path relative to sites/main/media/ (for example "a26bfa3ebe.png"), which the site serves
// at /assets/main/<path>. The Site Manager uploads small images with the pull request under the same rules the
// server enforces (@team6220/data `validateImages` uses IMAGE_RULES too).
import { z } from "zod";
import { escapeAttr } from "./inline.ts";

export const IMAGE_RULES = {
  /** Where uploaded images are committed. */
  dir: "sites/main/media/",
  maxBytes: 2_000_000,
  maxPerChange: 10,
  extensions: ["png", "jpg", "jpeg", "webp", "gif", "avif"],
  mimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"],
} as const;

const NAME_CHAR = /[A-Za-z0-9._/-]/;

/**
 * A repository-relative image file name: letters, digits, `.`, `_`, `-` and `/`, starting with a letter or digit,
 * ending in an allowed extension, no `..` or `//`. A single pass (no backtracking) because it runs on user input.
 */
export function isImageFile(path: string): boolean {
  if (path.length === 0 || path.length > 300) return false;
  if (!/[A-Za-z0-9]/.test(path[0]!)) return false;
  for (let i = 0; i < path.length; i++) if (!NAME_CHAR.test(path[i]!)) return false;
  if (path.includes("..") || path.includes("//")) return false;
  const dot = path.lastIndexOf(".");
  if (dot < 1) return false;
  return (IMAGE_RULES.extensions as readonly string[]).includes(path.slice(dot + 1).toLowerCase());
}

/** Where the site serves a file of sites/main/media/. Logos and photos here are always under /assets/main. */
export const mediaUrl = (path: string) => `/assets/main/${path}`;

/**
 * An image field: a path relative to sites/main/media/. `optional: true` also allows "" (no image), so the
 * form can leave it empty. The editor shows an uploader for fields marked `ui: "image"`.
 */
export function imageField(title: string, opts: { optional?: boolean; description?: string } = {}) {
  return z
    .string()
    .trim()
    .max(200)
    .refine((v) => (opts.optional && v === "") || isImageFile(v), `Choose a ${IMAGE_RULES.extensions.join("/")} image`)
    .meta({
      title,
      ui: "image",
      description: opts.description ?? `${IMAGE_RULES.extensions.join(", ")} up to ${IMAGE_RULES.maxBytes / 1_000_000} MB.`,
    });
}

/** The `src` attribute value for an image path. */
export function imgSrc(path: string): string {
  return escapeAttr(mediaUrl(path));
}
