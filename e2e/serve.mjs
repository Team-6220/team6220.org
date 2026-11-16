// A tiny static server for the built site (dist/), used by the Playwright smoke tests.
// It behaves like GitHub Pages (dev.team6220.org), which is how the site is deployed today:
//   - the site is served from the root of the host (base path "/"; set E2E_BASE to try a sub-path)
//   - /about redirects once to /about/ (Pages does this for folder-style pages), /about/ serves about/index.html
//   - anything else that is missing is a plain 404
// Usage: node e2e/serve.mjs [dist-dir] [port]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
};

export function startServer({ root, port = 0, base = "/" }) {
  const rootDir = resolve(root);
  const prefix = base.replace(/\/+$/, ""); // "" for the site root
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      let path = decodeURIComponent(url.pathname);
      if (prefix) {
        if (path !== prefix && !path.startsWith(prefix + "/")) return send(res, 404, "Not found");
        path = path.slice(prefix.length) || "/";
      }
      const file = normalize(join(rootDir, path));
      if (file !== rootDir && !file.startsWith(rootDir + sep)) return send(res, 403, "Forbidden");
      const s = await stat(file).catch(() => null);
      if (s?.isDirectory()) {
        if (!path.endsWith("/")) {
          res.writeHead(301, { location: prefix + path + "/" + url.search });
          return res.end();
        }
        return serveFile(res, join(file, "index.html"));
      }
      if (s) return serveFile(res, file);
      return send(res, 404, "Not found");
    } catch (e) {
      console.error(e);
      return send(res, 500, "Server error");
    }
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}

async function serveFile(res, file) {
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    send(res, 404, "Not found");
  }
}

function send(res, code, text) {
  res.writeHead(code, { "content-type": "text/plain; charset=utf-8" });
  res.end(text);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ?? "dist";
  const port = Number(process.argv[3] ?? process.env.E2E_PORT ?? 4322);
  const base = process.env.E2E_BASE ?? "/";
  const server = await startServer({ root, port, base });
  console.log(`Serving ${root} at http://127.0.0.1:${server.address().port}${base}`);
}
