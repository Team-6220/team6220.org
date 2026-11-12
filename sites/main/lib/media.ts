// Team photos live in sites/main/media/team and are served from PUBLIC_MEDIA_BASE
// (default: the copies in sites/main/media/team, at /assets/main/team; set it to move photos to another host).
// Moving media out of git is tracked in issue #8.
export const MEDIA_BASE = (import.meta.env.PUBLIC_MEDIA_BASE ?? "/assets/main").replace(/\/$/, "");

/** URL of a file under the media base, e.g. media("team/4f1c204f9c.webp"). */
export const media = (path: string) => `${MEDIA_BASE}/${path.replace(/^\//, "")}`;
