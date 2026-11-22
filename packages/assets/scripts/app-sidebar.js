/* The frame every team app shares: the apps rail, the app's own menu (the panel), pins, search, keybinds and the
   account menu. Published at /assets/shared/scripts/app-sidebar.js (the old sidebar's name, so GoldSim, WingIt and
   the Inventory pick it up without changes). Needs icons.js and account.js loaded first, and
   /assets/shared/styles/app-sidebar.css. Design: the apps redesign prototype; rules: the wiki's UX-Rules page.

   Layouts (Account menu, saved per person):
     rail   small app icons on the left, then the app's menu. The default.
     split  app names on the left, the app's menu on the right.
     top    one bar across the top for the apps, the app's menu on the left.
   Phones (narrow screens) always get the phone frame: the app name at the top opens the apps, and the app's
   screens sit in a bar at the bottom ("More" when there are more than five).

   Where things come from
     /assets/shared/data/apps.json   every app: category, icon, and its menu (sections -> items -> view)
     /assets/shared/data/links.json  the Resources links, offered as pins
     localStorage team6220.frame     this person's choices (layout, hidden apps, pins, keybinds, ...); the
                                     Account page copies them to the server so they follow the account

   The page talks to the frame through window.team6220Frame (all optional):
     setContext({ label, options: [{ label, current }], onPick(label), newLabel, onNew, countdown })
     setCount(view, text)     the number next to a menu item, e.g. setCount("all", "18")
     onNavigate(fn)           take over menu clicks inside the app (fn(view) returns true when it handled it)
     addSearch(fn)            fn(query) returns [{ group, label, meta, href }] for the search box
     on(action, fn)           run fn for a keybind action ("task", "project", ...) instead of the default

   Page offsets: the frame sets --sidebar-space (left), --frame-top and --frame-right on <html>; pages in normal flow
   get them as body padding, apps that fill the screen with position: fixed use them for their own edges. */
(function () {
  var root = document.documentElement;
  var icons = window.team6220Icons;
  var STORE = "team6220.frame";
  var THEME_KEY = "team6220.theme";
  var CATS = ["Operations", "Mechanical", "Strategy", "Fun", "Admin"];
  var PHONE = window.matchMedia("(max-width: 760px)");

  // ---------------------------------------------------------------- saved choices
  var DEFAULT_KEYS = {
    pins: "S", close: "Esc", search: "Ctrl + K", task: "T", project: "P",
    panel: "`", rail: "Shift + `", fullscreen: "Shift + F",
    nextApp: "Shift + ↓", prevApp: "Shift + ↑", nextScreen: "↓", prevScreen: "↑",
  };
  for (var n = 1; n <= 10; n++) {
    DEFAULT_KEYS["app" + n] = "Shift + " + (n % 10);
    DEFAULT_KEYS["screen" + n] = String(n % 10);
  }
  function read() {
    try { return JSON.parse(localStorage.getItem(STORE) || "{}") || {}; } catch (e) { return {}; }
  }
  var prefs = Object.assign({
    layout: "rail", railHidden: false, panelHidden: false, listCollapsed: false,
    hidden: ["rsvp"], catOrder: CATS.slice(), appOrder: {},
    pins: ["Master link", "Team resources", "CAD on Onshape", "GitHub"], own: [], pinKeys: {},
    keys: {}, arrows: false, showArrow: true,
  }, read());
  var syncTimer = null;
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(prefs)); } catch (e) { /* the choice still applies until the page closes */ }
    window.dispatchEvent(new CustomEvent("team6220:frame-prefs", { detail: prefs }));
    // Copy them to the server a moment later, so they follow the account (only on the real site, when signed in).
    var data = window.team6220FrameData;
    if (!data || !data.server || !(window.team6220Account && window.team6220Account.member())) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () {
      fetch("/api/ops", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ action: "savePrefs", prefs: prefs }) })
        .catch(function () { /* kept in this browser; the next change tries again */ });
    }, 1500);
  }
  function keyOf(action) { return (prefs.keys && prefs.keys[action]) || DEFAULT_KEYS[action] || ""; }

  root.dataset.theme = (function () { try { return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark"; } catch (e) { return "dark"; } })();

  // ---------------------------------------------------------------- small helpers
  function el(tag, attrs, kids) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === undefined || v === null || v === false) return;
      if (k.slice(0, 2) === "on" && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v === true ? "" : v);
    });
    (kids || []).forEach(function (c) { if (c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return node;
  }
  function ic(name, cls) { var s = icons.svg(name); if (cls) s.classList.add(cls); return s; }
  function appIcon(app, cls) {
    var s = ic(app.icon || "grid", cls);
    if (app.filledIcon) s.classList.add("tf-filled");
    return s;
  }
  function cleanPath(p) { return (p || "/").replace(/\/+$/, "") || "/"; }
  function viewHref(app, view) { return cleanPath(app.href) + (view ? "/" + view : ""); }
  function isExternal(url) { return /^https?:\/\//.test(url) && !/^https:\/\/(www\.)?team6220\.org\/apps/.test(url); }

  // ---------------------------------------------------------------- the page API
  var hooks = { navigate: null, search: [], actions: {}, context: null, counts: {} };
  var api = (window.team6220Frame = window.team6220Frame || {});
  api.setContext = function (c) { hooks.context = c || null; render(); };
  api.setCount = function (view, text) { hooks.counts[view] = text == null ? "" : String(text); render(); };
  api.onNavigate = function (fn) { hooks.navigate = fn; };
  api.addSearch = function (fn) { hooks.search.push(fn); };
  api.on = function (action, fn) { hooks.actions[action] = fn; };
  api.prefs = function () { return JSON.parse(JSON.stringify(prefs)); };
  api.setPrefs = function (next) { Object.assign(prefs, next || {}); save(); render(); };
  api.defaultKeys = function () { return Object.assign({}, DEFAULT_KEYS); };
  api.keyName = keyName;
  api.pins = function () { return pinList(); };
  api.links = function () { return LINKS.slice(); };
  api.apps = function () { return APPS.slice(); };
  api.openSearch = function () { openSearch(); };

  // ---------------------------------------------------------------- data
  var APPS = [];
  var LINKS = [];
  var state = { pinsOpen: false, pinsAt: null, menuOpen: false, searchOpen: false, ctx: null, sheet: null, railPeek: false, panelPeek: false, query: "", pick: 0 };

  function currentApp() {
    var here = cleanPath(location.pathname);
    var best = null;
    APPS.forEach(function (a) {
      if (!a.href) return;
      var h = cleanPath(a.href);
      if ((here === h || here.indexOf(h + "/") === 0) && (!best || h.length > cleanPath(best.href).length)) best = a;
    });
    return best || APPS[0];
  }
  function currentView(app) {
    var rest = cleanPath(location.pathname).slice(cleanPath(app.href).length).replace(/^\//, "");
    return rest.split("/")[0];
  }
  function items(app) {
    return (app.sections || []).reduce(function (all, s) { return all.concat(s.items); }, []);
  }
  function visibleApps() {
    var hid = prefs.hidden || [];
    return APPS.filter(function (a) { return a.category && a.status !== "hidden" && hid.indexOf(a.id) < 0; });
  }
  function ordered(cat) {
    var list = visibleApps().filter(function (a) { return a.category === cat; });
    var order = (prefs.appOrder && prefs.appOrder[cat]) || [];
    return list.sort(function (a, b) {
      var i = order.indexOf(a.id), j = order.indexOf(b.id);
      return (i < 0 ? 999 : i) - (j < 0 ? 999 : j);
    });
  }
  function catList() {
    var seen = (prefs.catOrder || []).filter(function (c) { return CATS.indexOf(c) >= 0; });
    CATS.forEach(function (c) { if (seen.indexOf(c) < 0) seen.push(c); });
    return seen;
  }
  function groups() {
    return catList().map(function (c) { return { name: c, apps: ordered(c) }; }).filter(function (g) { return g.apps.length; });
  }
  /** The rail order: Home, then each section's apps. The keys Shift + 1 ... follow these places. */
  function railOrder() {
    var home = APPS.filter(function (a) { return a.id === "home"; });
    return home.concat(groups().reduce(function (all, g) { return all.concat(g.apps.filter(function (a) { return a.status === "live"; })); }, []));
  }
  function pinList() {
    var chosen = LINKS.filter(function (l) { return prefs.pins.indexOf(l.title) >= 0; }).map(function (l) { return { id: l.title, name: l.title, url: l.href }; });
    var own = (prefs.own || []).map(function (o) { return { id: "own:" + o.name, name: o.name, url: o.url }; });
    return chosen.concat(own).map(function (p, i) {
      var k = prefs.pinKeys && Object.prototype.hasOwnProperty.call(prefs.pinKeys, p.id) ? prefs.pinKeys[p.id] : i < 10 ? String((i + 1) % 10) : "";
      p.key = k;
      p.ext = isExternal(p.url);
      return p;
    });
  }

  // ---------------------------------------------------------------- navigation
  function go(app, view, ev) {
    if (ev && (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button === 1)) return; // new tab: let the link do it
    if (app === currentApp() && hooks.navigate) {
      if (ev) ev.preventDefault();
      if (hooks.navigate(view) === true) {
        history.pushState(null, "", viewHref(app, view));
        closeAll();
        return;
      }
    }
    if (ev) ev.preventDefault();
    location.assign(viewHref(app, view));
  }
  function goItem(item, ev) { go(currentApp(), item.view, ev); }
  function closeAll() {
    state.pinsOpen = state.menuOpen = state.searchOpen = false;
    state.ctx = state.sheet = null;
    render();
  }

  // ---------------------------------------------------------------- pieces
  function homeButton(size) {
    // The team's gold 6220 circle logo.
    return el("a", { class: "tf-home tf-home--" + size, href: "/apps", title: "Home", "aria-label": "Home" },
      [el("img", { src: "/assets/shared/logos/6220LogoVectorGold.svg", alt: "" })]);
  }
  function avatar(cls) {
    var m = window.team6220Account && window.team6220Account.member();
    var b = el("button", { type: "button", class: "tf-avatar " + (cls || ""), title: "Account and layout", "aria-label": "Account and layout", "aria-expanded": state.menuOpen ? "true" : "false",
      onClick: function (e) { e.stopPropagation(); state.menuOpen = !state.menuOpen; state.pinsOpen = false; render(); } });
    if (m) b.appendChild(window.team6220Account.avatar(m)); else b.appendChild(ic("user"));
    return b;
  }
  function iconButton(name, label, onClick, cls) {
    return el("button", { type: "button", class: "tf-ibtn " + (cls || ""), title: label, "aria-label": label, onClick: onClick }, [ic(name)]);
  }
  function searchButton(cls) {
    return iconButton("search", "Search (" + keyOf("search") + ")", function (e) { e.stopPropagation(); openSearch(); }, cls);
  }
  function pinsButton(cls) {
    var b = iconButton("pin", "Pinned links", function (e) {
      e.stopPropagation();
      var r = e.currentTarget.getBoundingClientRect();
      state.pinsOpen = !state.pinsOpen; state.pinsAt = null; state.menuOpen = false;
      state.pinsAnchor = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      render();
    }, cls);
    if (state.pinsOpen) b.classList.add("is-on");
    return b;
  }
  function appLink(a, kind) {
    var cur = currentApp();
    var planned = a.status !== "live";
    var attrs = { class: "tf-app tf-app--" + kind + (a === cur ? " is-on" : "") + (planned ? " is-planned" : ""), title: planned ? a.name + " (coming soon)" : a.name, "aria-label": planned ? a.name + " (coming soon)" : a.name };
    if (planned) { attrs["aria-disabled"] = "true"; return el("span", attrs, [appIcon(a), kind === "rail" ? null : el("span", { class: "tf-app-name" }, [a.name]), planned && kind === "list" ? el("span", { class: "tf-soon" }, ["Soon"]) : null]); }
    attrs.href = a.href;
    if (a === cur) attrs["aria-current"] = "page";
    return el("a", attrs, [appIcon(a), kind === "rail" ? null : el("span", { class: "tf-app-name" }, [a.name])]);
  }

  function rail() {
    var nav = el("nav", { class: "tf-rail", "aria-label": "Apps", onMouseleave: function () { if (prefs.railHidden && state.railPeek) { state.railPeek = false; render(); } },
      onClick: function (e) { if (prefs.railHidden && !e.target.closest("a,button")) { prefs.railHidden = false; state.railPeek = false; save(); render(); } } });
    var scroll = el("div", { class: "tf-rail-apps" }, [homeButton("rail")]);
    groups().forEach(function (g) {
      scroll.appendChild(el("div", { class: "tf-rule", "aria-hidden": "true" }));
      g.apps.forEach(function (a) { scroll.appendChild(appLink(a, "rail")); });
    });
    scroll.appendChild(el("div", { class: "tf-rule", "aria-hidden": "true" }));
    scroll.appendChild(pinsButton("tf-ibtn--rail"));
    nav.appendChild(scroll);
    var foot = el("div", { class: "tf-rail-foot" });
    if (prefs.layout === "split") foot.appendChild(iconButton("showRight", "Show app names", function () { prefs.listCollapsed = false; prefs.railHidden = false; save(); render(); }, "tf-ibtn--rail"));
    foot.appendChild(iconButton(prefs.railHidden ? "showRight" : "hideLeft", prefs.railHidden ? "Keep the apps open" : "Hide the apps", function () { prefs.railHidden = !prefs.railHidden; state.railPeek = false; save(); render(); }, "tf-ibtn--rail"));
    foot.appendChild(searchButton("tf-ibtn--rail"));
    foot.appendChild(avatar("tf-avatar--rail"));
    nav.appendChild(foot);
    return nav;
  }

  function list() {
    var nav = el("nav", { class: "tf-list", "aria-label": "Apps" }, [
      el("div", { class: "tf-list-head" }, [homeButton("small"), el("span", { class: "tf-brandword" }, ["Team apps"]),
        iconButton("hideLeft", "Collapse to icons", function () { prefs.listCollapsed = true; save(); render(); }, "tf-push")]),
    ]);
    groups().forEach(function (g) {
      nav.appendChild(el("p", { class: "tf-label" }, [g.name]));
      g.apps.forEach(function (a) { nav.appendChild(appLink(a, "list")); });
    });
    nav.appendChild(el("p", { class: "tf-label" }, ["Pinned"]));
    pinList().forEach(function (p) { nav.appendChild(pinLink(p, false)); });
    nav.appendChild(el("div", { class: "tf-grow" }));
    var m = window.team6220Account && window.team6220Account.member();
    nav.appendChild(el("button", { type: "button", class: "tf-list-account", onClick: function (e) { e.stopPropagation(); state.menuOpen = !state.menuOpen; render(); } }, [
      m ? window.team6220Account.avatar(m) : ic("user"), el("span", {}, [m ? m.name : "Sign in", el("br"), el("small", {}, ["Account and layout"])]),
    ]));
    return nav;
  }

  function top() {
    var nav = el("nav", { class: "tf-top-apps", "aria-label": "Apps" });
    nav.appendChild(appLink(APPS[0], "top"));
    groups().forEach(function (g) {
      nav.appendChild(el("span", { class: "tf-vrule", "aria-hidden": "true" }));
      g.apps.forEach(function (a) { nav.appendChild(appLink(a, "top")); });
    });
    return el("header", { class: "tf-top" }, [
      el("div", { class: "tf-top-brand" }, [homeButton("small"), el("span", { class: "tf-brandword" }, ["Team apps"])]),
      nav, pinsButton(), searchButton(), avatar(),
    ]);
  }

  function contextBox() {
    var c = hooks.context;
    if (!c || !c.label) return null;
    var wrap = el("div", { class: "tf-context" });
    if (c.options && c.options.length) {
      var d = el("details", { class: "tf-picker" }, [
        el("summary", {}, [el("span", {}, [c.label]), ic("chevronDown")]),
      ]);
      var menu = el("div", { class: "tf-menu", role: "menu" });
      c.options.forEach(function (o) {
        menu.appendChild(el("button", { type: "button", role: "menuitem", class: o.current ? "is-on" : "", onClick: function () { d.open = false; if (c.onPick) c.onPick(o.label); } }, [o.label]));
      });
      if (c.newLabel) menu.appendChild(el("button", { type: "button", role: "menuitem", class: "tf-menu-new", onClick: function () { d.open = false; if (c.onNew) c.onNew(); } }, [c.newLabel]));
      d.appendChild(menu);
      wrap.appendChild(d);
    } else {
      wrap.appendChild(el("div", { class: "tf-picker tf-picker--plain" }, [el("span", {}, [c.label])]));
    }
    if (c.countdown) wrap.appendChild(el("p", { class: "tf-countdown" }, [c.countdown]));
    return wrap;
  }

  function panel(app) {
    var view = currentView(app);
    var aside = el("aside", { class: "tf-panel", "aria-label": app.name + " options",
      onMouseleave: function () { if (prefs.panelHidden && state.panelPeek) { state.panelPeek = false; render(); } },
      onClick: function (e) { if (prefs.panelHidden && !e.target.closest("a,button,summary,details,input")) { prefs.panelHidden = false; state.panelPeek = false; save(); render(); } } });
    var head = el("div", { class: "tf-panel-head" }, [
      el("div", { class: "tf-panel-title" }, [appIcon(app, "tf-gold"), el("h1", {}, [app.name]),
        iconButton(prefs.panelHidden !== (prefs.layout === "split") ? "showRight" : "hideLeft", prefs.panelHidden ? "Keep the menu open" : "Hide the menu",
          function (e) { e.stopPropagation(); prefs.panelHidden = !prefs.panelHidden; state.panelPeek = false; save(); render(); }, "tf-push")]),
      contextBox(),
    ]);
    var body = el("div", { class: "tf-panel-body" });
    (app.sections || []).forEach(function (s) {
      if (s.label) body.appendChild(el("p", { class: "tf-label" }, [s.label]));
      s.items.forEach(function (it) {
        var on = it.view === view;
        var a = el("a", { class: "tf-item" + (on ? " is-on" : ""), href: viewHref(app, it.view), "aria-current": on ? "page" : null,
          onClick: function (e) { goItem(it, e); },
          onContextmenu: function (e) { e.preventDefault(); state.ctx = it.view; render(); } }, [
          ic(it.icon), el("span", { class: "tf-item-name" }, [it.name]),
          hooks.counts[it.view] ? el("span", { class: "tf-count" }, [hooks.counts[it.view]]) : null,
        ]);
        var row = el("div", { class: "tf-item-row" }, [a]);
        if (state.ctx === it.view) row.appendChild(itemMenu(app, it));
        body.appendChild(row);
      });
    });
    aside.appendChild(head);
    aside.appendChild(body);
    if (app.id === "home") {
      aside.appendChild(el("div", { class: "tf-panel-foot" }, [el("a", { class: "tf-back", href: "/" }, [ic("back"), "Return to main site"])]));
    }
    return aside;
  }

  function itemMenu(app, it) {
    var link = location.origin + viewHref(app, it.view);
    var pinned = (prefs.own || []).some(function (o) { return o.url === link; });
    var close = function () { state.ctx = null; render(); };
    return el("div", { class: "tf-menu tf-menu--ctx", role: "menu", "aria-label": it.name + " options" }, [
      el("div", { class: "tf-menu-title" }, [it.name]),
      el("a", { role: "menuitem", href: link, target: "_blank", rel: "noopener", onClick: close }, ["Open in new tab"]),
      el("button", { type: "button", role: "menuitem", onClick: function () { window.open(link, "_blank", "noopener,popup"); close(); } }, ["Open in new window"]),
      el("button", { type: "button", role: "menuitem", onClick: function () { try { navigator.clipboard.writeText(link); } catch (e) { /* no clipboard */ } close(); } }, ["Copy link"]),
      el("button", { type: "button", role: "menuitem", onClick: function () {
        prefs.own = pinned ? prefs.own.filter(function (o) { return o.url !== link; }) : (prefs.own || []).concat([{ name: it.name, url: link }]);
        save(); close();
      } }, [pinned ? "Remove from pins" : "Add to pins"]),
    ]);
  }

  function pinLink(p, compact) {
    var attrs = { class: "tf-pin" + (compact ? " tf-pin--compact" : ""), href: p.url, rel: "noopener" };
    if (p.ext) attrs.target = "_blank";
    return el("a", attrs, [
      p.key ? el("kbd", { class: "tf-kbd" }, [p.key]) : null,
      el("span", { class: "tf-pin-name" }, [p.name]),
      p.ext ? ic("newTab", "tf-newtab") : null,
    ]);
  }

  function pinsPopup() {
    var compact = !!state.pinsAt;
    var box = el("div", { class: "tf-pop tf-pins" + (compact ? " tf-pins--compact" : ""), role: "dialog", "aria-label": "Pinned links", onClick: function (e) { e.stopPropagation(); } });
    if (compact) {
      box.style.left = Math.max(8, Math.min(window.innerWidth - 228, state.pinsAt.x - 20)) + "px";
      box.style.top = Math.max(8, Math.min(window.innerHeight - 220, state.pinsAt.y + 8)) + "px";
      box.appendChild(iconButton("edit", "Edit pins", function () { state.pinsOpen = false; state.menuOpen = true; render(); }, "tf-pins-edit"));
    } else {
      var a = state.pinsAnchor;
      if (a) {
        var beside = prefs.layout !== "top" && !PHONE.matches;
        box.style.left = Math.max(8, Math.min(window.innerWidth - 308, beside ? a.right + 12 : a.right - 300)) + "px";
        box.style.top = Math.max(8, Math.min(window.innerHeight - 340, beside ? a.top - 12 : a.bottom + 8)) + "px";
      }
      box.appendChild(el("p", { class: "tf-label tf-label--tight" }, ["Pinned"]));
    }
    var pins = pinList();
    if (!pins.length) box.appendChild(el("p", { class: "tf-muted" }, ["No pins yet. Add some from the account menu."]));
    pins.forEach(function (p) { box.appendChild(pinLink(p, compact)); });
    if (!compact) box.appendChild(el("button", { type: "button", class: "tf-btn tf-btn--block", onClick: function () { state.pinsOpen = false; state.menuOpen = true; render(); } }, ["Edit pins"]));
    return box;
  }

  function accountMenu() {
    var m = window.team6220Account && window.team6220Account.member();
    var box = el("div", { class: "tf-pop tf-account", role: "dialog", "aria-label": "Account and layout", onClick: function (e) { e.stopPropagation(); } });
    box.appendChild(el("div", { class: "tf-account-head" }, [
      m ? window.team6220Account.avatar(m) : ic("user"),
      el("span", {}, [el("strong", {}, [m ? m.name : "Not signed in"])]),
      iconButton("x", "Close", function () { state.menuOpen = false; render(); }, "tf-push"),
    ]));
    if (!PHONE.matches) {
      box.appendChild(el("p", { class: "tf-label" }, ["Layout"]));
      [["rail", "Rail and panel", "Small app icons on the left, then the app’s own menu. Like Discord. Default."],
       ["split", "Apps left, options right", "App names on the left, the app’s menu on the right. Like VS Code."],
       ["top", "Apps on top", "One bar across the top for apps, the app’s menu on the left."]].forEach(function (l) {
        box.appendChild(el("button", { type: "button", class: "tf-layout" + (prefs.layout === l[0] ? " is-on" : ""), onClick: function () { prefs.layout = l[0]; save(); render(); } },
          [el("strong", {}, [l[1]]), el("span", {}, [l[2]])]));
      });
    }
    box.appendChild(el("p", { class: "tf-label" }, ["Visible apps"]));
    var vis = el("div", { class: "tf-vis" });
    catList().forEach(function (c) {
      var list = APPS.filter(function (a) { return a.category === c; });
      if (!list.length) return;
      var allOn = list.every(function (a) { return prefs.hidden.indexOf(a.id) < 0; });
      var grp = el("div", { class: "tf-vis-group" }, [
        el("label", { class: "tf-check tf-check--strong" }, [el("input", { type: "checkbox", checked: allOn, onChange: function () {
          var ids = list.map(function (a) { return a.id; });
          prefs.hidden = allOn ? Array.from(new Set(prefs.hidden.concat(ids))) : prefs.hidden.filter(function (h) { return ids.indexOf(h) < 0; });
          save(); render();
        } }), c + " (section)"]),
      ]);
      var inner = el("div", { class: "tf-vis-apps" });
      list.forEach(function (a) {
        inner.appendChild(el("label", { class: "tf-check" }, [el("input", { type: "checkbox", checked: prefs.hidden.indexOf(a.id) < 0, onChange: function () {
          prefs.hidden = prefs.hidden.indexOf(a.id) < 0 ? prefs.hidden.concat([a.id]) : prefs.hidden.filter(function (h) { return h !== a.id; });
          save(); render();
        } }), a.name]));
      });
      grp.appendChild(inner);
      vis.appendChild(grp);
    });
    box.appendChild(vis);
    box.appendChild(el("p", { class: "tf-label" }, ["Pinned links: from Resources"]));
    LINKS.forEach(function (l) {
      box.appendChild(el("label", { class: "tf-check" }, [el("input", { type: "checkbox", checked: prefs.pins.indexOf(l.title) >= 0, onChange: function () {
        prefs.pins = prefs.pins.indexOf(l.title) >= 0 ? prefs.pins.filter(function (p) { return p !== l.title; }) : prefs.pins.concat([l.title]);
        save(); render();
      } }), el("span", { class: "tf-kind" }, [l.kind]), l.title]));
    });
    box.appendChild(el("p", { class: "tf-label" }, ["Your own links"]));
    (prefs.own || []).forEach(function (o, i) {
      box.appendChild(el("div", { class: "tf-own" }, [el("span", {}, [o.name]),
        iconButton("trash", "Remove " + o.name, function () { prefs.own = prefs.own.filter(function (_, j) { return j !== i; }); save(); render(); }, "tf-danger")]));
    });
    var nm = el("input", { "aria-label": "Link name", placeholder: "Name", class: "tf-input tf-input--name" });
    var url = el("input", { "aria-label": "Link address", placeholder: "https://…", class: "tf-input" });
    box.appendChild(el("form", { class: "tf-own-add", onSubmit: function (e) {
      e.preventDefault();
      if (!nm.value.trim() || !/^(https?:\/\/|\/)/.test(url.value.trim())) return;
      prefs.own = (prefs.own || []).concat([{ name: nm.value.trim(), url: url.value.trim() }]);
      save(); render();
    } }, [nm, url, el("button", { type: "submit", class: "tf-btn tf-btn--gold" }, ["Pin"])]));
    box.appendChild(el("p", { class: "tf-muted" }, ["Your layout, apps and pins follow your account to every device."]));
    box.appendChild(el("a", { class: "tf-btn tf-btn--outline tf-btn--block", href: "/apps/account" }, ["All account settings"]));
    var light = root.dataset.theme === "light";
    box.appendChild(el("div", { class: "tf-row" }, [
      el("div", { class: "tf-seg", role: "group", "aria-label": "Theme" }, [
        iconButton("sun", "Light", function () { setTheme("light"); }, light ? "is-on" : ""),
        iconButton("moon", "Dark", function () { setTheme("dark"); }, light ? "" : "is-on"),
      ]),
      m ? el("a", { class: "tf-btn tf-btn--outline", href: "/apps/logout" }, ["Sign out"]) : el("a", { class: "tf-btn tf-btn--outline", href: "/apps" }, ["Sign in"]),
    ]));
    return box;
  }
  function setTheme(t) {
    root.dataset.theme = t;
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* not saved */ }
    render();
  }

  // ---------------------------------------------------------------- search (Ctrl K)
  function openSearch() { state.searchOpen = true; state.query = ""; state.pick = 0; state.pinsOpen = state.menuOpen = false; render(); }
  function searchResults(q) {
    q = q.trim().toLowerCase();
    var out = [];
    APPS.forEach(function (a) {
      if (a.status !== "live") return;
      if (!q || a.name.toLowerCase().indexOf(q) >= 0) out.push({ group: "Apps", label: a.name, meta: a.description || "", href: a.href });
      if (a.ready) items(a).forEach(function (it) {
        if (q && (a.name + " " + it.name).toLowerCase().indexOf(q) >= 0) out.push({ group: "Screens", label: it.name, meta: a.name, href: viewHref(a, it.view) });
      });
    });
    pinList().forEach(function (p) { if (q && p.name.toLowerCase().indexOf(q) >= 0) out.push({ group: "Pins", label: p.name, meta: p.ext ? "Opens in a new tab" : "", href: p.url, ext: p.ext }); });
    hooks.search.forEach(function (fn) { try { out = out.concat(q ? fn(q) || [] : []); } catch (e) { /* a broken source never breaks search */ } });
    var rank = { Apps: 0, Screens: 1, Pins: 2 };
    out.sort(function (x, y) { return (x.group in rank ? rank[x.group] : 3) - (y.group in rank ? rank[y.group] : 3); });
    return out.slice(0, 40);
  }
  function searchBox() {
    var results = searchResults(state.query);
    var input = el("input", { class: "tf-search-input", "aria-label": "Search everything", placeholder: "Search apps, screens, tasks, parts, people…", value: state.query, autocomplete: "off",
      onInput: function (e) { state.query = e.target.value; state.pick = 0; render(); var i = document.querySelector(".tf-search-input"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } },
      onKeydown: function (e) {
        if (e.key === "ArrowDown") { e.preventDefault(); state.pick = Math.min(results.length - 1, state.pick + 1); render(); refocus(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); state.pick = Math.max(0, state.pick - 1); render(); refocus(); }
        else if (e.key === "Enter" && results[state.pick]) { e.preventDefault(); openResult(results[state.pick]); }
      } });
    var list = el("div", { class: "tf-search-list", role: "listbox" });
    var last = "";
    results.forEach(function (r, i) {
      if (r.group !== last) { list.appendChild(el("p", { class: "tf-label" }, [r.group])); last = r.group; }
      list.appendChild(el("a", { class: "tf-result" + (i === state.pick ? " is-on" : ""), role: "option", href: r.href, target: r.ext ? "_blank" : null, rel: "noopener", "aria-selected": i === state.pick ? "true" : "false" },
        [el("span", {}, [r.label]), el("span", { class: "tf-result-meta" }, [r.meta || ""])]));
    });
    if (!results.length) list.appendChild(el("p", { class: "tf-muted tf-pad" }, [state.query ? "Nothing matches." : "Type to search."]));
    return el("div", { class: "tf-search", role: "dialog", "aria-label": "Search", onClick: function (e) { e.stopPropagation(); } }, [
      el("div", { class: "tf-search-head" }, [ic("search"), input, el("kbd", { class: "tf-kbd tf-kbd--quiet" }, ["Esc"])]),
      list,
      el("p", { class: "tf-search-foot" }, ["↑ ↓ to pick · Enter to open · Esc to close"]),
    ]);
  }
  function refocus() { var i = document.querySelector(".tf-search-input"); if (i) i.focus(); }
  function openResult(r) { closeAll(); if (r.ext) window.open(r.href, "_blank", "noopener"); else location.assign(r.href); }

  // ---------------------------------------------------------------- phone
  function phoneHeader(app) {
    var btn = el("button", { type: "button", class: "tf-ph-app", "aria-label": "Switch app", "aria-expanded": state.sheet === "apps" ? "true" : "false",
      onClick: function (e) { e.stopPropagation(); state.sheet = state.sheet === "apps" ? null : "apps"; render(); } },
      [appIcon(app, "tf-gold"), el("span", { class: "tf-ph-name" }, [app.name]), prefs.showArrow ? ic("chevronDown", state.sheet === "apps" ? "tf-flip" : "") : null]);
    var header = el("header", { class: "tf-ph" }, [btn, el("div", { class: "tf-grow" }), searchButton(), avatar()]);
    return header;
  }
  function phoneBar(app) {
    var all = items(app);
    if (!all.length) return null;
    var view = currentView(app);
    var many = all.length > 5;
    var bar = el("nav", { class: "tf-ph-bar", "aria-label": app.name });
    (many ? all.slice(0, 4) : all).forEach(function (it) {
      bar.appendChild(el("a", { class: "tf-ph-tab" + (it.view === view ? " is-on" : ""), href: viewHref(app, it.view), onClick: function (e) { goItem(it, e); } }, [ic(it.icon), el("span", {}, [it.name])]));
    });
    if (many) {
      var inMore = !all.slice(0, 4).some(function (it) { return it.view === view; });
      bar.appendChild(el("button", { type: "button", class: "tf-ph-tab" + (inMore ? " is-on" : ""), onClick: function (e) { e.stopPropagation(); state.sheet = "more"; render(); } }, [ic("more"), el("span", {}, ["More"])]));
    }
    return bar;
  }
  function phoneSheet(app) {
    if (state.sheet === "more") {
      var box = el("div", { class: "tf-sheet tf-sheet--bottom", role: "dialog", "aria-label": "All of " + app.name, onClick: function (e) { e.stopPropagation(); } }, [el("div", { class: "tf-grip", "aria-hidden": "true" })]);
      var view = currentView(app);
      (app.sections || []).forEach(function (s) {
        if (s.label) box.appendChild(el("p", { class: "tf-label" }, [s.label]));
        s.items.forEach(function (it) {
          box.appendChild(el("a", { class: "tf-item" + (it.view === view ? " is-on" : ""), href: viewHref(app, it.view), onClick: function (e) { goItem(it, e); } },
            [ic(it.icon), el("span", { class: "tf-item-name" }, [it.name]), hooks.counts[it.view] ? el("span", { class: "tf-count" }, [hooks.counts[it.view]]) : null]));
        });
      });
      return box;
    }
    if (state.sheet === "apps") {
      var s = el("div", { class: "tf-sheet tf-sheet--top", role: "dialog", "aria-label": "Apps", onClick: function (e) { e.stopPropagation(); } }, [
        el("a", { class: "tf-sheet-row", href: "/" }, [ic("back", "tf-gold"), "Main site"]),
        el("a", { class: "tf-sheet-row", href: "/apps" }, [ic("home", "tf-gold"), "Home"]),
        el("p", { class: "tf-label tf-label--icon" }, [ic("pin"), "Pinned"]),
      ]);
      var chips = el("div", { class: "tf-chips" });
      pinList().forEach(function (p) { chips.appendChild(el("a", { class: "tf-chip", href: p.url, target: p.ext ? "_blank" : null, rel: "noopener" }, [p.name])); });
      s.appendChild(chips);
      groups().forEach(function (g) {
        s.appendChild(el("p", { class: "tf-label" }, [g.name]));
        var grid = el("div", { class: "tf-tiles" });
        g.apps.forEach(function (a) {
          var planned = a.status !== "live";
          grid.appendChild(el(planned ? "span" : "a", { class: "tf-tile" + (a === app ? " is-on" : "") + (planned ? " is-planned" : ""), href: planned ? null : a.href, "aria-label": planned ? a.name + " (coming soon)" : a.name },
            [appIcon(a), el("span", {}, [a.name]), planned ? el("small", {}, ["Coming soon"]) : null]));
        });
        s.appendChild(grid);
      });
      return s;
    }
    return null;
  }
  function phoneAccount() {
    var m = window.team6220Account && window.team6220Account.member();
    return el("div", { class: "tf-sheet tf-sheet--top", role: "dialog", "aria-label": "Account and settings", onClick: function (e) { e.stopPropagation(); } }, [
      el("div", { class: "tf-account-head" }, [m ? window.team6220Account.avatar(m) : ic("user"), el("strong", {}, [m ? m.name : "Not signed in"])]),
      el("label", { class: "tf-check tf-check--row" }, [el("span", {}, ["Show the arrow next to the app name", el("br"), el("small", {}, ["Tapping the name still opens the apps"])]),
        el("input", { type: "checkbox", checked: prefs.showArrow, onChange: function () { prefs.showArrow = !prefs.showArrow; save(); render(); } })]),
      el("a", { class: "tf-sheet-row", href: "/apps/account" }, ["All account settings"]),
      m ? el("a", { class: "tf-sheet-row", href: "/apps/logout" }, ["Sign out"]) : el("a", { class: "tf-sheet-row", href: "/apps" }, ["Sign in"]),
      el("p", { class: "tf-muted" }, ["These settings follow your account to every device."]),
    ]);
  }

  // ---------------------------------------------------------------- draw
  var mount = null;
  function render() {
    if (!APPS.length) return;
    var app = currentApp();
    var phone = PHONE.matches;
    var hasPanel = !!(app.ready && (app.sections || []).length);
    var layout = phone ? "phone" : prefs.layout;
    root.dataset.frame = layout;
    root.dataset.frameRail = prefs.railHidden ? (state.railPeek ? "peek" : "hidden") : "shown";
    root.dataset.framePanel = !hasPanel ? "none" : prefs.panelHidden ? (state.panelPeek ? "peek" : "hidden") : "shown";
    root.dataset.frameList = prefs.listCollapsed ? "collapsed" : "open";

    var kids = [];
    if (phone) {
      kids.push(phoneHeader(app));
      var bar = hasPanel ? phoneBar(app) : null;
      root.dataset.frameBar = bar ? "on" : "off";
      if (bar) kids.push(bar);
      if (state.sheet || state.menuOpen) kids.push(el("button", { type: "button", class: "tf-scrim", "aria-label": "Close", tabindex: "-1", onClick: closeAll }));
      var sheet = state.menuOpen ? phoneAccount() : phoneSheet(app);
      if (sheet) kids.push(sheet);
    } else {
      if (layout === "top") kids.push(top());
      if (layout === "split" && !prefs.listCollapsed) kids.push(list());
      else {
        if (prefs.railHidden) kids.push(el("div", { class: "tf-edge tf-edge--rail", title: "Move here to show the apps", onMouseenter: function () { state.railPeek = true; render(); } }));
        if (layout !== "top") kids.push(rail());
      }
      if (hasPanel) {
        if (prefs.panelHidden) kids.push(el("div", { class: "tf-edge tf-edge--panel", title: "Move here to show the menu", onMouseenter: function () { state.panelPeek = true; render(); } }));
        kids.push(panel(app));
      }
      if (state.pinsOpen || state.menuOpen || state.ctx) kids.push(el("button", { type: "button", class: "tf-scrim tf-scrim--clear", "aria-label": "Close menu", tabindex: "-1", onClick: closeAll }));
      if (state.pinsOpen) kids.push(pinsPopup());
      if (state.menuOpen) kids.push(accountMenu());
    }
    if (state.searchOpen) {
      kids.push(el("button", { type: "button", class: "tf-scrim tf-scrim--dim", "aria-label": "Close search", tabindex: "-1", onClick: closeAll }));
      kids.push(searchBox());
    }
    // How much room the page leaves for the frame (body padding, or the edges of a full-screen app).
    var RAIL = 68, EDGE = 10, LIST = 220, PANEL = 264, TOP = 56, BAR = 68;
    var left = 0, right = 0, topSpace = 0, bottom = 0, panelAt = 0;
    var panelSpace = hasPanel ? (prefs.panelHidden ? EDGE : PANEL) : 0;
    if (phone) { topSpace = TOP; bottom = root.dataset.frameBar === "on" ? BAR : 0; }
    else if (layout === "top") { topSpace = TOP; left = panelSpace; }
    else {
      var appsSpace = layout === "split" && !prefs.listCollapsed ? LIST : prefs.railHidden ? EDGE : RAIL;
      if (layout === "split") { left = appsSpace; right = panelSpace; }
      else { left = appsSpace + panelSpace; panelAt = appsSpace; }
    }
    root.style.setProperty("--sidebar-space", left + "px");
    root.style.setProperty("--frame-right", right + "px");
    root.style.setProperty("--frame-top", topSpace + "px");
    root.style.setProperty("--frame-bottom", bottom + "px");
    root.style.setProperty("--frame-panel-at", panelAt + "px");
    var next = el("div", { class: "tf", id: "team-frame" }, kids);
    if (mount) mount.replaceWith(next); else document.body.appendChild(next);
    mount = next;
    if (state.searchOpen) refocus();
  }

  // ---------------------------------------------------------------- keybinds
  /** The keybind name for a key press, the way Account → Keybinds writes it ("Shift + 1", "Ctrl + K", "`"). */
  function keyName(e) {
    var c = e.code || "", m = [], k;
    if (e.ctrlKey || e.metaKey) m.push("Ctrl");
    if (e.altKey) m.push("Alt");
    if (e.shiftKey) m.push("Shift");
    if (/^Key.$/.test(c)) k = c.slice(3);
    else if (/^Digit\d$/.test(c)) k = c.slice(5);
    else if (c === "Backquote") k = "`";
    else if (/^Arrow/.test(c)) k = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" }[c];
    else if (c === "Escape") k = "Esc";
    else if (c === "Space") k = "Space";
    else k = e.key && e.key.length === 1 ? e.key.toUpperCase() : e.key;
    if (["Control", "Shift", "Alt", "Meta"].indexOf(e.key) >= 0) return "";
    m.push(k);
    return m.join(" + ");
  }
  function actionFor(name) {
    var all = Object.assign({}, DEFAULT_KEYS, prefs.keys || {});
    for (var a in all) if (all[a] === name) return a;
    return null;
  }
  document.addEventListener("keydown", function (e) {
    var name = keyName(e);
    if (!name) return;
    var action = actionFor(name);
    if (action === "close" || e.key === "Escape") {
      if (state.searchOpen || state.pinsOpen || state.menuOpen || state.ctx || state.sheet) { e.preventDefault(); closeAll(); }
      return;
    }
    if (action === "search") { e.preventDefault(); if (state.searchOpen) closeAll(); else openSearch(); return; }
    var t = e.target;
    var typing = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
    if (typing || state.searchOpen) return;
    // With the pins menu open, a pin's key opens it.
    if (state.pinsOpen) {
      var pin = pinList().filter(function (p) { return p.key && p.key === name; })[0];
      if (pin) { e.preventDefault(); closeAll(); if (pin.ext) window.open(pin.url, "_blank", "noopener"); else location.assign(pin.url); return; }
    }
    if (!action) return;
    var app = currentApp();
    var appList = railOrder();
    var screens = items(app);
    var hereApp = Math.max(0, appList.indexOf(app));
    var hereScreen = Math.max(0, screens.map(function (s) { return s.view; }).indexOf(currentView(app)));
    if (hooks.actions[action] && hooks.actions[action](e) === true) { e.preventDefault(); return; }
    var m;
    if (action === "pins") { e.preventDefault(); state.pinsAt = state.pinsOpen ? null : lastMouse; state.pinsOpen = !state.pinsOpen; state.menuOpen = false; render(); }
    else if (action === "panel") { e.preventDefault(); prefs.panelHidden = !prefs.panelHidden; state.panelPeek = false; save(); render(); }
    else if (action === "rail") { e.preventDefault(); prefs.railHidden = !prefs.railHidden; state.railPeek = false; save(); render(); }
    else if (action === "fullscreen") { e.preventDefault(); toggleFullscreen(); }
    else if (action === "task") { e.preventDefault(); location.assign("/apps/icarus?new=task"); }
    else if (action === "project") { e.preventDefault(); location.assign("/apps/icarus?new=project"); }
    else if ((m = /^app(\d+)$/.exec(action))) { e.preventDefault(); var a = appList[Math.min(Number(m[1]) - 1, appList.length - 1)]; if (a && a !== app) location.assign(a.href); }
    else if ((m = /^screen(\d+)$/.exec(action)) && screens.length && app.ready) { e.preventDefault(); goItem(screens[Math.min(Number(m[1]) - 1, screens.length - 1)]); }
    else if (prefs.arrows && (action === "nextApp" || action === "prevApp")) { e.preventDefault(); var na = appList[Math.min(appList.length - 1, Math.max(0, hereApp + (action === "nextApp" ? 1 : -1)))]; if (na !== app) location.assign(na.href); }
    else if (prefs.arrows && (action === "nextScreen" || action === "prevScreen") && screens.length && app.ready) { e.preventDefault(); goItem(screens[Math.min(screens.length - 1, Math.max(0, hereScreen + (action === "nextScreen" ? 1 : -1)))]); }
  });
  var lastMouse = null;
  document.addEventListener("mousemove", function (e) { lastMouse = { x: e.clientX, y: e.clientY }; }, { passive: true });

  // Full screen hides the rail and the panel, then puts them back.
  var before = null;
  function toggleFullscreen() {
    if (document.fullscreenElement) { if (document.exitFullscreen) document.exitFullscreen(); }
    else if (root.requestFullscreen) root.requestFullscreen();
  }
  document.addEventListener("fullscreenchange", function () {
    if (document.fullscreenElement) { before = { rail: prefs.railHidden, panel: prefs.panelHidden }; prefs.railHidden = true; prefs.panelHidden = true; }
    else if (before) { prefs.railHidden = before.rail; prefs.panelHidden = before.panel; before = null; }
    render();
  });
  window.addEventListener("popstate", function () { render(); });
  PHONE.addEventListener ? PHONE.addEventListener("change", render) : PHONE.addListener(render);
  window.addEventListener("storage", function (e) { if (e.key === STORE) { prefs = Object.assign(prefs, read()); render(); } });

  // ---------------------------------------------------------------- start
  function start() {
    var given = window.team6220FrameData;
    if (given && given.apps) {
      APPS = given.apps.filter(function (a) { return a.status !== "hidden"; });
      LINKS = given.links || [];
      render();
      return;
    }
    Promise.all([
      fetch("/assets/shared/data/apps.json").then(function (r) { return r.json(); }).catch(function () { return []; }),
      fetch("/assets/shared/data/links.json").then(function (r) { return r.json(); }).then(function (d) { return (d && d.links) || []; }).catch(function () { return []; }),
    ]).then(function (res) {
      APPS = (res[0] || []).filter(function (a) { return a.status !== "hidden"; });
      LINKS = res[1];
      if (!APPS.length) APPS = [{ id: "home", name: "Home", href: "/apps", status: "live", icon: "home", sections: [] }];
      render();
    });
  }
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
})();
