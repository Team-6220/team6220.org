// Demo data for RSVP: two events with open forms (a competition and a team dinner), one draft, and some answers, so every
// screen has something to show. Below it, the demo versions of the server's RSVP actions, which use the same plan.ts.
import "../calendar/mock"; // the demo events come first
import { mockActions, seedMock, type MockActor, type MockDb } from "../ops/mock";
import { rolesFor } from "../ops/roles";
import { OpsError, type Item, type Person } from "../ops/types";
import { addDays, today } from "../calendar/dates";
import type { CalEvent } from "../calendar/types";
import { askedDays, cleanAnswer, cleanForm, cleanSettings, COLLECTION_ANSWERS, COLLECTION_FORMS, COLLECTION_SETTINGS, eventInfo, formState, manageRows, openFor, resultsFor, RsvpError, type TeamMember } from "./plan";
import { DEFAULT_SETTINGS, type EventInfo, type RsvpAnswer, type RsvpForm, type RsvpSettings } from "./types";

const TEAM_BADGE = "Team Member";

seedMock((db) => {
  const now = today();
  const comp = db.rows<CalEvent>("cal_events").find((e) => e.type === "competition" && !e.cancelled);
  const event = (e: Partial<CalEvent> & Pick<CalEvent, "title" | "startDate">) =>
    db.save<CalEvent>("cal_events", { type: "event", endDate: e.startDate, startTime: "", endTime: "", location: "Workshop", notes: "", mandatory: false, subteams: [], public: true, cancelled: false, ...e });
  const dinner = event({ title: "Team dinner", startDate: addDays(now, 3), startTime: "17:30", endTime: "20:00", location: "Pizza place" });
  const workshop = event({ title: "Open workshop", startDate: addDays(now, 9), startTime: "10:00", endTime: "14:00" });
  event({ title: "Lakewood scrimmage", startDate: addDays(now, 16), startTime: "09:00", endTime: "16:00", location: "Lakewood" }); // no form yet: New form can pick it
  const form = (eventId: string, extra: Partial<RsvpForm>) =>
    db.save<RsvpForm>("rsvp_forms", { eventId, status: "published", answerBy: addDays(now, 5), questions: [], publishedAt: new Date().toISOString(), finished: 0, asked: 0, ...extra });
  const compForm = comp ? form(comp._id, { answerBy: addDays(comp.startDate, -7), questions: [{ id: "qlaptop", label: "Will you bring a laptop?", type: "yesno", options: [] }, { id: "qmeal", label: "Dinner on Friday", type: "choice", options: ["Pizza", "Sandwich", "No thanks"] }] }) : null;
  const dinnerForm = form(dinner._id, { answerBy: addDays(now, 1) });
  form(workshop._id, { status: "draft", answerBy: addDays(now, 7) });
  // A few people have answered.
  const answer = (formId: string, memberId: string, days: RsvpAnswer["days"], pit: RsvpAnswer["pit"], misses: string, extra: RsvpAnswer["extra"] = {}) =>
    db.save<RsvpAnswer>("rsvp_answers", { formId, memberId, days, pit, misses, extra, complete: Object.values(days).every((d) => d !== "maybe") && !!misses, answeredAt: new Date().toISOString() });
  const everyone = ["demo-lead", "p-ada", "p-grace", "p-nikola", "p-hedy", "p-katherine"];
  if (compForm && comp) {
    const days = askedDays({ startDate: comp.startDate, endDate: comp.endDate });
    answer(compForm._id, "p-ada", Object.fromEntries(days.map((d) => [d, "yes"])), "available", "N/A", { qlaptop: "Yes", qmeal: "Pizza" });
    answer(compForm._id, "p-nikola", Object.fromEntries(days.map((d, i) => [d, i === 0 ? "yes" : "maybe"])), "not", "Sunday: family event");
    answer(compForm._id, "p-hedy", Object.fromEntries(days.map((d) => [d, "no"])), "not", "Out of town all weekend", { qlaptop: "No", qmeal: "No thanks" });
  }
  answer(dinnerForm._id, "demo-member", { [dinner.startDate]: "yes" }, "", "N/A");
  for (const id of everyone.slice(1, 4)) answer(dinnerForm._id, id, { [dinner.startDate]: "yes" }, "", "N/A");
  for (const f of [compForm, dinnerForm]) if (f) db.save("rsvp_forms", { ...f, finished: db.rows<RsvpAnswer>("rsvp_answers").filter((a) => a.formId === f._id && a.complete).length, asked: 8 });
  db.save("rsvp_settings", { ...DEFAULT_SETTINGS });
});

// ----- the demo backend's actions -----

const plan = <T>(step: () => T): T => {
  try {
    return step();
  } catch (e) {
    if (e instanceof RsvpError) throw new OpsError("bad-request", e.message);
    throw e;
  }
};

const forms = (db: MockDb) => db.rows<RsvpForm>(COLLECTION_FORMS);
const answers = (db: MockDb) => db.rows<RsvpAnswer>(COLLECTION_ANSWERS);
const events = (db: MockDb) => new Map(db.rows<CalEvent>("cal_events").filter((e) => (e.type === "competition" || e.type === "event") && !e.cancelled).map((e) => [e._id, eventInfo(e)] as [string, EventInfo]));
const teamOf = (db: MockDb): TeamMember[] =>
  db.rows<Person>("ops_people").filter((p) => (db.badges.get(p.memberId) ?? []).includes(TEAM_BADGE)).map((p) => ({ memberId: p.memberId, name: p.name, subteams: p.subteams }));

function settingsOf(db: MockDb): RsvpSettings {
  return { ...DEFAULT_SETTINGS, ...(db.rows<Item & Partial<RsvpSettings>>(COLLECTION_SETTINGS)[0] ?? {}) };
}

function formOf(db: MockDb, id: unknown): RsvpForm {
  const form = forms(db).find((f) => f._id === id);
  if (!form) throw new OpsError("bad-request", "That form doesn't exist any more. Reload the page.");
  return form;
}

mockActions({
  rsvpOpen: { who: "team", run: (_r, actor, db) => ({ forms: openFor(forms(db).filter((f) => f.status === "published"), events(db), answers(db).filter((a) => a.memberId === actor.id), actor.id, today()) }) },
  rsvpAnswer: {
    who: "team",
    run: (request, actor, db) => {
      const form = formOf(db, request.formId);
      const event = events(db).get(form.eventId);
      if (!event || formState(form, event, today()) !== "open") throw new OpsError("bad-request", "That form isn't open any more.");
      const clean = plan(() => cleanAnswer(form, event, (request.answer ?? {}) as Record<string, unknown>));
      const existing = answers(db).find((a) => a.formId === form._id && a.memberId === actor.id);
      const saved = db.save<RsvpAnswer>(COLLECTION_ANSWERS, { ...(existing ?? {}), formId: form._id, memberId: actor.id, ...clean, answeredAt: new Date().toISOString() } as RsvpAnswer);
      const team = teamOf(db);
      const ids = new Set(team.map((m) => m.memberId));
      db.save(COLLECTION_FORMS, { ...form, finished: answers(db).filter((a) => a.formId === form._id && a.complete && ids.has(a.memberId)).length, asked: team.length });
      return { form: openFor([form], new Map([[event.id, event]]), [saved], actor.id, today())[0] };
    },
  },
  rsvpResults: {
    who: "team",
    run: (request, actor, db) => {
      const form = formOf(db, request.formId);
      const roles = rolesFor(actor.badges);
      if (form.status !== "published" && !roles.lead) throw new OpsError("forbidden", "That form isn't published yet.");
      const event = events(db).get(form.eventId);
      if (!event) throw new OpsError("bad-request", "That form's event isn't on the calendar any more.");
      return { results: resultsFor(form, event, teamOf(db), answers(db).filter((a) => a.formId === form._id), roles.scheduler) };
    },
  },
  rsvpManage: { who: "lead", run: (_r, _a, db) => ({ rows: manageRows(forms(db), events(db), teamOf(db).length, today()) }) },
  rsvpSaveForm: {
    who: "lead",
    run: (request, actor, db) => {
      const input = (request.form ?? {}) as Record<string, unknown>;
      const before = input._id ? formOf(db, input._id) : null;
      const event = events(db).get(String(before?.eventId ?? input.eventId));
      const clean = plan(() => cleanForm({ ...input, eventId: before?.eventId ?? input.eventId }, event, today()));
      if (!before && forms(db).some((f) => f.eventId === clean.eventId)) throw new OpsError("bad-request", "That event already has a form.");
      if (before) {
        const gone = before.questions.filter((q) => !clean.questions.some((c) => c.id === q.id));
        if (gone.length && answers(db).some((a) => a.formId === before._id)) throw new OpsError("bad-request", "People have already answered, so a question can't be taken away. You can change its wording.");
      }
      const publishing = clean.status === "published" && before?.status !== "published";
      const saved = db.save<RsvpForm>(COLLECTION_FORMS, { ...(before ?? { finished: 0, asked: 0 }), ...clean, publishedAt: publishing ? new Date().toISOString() : (before?.publishedAt ?? "") } as RsvpForm);
      db.writeHistory(actor, { kind: "rsvp", id: saved._id }, before ? (publishing ? "published" : "updated") : "created", event?.title ?? "form");
      return { form: saved };
    },
  },
  rsvpRemind: {
    who: "lead",
    run: (request, _a, db) => {
      const form = formOf(db, request.formId);
      const event = events(db).get(form.eventId);
      if (!event || formState(form, event, today()) !== "open") throw new OpsError("bad-request", "Only a published form whose event hasn't ended can be reminded.");
      const done = new Set(answers(db).filter((a) => a.formId === form._id && a.complete).map((a) => a.memberId));
      return { sent: teamOf(db).filter((m) => !done.has(m.memberId)).length };
    },
  },
  rsvpGetSettings: { who: "lead", run: (_r, _a, db) => ({ settings: settingsOf(db) }) },
  rsvpSaveSettings: {
    who: "lead",
    run: (request, _a, db) => {
      const clean = plan(() => cleanSettings((request.settings ?? {}) as Record<string, unknown>));
      db.save(COLLECTION_SETTINGS, { ...(db.rows(COLLECTION_SETTINGS)[0] ?? {}), ...clean });
      return { settings: clean };
    },
  },
});

export type { MockActor };
