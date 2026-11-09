// Builds the inventory page from the original Apps Script files in apps/inventory/ui, the way Apps Script did:
// Index.html with every <?!= include('Name'); ?> replaced by that file's contents (Main.gs include()).
// Runs at build time in src/pages/apps/inventory/index.astro. The UI files themselves are never changed.

/** The files Index.html may include (same allowlist as Main.gs include()). */
export const UI_INCLUDES = [
  "Styles",
  "Fonts",
  "Brand",
  "JsCore",
  "JsSearch",
  "JsParts",
  "JsSections",
  "JsGeometry",
  "JsRaw",
  "JsPlanner",
  "JsAudits",
  "JsPacking",
  "JsSettings",
] as const;

/**
 * What Main.gs embedded as window.BOOT. Apps Script put all the data in the page; here the data needs the
 * signed-in member, so the page boots without it and JsCore's App.start() loads it with apiGetAll.
 */
export const BOOT_JSON = '{"ok":false}';

/** The page title Apps Script set (Config.gs APP.NAME, via doGet().setTitle). */
export const APP_TITLE = "Golden Griffins Inventory";

export interface AssembledPage {
  /** Everything inside Index.html's <head>, includes filled in. */
  head: string;
  /** Everything inside Index.html's <body>, includes filled in. */
  body: string;
}

/** Path or name ("../ui/JsCore.html", "JsCore.html", "JsCore") -> "JsCore". */
export function uiName(path: string): string {
  return path.replace(/^.*[\\/]/, "").replace(/\.html$/, "");
}

const INCLUDE = /<\?!=\s*include\(\s*'([A-Za-z]+)'\s*\)\s*;?\s*\?>/g;
const BOOT = /<\?!=\s*bootJson\s*\?>/g;

function fill(part: string, files: Record<string, string>): string {
  const out = part
    .replace(INCLUDE, (_m, name: string) => {
      if (!(UI_INCLUDES as readonly string[]).includes(name)) throw new Error(`Index.html includes "${name}", which isn't an allowed UI file.`);
      const src = files[name];
      if (typeof src !== "string") throw new Error(`apps/inventory/ui/${name}.html is missing.`);
      return src;
    })
    .replace(BOOT, () => BOOT_JSON);
  const left = out.match(/<\?[\s\S]*?\?>/);
  if (left && !/^<\?xml/.test(left[0])) throw new Error(`Unsupported Apps Script scriptlet in Index.html: ${left[0].slice(0, 60)}`);
  return out;
}

/** files: UI file name (or path) -> contents. Must contain Index and every file it includes. */
export function assembleIndex(input: Record<string, string>): AssembledPage {
  const files: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) files[uiName(k)] = v;
  const index = files.Index;
  if (typeof index !== "string") throw new Error("apps/inventory/ui/Index.html is missing.");
  // Split the template first, so text inside the included files can never be mistaken for </head> or </body>.
  const head = index.match(/<head>([\s\S]*?)<\/head>/);
  const body = index.match(/<body>([\s\S]*?)<\/body>/);
  if (!head || !body) throw new Error("apps/inventory/ui/Index.html needs a <head> and a <body>.");
  return { head: fill(head[1], files), body: fill(body[1], files) };
}
