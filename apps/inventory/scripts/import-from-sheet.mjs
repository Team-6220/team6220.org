#!/usr/bin/env node
// One-time import: CSV exports of the old inventory Google Sheet -> Wix CMS collections.
// How to run it is in apps/inventory/README.md ("Moving the data from the Google Sheet").
//
//   node apps/inventory/scripts/import-from-sheet.mjs <folder-with-csv-files> --dry-run
//   WIX_API_KEY=... WIX_SITE_ID=... node apps/inventory/scripts/import-from-sheet.mjs <folder> --dry-run   (also checks the collections)
//   WIX_API_KEY=... WIX_SITE_ID=... node apps/inventory/scripts/import-from-sheet.mjs <folder>             (writes)
//
// Options:
//   --dry-run              validate and print what would be created; never writes to Wix
//   --only parts,tools     import only these tables (keys as in packages/data/src/inventory/schema.ts)
//   --create-collections   create any missing inventory_* collections first (fields + permissions from schema.ts)
//   --print-schema         print the collection definitions as JSON and exit
//   --allow-nonempty       import into collections that already have items (default: refuse, to avoid duplicates)
//
// The API key and site ID come ONLY from environment variables. Never put them in this file or commit them.
// Needs Node 22.18+ (it imports TypeScript files from packages/data directly).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { META_COLLECTION, TABLES, wixCollectionDefinitions } from "../../../packages/data/src/inventory/schema.ts";
import { toWixItem } from "../../../packages/data/src/inventory/wix-mapping.ts";
import { checkReferences, findCsvFile, readTable } from "./lib/sheet.mjs";

/** Tables in insert order: things that are referred to come first. */
export const IMPORT_ORDER = [
  "lists", "categories", "suppliers", "locations", "tags", "collections",
  "parts", "rawMaterials", "tools", "fasteners", "wire",
  "auditSessions", "auditItems", "packingItems", "packingNotes", "production",
];

const API = "https://www.wixapis.com/wix-data/v2";
const BATCH = 500; // Wix allows 1000 items per bulk call; 500 keeps each request well under size limits.

function parseArgs(argv) {
  const out = { dir: "", dryRun: false, only: null, createCollections: false, printSchema: false, allowNonempty: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--create-collections") out.createCollections = true;
    else if (a === "--print-schema") out.printSchema = true;
    else if (a === "--allow-nonempty") out.allowNonempty = true;
    else if (a === "--only") out.only = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith("--only=")) out.only = a.slice(7).split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a.startsWith("--")) throw new Error(`Unknown option ${a}`);
    else out.dir = a;
  }
  return out;
}

/** Parent rows before children, for self-referencing tables (locations, packing list). */
function parentsFirst(rows) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const depth = (r) => {
    let d = 0;
    let p = r.parentId;
    while (p && byId.has(p) && d < 20) {
      d++;
      p = byId.get(p).parentId;
    }
    return d;
  };
  return rows.slice().sort((a, b) => depth(a) - depth(b));
}

/** Reads and checks every CSV. Pure apart from reading files; used by the tests too. */
export function loadFolder(dir, only) {
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".csv"));
  const keys = only ?? IMPORT_ORDER;
  for (const k of keys) if (!TABLES[k]) throw new Error(`Unknown table "${k}". Use: ${IMPORT_ORDER.join(", ")}`);
  const tables = {};
  const problems = [];
  const found = {};
  for (const k of IMPORT_ORDER) {
    const def = TABLES[k];
    const file = findCsvFile(files, def.sheet);
    if (!file) {
      tables[k] = [];
      if (keys.includes(k)) problems.push({ level: k === "parts" ? "error" : "warning", message: `No CSV for the "${def.sheet}" tab (expected ${def.sheet}.csv).` });
      continue;
    }
    found[k] = file;
    const r = readTable(k, readFileSync(join(dir, file), "utf8"));
    tables[k] = r.rows;
    problems.push(...r.problems);
  }
  problems.push(...checkReferences(tables));
  // Archived rows and finished audits import as they are; only rows of active audits are kept in auditItems.
  const active = new Set(tables.auditSessions.filter((s) => s.status === "active").map((s) => s.id));
  const strays = tables.auditItems.filter((a) => !active.has(a.auditId));
  if (strays.length) {
    problems.push({ level: "warning", message: `AuditItems: ${strays.length} row(s) belong to no active audit and are skipped.` });
    tables.auditItems = tables.auditItems.filter((a) => active.has(a.auditId));
  }
  tables.locations = parentsFirst(tables.locations);
  tables.packingItems = parentsFirst(tables.packingItems);
  return { tables, problems, found, keys };
}

// ─────────────── Wix REST ───────────────

function wixClient() {
  const key = process.env.WIX_API_KEY;
  const site = process.env.WIX_SITE_ID;
  if (!key || !site) return null;
  const call = async (method, path, body) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: key, "wix-site-id": site, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      const err = new Error(`${method} ${path} -> HTTP ${res.status}: ${json?.message ?? text.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    return json;
  };
  return { call };
}

async function collectionExists(wix, id) {
  try {
    await wix.call("GET", `/collections/${encodeURIComponent(id)}`);
    return true;
  } catch (e) {
    if (e.status === 404) return false;
    throw e;
  }
}

async function countItems(wix, id) {
  const r = await wix.call("POST", "/items/count", { dataCollectionId: id });
  return Number(r.totalCount ?? 0);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.printSchema) {
    console.log(JSON.stringify(wixCollectionDefinitions(), null, 2));
    return;
  }
  if (args.help || !args.dir) {
    console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 18).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
    process.exit(args.help ? 0 : 1);
  }
  const dir = resolve(args.dir);
  if (!statSync(dir).isDirectory()) throw new Error(`${dir} is not a folder`);

  const { tables, problems, found, keys } = loadFolder(dir, args.only);
  console.log(`Reading CSV files from ${dir}\n`);
  for (const p of problems) console.log(`${p.level === "error" ? "ERROR  " : "warning"} ${p.message}`);
  if (problems.length) console.log("");

  console.log("Would create:");
  let total = 0;
  for (const k of IMPORT_ORDER) {
    if (!keys.includes(k)) continue;
    const def = TABLES[k];
    const rows = tables[k];
    total += rows.length;
    const archived = rows.filter((r) => r.archivedAt).length;
    console.log(`  ${def.wix.padEnd(28)} ${String(rows.length).padStart(5)} item(s)${archived ? ` (${archived} archived)` : ""}${found[k] ? `  from ${found[k]}` : ""}`);
  }
  console.log(`  ${"total".padEnd(28)} ${String(total).padStart(5)}`);
  const sample = tables.parts?.[0];
  if (sample && keys.includes("parts")) {
    console.log("\nExample (first part) as it will be sent to Wix:");
    console.log(JSON.stringify(toWixItem("parts", sample, "rest"), null, 2));
  }
  console.log("\nNot in the Sheet, so not imported: the packing list's event/season names and final-check state (Script Properties),");
  console.log("photos (Drive files; imageId is kept so they can be moved later), and the Config tab (Drive folder IDs).");

  const errors = problems.filter((p) => p.level === "error");
  if (errors.length) {
    console.log(`\n${errors.length} error(s). Fix the CSV files and run again. Nothing was written.`);
    process.exit(1);
  }

  const wix = wixClient();
  if (!wix) {
    if (args.dryRun) {
      console.log("\nDry run OK. (Set WIX_API_KEY and WIX_SITE_ID to also check the Wix collections, read-only.)");
      return;
    }
    throw new Error("Set WIX_API_KEY and WIX_SITE_ID in the environment (never in a file in the repo).");
  }

  // Read-only checks: do the collections exist, and are they empty?
  console.log("\nChecking Wix collections (read-only)…");
  const needed = [...IMPORT_ORDER.filter((k) => keys.includes(k)).map((k) => TABLES[k].wix), META_COLLECTION];
  const missing = [];
  for (const id of needed) {
    const ok = await collectionExists(wix, id);
    if (!ok) missing.push(id);
    else if (id !== META_COLLECTION) {
      const n = await countItems(wix, id);
      const k = IMPORT_ORDER.find((x) => TABLES[x].wix === id);
      if (n > 0 && tables[k].length && !args.allowNonempty) {
        throw new Error(`${id} already has ${n} item(s). Importing again would duplicate or clash. Empty it first, or pass --allow-nonempty.`);
      }
      console.log(`  ${id}: exists, ${n} item(s)`);
    }
  }
  if (missing.length) {
    console.log(`  missing: ${missing.join(", ")}`);
    if (!args.createCollections) {
      throw new Error("Some collections don't exist yet. Create them (see README), or run again with --create-collections.");
    }
  }
  if (args.dryRun) {
    console.log(`\nDry run OK.${missing.length ? ` Would create ${missing.length} collection(s) first.` : ""} Nothing was written.`);
    return;
  }

  // Writes start here.
  if (missing.length) {
    const defs = wixCollectionDefinitions();
    for (const id of missing) {
      const def = defs.find((d) => d.id === id);
      console.log(`Creating collection ${id}…`);
      await wix.call("POST", "/collections", { collection: def });
    }
  }
  for (const k of IMPORT_ORDER) {
    if (!keys.includes(k) || !tables[k].length) continue;
    const def = TABLES[k];
    const rows = tables[k];
    for (let i = 0; i < rows.length; i += BATCH) {
      const dataItems = rows.slice(i, i + BATCH).map((r) => {
        const { _id, ...data } = toWixItem(k, r, "rest");
        return { id: _id, data };
      });
      const res = await wix.call("POST", "/bulk/items/insert", { dataCollectionId: def.wix, dataItems, returnEntity: false });
      const failed = (res.results ?? []).filter((x) => x.itemMetadata && x.itemMetadata.success === false);
      if (failed.length) {
        for (const f of failed.slice(0, 10)) console.log(`  failed ${f.itemMetadata.id}: ${f.itemMetadata.error?.description ?? JSON.stringify(f.itemMetadata.error)}`);
        throw new Error(`${failed.length} item(s) failed in ${def.wix}. Fix and re-run with --only ${k} --allow-nonempty after removing what was inserted.`);
      }
      console.log(`  ${def.wix}: ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
    }
  }
  console.log("\nImport finished. Open /apps/inventory (with PUBLIC_INVENTORY_BACKEND=wix) and spot-check a few items.");
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (isMain) {
  main().catch((e) => {
    console.error(`\nStopped: ${e.message}`);
    process.exit(1);
  });
}
