// Builds the imported apps that keep their own tooling and puts them in the site output.
// Runs on `astro build` only (dev and check skip it), so the normal site build ships them.
//
//   apps/wingit/{index.html,css,js,assets}   ->  dist/apps/wingit/    (static files, relative paths)
//   apps/goldsim (npm workspace, Vite)        ->  dist/apps/goldsim/   (vite build with base /apps/goldsim/)
//
// GoldSim installs with its own lockfile: if apps/goldsim/node_modules is missing, this runs `npm ci` there first.
// Nothing is written into the repo except GoldSim's own git-ignored node_modules/ and packages/web/dist/.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const WINGIT_FILES = ["index.html", "css", "js", "assets"];
const GOLDSIM_BASE = "/apps/goldsim/";

// npm must not inherit what pnpm and Astro put in the environment: Astro sets NODE_ENV=production (npm ci would
// then skip devDependencies such as Vite) and pnpm passes its own config (overrides, globalconfig, ...) as npm_*.
// Proxy, registry and certificate settings are kept.
const KEEP_NPM_CONFIG = /^npm_config_(https?_proxy|proxy|noproxy|registry|userconfig|cafile|strict_ssl)$/i;
function cleanEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k === "NODE_ENV") continue;
    if (/^(npm|pnpm)_/i.test(k) && !KEEP_NPM_CONFIG.test(k)) continue;
    env[k] = v;
  }
  return env;
}

function run(cmd, args, cwd, env = {}) {
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    env: { ...cleanEnv(), ...env },
    shell: process.platform === "win32",
  });
  if (res.status !== 0) throw new Error(`build-apps: \`${cmd} ${args.join(" ")}\` failed in ${cwd}`);
}

export default function buildApps() {
  let root;
  return {
    name: "build-apps",
    hooks: {
      "astro:config:setup": ({ config }) => {
        root = fileURLToPath(config.root);
      },
      // Build GoldSim before Astro builds the site, so a broken app fails the build early.
      "astro:build:start": ({ logger }) => {
        const goldsim = join(root, "apps/goldsim");
        if (!existsSync(join(goldsim, "node_modules"))) {
          logger.info("installing GoldSim dependencies (npm ci)");
          run("npm", ["ci", "--no-audit", "--no-fund"], goldsim);
        }
        logger.info(`building GoldSim for ${GOLDSIM_BASE}`);
        run("npm", ["run", "build"], goldsim, { BASE_PATH: GOLDSIM_BASE });
      },
      "astro:build:done": ({ dir, logger }) => {
        const out = join(fileURLToPath(dir), "apps");

        const wingitOut = join(out, "wingit");
        rmSync(wingitOut, { recursive: true, force: true });
        for (const f of WINGIT_FILES) cpSync(join(root, "apps/wingit", f), join(wingitOut, f), { recursive: true });

        const goldsimOut = join(out, "goldsim");
        rmSync(goldsimOut, { recursive: true, force: true });
        cpSync(join(root, "apps/goldsim/packages/web/dist"), goldsimOut, { recursive: true });

        logger.info("copied WingIt and GoldSim into apps/");
      },
    },
  };
}
