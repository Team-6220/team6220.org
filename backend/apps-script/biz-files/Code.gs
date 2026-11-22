/**
 * 6220 Business Files
 *
 * Keeps the files students send for 1-2-3-100 (restaurant flyers, proofs, grant applications) in one Google Drive folder, so they
 * don't use the website's storage and are never public. The website's server (/api/ops) is the only caller: it checks who the student
 * is, then asks this script to put a file in the folder or to hand one back. Plan: https://github.com/Team-6220/team6220.org/wiki/Operations-Business
 *
 * Script Properties (Project Settings > Script Properties):
 *   FILES_SECRET     required. The same value as the Wix secret BIZ_FILES_SECRET (20 or more random characters). SECRET.
 *   ROOT_FOLDER_ID   required. The ID of the Drive folder to keep everything in (the long part of its address).
 *
 * Deploy as a web app: Execute as "Me", Who has access "Anyone". The address it gives goes in the Wix secret BIZ_FILES_URL.
 * Every request must carry the secret; without it this script answers { ok: false } and does nothing.
 */

function doPost(e) {
  try {
    const call = JSON.parse(e.postData.contents);
    const secret = PropertiesService.getScriptProperties().getProperty("FILES_SECRET");
    if (!secret || call.secret !== secret) return json_({ ok: false });
    if (call.action === "put") return json_(put_(call));
    if (call.action === "get") return json_(get_(call));
    return json_({ ok: false });
  } catch (err) {
    return json_({ ok: false });
  }
}

/** { action: "put", season, student, name, mime, data (base64) } -> { ok, id } */
function put_(call) {
  const root = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty("ROOT_FOLDER_ID"));
  const folder = child_(child_(root, "1-2-3-100 " + String(call.season || "")), String(call.student || "Unknown"));
  const blob = Utilities.newBlob(Utilities.base64Decode(call.data), call.mime || "application/octet-stream", call.name || "file");
  const file = folder.createFile(blob);
  return { ok: true, id: file.getId() };
}

/** { action: "get", id } -> { ok, mime, data (base64) } (only files inside the root folder) */
function get_(call) {
  const file = DriveApp.getFileById(call.id);
  const rootId = PropertiesService.getScriptProperties().getProperty("ROOT_FOLDER_ID");
  if (!isInside_(file, rootId)) return { ok: false };
  return { ok: true, mime: file.getMimeType(), data: Utilities.base64Encode(file.getBlob().getBytes()) };
}

/** The folder called `name` inside `parent`, made if it isn't there. */
function child_(parent, name) {
  const found = parent.getFoldersByName(name);
  return found.hasNext() ? found.next() : parent.createFolder(name);
}

/** Whether the file is somewhere under the root folder, so a made-up ID can't read anything else in the Drive. */
function isInside_(file, rootId) {
  let parents = file.getParents();
  while (parents.hasNext()) {
    const parent = parents.next();
    if (parent.getId() === rootId) return true;
    if (isInside_(parent, rootId)) return true;
  }
  return false;
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
