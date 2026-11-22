// Demo data for Business: a season of sponsors and grants (and last season's, so Import has something), plus the demo
// versions of the server's actions, which use the same plan.ts. Numbers and names are made up.
import { mockActions, seedMock, type MockDb } from "../ops/mock";
import { rolesFor } from "../ops/roles";
import { OpsError, type ApiRequest } from "../ops/types";
import { today } from "../calendar/dates";
import { BizError, COLLECTION_GRANTS, COLLECTION_SPONSORS, cleanGrant, cleanSponsor, importGrants, importSponsors, priorGrantTitles, priorNames, publicGrant, publicSponsor, sameName, seasonLabel, statsFor } from "./plan";
import type { Grant, Sponsor } from "./types";

const plan = <T>(step: () => T): T => {
  try {
    return step();
  } catch (e) {
    if (e instanceof BizError) throw new OpsError("bad-request", e.message);
    throw e;
  }
};

const lastSeason = () => `${Number(seasonLabel(today()).slice(0, 4)) - 1}–${seasonLabel(today()).slice(0, 4).slice(2)}`;

seedMock((db) => {
  const season = seasonLabel(today());
  const last = lastSeason();
  const sponsor = (s: Partial<Sponsor> & Pick<Sponsor, "company">, when = season) =>
    db.save<Sponsor>(COLLECTION_SPONSORS, { season: when, studentContact: "", contact: "", status: "0. Needs research", support: "", amount: "", notes: "", tier: "", prior: false, createdAt: new Date().toISOString(), ...s });
  sponsor({ company: "Discovery Cube", studentContact: "Maya Chen", contact: "Jordan Lee · jordan@example.com · (555) 010-0101", status: "3. Discussing", notes: "Interested in a workshop visit." });
  sponsor({ company: "Boeing", studentContact: "Sam", contact: "Bruce Wayne · bruce@example.com · (555) 010-0102", status: "5. Received monetary", support: "Sponsorship (money)", amount: "3,000", tier: "Griffin", prior: true });
  sponsor({ company: "Raytheon", studentContact: "Ada", contact: "Pat Kim · pat@example.com", status: "5. Received monetary", support: "Sponsorship (money)", amount: "1,500", tier: "Eagle", prior: true });
  sponsor({ company: "Wix Website", contact: "Sam Ortiz · sam@example.com", status: "5. Received in-kind", support: "In-kind", amount: "Website hosting", tier: "Lion" });
  sponsor({ company: "Local Pizza Co.", studentContact: "Priya", status: "2. Pending", contact: "orders@example.com" });
  sponsor({ company: "Acme Machining", status: "0. Needs research" });
  sponsor({ company: "Boeing", status: "5. Received monetary", amount: "2,500", tier: "Griffin", support: "Sponsorship (money)" }, last);
  sponsor({ company: "Wix Website", status: "5. Received in-kind", amount: "Website hosting", tier: "Lion", support: "In-kind" }, last);
  sponsor({ company: "Old Tool Supply", status: "4. Declined", contact: "Lou", notes: "Not sponsoring this year." }, last);
  const grant = (g: Partial<Grant> & Pick<Grant, "title">, when = season) =>
    db.save<Grant>(COLLECTION_GRANTS, { season: when, organization: "", link: "", writer: "", status: "0. Needs research", deadline: "Rolling", amount: "", notes: "", questions: "", prior: false, sponsored: false, kind: "", createdAt: new Date().toISOString(), ...g });
  grant({ title: "PTSA Innovation Grant", organization: "LAHS PTSA", link: "https://example.com/ptsa", writer: "Hedy", status: "1. Applying", amount: "986.15 + 78.89 tax" });
  grant({ title: "SWYFT Robotics", organization: "SWYFT", writer: "Ada", status: "2. Submitted", deadline: "Jan 17, 2027" });
  grant({ title: "REV Robotics", organization: "REV Robotics", status: "5. Received", amount: "1,000", writer: "Nikola" });
  grant({ title: "Community Grant Program", organization: "City of Encinitas", notes: "Check eligibility." });
  grant({ title: "REV Robotics", organization: "REV Robotics", status: "5. Received", amount: "1,000" }, last);
});

const sponsors = (db: MockDb) => db.rows<Sponsor>(COLLECTION_SPONSORS);
const grants = (db: MockDb) => db.rows<Grant>(COLLECTION_GRANTS);
const seasonOf = (request: ApiRequest) => (typeof request.season === "string" && /^\d{4}–\d{2}$/.test(request.season) ? request.season : seasonLabel(today()));
const seasonsOf = (rows: { season: string }[]) => [...new Set([seasonLabel(today()), ...rows.map((r) => r.season)])].sort().reverse();
const byName = (a: { company?: string; title?: string }, b: { company?: string; title?: string }) => (a.company ?? a.title ?? "").localeCompare(b.company ?? b.title ?? "");
const find = <T extends { _id: string }>(rows: T[], id: unknown, what: string): T => {
  const row = rows.find((r) => r._id === id);
  if (!row) throw new OpsError("bad-request", `That ${what} doesn't exist any more. Reload the page.`);
  return row;
};

mockActions({
  bizSponsors: {
    who: "team",
    run: (request, actor, db) => {
      const here = seasonOf(request);
      const rows = sponsors(db).filter((s) => s.season === here).sort(byName);
      const full = rolesFor(actor.badges).business;
      return { season: here, seasons: seasonsOf(sponsors(db)), full, rows: full ? rows : rows.map(publicSponsor) };
    },
  },
  bizAddSponsor: {
    who: "team",
    run: (request, actor, db) => {
      const input = (request.sponsor ?? {}) as Record<string, unknown>;
      const here = seasonLabel(today());
      const clean = plan(() => cleanSponsor({ company: input.company, studentContact: input.studentContact, contact: input.contact }, null, here));
      if (sponsors(db).some((s) => s.season === here && sameName(s.company, clean.company))) throw new OpsError("bad-request", `${clean.company} is already on the tracker.`);
      const saved = db.save<Sponsor>(COLLECTION_SPONSORS, { ...clean, prior: priorNames(sponsors(db), here).some((p) => sameName(p, clean.company)), createdAt: new Date().toISOString() } as Sponsor);
      return { sponsor: rolesFor(actor.badges).business ? saved : publicSponsor(saved) };
    },
  },
  bizSaveSponsor: {
    who: "business",
    run: (request, _a, db) => {
      const input = (request.sponsor ?? {}) as Record<string, unknown>;
      const before = find(sponsors(db), input._id, "company");
      return { sponsor: db.save<Sponsor>(COLLECTION_SPONSORS, { ...before, ...plan(() => cleanSponsor(input, before, before.season)) }) };
    },
  },
  bizImportSponsors: {
    who: "business",
    run: (request, _a, db) => {
      const here = seasonLabel(today());
      const rows = importSponsors(sponsors(db).filter((s) => s.season === request.from), sponsors(db).filter((s) => s.season === here), sponsors(db), here);
      for (const r of rows) db.save<Sponsor>(COLLECTION_SPONSORS, { ...r, createdAt: new Date().toISOString() } as Sponsor);
      return { added: rows.length };
    },
  },
  bizGrants: {
    who: "team",
    run: (request, actor, db) => {
      const here = seasonOf(request);
      const rows = grants(db).filter((g) => g.season === here).sort(byName);
      const full = rolesFor(actor.badges).business;
      return { season: here, seasons: seasonsOf(grants(db)), full, rows: full ? rows : rows.map(publicGrant) };
    },
  },
  bizAddGrant: {
    who: "team",
    run: (request, actor, db) => {
      const input = (request.grant ?? {}) as Record<string, unknown>;
      const here = seasonLabel(today());
      const clean = plan(() => cleanGrant({ title: input.title, link: input.link }, null, here));
      if (grants(db).some((g) => g.season === here && sameName(g.title, clean.title))) throw new OpsError("bad-request", `${clean.title} is already on the tracker.`);
      const saved = db.save<Grant>(COLLECTION_GRANTS, { ...clean, prior: priorGrantTitles(grants(db), here).some((p) => sameName(p, clean.title)), createdAt: new Date().toISOString() } as Grant);
      return { grant: rolesFor(actor.badges).business ? saved : publicGrant(saved) };
    },
  },
  bizSaveGrant: {
    who: "business",
    run: (request, _a, db) => {
      const input = (request.grant ?? {}) as Record<string, unknown>;
      const before = find(grants(db), input._id, "grant");
      return { grant: db.save<Grant>(COLLECTION_GRANTS, { ...before, ...plan(() => cleanGrant(input, before, before.season)) }) };
    },
  },
  bizImportGrants: {
    who: "business",
    run: (request, _a, db) => {
      const here = seasonLabel(today());
      const rows = importGrants(grants(db).filter((g) => g.season === request.from), grants(db).filter((g) => g.season === here), grants(db), here);
      for (const r of rows) db.save<Grant>(COLLECTION_GRANTS, { ...r, createdAt: new Date().toISOString() } as Grant);
      return { added: rows.length };
    },
  },
  bizGrantToSponsor: {
    who: "business",
    run: (request, _a, db) => {
      const grant = find(grants(db), request.grantId, "grant");
      if (grant.status !== "5. Received") throw new OpsError("bad-request", "Only a received grant can be added to the Sponsor tracker.");
      const name = grant.organization || grant.title;
      const here = seasonLabel(today());
      if (sponsors(db).some((s) => s.season === here && sameName(s.company, name))) throw new OpsError("bad-request", `${name} is already on the Sponsor tracker.`);
      const clean = plan(() => cleanSponsor({ company: name, status: "5. Received monetary", support: "Sponsorship (money)", amount: grant.amount, notes: `Received through ${grant.title}` }, null, here));
      const sponsor = db.save<Sponsor>(COLLECTION_SPONSORS, { ...clean, prior: priorNames(sponsors(db), here).some((p) => sameName(p, name)), createdAt: new Date().toISOString() } as Sponsor);
      db.save<Grant>(COLLECTION_GRANTS, { ...grant, sponsored: true });
      return { sponsor };
    },
  },
  bizStats: { who: "team", run: (request, _a, db) => ({ stats: statsFor(seasonOf(request), sponsors(db), grants(db)), seasons: seasonsOf([...sponsors(db), ...grants(db)]) }) },
});
