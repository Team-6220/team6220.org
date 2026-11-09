# Photos of students

Most photos on the site show students, most of them minors. A mentor confirmed consent for the photos below
before they were committed to this public repo.

## Where they are

| Photos | Location | Served at |
| --- | --- | --- |
| Homepage team photos (hero + four cards, 5 files) | `sites/main/media/team/` | `/assets/main/team/<name>.webp` |
| Gallery albums (94 photos) | **Not in git yet.** `/public/gal/*` is git-ignored | `/gal/<album>/NN.webp`. The gallery section shows broken images until they are added |

This is a stopgap. Storing photos in git makes the repo heavy and any photo removed later stays in history.
See the GitHub issue "Serve media from Wix instead of git".

`PUBLIC_MEDIA_BASE` (default `/assets/main`) is the base URL the homepage uses for these photos. Point it at
another host to move them out of git without touching the markup.

## Rules

- Photos of students are added only after a mentor confirms consent.
- Keep student names and Discord handles off the site.
