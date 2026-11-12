/* Shared page-change logic for the main site and the apps (published at /assets/shared/scripts/page-nav.js).
   WHEN the page-change loader appears, not how it looks:

     click on a same-site link -> fetch the target page and start a short timer
       target ready before the timer ends (or the fetch fails)  -> plain navigation, no loader
       timer ends first (content really needs to load)           -> the layout's loader plays, then navigates

   It also warms the cache on hover, keyboard focus and touch, so most clicks are "ready" at once.
   Needs nothing from the host: it only uses fetch(), so it works on static hosting and on Wix server rendering. */
(function (root) {
  /* THE ONE SETTING: how long a click waits for the next page before the loader appears (milliseconds).
     Bigger = the loader shows less often. 0 = show it on every click, like before. */
  var LOADER_DELAY_MS = 200;

  var SKIP_PATH = /^\/(assets|gal)(\/|$)/; /* files and the external gallery: nothing to prefetch */
  var CACHE_MS = 30000;                   /* a finished prefetch counts as "ready" for this long */

  /* Pure decision. status: 'pending' | 'ready' | 'failed' (anything but pending ends the wait).
       'navigate' -> go now, no loader (page is ready, or the fetch failed so the browser shows the real result)
       'loader'   -> still waiting after the delay: show the loader
       'wait'     -> keep waiting */
  function decide(elapsedMs, status, delayMs) {
    if (delayMs == null) delayMs = LOADER_DELAY_MS;
    if (status !== 'pending') return 'navigate';
    return elapsedMs >= delayMs ? 'loader' : 'wait';
  }
  function shouldShowLoader(elapsedMs, ready, delayMs) {
    return decide(elapsedMs, ready ? 'ready' : 'pending', delayMs) === 'loader';
  }

  function norm(p) { return p.replace(/\/index\.html$|\.html$/, '').replace(/\/$/, '') || '/'; }

  /* Is this link worth prefetching? Same site, http(s), a different page than the one we are on. */
  function canPrefetch(href, base) {
    var u, b;
    try { u = new URL(href, base); b = new URL(base); } catch (e) { return false; }
    if (u.origin !== b.origin || !/^https?:$/.test(u.protocol)) return false;
    if (SKIP_PATH.test(u.pathname)) return false;
    if (norm(u.pathname) === norm(b.pathname) && u.search === b.search) return false;
    return true;
  }

  var api = { LOADER_DELAY_MS: LOADER_DELAY_MS, decide: decide, shouldShowLoader: shouldShowLoader, canPrefetch: canPrefetch };
  root.G6220PageNav = api;
  if (!root.document || typeof root.fetch !== 'function') return;

  var cache = {}, seq = 0, now = function () { return Date.now(); };

  /* Fetch the page. Resolves 'ready' (HTML arrived in full, so the real navigation can use the cache) or 'failed'
     (offline, 404/5xx, not a web page). Never rejects. */
  function prefetch(url) {
    var hit = cache[url];
    if (hit && now() - hit.t < CACHE_MS) return hit.p;
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var p = fetch(url, { credentials: 'same-origin', signal: ctl && ctl.signal }).then(function (res) {
      var type = res.headers.get('content-type') || '';
      if (!res.ok || type.indexOf('html') < 0) { if (ctl) ctl.abort(); return 'failed'; }
      return res.arrayBuffer().then(function () { return 'ready'; });
    }).catch(function () { return 'failed'; });
    cache[url] = { p: p, t: now() };
    p.then(function (s) { if (s === 'failed') delete cache[url]; else cache[url].t = now(); });
    return p;
  }

  /* A same-site link was clicked (the caller already called preventDefault). show() plays the loader and must
     navigate to url itself; without it we navigate directly. */
  function go(url, show) {
    var my = ++seq, t0 = now(), status = 'pending', timer = 0, over = false;
    var tick = function () {
      if (over || my !== seq) return;
      var a = decide(now() - t0, status);
      if (a === 'wait') { timer = setTimeout(tick, Math.max(0, LOADER_DELAY_MS - (now() - t0))); return; }
      over = true; clearTimeout(timer);
      if (a === 'loader' && typeof show === 'function') { show(); return; }
      root.location.href = url;
    };
    prefetch(url).then(function (s) { status = s; tick(); });
    timer = setTimeout(tick, LOADER_DELAY_MS);
  }
  api.go = go;

  /* Warm the cache on hover, keyboard focus and touch. */
  var warm = function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    if (canPrefetch(a.href, root.location.href)) prefetch(new URL(a.href, root.location.href).href);
  };
  ['mouseover', 'focusin'].forEach(function (n) { root.document.addEventListener(n, warm); });
  root.document.addEventListener('touchstart', warm, { passive: true });
  /* Coming back from the back/forward cache: forget any wait that was in progress. */
  root.addEventListener('pageshow', function (e) { if (e.persisted) { seq++; cache = {}; } });
})(typeof window !== 'undefined' ? window : globalThis);
