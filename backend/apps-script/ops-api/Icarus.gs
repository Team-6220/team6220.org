// Icarus (tasks and Gantt). Plan: docs/operations/ICARUS.md.
//
// Tasks themselves are written straight to Wix by members (collection icarus_tasks), like Inventory items.
// The PLANNING records below can only be changed by a Lead, so members can read their collections but not
// write them, and every change comes through here:
//   milestone   a target date, for the whole team or for some subteams
//   event       a competition or scrimmage, with the team's own display name
//   season      one Gantt chart: a name, a start date and an end date
//   template    a saved set of tasks and milestones with dates stored as day offsets
// The demo backend follows the same rules: packages/data/src/icarus/mock.ts. Change both together.

/** For each kind: its collection, and its fields with the type each must have. */
const ICARUS_KINDS = {
  milestone: {
    collection: "icarus_milestones",
    fields: { name: "text", date: "date", subteams: "subteams", seasonId: "text?", eventId: "text?" },
  },
  event: {
    collection: "icarus_events",
    fields: {
      code: "text", displayName: "text", officialName: "text?", startDate: "date", endDate: "date",
      location: "text?", source: "text?",
    },
  },
  season: {
    collection: "icarus_seasons",
    fields: { name: "text", startDate: "date", endDate: "date", eventIds: "list" },
  },
  template: {
    collection: "icarus_templates",
    fields: { name: "text", tasks: "list", milestones: "list" },
  },
};
const ICARUS_COLLECTIONS = ["icarus_tasks"].concat(Object.keys(ICARUS_KINDS).map(function (k) {
  return ICARUS_KINDS[k].collection;
}));

function icarusKind_(name) {
  if (!Object.prototype.hasOwnProperty.call(ICARUS_KINDS, name)) throw apiError_("bad-request", "Unknown kind of record.");
  return ICARUS_KINDS[name];
}

/** Checks one field of a planning record and returns the cleaned value. */
function icarusField_(type, value, name) {
  const optional = type.slice(-1) === "?";
  switch (optional ? type.slice(0, -1) : type) {
    case "text":
      return text_(value, name, 300, optional);
    case "date": {
      const date = text_(value, name, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw apiError_("bad-request", name + " must be a date (yyyy-mm-dd).");
      return date;
    }
    case "subteams":
      return wantedSubteams_(value);
    case "list": {
      const list = Array.isArray(value) ? value : [];
      if (JSON.stringify(list).length > 200000) throw apiError_("bad-request", name + " is too large.");
      return list;
    }
    default:
      throw new Error("Unknown field type " + type);
  }
}

/** { kind, record: { _id?, ...fields } } -> { record }. A Lead creates or changes a planning record. */
function saveIcarusRecord_(body, actor) {
  const kind = icarusKind_(body.kind);
  const input = body.record || {};
  const existing = input._id ? getRecord_(kind.collection, input._id, body.kind) : null;
  const record = existing ? { _id: existing._id } : {};
  Object.keys(kind.fields).forEach(function (name) {
    record[name] = icarusField_(kind.fields[name], input[name], name);
  });
  if (record.startDate && record.endDate && record.endDate < record.startDate) {
    throw apiError_("bad-request", "The end date is before the start date.");
  }
  const saved = wixSave_(kind.collection, record);
  writeHistory_(actor, { kind: body.kind, id: saved._id }, existing ? "updated" : "created", saved.name || saved.displayName || "");
  return { record: saved };
}

/** { kind, id } -> {}. A Lead removes a planning record. Tasks that pointed at it keep working without it. */
function removeIcarusRecord_(body, actor) {
  const kind = icarusKind_(body.kind);
  const record = getRecord_(kind.collection, body.id, body.kind);
  wixRemove_(kind.collection, record._id);
  writeHistory_(actor, { kind: body.kind, id: record._id }, "removed", record.name || record.displayName || "");
  return {};
}
