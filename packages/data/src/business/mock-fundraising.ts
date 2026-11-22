// Demo data for 1-2-3-100, and the demo versions of the server's actions (ops/server/fundraising.ts). They use the same
// rules (./fundraising.ts), so the demo behaves like the real thing. Names and numbers are made up.
import { mockActions, seedMock, type MockDb } from "../ops/mock";
import { OpsError, type Person } from "../ops/types";
import { addDays as shiftDay, today } from "../calendar/dates";
import {
  COLLECTION_CHOICES, COLLECTION_MERCH, COLLECTION_TEMPLATES, COLLECTION_PITCHES, COLLECTION_RESTAURANT, COLLECTION_SETTINGS, COLLECTION_STUDENT_GRANTS, FAR_MILES, MERCH_GOAL, REPLY_STATUS,
  cleanPitch, cleanRestaurant, cleanSale, cleanSettings, cleanStudentGrant, decide, defaultSettings, followUpsFor, grantPlanProblem, isApproved, isReply, merchTotal, pickOption,
  pitchPlanProblem, progressRows, restaurantDaysUsed, restaurantProblem, sendApproval, standingOf, statusDetail, type StudentRecords,
} from "./fundraising";
import { BizError, COLLECTION_GRANTS, COLLECTION_SPONSORS, cleanGrant, cleanSponsor, sameName, seasonLabel } from "./plan";
import { NO_APPROVAL, type Approval, type BizSettings, type Choice, type EmailTemplate, type MerchSale, type Pitch, type RestaurantDay, type Sponsor, type StudentGrant } from "./types";
import "./mock"; // the trackers' demo data comes first

const plan = <T>(step: () => T): T => {
  try {
    return step();
  } catch (e) {
    if (e instanceof BizError) throw new OpsError("bad-request", e.message);
    throw e;
  }
};

const season = () => seasonLabel(today());
const approved = (by = "Demo Lead"): Approval => ({ status: "approved", sentAt: "2026-11-01T10:00:00Z", decidedAt: "2026-11-02T10:00:00Z", by, note: "" });
const waiting = (): Approval => ({ status: "waiting", sentAt: "2026-11-09T10:00:00Z", decidedAt: "", by: "", note: "" });
const WORDS = "Los Al Robotics is a natural fit for the Discovery Cube: both of us inspire the next generation of innovators through science and technology, and many of our members first found STEM there. We have taken part in their Open House days for years, our members still talk about the exhibits that first made them curious about engineering, and we would love to help the next group of local kids find the same spark through the hands-on robotics demos our team runs at its own events every year.";

const PITCH_BODY = `Dear [Contact],

We are writing to request [Company]'s partnership with our student-led robotics team in this year's FIRST Robotics Competition (FRC). Los Al Robotics, known in competition as Team 6220 or the Golden Griffins, is a growing group of students based out of Los Alamitos High School who share a passion for Science, Technology, Engineering, and Mathematics (STEM), Business, and Marketing.

[Why this company fits us]

Each year, as we construct a new robot from scratch, the team uses a great deal of resources. We rely on gracious support, like materials and capital, from our sponsors. We would be grateful for any financial or in-kind support from [Company].

Our 501(c)(3) nonprofit status qualifies any of your contributions as tax-deductible (EIN 00-0000000). We would be happy to answer any questions you have by replying here.

Sincerely,
6220 [Your name] - [Your subteam]
Los Al Robotics / Golden Griffins / FRC Team 6220`;

seedMock((db) => {
  const here = season();
  const template = (order: number, name: string, subject: string, body: string) => db.save<EmailTemplate>(COLLECTION_TEMPLATES, { kind: "pitch", name, subject, body, order });
  template(1, "Main", "[Local?] Sponsorship Invitation - Los Al Robotics Team", PITCH_BODY);
  template(2, "Follow-up 1", "Following up: partnership with Los Al Robotics", "Dear [Contact],\n\nI hope this message finds you well. I wanted to follow up on our previous email regarding a potential partnership between [Company] and Los Al Robotics (FRC Team 6220).\n\nBest regards,\n6220 [Your name] - [Your subteam]");
  template(3, "Follow-up 2", "Checking in: Los Al Robotics sponsorship request", "Dear [Contact],\n\nI am writing to check in regarding our sponsorship request and to see if you had a chance to review our materials.\n\nSincerely,\n6220 [Your name] - [Your subteam]");
  db.save(COLLECTION_SETTINGS, { ...defaultSettings(here), deadline: shiftDay(today(), 56) });
  const choice = (memberId: string, option: Choice["option"], merchDone: Approval = NO_APPROVAL) => db.save<Choice>(COLLECTION_CHOICES, { season: here, memberId, option, merchDone, touchedAt: new Date().toISOString() });
  const pitch = (memberId: string, slot: number, p: Partial<Pitch>) =>
    db.save<Pitch>(COLLECTION_PITCHES, { season: here, memberId, slot, company: "", contactName: "", contactEmail: "", contactPhone: "", method: "email", why: WORDS, plan: NO_APPROVAL, visit: { date: "", who: "", what: "" }, template: "Main", sentOn: "", sentBy: "", followUps: [], reply: "none", result: { status: "", support: "", amount: "", tier: "", expires: false, endDate: "", followUpsDone: false, notes: "" }, resultApproval: NO_APPROVAL, trackerId: "", touchedAt: new Date().toISOString(), ...p });
  // The demo member is doing Sponsor pitches: Boeing is sent and waiting on a reply, a second plan has been approved.
  choice("demo-member", "sponsor");
  pitch("demo-member", 1, { company: "Boeing", contactName: "Bruce Wayne", contactEmail: "bruce@example.com", plan: approved(), sentOn: shiftDay(today(), -19), sentBy: "email", followUps: followUpsFor(shiftDay(today(), -19), 2) });
  pitch("demo-member", 2, { company: "Discovery Cube", contactName: "Mr. Adams", contactEmail: "outreach@example.com", plan: approved() });
  // The other demo people each try a different option: the lead a restaurant day, the mentor merch, the booster grants.
  choice("demo-lead", "restaurant");
  choice("demo-mentor", "merch");
  for (const [item, quantity, price, boughtBy, payment] of [["Team shirt", 1, 20, "Mr. Jones", ""], ["Hoodie", 1, 40, "Family member", ""], ["Custom: tote bag", 1, 5, "Friend", "Venmo"]] as const) {
    db.save<MerchSale>(COLLECTION_MERCH, { season: here, memberId: "demo-mentor", item, quantity, price: item === "Hoodie" ? 40 : price, boughtBy, date: shiftDay(today(), -7), payment });
  }
  choice("demo-booster", "grant");
  // Everyone else, in every standing, so Approvals and Everyone's status have something to show.
  const people = db.rows<Person>("ops_people");
  const by = (name: string) => people.find((p) => p.name.toLowerCase().includes(name))?.memberId ?? "";
  const ada = by("ada"), grace = by("grace"), nikola = by("nikola"), hedy = by("hedy");
  if (hedy) {
    choice(hedy, "grant");
    db.save<StudentGrant>(COLLECTION_STUDENT_GRANTS, { season: here, memberId: hedy, slot: 1, title: "PTSA Innovation Grant", organization: "LAHS PTSA", link: "", deadline: "Rolling", asking: "A pit workbench", amount: "986.15 + 78.89 tax", notes: "Should the tax go in the amount, or as its own line?", application: { id: "f-app", name: "ptsa-application.pdf", size: 240000 }, plan: waiting(), submittedOn: "", finalFile: null, resultNotes: "", result: NO_APPROVAL, trackerId: "", touchedAt: "2026-11-09T10:00:00Z" });
  }
  if (nikola) {
    choice(nikola, "restaurant");
    db.save<RestaurantDay>(COLLECTION_RESTAURANT, { season: here, memberId: nikola, restaurant: "Chipotle", partner: "Hedy", date: shiftDay(today(), 12), allDay: true, startTime: "", endTime: "", address: "100 Main St, Los Alamitos", miles: 3.8, link: "", notes: "", plan: waiting(), flyer: null, proof: null, setupNotes: "", setUp: false, touchedAt: "2026-11-12T10:00:00Z" });
  }
  if (ada) {
    choice(ada, "merch", waiting());
    for (const [item, quantity, price, boughtBy] of [["Team shirt", 1, 20, "Mr. Jones"], ["Hoodie", 2, 40, "family"]] as const) db.save<MerchSale>(COLLECTION_MERCH, { season: here, memberId: ada, item, quantity, price, boughtBy, date: shiftDay(today(), -5), payment: "Venmo" });
  }
  if (grace) {
    choice(grace, "sponsor");
    pitch(grace, 1, { company: "Raytheon", contactName: "Pat Kim", contactEmail: "pat@example.com", plan: approved(), sentOn: shiftDay(today(), -30), sentBy: "email", reply: "money", result: { status: "money", support: "Sponsorship (money)", amount: "1,500", tier: "Eagle", expires: false, endDate: "", followUpsDone: true, notes: "" }, resultApproval: waiting() });
  }
});

// ----- the demo backend's actions -----

const q = <T>(db: MockDb, collection: string) => db.rows(collection) as unknown as (T & { _id: string })[];
const mineIn = <T extends { memberId: string; season: string }>(rows: T[], memberId: string) => rows.filter((r) => r.memberId === memberId && r.season === season());
const settingsOf = (db: MockDb): BizSettings => (q<BizSettings>(db, COLLECTION_SETTINGS).find((s) => s.season === season()) ?? ({ ...defaultSettings(season()), _id: "" } as BizSettings));
const teamOf = (db: MockDb) => db.rows<Person>("ops_people").filter((p) => (db.badges.get(p.memberId) ?? []).includes("Team Member")).map((p) => ({ memberId: p.memberId, name: p.name, subteams: p.subteams }));
const nameOf = (db: MockDb, memberId: string) => db.rows<Person>("ops_people").find((p) => p.memberId === memberId)?.name ?? "A student";

function recordsOf(db: MockDb, memberId: string): StudentRecords {
  return {
    choice: mineIn(q<Choice>(db, COLLECTION_CHOICES), memberId)[0] ?? null, restaurant: mineIn(q<RestaurantDay>(db, COLLECTION_RESTAURANT), memberId), grants: mineIn(q<StudentGrant>(db, COLLECTION_STUDENT_GRANTS), memberId),
    pitches: mineIn(q<Pitch>(db, COLLECTION_PITCHES), memberId), sales: mineIn(q<MerchSale>(db, COLLECTION_MERCH), memberId),
  };
}

const KINDS = { restaurant: COLLECTION_RESTAURANT, grant: COLLECTION_STUDENT_GRANTS, pitch: COLLECTION_PITCHES } as const;
type Kind = keyof typeof KINDS;
const kindOf = (value: unknown): Kind => {
  if (typeof value === "string" && Object.hasOwn(KINDS, value)) return value as Kind;
  throw new OpsError("bad-request", "Unknown kind.");
};
const OPTION_FOR = { restaurant: "restaurant", grant: "grant", pitch: "sponsor" } as const;
const SLOTS = { restaurant: 1, grant: 2, pitch: 3 } as const;
const BLANK: Record<Kind, Record<string, unknown>> = {
  restaurant: { restaurant: "", partner: "", date: "", allDay: false, startTime: "", endTime: "", address: "", miles: 0, link: "", notes: "", plan: NO_APPROVAL, flyer: null, proof: null, setupNotes: "", setUp: false },
  grant: { title: "", organization: "", link: "", deadline: "", asking: "", amount: "", notes: "", application: null, plan: NO_APPROVAL, submittedOn: "", finalFile: null, resultNotes: "", result: NO_APPROVAL, trackerId: "" },
  pitch: { company: "", contactName: "", contactEmail: "", contactPhone: "", method: "email", why: "", plan: NO_APPROVAL, visit: { date: "", who: "", what: "" }, template: "", sentOn: "", sentBy: "", followUps: [], reply: "none", result: { status: "", support: "", amount: "", tier: "", expires: false, endDate: "", followUpsDone: false, notes: "" }, resultApproval: NO_APPROVAL, trackerId: "" },
};

function ownRow(db: MockDb, kind: Kind, id: unknown, memberId: string): Record<string, any> & { _id: string } {
  const row = q<Record<string, any>>(db, KINDS[kind]).find((r) => r._id === id);
  if (!row) throw new OpsError("bad-request", "That item doesn't exist any more. Reload the page.");
  if (row.memberId !== memberId) throw new OpsError("forbidden", "That isn't yours.");
  return row;
}

function syncSponsor(db: MockDb, pitch: Pitch, studentName: string, fields: Partial<Sponsor>): string {
  const here = season();
  const found = q<Sponsor>(db, COLLECTION_SPONSORS).find((s) => s.season === here && sameName(s.company, pitch.company));
  if (found) return db.save<Sponsor>(COLLECTION_SPONSORS, { ...found, ...cleanSponsor(fields, found, here) })._id;
  const contact = [pitch.contactName, pitch.contactEmail, pitch.contactPhone].filter(Boolean).join(" · ");
  return db.save<Sponsor>(COLLECTION_SPONSORS, { ...cleanSponsor({ company: pitch.company, studentContact: studentName, contact, ...fields }, null, here), createdAt: new Date().toISOString() } as Sponsor)._id;
}

const RESULT_TO_STATUS: Record<string, string> = { pending: "2. Pending", discussing: "3. Discussing", accepted: "4. Accepted", declined: "4. Declined", money: "5. Received monetary", inkind: "5. Received in-kind" };

mockActions({
  bizMy: {
    who: "team",
    run: (_r, actor, db) => {
      const records = recordsOf(db, actor.id);
      return { settings: settingsOf(db), records, rows: progressRows(records, today()), restaurantUsed: restaurantDaysUsed(q<RestaurantDay>(db, COLLECTION_RESTAURANT).filter((d) => d.season === season())) };
    },
  },
  bizPick: {
    who: "team",
    run: (request, actor, db) => {
      const r = recordsOf(db, actor.id);
      const hasApproved = r.restaurant.some((d) => isApproved(d.plan)) || r.grants.some((g) => isApproved(g.plan)) || r.pitches.some((p) => isApproved(p.plan));
      const option = plan(() => pickOption(request.option, r.choice, hasApproved || r.sales.length > 0));
      return { choice: db.save<Choice>(COLLECTION_CHOICES, { ...(r.choice ?? { season: season(), memberId: actor.id, merchDone: NO_APPROVAL }), option, touchedAt: new Date().toISOString() } as Choice) };
    },
  },
  bizItemSave: {
    who: "team",
    run: (request, actor, db) => {
      const kind = kindOf(request.kind);
      const fields = (request.fields ?? {}) as Record<string, unknown>;
      const before = request.id ? ownRow(db, kind, request.id, actor.id) : null;
      if (recordsOf(db, actor.id).choice?.option !== OPTION_FOR[kind]) throw new OpsError("bad-request", "Pick that option first on My 1-2-3-100.");
      const clean = plan(() => (kind === "restaurant" ? cleanRestaurant(fields, before as unknown as RestaurantDay | null) : kind === "grant" ? cleanStudentGrant(fields, before as unknown as StudentGrant | null) : cleanPitch(fields, before as unknown as Pitch | null)));
      let row: Record<string, unknown>;
      if (before) row = { ...before, ...clean };
      else {
        const slot = Math.floor(Number(request.slot ?? 1));
        if (!(slot >= 1 && slot <= SLOTS[kind])) throw new OpsError("bad-request", "That is more than you need to do.");
        if (mineIn(q<{ memberId: string; season: string; slot: number }>(db, KINDS[kind]), actor.id).some((x) => x.slot === slot)) throw new OpsError("bad-request", "You already started that one.");
        row = { season: season(), memberId: actor.id, slot, ...BLANK[kind], ...clean };
      }
      return { item: db.save(KINDS[kind], { ...row, touchedAt: new Date().toISOString() } as never) };
    },
  },
  bizItemSend: {
    who: "team",
    run: (request, actor, db) => {
      const kind = kindOf(request.kind);
      const row = ownRow(db, kind, request.id, actor.id);
      const at = new Date().toISOString();
      const settings = settingsOf(db);
      if (kind === "restaurant") {
        if (request.step === "setup") {
          if (!isApproved(row.plan)) throw new OpsError("bad-request", "Wait for Operations to approve step 1.");
          if (!row.flyer || !row.proof) throw new OpsError("bad-request", "Upload the flyer and your proof that you contacted the restaurant.");
          row.setUp = true;
        } else {
          const problem = restaurantProblem(row as RestaurantDay);
          if (problem) throw new OpsError("bad-request", problem);
          if (restaurantDaysUsed(q<RestaurantDay>(db, COLLECTION_RESTAURANT).filter((d) => d.season === season())) >= settings.restaurantLimit) throw new OpsError("bad-request", `All ${settings.restaurantLimit} restaurant days this year are taken. Pick something else.`);
          row.plan = plan(() => sendApproval(row.plan, at));
        }
      } else if (kind === "grant") {
        if (request.step === "result") {
          if (!isApproved(row.plan)) throw new OpsError("bad-request", "Wait for Operations to approve step 1.");
          if (!row.submittedOn || !row.finalFile) throw new OpsError("bad-request", "Type the date you submitted it and upload the submitted application.");
          row.result = plan(() => sendApproval(row.result, at));
        } else {
          const problem = grantPlanProblem(row as StudentGrant);
          if (problem) throw new OpsError("bad-request", problem);
          row.plan = plan(() => sendApproval(row.plan, at));
        }
      } else if (request.step === "result") {
        if (!row.sentOn && !row.visit.date) throw new OpsError("bad-request", "Say you sent it first.");
        row.resultApproval = plan(() => sendApproval(row.resultApproval, at));
      } else {
        const problem = pitchPlanProblem(row as Pitch, settings.minWords);
        if (problem) throw new OpsError("bad-request", problem);
        row.plan = plan(() => sendApproval(row.plan, at));
      }
      return { item: db.save(KINDS[kind], { ...row, touchedAt: at } as never) };
    },
  },
  bizAttach: {
    who: "team",
    run: (request, actor, db) => {
      const kind = kindOf(request.kind);
      const row = ownRow(db, kind, request.id, actor.id);
      const field = String(request.field);
      if (!["flyer", "proof", "application", "finalFile"].includes(field)) throw new OpsError("bad-request", "That isn't a place for a file.");
      const size = Math.floor((String(request.data ?? "").length * 3) / 4);
      return { item: db.save(KINDS[kind], { ...row, [field]: { id: `demo-${Date.now()}`, name: String(request.name ?? "file"), size }, touchedAt: new Date().toISOString() } as never) };
    },
  },
  bizFile: { who: "team", run: () => ({ name: "demo.pdf", mime: "text/plain", data: btoa("This is a demo file. Real files open from the team's Drive folder.") }) },
  bizPitchSent: {
    who: "team",
    run: (request, actor, db) => {
      const p = ownRow(db, "pitch", request.id, actor.id) as unknown as Pitch;
      if (!isApproved(p.plan)) throw new OpsError("bad-request", "Wait for Operations to approve your plan.");
      const sentOn = typeof request.sentOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(request.sentOn) ? request.sentOn : today();
      const saved = db.save<Pitch>(COLLECTION_PITCHES, { ...p, sentOn, sentBy: String(request.sentBy ?? "email"), followUps: p.method === "email" ? followUpsFor(sentOn, settingsOf(db).followUps) : [], reply: "none", touchedAt: new Date().toISOString() });
      syncSponsor(db, p, actor.name, { status: "2. Pending" });
      return { item: saved };
    },
  },
  bizPitchReply: {
    who: "team",
    run: (request, actor, db) => {
      const p = ownRow(db, "pitch", request.id, actor.id) as unknown as Pitch;
      if (!p.sentOn) throw new OpsError("bad-request", "Say you sent it first.");
      if (!isReply(request.reply)) throw new OpsError("bad-request", "Pick one of the answers.");
      syncSponsor(db, p, actor.name, { status: REPLY_STATUS[request.reply] as Sponsor["status"] });
      return { item: db.save<Pitch>(COLLECTION_PITCHES, { ...p, reply: request.reply, touchedAt: new Date().toISOString() }) };
    },
  },
  bizFollowUpSent: {
    who: "team",
    run: (request, actor, db) => {
      const p = ownRow(db, "pitch", request.id, actor.id) as unknown as Pitch;
      return { item: db.save<Pitch>(COLLECTION_PITCHES, { ...p, followUps: p.followUps.map((f) => (f.n === Number(request.n) ? { ...f, sentOn: today() } : f)) }) };
    },
  },
  bizMerchAdd: {
    who: "team",
    run: (request, actor, db) => {
      if (recordsOf(db, actor.id).choice?.option !== "merch") throw new OpsError("bad-request", "Pick Merch first on My 1-2-3-100.");
      const clean = plan(() => cleanSale((request.sale ?? {}) as Record<string, unknown>, today()));
      return { sale: db.save<MerchSale>(COLLECTION_MERCH, { season: season(), memberId: actor.id, ...clean } as MerchSale) };
    },
  },
  bizMerchRemove: {
    who: "team",
    run: (request, actor, db) => {
      const sale = q<MerchSale>(db, COLLECTION_MERCH).find((s) => s._id === request.id);
      if (!sale || sale.memberId !== actor.id) throw new OpsError("forbidden", "That isn't yours.");
      if (recordsOf(db, actor.id).choice && isApproved(recordsOf(db, actor.id).choice!.merchDone)) throw new OpsError("bad-request", "Operations already confirmed you're done.");
      db.remove(COLLECTION_MERCH, sale._id);
      return {};
    },
  },
  bizMerchDone: {
    who: "team",
    run: (_r, actor, db) => {
      const r = recordsOf(db, actor.id);
      if (r.choice?.option !== "merch") throw new OpsError("bad-request", "Pick Merch first.");
      if (merchTotal(r.sales) < MERCH_GOAL) throw new OpsError("bad-request", `Sell $${MERCH_GOAL} first (you have $${merchTotal(r.sales)}).`);
      return { choice: db.save<Choice>(COLLECTION_CHOICES, { ...r.choice, merchDone: plan(() => sendApproval(r.choice!.merchDone, new Date().toISOString())) }) };
    },
  },
  bizApprovals: {
    who: "business",
    run: (_r, _a, db) => {
      const here = season();
      const row = (kind: string, d: { _id: string; memberId: string }, step: string, a: Approval, option: string, what: string) =>
        a.status === "draft" ? [] : [{ kind, id: d._id, step, memberId: d.memberId, student: nameOf(db, d.memberId), option, what, sentAt: a.sentAt, status: a.status }];
      const rows = [
        ...q<RestaurantDay>(db, COLLECTION_RESTAURANT).filter((d) => d.season === here).flatMap((d) => row("restaurant", d, "plan", d.plan, "Restaurant day", `${d.restaurant}, ${d.date}`)),
        ...q<StudentGrant>(db, COLLECTION_STUDENT_GRANTS).filter((g) => g.season === here).flatMap((g) => [...row("grant", g, "plan", g.plan, "Grants", g.title), ...row("grant", g, "result", g.result, "Grants", g.title)]),
        ...q<Pitch>(db, COLLECTION_PITCHES).filter((p) => p.season === here).flatMap((p) => [...row("pitch", p, "plan", p.plan, "Sponsor pitches", p.company), ...row("pitch", p, "result", p.resultApproval, "Sponsor pitches", p.company)]),
        ...q<Choice>(db, COLLECTION_CHOICES).filter((c) => c.season === here).flatMap((c) => row("merch", c, "done", c.merchDone, "Merch", `$${MERCH_GOAL} sold`)),
      ].sort((a, b) => b.sentAt.localeCompare(a.sentAt));
      const settings = settingsOf(db);
      return { rows, restaurantUsed: restaurantDaysUsed(q<RestaurantDay>(db, COLLECTION_RESTAURANT).filter((d) => d.season === here)), restaurantLimit: settings.restaurantLimit };
    },
  },
  bizReview: {
    who: "business",
    run: (request, _a, db) => {
      const collection = request.kind === "merch" ? COLLECTION_CHOICES : KINDS[kindOf(request.kind)];
      const item = (db.rows(collection) as unknown as Record<string, any>[]).find((r) => r._id === request.id);
      if (!item) throw new OpsError("bad-request", "That item doesn't exist any more. Reload the page.");
      const records = recordsOf(db, item.memberId);
      return { item, student: nameOf(db, item.memberId), records, rows: progressRows(records, today()), settings: settingsOf(db) };
    },
  },
  bizDecide: {
    who: "bizApprover",
    run: (request, actor, db) => {
      const kind = request.kind === "merch" ? "merch" : kindOf(request.kind);
      const collection = kind === "merch" ? COLLECTION_CHOICES : KINDS[kind];
      const row = (db.rows(collection) as unknown as Record<string, any>[]).find((r) => r._id === request.id);
      if (!row) throw new OpsError("bad-request", "That item doesn't exist any more. Reload the page.");
      const field = kind === "merch" ? "merchDone" : kind === "pitch" && request.step === "result" ? "resultApproval" : request.step === "result" ? "result" : "plan";
      const decided = plan(() => decide(row[field], request.decision, actor.name, request.note, new Date().toISOString()));
      row[field] = decided;
      const student = nameOf(db, row.memberId);
      if (decided.status === "approved" && kind === "pitch") {
        row.trackerId = request.step === "result"
          ? syncSponsor(db, row as Pitch, student, { status: (RESULT_TO_STATUS[row.result.status] ?? "2. Pending") as Sponsor["status"], support: row.result.support, amount: row.result.amount.replace(/^\$/, ""), tier: row.result.tier, notes: row.result.notes })
          : syncSponsor(db, row as Pitch, student, { status: "1. Request in progress" });
      }
      if (decided.status === "approved" && kind === "grant" && request.step === "result") {
        row.trackerId = db.save(COLLECTION_GRANTS, { ...cleanGrant({ title: row.title, organization: row.organization, link: row.link, writer: student, status: "2. Submitted", deadline: row.deadline, notes: row.resultNotes }, null, season()), prior: false, sponsored: false, createdAt: new Date().toISOString() } as never)._id;
      }
      return { item: db.save(collection, { ...row, touchedAt: new Date().toISOString() } as never) };
    },
  },
  bizStatus: {
    who: "business",
    run: (_r, _a, db) => {
      const settings = settingsOf(db);
      const exempt = new Set(settings.exempt.map((e) => e.memberId));
      const rows = teamOf(db).map((m) => {
        const r = recordsOf(db, m.memberId);
        const touched = [r.choice, ...r.restaurant, ...r.grants, ...r.pitches].map((x) => String((x as { touchedAt?: string } | null)?.touchedAt ?? "")).sort().pop() ?? "";
        return { memberId: m.memberId, name: m.name, subteams: m.subteams, option: r.choice?.option ?? "", standing: exempt.has(m.memberId) ? "exempt" : standingOf(r), detail: statusDetail(r), lastActivity: touched };
      });
      return { deadline: settings.deadline, exempt: settings.exempt, rows };
    },
  },
  bizRemind: {
    who: "bizApprover",
    run: (request, actor, db) => {
      const ask = Array.isArray(request.memberIds) ? new Set(request.memberIds.map(String)) : null;
      const settings = settingsOf(db);
      const exempt = new Set(settings.exempt.map((e) => e.memberId));
      void actor;
      return { sent: teamOf(db).filter((m) => !exempt.has(m.memberId) && standingOf(recordsOf(db, m.memberId)) !== "done" && (!ask || ask.has(m.memberId))).length };
    },
  },
  bizTemplates: { who: "team", run: (_r, _a, db) => ({ templates: q<EmailTemplate>(db, COLLECTION_TEMPLATES).sort((a, b) => a.order - b.order), cc: settingsOf(db).pitchCc }) },
  bizGetSettings: { who: "team", run: (_r, _a, db) => ({ settings: settingsOf(db) }) },
  bizSaveSettings: {
    who: "lead",
    run: (request, _a, db) => {
      const before = settingsOf(db);
      const clean = plan(() => cleanSettings((request.settings ?? {}) as Record<string, unknown>, before));
      return { settings: db.save<BizSettings>(COLLECTION_SETTINGS, { ...before, ...clean } as BizSettings) };
    },
  },
  bizDistance: {
    who: "team",
    run: (request) => {
      const address = String(request.address ?? "").trim();
      if (address.length < 6) throw new OpsError("bad-request", "Type the whole address.");
      const away = /far|7\.|riverside/i.test(address) ? 7.2 : 3.8;
      return { miles: away, far: away > FAR_MILES };
    },
  },
});

