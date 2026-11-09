/**
 * ApiImages.gs — Golden Griffins Inventory
 * ---------------------------------------------------------------------------
 * Item photos (Parts, Tools and packing list entries). The browser shrinks photos before upload
 * (about 1200 px, JPEG), so files are typically 100–300 KB.
 *
 * Photos are saved in Drive → "Golden Griffins Inventory / Item Images" and
 * set to "anyone with the link can view" so the page can show them to
 * visitors who aren't signed in. If the Workspace admin blocks link
 * sharing, photos still work: the page falls back to apiGetImage, which
 * sends the picture through the script (slower, but always allowed).
 */

const IMAGE_TABLES = ['parts', 'tools', 'packingItems'];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Adds or replaces an item's photo. dataUrl: "data:image/jpeg;base64,...". */
function apiUploadImage(key, id, dataUrl) {
  return api_(function () {
    if (IMAGE_TABLES.indexOf(key) < 0) throw new AppError('BAD_REQUEST', 'Photos are not supported in this section.');
    assertId_(id);
    const m = typeof dataUrl === 'string' && dataUrl.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) throw new AppError('BAD_REQUEST', 'That file isn’t a supported image.');
    const bytes = Utilities.base64Decode(m[2]);
    if (bytes.length > MAX_IMAGE_BYTES) throw new AppError('VALIDATION', 'That photo is too large even after shrinking (2 MB max).');
    const pre = findRow_(key, id);
    if (!pre || pre.rec.archivedAt) throw new AppError('NOT_FOUND', 'This item no longer exists.');
    const folderId = getConfig_('imageFolderId');
    if (!folderId) throw new AppError('NOT_SETUP', 'No image folder is set up. Run setupDatabase from the Apps Script editor.');

    // Saving to Drive is slow, so it happens before taking the lock.
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const file = DriveApp.getFolderById(folderId).createFile(Utilities.newBlob(bytes, 'image/' + m[1], key + '-' + id + '.' + ext));
    let shared = true;
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {
      shared = false;
      console.warn('Link sharing blocked for image ' + file.getId() + ': ' + e);
    }
    try {
      return withLock_(function () {
        const found = findRow_(key, id);
        if (!found || found.rec.archivedAt) throw new AppError('NOT_FOUND', 'This item no longer exists.');
        const rec = found.rec;
        const old = rec.imageId;
        rec.imageId = file.getId();
        rec.version = (rec.version || 0) + 1;
        rec.updatedAt = nowIso_();
        writeFound_(found, rec);
        if (old) trashImage_(old);
        return { record: publicRec_(rec), shared: shared, versions: bumpVersions_([key]) };
      });
    } catch (e) {
      trashImage_(file.getId());
      throw e;
    }
  });
}

/** Removes an item's photo (the file goes to Drive trash). */
function apiRemoveImage(key, id) {
  return api_(function () {
    if (IMAGE_TABLES.indexOf(key) < 0) throw new AppError('BAD_REQUEST', 'Photos are not supported in this section.');
    assertId_(id);
    return withLock_(function () {
      const found = findRow_(key, id);
      if (!found) throw new AppError('NOT_FOUND', 'This item no longer exists.');
      const rec = found.rec;
      if (!rec.imageId) return { record: publicRec_(rec), versions: getVersions_() };
      trashImage_(rec.imageId);
      rec.imageId = '';
      rec.version = (rec.version || 0) + 1;
      rec.updatedAt = nowIso_();
      writeFound_(found, rec);
      return { record: publicRec_(rec), versions: bumpVersions_([key]) };
    });
  });
}

/**
 * Fallback for showing a photo when Drive link sharing is blocked.
 * Only serves files that are an item's current photo, so it can't be used
 * to read anything else in the team's Drive.
 */
function apiGetImage(fileId) {
  return api_(function () {
    if (typeof fileId !== 'string' || !/^[A-Za-z0-9_-]{10,100}$/.test(fileId)) throw new AppError('BAD_REQUEST', 'Invalid image.');
    const used = IMAGE_TABLES.some(function (k) {
      return readAll_(k).rows.some(function (r) { return r.imageId === fileId; });
    });
    if (!used) throw new AppError('NOT_FOUND', 'Image not found.');
    const blob = DriveApp.getFileById(fileId).getBlob();
    return { dataUrl: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) };
  });
}
