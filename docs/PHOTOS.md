# Photos of students

Most photos on the site show students, most of them minors. **They are not stored in this repo.** The originals
stay in the team Google Drive or Wix media, where consent and access are already managed. Logos, CAD renders,
merch images and fonts are not photos of people and stay in `public/assets/`.

## How the site finds them

`PUBLIC_MEDIA_BASE` is the base URL the homepage uses for team photos (`/team/<name>.webp`) and gallery albums
(`/gal/<album>/NN.webp`, `NN-t.webp`). It defaults to `/media`, which is empty in git, so photos show as broken
images until you point it at a host (a Wix media folder or other static host) in the Pages workflow
(`env:` on the build step) or a local `.env`. Locally you can also drop files in `public/media/` (git-ignored).

Needed files: `team/4f1c204f9c.webp` (hero), `2d048fe84f`, `b5ea775824`, `bc010b578b`, `27bdee70e4`.

## Rules

- Never commit photos of students. `/public/media/` and `/public/gal/*` are git-ignored.
- Keep student names and Discord handles off the site.
- **Git history:** the five team photos above were in the first commits of this public repo. Removing them from
  the tree does not remove them from history. Fixing that needs a history rewrite (a repo admin must temporarily
  allow it) or recreating the repo.
