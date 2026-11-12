/* The team icon set, shared by every app. Published at /assets/shared/scripts/icons.js.
   Each icon is drawn on a 24px grid with a 1.8 stroke (the style the Inventory started).
   Use: team6220Icons.svg("search") returns an <svg> element; style it with the "t-icon" class
   (packages/assets/styles/app-sidebar.css) or your own width/height. team6220Icons.paths("search") returns just the
   drawing, for frameworks that render the <svg> themselves (React: packages/ui/src/Icon.tsx).
   To add an icon: add one entry to PATHS, keeping the same grid and stroke. */
(function () {
  var PATHS = {
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    external: '<path d="M7 17L17 7M8 7h9v9"/>',
    arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    home: '<path d="M4 11l8-7 8 7M6 10v10h12V10M10 20v-6h4v6"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/>',
    parts: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
    tools: '<path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5a4 4 0 0 0-2-2z"/><path d="M14.5 6.5L17 4"/>',
    audits: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM8.5 12.5l2.2 2.2 4.8-4.8"/>',
    production: '<path d="M4 20h16M6 20V9l4 3V9l4 3V5h4v15"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/>',
    wing: '<path d="M3 6c7 0 13 1 18 5-4 0-6 1-7 3-2-1-4-1-6 0 0-2-2-5-5-8z"/><path d="M8 14c0 2 1 4 3 5"/>',
    collapse: '<path d="M15 6l-6 6 6 6"/><path d="M20 4v16"/>',
    hide: '<path d="M4 4v16"/><path d="M20 12H9M13 8l-4 4 4 4"/>',
    fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  };

  window.team6220Icons = {
    names: Object.keys(PATHS),
    paths: function (name) {
      return PATHS[name] || "";
    },
    svg: function (name) {
      var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      s.setAttribute("viewBox", "0 0 24 24");
      s.setAttribute("class", "t-icon");
      s.setAttribute("aria-hidden", "true");
      s.innerHTML = PATHS[name] || ""; // static strings from PATHS only
      return s;
    },
  };
})();
