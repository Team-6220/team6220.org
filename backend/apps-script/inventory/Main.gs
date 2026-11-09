/**
 * Main.gs — Golden Griffins Inventory
 * ---------------------------------------------------------------------------
 * Web app entry point. Serves the interface (Index.html) and embeds the
 * current data in the page, so the app is usable as soon as it loads
 * instead of waiting for a second request.
 */

function doGet() {
  const t = HtmlService.createTemplateFromFile('Index');
  t.bootJson = bootJson_();
  return t.evaluate()
    .setTitle(APP.NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/** Used by Index.html to pull in the other HTML files. Returns only page source, so it is safe to be public. */
function include(name) {
  if (['Styles', 'Fonts', 'Brand', 'JsCore', 'JsSearch', 'JsParts', 'JsSections', 'JsGeometry', 'JsRaw', 'JsPlanner', 'JsAudits', 'JsPacking', 'JsSettings'].indexOf(name) < 0) return '';
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/**
 * Initial data as JSON that is safe to place inside a <script> tag.
 * If anything fails, the page falls back to loading data with apiGetAll.
 */
function bootJson_() {
  const res = apiGetAll();
  const payload = res.ok ? { ok: true, data: res.data } : { ok: false, error: res.error };
  return JSON.stringify(payload)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
