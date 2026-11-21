// Copies media from where it lives in the repo to where the browser finds it.
// Runs whenever Astro starts (dev, build, check), so there is nothing to remember.
//
//   packages/assets/favicon/*       ->  /            (favicon.ico, apple-touch-icon.png, ...)
//   packages/assets/<folder>/       ->  /assets/shared/<folder>/   (logos, fonts, ... for anyone)
//   sites/<name>/media/             ->  /assets/<name>/
//   sites/<name>/scripts/           ->  /assets/<name>/js/
//   apps/<name>/media/              ->  /assets/<name>/
//   sites/main/content/resources.json -> /assets/shared/data/links.json (the pins menu's links)
//
// The output lives in public/ and is git-ignored. Edit the sources, never the copies.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dirs = (p) => (existsSync(p) ? readdirSync(p).filter((n) => statSync(join(p, n)).isDirectory()) : []);

export default function syncMedia() {
  return {
    name: "sync-media",
    hooks: {
      "astro:config:setup": ({ config }) => {
        const root = fileURLToPath(config.root);
        const pub = join(root, "public");
        rmSync(join(pub, "assets"), { recursive: true, force: true });
        mkdirSync(join(pub, "assets"), { recursive: true });
        const copy = (from, to) => existsSync(from) && cpSync(from, join(pub, to), { recursive: true });

        const shared = join(root, "packages/assets");
        for (const d of dirs(shared)) {
          if (d === "favicon") cpSync(join(shared, d), pub, { recursive: true });
          else copy(join(shared, d), `assets/shared/${d}`);
        }
        for (const s of dirs(join(root, "sites"))) {
          copy(join(root, "sites", s, "media"), `assets/${s}`);
          copy(join(root, "sites", s, "scripts"), `assets/${s}/js`);
        }
        for (const a of dirs(join(root, "apps"))) copy(join(root, "apps", a, "media"), `assets/${a}`);
        // The Resources links, for the apps' pins menu (the shared frame in packages/assets/scripts/app-sidebar.js).
        copy(join(root, "sites/main/content/resources.json"), "assets/shared/data/links.json");
      },
    },
  };
}
