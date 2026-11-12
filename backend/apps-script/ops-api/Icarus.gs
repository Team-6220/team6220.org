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

// ---------------------------------------------------------------------------------------------------------
// Tasks for Apollo (the team's Hermes agent). Members write tasks straight to Wix from the website; Apollo has no
// Wix login, so it uses these. Everything it writes is recorded under the Apollo user.
// ---------------------------------------------------------------------------------------------------------

const TASK_STATUSES = ["not-started", "in-progress", "done", "cancelled"];

function isOpenTask_(t) {
  return t.status === "not-started" || t.status === "in-progress";
}

/** "42.10" after "42.2". */
function byTaskNumber_(a, b) {
  const pa = String(a.number).split(".").map(Number), pb = String(b.number).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] === undefined ? -1 : pa[i]) - (pb[i] === undefined ? -1 : pb[i]);
    if (d) return d;
  }
  return 0;
}

/**
 * { status?: "open"|"closed"|<status>, assigneeId?, seasonId?, search?, overdue? } -> { tasks }
 * Up to 200 tasks, in number order.
 */
function listTasks_(body) {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const words = String(body.search || "").toLowerCase();
  const tasks = wixQuery_("icarus_tasks", {}).filter(function (t) {
    if (body.status === "open" && !isOpenTask_(t)) return false;
    if (body.status === "closed" && isOpenTask_(t)) return false;
    if (TASK_STATUSES.indexOf(body.status) !== -1 && t.status !== body.status) return false;
    if (body.assigneeId && (t.ownerIds || []).indexOf(String(body.assigneeId)) === -1) return false;
    if (body.seasonId && t.seasonId !== body.seasonId) return false;
    if (body.overdue && !(t.dueDate && t.dueDate < today && isOpenTask_(t))) return false;
    if (words && ("t" + t.number + " " + t.title + " " + (t.description || "")).toLowerCase().indexOf(words) === -1) return false;
    return true;
  });
  return { tasks: tasks.sort(byTaskNumber_).slice(0, 200) };
}

/**
 * { task: { _id?, title, description, parentId, seasonId, projectId, subteams, ownerIds, status, startDate, dueDate,
 *   notes, blockedBy, related } } -> { task }
 * Creates a task (numbered like the website does: t43, or t42.3 under a parent) or changes one.
 */
function saveTask_(body, actor) {
  const input = body.task || {};
  const existing = input._id ? getRecord_("icarus_tasks", String(input._id), "task") : null;
  const date = function (v, name) {
    const s = text_(v, name, 10, true);
    if (s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw apiError_("bad-request", name + " must be a date (yyyy-mm-dd).");
    return s;
  };
  const ids = function (v) { return (Array.isArray(v) ? v : []).map(String).slice(0, 50); };
  const status = input.status === undefined && existing ? existing.status : input.status || "not-started";
  if (TASK_STATUSES.indexOf(status) === -1) throw apiError_("bad-request", "Status must be one of " + TASK_STATUSES.join(", ") + ".");
  const pick = function (name, clean) { return input[name] === undefined && existing ? existing[name] : clean(input[name]); };
  const task = Object.assign({}, existing, {
    title: pick("title", function (v) { return text_(v, "title", 200); }),
    description: pick("description", function (v) { return text_(v, "description", 4000, true); }),
    parentId: existing ? existing.parentId : text_(input.parentId, "parent", 100, true),
    seasonId: pick("seasonId", function (v) { return text_(v, "season", 100, true); }),
    projectId: pick("projectId", function (v) { return text_(v, "project", 100, true); }),
    subteams: pick("subteams", function (v) { return Array.isArray(v) && v.length ? wantedSubteams_(v) : []; }),
    ownerIds: pick("ownerIds", ids),
    status: status,
    startDate: pick("startDate", function (v) { return date(v, "Start"); }),
    dueDate: pick("dueDate", function (v) { return date(v, "Due"); }),
    notes: pick("notes", function (v) { return text_(v, "notes", 500, true); }),
    blockedBy: pick("blockedBy", ids),
    related: pick("related", ids),
    needs: existing ? existing.needs || [] : [],
    updatedAt: new Date().toISOString(),
  });
  if (task.startDate && task.dueDate && task.dueDate < task.startDate) throw apiError_("bad-request", "The due date is before the start date.");
  if (!existing) {
    task.createdBy = actor.id;
    task.number = withLock_(function () {
      if (!task.parentId) return String(takeNumber_("task"));
      const parent = getRecord_("icarus_tasks", task.parentId, "parent task");
      const siblings = wixQuery_("icarus_tasks", { parentId: parent._id }).map(function (t) { return Number(String(t.number).split(".").pop()); });
      if (!task.seasonId) task.seasonId = parent.seasonId;
      return parent.number + "." + (Math.max.apply(null, [0].concat(siblings)) + 1);
    });
  }
  const saved = wixSave_("icarus_tasks", task);
  writeHistory_(actor, { kind: "task", id: saved._id }, existing ? "edited" : "created", "t" + saved.number + " " + saved.title + " (" + saved.status + ")");
  return { task: saved };
}

/** { taskId, body } -> { comment }. */
function addTaskComment_(body, actor) {
  const task = getRecord_("icarus_tasks", String(body.taskId || ""), "task");
  const comment = wixInsert_("icarus_comments", {
    taskId: task._id, authorId: actor.id, authorName: actor.name, body: text_(body.body, "comment", 4000), at: new Date().toISOString(),
  });
  return { comment: comment };
}

/**
 * {} -> what needs a person's attention across the three apps, for Apollo's reminders:
 *   overdueTasks, blockedTasks, linesWaitingForSignatures, orderedNotReceived, partsPendingSetup.
 */
function needsAttention_() {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const tasks = wixQuery_("icarus_tasks", {});
  const open = tasks.filter(isOpenTask_);
  const byId = {};
  tasks.forEach(function (t) { byId[t._id] = t; });
  const brief = function (t) { return { _id: t._id, number: t.number, title: t.title, dueDate: t.dueDate, ownerIds: t.ownerIds || [] }; };
  const lines = wixQuery_(COLLECTION_LINES, {});
  return {
    overdueTasks: open.filter(function (t) { return t.dueDate && t.dueDate < today; }).sort(byTaskNumber_).map(brief),
    blockedTasks: open.filter(function (t) {
      return (t.blockedBy || []).some(function (id) { return byId[id] && isOpenTask_(byId[id]); });
    }).sort(byTaskNumber_).map(brief),
    linesWaitingForSignatures: lines.filter(function (l) { return !l.orderedAt && (l.signatures || []).length < SIGNATURES_NEEDED; })
      .map(function (l) { return { _id: l._id, name: l.name, signatures: (l.signatures || []).length }; }),
    orderedNotReceived: lines.filter(function (l) { return l.orderedAt && (l.receivedQty || 0) < l.quantity; })
      .map(function (l) { return { _id: l._id, name: l.name, left: l.quantity - (l.receivedQty || 0) }; }),
    partsPendingSetup: wixQuery_("production_parts", { status: "pending-setup" })
      .map(function (p) { return { _id: p._id, number: p.number, partName: p.partName }; }),
  };
}
