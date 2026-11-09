/**
 * Backup.gs — Golden Griffins Inventory
 * ---------------------------------------------------------------------------
 * The safety net:
 *   - Each night, IF anything changed since the last backup, every sheet is
 *     copied into Drive → "Golden Griffins Inventory / Backups".
 *     Nights with no changes are skipped, so no duplicate copies pile up.
 *   - Backups older than 3 months go to Drive trash automatically, but the
 *     newest 3 are always kept (so a quiet summer never deletes them all).
 *   - Archived ("deleted") items are permanently removed after 30 days.
 *
 * To restore from a backup: open the backup spreadsheet, copy the rows you
 * need, and paste them into the live sheet (see the handoff guide).
 */

/** ▶ Run ONCE from the editor to schedule the nightly backup (safe to re-run). */
function installNightlyBackup() {
  requireEditor_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'nightlyMaintenance') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('nightlyMaintenance').timeBased().everyDays(1).atHour(APP.BACKUP_HOUR).create();
  console.log('Nightly backup scheduled for about ' + APP.BACKUP_HOUR + ':00 (' + Session.getScriptTimeZone() + ').');
}

/** ▶ Run from the editor to make a backup right now. */
function runBackupNow() {
  requireEditor_();
  PropertiesService.getScriptProperties().deleteProperty('lastBackupAt');
  console.log(nightlyMaintenance(true));
}

/**
 * Called by the nightly trigger. Rate-limited to once an hour, so it is
 * harmless even if a web-app visitor manages to call it.
 */
function nightlyMaintenance(force) {
  const props = PropertiesService.getScriptProperties();
  const last = Number(props.getProperty('lastBackupAt') || 0);
  if (Date.now() - last < APP.BACKUP_MIN_INTERVAL_MS) return 'Skipped: a backup ran less than an hour ago.';

  const out = [];
  const sig = changeSignature_();
  if (force !== true && sig === props.getProperty('lastBackupSignature')) {
    out.push('No changes since the last backup, so no new copy was made.');
  } else {
    props.setProperty('lastBackupAt', String(Date.now()));
    try {
      out.push(runBackup_());
      props.setProperty('lastBackupSignature', sig);
    } catch (e) { console.error('Backup failed: ' + (e.stack || e)); out.push('Backup FAILED: ' + e); }
  }
  try { out.push(pruneBackups_()); } catch (e) { console.error('Prune failed: ' + (e.stack || e)); }
  try { out.push(purgeArchived_()); } catch (e) { console.error('Purge failed: ' + (e.stack || e)); }
  return out.filter(Boolean).join('\n');
}

/** Copies every sheet into a new spreadsheet inside the Backups folder. */
function runBackup_() {
  const src = ss_();
  const folderId = getConfig_('backupFolderId');
  if (!folderId) throw new Error('No backup folder configured. Run setupDatabase.');
  const folder = DriveApp.getFolderById(folderId);
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HHmm');
  const copy = SpreadsheetApp.create(APP.BACKUP_PREFIX + stamp);
  const starter = copy.getSheets()[0];
  src.getSheets().forEach(function (sh) {
    sh.copyTo(copy).setName(sh.getName());
  });
  copy.deleteSheet(starter);
  DriveApp.getFileById(copy.getId()).moveTo(folder);
  return 'Backup created: ' + copy.getName();
}

/**
 * A fingerprint of every table's change counter. If it matches the one saved
 * at the last backup, nothing has changed. (The final-check "still here"
 * signal isn't a data change, so it is left out.)
 */
function changeSignature_() {
  const v = getVersions_();
  return JSON.stringify(Object.keys(v).filter(function (k) { return k !== 'packingMeta'; }).sort()
    .map(function (k) { return k + ':' + v[k]; }));
}

/** Trashes backups older than APP.BACKUP_MAX_AGE_DAYS, always keeping the newest APP.BACKUP_MIN_KEEP. */
function pruneBackups_() {
  const folder = DriveApp.getFolderById(getConfig_('backupFolderId'));
  const files = [];
  const it = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
  while (it.hasNext()) {
    const f = it.next();
    if (f.getName().indexOf(APP.BACKUP_PREFIX) === 0) files.push(f);
  }
  files.sort(function (a, b) { return b.getDateCreated().getTime() - a.getDateCreated().getTime(); });
  const cutoff = Date.now() - APP.BACKUP_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const old = files.slice(APP.BACKUP_MIN_KEEP).filter(function (f) { return f.getDateCreated().getTime() < cutoff; });
  old.forEach(function (f) { f.setTrashed(true); });
  return old.length ? 'Removed ' + old.length + ' old backup(s).' : '';
}

/** Permanently deletes items archived more than APP.ARCHIVE_PURGE_DAYS ago. */
function purgeArchived_() {
  const cutoff = Date.now() - APP.ARCHIVE_PURGE_DAYS * 24 * 60 * 60 * 1000;
  return withLock_(function () {
    let total = 0;
    const changed = [];
    INVENTORY_SECTIONS.forEach(function (key) {
      const t = readAll_(key);
      const old = t.rows.filter(function (r) {
        if (!r.archivedAt) return false;
        const when = Date.parse(r.archivedAt);
        return isFinite(when) && when < cutoff;
      });
      if (!old.length) return;
      old.forEach(function (r) { trashImage_(r.imageId); });
      deleteRows_(t.sh, old.map(function (r) { return r.__i + 2; }));
      total += old.length;
      changed.push(key);
    });
    if (changed.length) bumpVersions_(changed);
    return total ? 'Permanently removed ' + total + ' archived item(s) older than ' + APP.ARCHIVE_PURGE_DAYS + ' days.' : '';
  });
}
