// Demo backend for Icarus: made-up data, and the same rules for planning records as
// backend/apps-script/ops-api/Icarus.gs. Change both together.
import { mockActions, mockWantedSubteams, seedMock, type MockDb } from "../ops/mock";
import { OpsError } from "../ops/types";
import { addDays, isDate } from "./dates";
import { BUILT_IN_TEMPLATES, previewTemplate } from "./templates";
import type { Milestone, Season, Task, TeamEvent } from "./types";

/** For each kind: its collection, and its fields with the type each must have (as in Icarus.gs). */
const KINDS: Record<string, { collection: string; fields: Record<string, string> }> = {
  milestone: { collection: "icarus_milestones", fields: { name: "text", date: "date", subteams: "subteams", seasonId: "text?", eventId: "text?" } },
  event: {
    collection: "icarus_events",
    fields: { code: "text", displayName: "text", officialName: "text?", startDate: "date", endDate: "date", location: "text?", source: "text?" },
  },
  season: { collection: "icarus_seasons", fields: { name: "text", startDate: "date", endDate: "date", eventIds: "list" } },
  template: { collection: "icarus_templates", fields: { name: "text", tasks: "list", milestones: "list" } },
};

function kindOf(name: unknown) {
  const kind = typeof name === "string" && Object.hasOwn(KINDS, name) ? KINDS[name] : null;
  if (!kind) throw new OpsError("bad-request", "Unknown kind of record.");
  return kind;
}

function field(type: string, value: unknown, name: string): unknown {
  const optional = type.endsWith("?");
  const base = optional ? type.slice(0, -1) : type;
  if (base === "subteams") return mockWantedSubteams(value);
  if (base === "list") return Array.isArray(value) ? value : [];
  const s = typeof value === "string" ? value.trim() : "";
  if (!s && !optional) throw new OpsError("bad-request", `Missing ${name}.`);
  if (base === "date" && !isDate(s)) throw new OpsError("bad-request", `${name} must be a date (yyyy-mm-dd).`);
  return s;
}

function existing(db: MockDb, collection: string, id: unknown, what: string) {
  const row = db.rows(collection).find((r) => r._id === id);
  if (!row) throw new OpsError("bad-request", `That ${what} doesn't exist any more. Reload the page.`);
  return row;
}

mockActions({
  saveIcarusRecord: {
    who: "lead",
    run: (request, actor, db) => {
      const kind = kindOf(request.kind);
      const input = (request.record ?? {}) as Record<string, unknown>;
      const old = input._id ? existing(db, kind.collection, input._id, String(request.kind)) : null;
      const record: Record<string, unknown> = old ? { _id: old._id } : {};
      for (const [name, type] of Object.entries(kind.fields)) record[name] = field(type, input[name], name);
      if (record.startDate && record.endDate && String(record.endDate) < String(record.startDate)) {
        throw new OpsError("bad-request", "The end date is before the start date.");
      }
      const saved = db.save(kind.collection, record);
      db.writeHistory(actor, { kind: String(request.kind), id: saved._id }, old ? "updated" : "created", String(saved.name ?? saved.displayName ?? ""));
      return { record: saved };
    },
  },
  removeIcarusRecord: {
    who: "lead",
    run: (request, actor, db) => {
      const kind = kindOf(request.kind);
      const record = existing(db, kind.collection, request.id, String(request.kind));
      db.remove(kind.collection, record._id);
      db.writeHistory(actor, { kind: String(request.kind), id: record._id }, "removed", String(record.name ?? record.displayName ?? ""));
      return {};
    },
  },
});

// ----- made-up starting data: a season that is under way today, so the chart has something to show -----

seedMock((db) => {
  // The demo season starts three weeks before today, so "today", overdue and upcoming all appear.
  const now = new Date().toLocaleDateString("en-CA");
  const startDate = addDays(now, -21);
  const events = [
    db.save<TeamEvent>("icarus_events", {
      code: "demo-showdown", displayName: "SoCal Showdown", officialName: "", startDate: addDays(startDate, 42),
      endDate: addDays(startDate, 43), location: "", source: "manual",
    }),
    db.save<TeamEvent>("icarus_events", {
      code: "demo-blitz", displayName: "Beach Blitz", officialName: "", startDate: addDays(startDate, 63),
      endDate: addDays(startDate, 64), location: "", source: "manual",
    }),
  ];
  const season = db.save<Season>("icarus_seasons", {
    name: "Demo Competition Season", startDate, endDate: addDays(startDate, 112), eventIds: events.map((e) => e._id),
  });

  const plan = previewTemplate(BUILT_IN_TEMPLATES[0], season);
  const owners: Record<string, string[]> = {
    Programming: ["demo-member", "p-ada"], Design: ["demo-lead", "p-hedy"], Manufacturing: ["p-hedy"], Electrical: ["p-nikola"],
    Operations: ["p-katherine"],
  };
  const ids = new Map<string, string>();
  const childCount = new Map<string, number>();
  for (const t of plan.tasks) {
    const parent = db.rows<Task>("icarus_tasks").find((row) => row._id === ids.get(t.parentKey));
    let number: string;
    if (parent) {
      childCount.set(parent._id, (childCount.get(parent._id) ?? 0) + 1);
      number = `${parent.number}.${childCount.get(parent._id)}`;
    } else number = String(db.takeNumber("task"));
    const status = t.dueDate < addDays(now, -3) ? "done" : t.startDate <= now ? "in-progress" : "not-started";
    const saved = db.save<Task>("icarus_tasks", {
      number, parentId: parent?._id ?? "", title: t.title, description: "", projectId: "", subteams: t.subteams,
      ownerIds: owners[t.subteams[0]] ?? ["demo-lead"], status, startDate: t.startDate, dueDate: t.dueDate, notes: "",
      seasonId: season._id, blockedBy: [], related: [], needs: [], createdBy: "demo-lead",
    });
    ids.set(t.key, saved._id);
  }
  // One dependency and one task with no dates, so those parts of the screen have an example.
  const row = (key: string) => db.rows<Task>("icarus_tasks").find((t) => t._id === ids.get(key))!;
  row("build").blockedBy = [ids.get("cad")!];
  db.save<Task>("icarus_tasks", {
    number: String(db.takeNumber("task")), parentId: "", title: "Decide on a team shirt design", description: "", projectId: "",
    subteams: ["Operations"], ownerIds: [], status: "not-started", startDate: "", dueDate: "", notes: "", seasonId: season._id,
    blockedBy: [], related: [], needs: [], createdBy: "demo-lead",
  });
  for (const m of plan.milestones) {
    db.save<Milestone>("icarus_milestones", { name: m.name, date: m.date, subteams: m.subteams, seasonId: season._id, eventId: "" });
  }
});
