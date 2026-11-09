// The Site Manager's core: validate a content change and open a pull request for it.
// Works with any SiteStore, so the same code runs against the mock (local, tests) and GitHub.
import {
  AREAS,
  describeChange,
  diffContent,
  parseContent,
  toFileText,
  type AreaId,
  type Change,
} from "@team6220/content";
import {
  SiteError,
  type ImageUpload,
  type ProposeResult,
  type RepoFile,
  type Requester,
  type SiteStore,
} from "./types";

export const IMAGE_DIR = "sites/main/media/";
const IMAGE_PATH = /^sites\/main\/media\/[A-Za-z0-9][A-Za-z0-9._/-]*\.(png|jpe?g|webp|gif|avif)$/i;
export const MAX_IMAGE_BYTES = 2_000_000;
export const MAX_IMAGES = 10;

/** `site-manager/<area>-<yyyymmdd>-<who>` (UTC date). */
export function branchName(area: string, now: Date, who: string): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `site-manager/${area}-${date}-${slug(who)}`;
}

export function slug(name: string): string {
  const s = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
  return s || "admin";
}

/** Reads and validates an area's file from the store's base branch. */
export async function readArea(store: SiteStore, area: AreaId): Promise<unknown> {
  const text = await store.readFile(AREAS[area].path);
  if (text === null) throw new SiteError("server-error", `${AREAS[area].path} was not found on the main branch.`);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SiteError("server-error", `${AREAS[area].path} on the main branch is not valid JSON.`);
  }
  const parsed = parseContent(area, raw);
  // An invalid file on main can still be replaced by a valid edit, so hand back what is there.
  return parsed.ok ? parsed.value : raw;
}

export function validateImages(images: ImageUpload[] | undefined): ImageUpload[] {
  const list = images ?? [];
  if (list.length > MAX_IMAGES) throw new SiteError("invalid-image", `At most ${MAX_IMAGES} images per change.`);
  for (const img of list) {
    if (!IMAGE_PATH.test(img.path) || img.path.includes("..") || img.path.includes("//")) {
      throw new SiteError("invalid-image", `Images must be png, jpg, webp, gif or avif files under ${IMAGE_DIR}. Got "${img.path}".`);
    }
    if (typeof img.base64 !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(img.base64) || img.base64.length % 4 !== 0) {
      throw new SiteError("invalid-image", `"${img.path}" is not valid image data.`);
    }
    const bytes = (img.base64.length / 4) * 3 - (img.base64.endsWith("==") ? 2 : img.base64.endsWith("=") ? 1 : 0);
    if (bytes > MAX_IMAGE_BYTES) {
      throw new SiteError("invalid-image", `"${img.path}" is bigger than ${MAX_IMAGE_BYTES / 1_000_000} MB. Large media belongs in Wix Media or Google Drive.`);
    }
  }
  return list;
}

/** Keeps names and values from pinging GitHub users with an `@`. */
function plain(s: string): string {
  return s.replace(/@/g, "@​").replace(/[\r\n]+/g, " ");
}

export function pullRequestBody(args: {
  label: string;
  path: string;
  requester: Requester;
  changes: Change[];
  images: ImageUpload[];
  mock?: boolean;
}): string {
  const lines = args.changes.slice(0, 60).map((c) => `- \`${plain(describeChange(c)).replace(/`/g, "'")}\``);
  if (args.changes.length > 60) lines.push(`- ...and ${args.changes.length - 60} more`);
  for (const img of args.images) lines.push(`- added image \`${img.path}\``);
  return [
    `Requested by **${plain(args.requester.name)}** in the Site Manager (/apps/site).`,
    "",
    `Area: ${args.label} (\`${args.path}\`)`,
    "",
    "What changed:",
    ...lines,
    "",
    "Nothing changes on the live site until a webmaster reviews and merges this pull request. To undo it later, revert the pull request.",
  ].join("\n");
}

/**
 * Validates `value` for `area`, then opens a pull request that replaces the area's content file
 * (plus any images). Throws SiteError("invalid") with the problems when the value doesn't match the schema,
 * and SiteError("no-changes") when it equals what is on main.
 */
export async function proposeChange(
  store: SiteStore,
  input: { area: AreaId; value: unknown; images?: ImageUpload[]; requestedBy: Requester; now?: Date },
): Promise<ProposeResult> {
  const def = AREAS[input.area];
  const parsed = parseContent(input.area, input.value);
  if (!parsed.ok) throw new SiteError("invalid", "The content doesn't match what this page allows.", parsed.issues);
  const images = validateImages(input.images);

  const current = await readArea(store, input.area);
  const changes = diffContent(current, parsed.value);
  if (changes.length === 0 && images.length === 0) throw new SiteError("no-changes", "Nothing changed compared with the live content.");

  const files: RepoFile[] = [];
  if (changes.length > 0) files.push({ path: def.path, content: toFileText(parsed.value), encoding: "utf-8" });
  for (const img of images) files.push({ path: img.path, content: img.base64, encoding: "base64" });

  const pullRequest = await store.createPullRequest({
    branch: branchName(input.area, input.now ?? new Date(), input.requestedBy.name),
    title: `Site Manager: update ${def.label.toLowerCase()}`,
    body: pullRequestBody({ label: def.label, path: def.path, requester: input.requestedBy, changes, images }),
    files,
  });
  return { pullRequest, changes };
}
