// Checks and prepares an image chosen in the editor. The limits come from the content package (IMAGE_RULES),
// the same ones the server enforces when the pull request is made.
import { IMAGE_RULES } from "@team6220/content";

export interface PreparedImage {
  /** Path relative to sites/main/media/ (what goes in the content file). */
  path: string;
  base64: string;
  /** For the preview. */
  dataUrl: string;
  bytes: number;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

/** The problem with a file, or null when it can be used. */
export function imageProblem(file: { type: string; size: number; name?: string }): string | null {
  if (!EXT_BY_MIME[file.type]) return `"${file.name ?? "That file"}" isn't a ${IMAGE_RULES.extensions.filter((e) => e !== "jpeg").join(", ")} image.`;
  if (file.size > IMAGE_RULES.maxBytes) {
    return `"${file.name ?? "That file"}" is ${(file.size / 1_000_000).toFixed(1)} MB. The limit is ${IMAGE_RULES.maxBytes / 1_000_000} MB; larger media belongs in Wix Media or Google Drive.`;
  }
  if (file.size === 0) return `"${file.name ?? "That file"}" is empty.`;
  return null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Reads the file and names it after a hash of its content (same file twice = one file), like the existing media. */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const problem = imageProblem(file);
  if (problem) throw new Error(problem);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hash = Array.from(digest.subarray(0, 5), (b) => b.toString(16).padStart(2, "0")).join("");
  const base64 = toBase64(bytes);
  return { path: `${hash}.${EXT_BY_MIME[file.type]}`, base64, dataUrl: `data:${file.type};base64,${base64}`, bytes: bytes.length };
}
