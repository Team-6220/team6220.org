# Photos of students

Most photos on the site show students, and most students are minors. A mentor or coach needs to confirm
photo consent **before this repository is made public** or the site is published, because:

- A public repo and the GitHub Pages site are both visible to anyone.
- Git keeps history. A photo that is committed and later removed is still downloadable from old commits, and
  fixing that means rewriting history.

## What is and isn't in the repo today

| Photos | In git? |
| --- | --- |
| Gallery albums (94 photos, full size + thumbnails) | **No.** `/public/gal/*` is git-ignored until consent is confirmed. The gallery section shows broken images until they are added. |
| Team photos used on the homepage (hero, team, pit, drive, crowd and similar) | **Yes**, in `public/assets/embedded/`. They are the larger `.webp` files there. They came with the approved preview and were not individually reviewed. |

## Before making the repo public

- [ ] A mentor confirms consent for every student visible in the homepage photos, or those photos are swapped.
- [ ] Decide the same for the gallery albums. When cleared, remove the `/public/gal/*` lines from `.gitignore`
      and add the photos in a pull request.
- [ ] Keep student names and Discord handles off the site.
