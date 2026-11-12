// The one-page prototype used in-page addresses like dev.team6220.org/#about. A small script on the
// home page sends those to the new pages (see MainLayout.astro). docs/REDIRECTS.md lists them too.
// "#photos-<album>" (an album in the old gallery) goes to /resources/media#<album>.
export const OLD_ANCHORS: Record<string, string> = {
  about: "/about",
  history: "/about/history",
  robots: "/robots",
  join: "/about/join",
  faq: "/about/join#faq",
  apply: "/about/join#apply",
  sponsors: "/sponsors",
  budget: "/sponsors#budget",
  "sponsor-list": "/sponsors#sponsor-list",
  resources: "/resources",
  outreach: "/about/outreach",
  gallery: "/about/outreach#gallery",
  social: "/about/outreach#social",
  merch: "/merch",
  photos: "/resources/media",
};
