/* The sidebar every team app shares. Published at /assets/shared/scripts/app-sidebar.js.
   Needs icons.js and account.js (loaded before this file) and /assets/shared/styles/app-sidebar.css.

   What it holds
     top:     the main site link, the apps dashboard, then one link per live app (from /assets/shared/data/apps.json)
     bottom:  fullscreen, light/dark, account, and the two size buttons

   Sizes (saved in the browser as team6220.sidebar and set on <html data-sidebar="...">)
     open        full width with labels
     compressed  icons only
     hidden      off screen; it slides in when the cursor reaches the left edge or a finger swipes in from it.
                 Fullscreen always starts hidden.
   On a phone the sidebar is always a drawer, opened with the round menu button.

   The light/dark choice is saved as team6220.theme and set on <html data-theme="...">. */
(function () {
  var SIZE_KEY = "team6220.sidebar";
  var THEME_KEY = "team6220.theme";
  var root = document.documentElement;
  var icons = window.team6220Icons;

  function read(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null; // storage blocked (private window)
    }
  }
  function save(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      // The choice still applies until the page is closed.
    }
  }
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "onClick") node.addEventListener("click", attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }
  function label(text) {
    return el("span", { class: "sb-label" }, [text]);
  }

  // ---- Light / dark
  function theme() {
    return root.dataset.theme === "light" ? "light" : "dark";
  }
  root.dataset.theme = read(THEME_KEY) === "light" ? "light" : "dark";

  // ---- Size
  var savedSize = read(SIZE_KEY);
  var size = savedSize === "compressed" || savedSize === "hidden" ? savedSize : "open";
  function setSize(next, remember) {
    size = next;
    root.dataset.sidebar = next;
    root.classList.remove("sb-peek");
    if (remember) save(SIZE_KEY, next);
  }
  setSize(size, false);


  function samePage(href) {
    var here = location.pathname.replace(/\/$/, "");
    return here === href.replace(/\/$/, "");
  }
  function link(href, iconName, text, isPlace) {
    var attrs = { href: href, title: text };
    if (isPlace !== false && samePage(href)) attrs["aria-current"] = "page"; // highlights where you are
    return el("a", attrs, [icons.svg(iconName), label(text)]);
  }
  function button(iconName, text, onClick) {
    return el("button", { type: "button", title: text, onClick: onClick }, [icons.svg(iconName), label(text)]);
  }

  // The account row: the member's picture and name when signed in, else "Sign in".
  // Both go to the dashboard, which has the sign-in and sign-out buttons.
  function accountLink() {
    var member = window.team6220Account.member();
    if (!member) return link("/apps/", "user", "Sign in", false);
    return el("a", { href: "/apps/", title: member.name }, [window.team6220Account.avatar(member), label(member.name)]);
  }

  function build(apps) {
    var nav = el("nav", { class: "sb-nav", "aria-label": "Team apps" }, [
      link("/", "home", "Main site"),
      link("/apps/", "grid", "All apps"),
      el("div", { class: "sb-group" }, ["Apps"]),
    ]);
    apps.forEach(function (app) {
      if (app.status !== "live" || !app.href) return;
      // Web Admin apps are only listed while you are in one (the sidebar cannot check badges).
      if (app.access === "web-admin" && !samePage(app.href)) return;
      nav.appendChild(link(app.href, app.symbol || "grid", app.name));
    });

    var themeButton = button("sun", "Light / dark mode", function () {
      root.dataset.theme = theme() === "light" ? "dark" : "light";
      save(THEME_KEY, theme());
      themeButton.replaceChild(icons.svg(theme() === "light" ? "moon" : "sun"), themeButton.firstChild);
    });
    if (theme() === "light") themeButton.replaceChild(icons.svg("moon"), themeButton.firstChild);

    var foot = el("div", { class: "sb-foot" }, [
      button("fullscreen", "Fullscreen", function () {
        if (document.fullscreenElement) document.exitFullscreen();
        else if (root.requestFullscreen) root.requestFullscreen();
      }),
      themeButton,
      accountLink(),
      el("div", { class: "sb-sizes" }, [
        button("collapse", "Collapse sidebar", function () {
          setSize(size === "open" ? "compressed" : "open", true);
        }),
        button("hide", "Hide sidebar", function () {
          setSize("hidden", true);
        }),
      ]),
    ]);

    var brand = el("a", { class: "sb-brand", href: "/", title: "Los Al Robotics main site" }, [
      el("img", { class: "sb-wings", src: "/assets/shared/logos/6220WingsAndLogoVectorGold.svg", alt: "Los Al Robotics" }),
      el("img", { class: "sb-mark", src: "/assets/shared/logos/6220LogoVectorGold.svg", alt: "Los Al Robotics" }),
    ]);
    var bar = el("aside", { class: "sb", id: "team-sidebar" }, [brand, nav, foot]);

    // Hidden size: a thin strip on the left edge brings the sidebar in; leaving it sends it back.
    var edge = el("div", { class: "sb-edge", "aria-hidden": "true" });
    edge.addEventListener("mouseenter", function () {
      root.classList.add("sb-peek");
    });
    bar.addEventListener("mouseleave", function () {
      root.classList.remove("sb-peek");
    });
    var startX = null;
    document.addEventListener("touchstart", function (e) { startX = e.touches[0].clientX; }, { passive: true });
    document.addEventListener("touchmove", function (e) {
      if (startX !== null && startX < 24 && e.touches[0].clientX - startX > 40) root.classList.add("sb-peek");
    }, { passive: true });

    // Phones: a round button opens the drawer; tapping outside closes it.
    var scrim = el("div", { class: "sb-scrim", onClick: function () { root.classList.remove("sb-peek"); } });
    var opener = el("button", { class: "sb-opener", type: "button", "aria-label": "Open the apps menu", onClick: function () {
      root.classList.toggle("sb-peek");
    } }, [icons.svg("menu")]);

    [edge, scrim, bar, opener].forEach(function (node) {
      document.body.appendChild(node);
    });
  }

  // Fullscreen starts hidden and goes back to the saved size afterwards.
  document.addEventListener("fullscreenchange", function () {
    if (document.fullscreenElement) setSize("hidden", false);
    else setSize(read(SIZE_KEY) === "compressed" ? "compressed" : read(SIZE_KEY) === "hidden" ? "hidden" : "open", false);
  });

  function start() {
    fetch("/assets/shared/data/apps.json")
      .then(function (r) { return r.json(); })
      .catch(function () { return []; }) // no list: still show the fixed links and controls
      .then(build);
  }
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
