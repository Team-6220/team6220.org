// Reading and writing Wix with the server's API key (Script Properties WIX_API_KEY and WIX_SITE_ID).
// The key can write collections that members can only read, which is how badge checks become real rules.
//
// Data Items API: https://dev.wix.com/docs/api-reference/business-solutions/cms/data-items/introduction
// Badge Assignments API: https://dev.wix.com/docs/api-reference/crm/members-contacts/members/activity/badge-assignments/introduction

const COLLECTION_COUNTERS = "ops_counters";
const COLLECTION_HISTORY = "ops_history";
const COLLECTION_PROJECTS = "ops_projects";
const COLLECTION_PEOPLE = "ops_people";
const REQUIRED_COLLECTIONS = [COLLECTION_COUNTERS, COLLECTION_HISTORY, COLLECTION_PROJECTS, COLLECTION_PEOPLE];

/** One call to Wix as the server. Returns the parsed answer, or throws wix-unavailable / not-configured. */
function wixAdmin_(method, path, payload) {
  const key = prop_("WIX_API_KEY");
  const site = prop_("WIX_SITE_ID");
  if (!key || !site) {
    throw apiError_("not-configured", "The operations server isn't set up yet (WIX_API_KEY / WIX_SITE_ID).");
  }
  const options = {
    method: method,
    contentType: "application/json",
    headers: { Authorization: key, "wix-site-id": site },
    muteHttpExceptions: true,
  };
  if (payload !== undefined) options.payload = JSON.stringify(payload);
  const res = UrlFetchApp.fetch(WIX_API + path, options);
  const code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    console.error("Wix " + method + " " + path + " answered " + code + ": " + res.getContentText().slice(0, 300));
    throw apiError_("wix-unavailable", "Wix didn't accept the change. Try again.");
  }
  const text = res.getContentText();
  return text ? JSON.parse(text) : {};
}

/** Items of a collection matching a filter (plain field: value pairs), as plain objects with their _id. */
function wixQuery_(collection, filter, limit) {
  const res = wixAdmin_("post", "/wix-data/v2/items/query", {
    dataCollectionId: collection,
    query: { filter: filter || {}, paging: { limit: limit || 1000 } },
  });
  return (res.dataItems || []).map(function (item) {
    return Object.assign({}, item.data, { _id: item.id || (item.data && item.data._id) });
  });
}

/** Adds an item. Fails if an item with the same _id already exists. Returns the saved item. */
function wixInsert_(collection, data) {
  const dataItem = { data: data };
  if (data._id) dataItem.id = data._id;
  const res = wixAdmin_("post", "/wix-data/v2/items", { dataCollectionId: collection, dataItem: dataItem });
  return Object.assign({}, res.dataItem && res.dataItem.data, { _id: res.dataItem && res.dataItem.id });
}

/** Adds the item, or replaces the one with the same _id. Returns the saved item. */
function wixSave_(collection, data) {
  const dataItem = { data: data };
  if (data._id) dataItem.id = data._id;
  const res = wixAdmin_("post", "/wix-data/v2/items/save", { dataCollectionId: collection, dataItem: dataItem });
  return Object.assign({}, res.dataItem && res.dataItem.data, { _id: res.dataItem && res.dataItem.id });
}

/** Deletes an item. https://dev.wix.com/docs/api-reference/business-solutions/cms/data-items/remove-data-item */
function wixRemove_(collection, id) {
  wixAdmin_("delete", "/wix-data/v2/items/" + encodeURIComponent(id) + "?dataCollectionId=" + encodeURIComponent(collection));
}

function wixAssignBadge_(badgeId, memberId) {
  wixAdmin_("post", "/badges/v4/assignments", { badgeAssignment: { badgeId: badgeId, memberId: memberId } });
}

function wixRemoveBadgeAssignment_(assignmentId) {
  wixAdmin_("delete", "/badges/v4/assignments/" + encodeURIComponent(assignmentId));
}
