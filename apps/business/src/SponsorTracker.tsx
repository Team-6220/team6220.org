// /apps/business/sponsor-tracker: every company we are asking for support, and how far along it is. Everyone on the team
// sees the company, its stage and the student contact (so two people never pitch the same company); Operations, leads,
// mentors and boosters also see contacts, amounts and notes, and click any text to change it.
import { useEffect, useMemo, useState } from "react";
import { business, type Me, type Sponsor, type SponsorPublic } from "@team6220/data";
import { Btn, DataTable, Field, Fields, Icon, Note, PageHeader, Screen, StatusChip, Tabs, Toggle, type Column } from "@team6220/ui";
import { EditChoice, EditMoney, EditText, ExportMenu, Fold, PeopleList, PrivateNote, SPONSOR_OPTIONS, SeasonPicker, savedSeason, Stages } from "./shared";

type Row = Sponsor | SponsorPublic;
const isFull = (r: Row): r is Sponsor => "contact" in r;

const STAGE_NOTES = ["Find who to write to", "Writing the pitch", "Sent. Waiting for a reply", "They replied", "Accepted or declined", "Money or in-kind"];

/** "a lead", "in Operations", "a mentor": why this person sees the private columns. */
function whyYouSee(me: Me): string {
  if (me.roles.lead) return "a lead";
  if (me.roles.approver) return me.badges.includes("Mentor") ? "a mentor" : "a booster";
  return "in Operations";
}

export function SponsorTracker({ me }: { me: Me }) {
  const canEdit = me.roles.business;
  const [list, setList] = useState<business.SponsorList | null>(null);
  const [season, setSeason] = useState<string | undefined>();
  const [stage, setStage] = useState("all");
  const [wrap, setWrap] = useState(false);
  const [error, setError] = useState("");
  const [add, setAdd] = useState({ company: "", contact: "" });
  const [importFrom, setImportFrom] = useState("");
  const [note, setNote] = useState("");

  const load = (s?: string) => business.sponsors(s).then((l) => { setList(l); setSeason(l.season); }, (e) => setError(e instanceof Error ? e.message : "We couldn't load the tracker."));
  useEffect(() => void load(savedSeason()), []);

  const rows = list?.rows ?? [];
  const shown = stage === "all" ? rows : rows.filter((r) => business.stageOf(r.status) === Number(stage));
  const counts = useMemo(() => [0, 1, 2, 3, 4, 5].map((n) => rows.filter((r) => business.stageOf(r.status) === n).length), [rows]);

  const change = async (row: Row, fields: Partial<Sponsor>) => {
    setError("");
    try {
      const saved = await business.saveSponsor({ _id: row._id, ...fields });
      setList((l) => l && { ...l, rows: l.rows.map((r) => (r._id === saved._id ? saved : r)) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save. Try again.");
      void load(season);
    }
  };

  const addCompany = async () => {
    setError("");
    setNote("");
    try {
      await business.addSponsor(add);
      setAdd({ company: "", contact: "" });
      await load(season);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save. Try again.");
    }
  };

  const columns: Column<Row>[] = [
    { key: "company", label: "Company", width: "minmax(0, 1.3fr)", menu: ["text"], render: (r) => (
      <span className="biz-company">
        {canEdit && isFull(r) ? <EditText value={r.company} label="Company" onSave={(company) => change(r, { company })} /> : <strong>{r.company}</strong>}
        {r.prior && <span className="k-hint biz-prior">Prior sponsor</span>}
      </span>
    ) },
    { key: "studentContact", label: "Student contact", width: "130px", menu: ["text"], render: (r) => canEdit ? <EditText value={r.studentContact} label="Student contact" list="biz-people" placeholder="Type a name" onSave={(studentContact) => change(r, { studentContact })} /> : r.studentContact || <span className="k-hint">None yet</span> },
    ...(canEdit ? [
      { key: "contact", label: "Contact", width: "minmax(0, 1.4fr)", menu: ["text"], value: (r: Row) => (isFull(r) ? r.contact : ""), render: (r: Row) => isFull(r) ? <span className="biz-private"><Icon name="lock" inline /><EditText value={r.contact} label="Contact" multiline placeholder="Name, email, phone" onSave={(contact) => change(r, { contact })} /></span> : null },
    ] as Column<Row>[] : []),
    { key: "status", label: "Status", width: "210px", menu: ["group"], divider: true, render: (r) => <StatusChip value={r.status} options={SPONSOR_OPTIONS} label={`${r.company} status`} onChange={canEdit ? (status) => change(r, { status: status as Sponsor["status"] }) : undefined} /> },
    ...(canEdit ? [
      { key: "support", label: "Type of support", width: "170px", menu: ["group"], divider: true, render: (r: Row) => isFull(r) ? <EditChoice value={r.support} label="Type of support" options={business.SUPPORT_TYPES} onSave={(support) => change(r, { support: support as Sponsor["support"] })} /> : null },
      { key: "amount", label: "Amount or details", width: "minmax(0, 1fr)", menu: ["text"], render: (r: Row) => isFull(r) ? <EditMoney value={r.amount} label="Amount or details" onSave={(amount) => change(r, { amount })} /> : null },
      { key: "notes", label: "Notes", width: "minmax(0, 1.5fr)", menu: ["text"], divider: true, render: (r: Row) => isFull(r) ? <EditText value={r.notes} label="Notes" multiline placeholder="Add a note" onSave={(notes) => change(r, { notes })} /> : null },
      { key: "tier", label: "Tier", width: "100px", menu: ["group"], render: (r: Row) => isFull(r) ? <EditChoice value={r.tier} label="Tier" options={business.TIERS} onSave={(tier) => change(r, { tier: tier as Sponsor["tier"] })} /> : null },
    ] as Column<Row>[] : []),
  ];

  const exportRows = () => [
    ["Company", "Student contact", ...(canEdit ? ["Contact"] : []), "Status", ...(canEdit ? ["Type of support", "Amount or details", "Notes", "Tier"] : [])],
    ...shown.map((r) => [r.company, r.studentContact, ...(isFull(r) ? [r.contact] : []), r.status, ...(isFull(r) ? [r.support, r.amount, r.notes, r.tier] : [])]),
  ];

  if (error && !list) return <Screen><PageHeader title="Sponsor tracker" /><Note tone="bad">{error}</Note></Screen>;
  if (!list) return <Screen><p className="k-hint" role="status">Loading…</p></Screen>;
  const previous = list.seasons.filter((s) => s !== list.season);

  return (
    <Screen>
      <PageHeader title="Sponsor tracker" sub="Season shown is the one chosen at the top of the sidebar" actions={<ExportMenu filename={`sponsor-tracker-${list.season}.csv`} rows={exportRows} />} />
      <SeasonPicker seasons={list.seasons} value={list.season} onChange={(s) => void load(s)} />
      {error && <Note tone="bad">{error}</Note>}
      <Fold icon="plus" title="Add a company">
        <p className="k-hint">Anyone can add a company and who to contact. The rest is filled in as it moves along.</p>
        <Fields cols={2}>
          <Field label="Company name"><input className="k-input" value={add.company} onChange={(e) => setAdd({ ...add, company: e.target.value })} /></Field>
          <Field label="Contact name, email and phone"><input className="k-input" value={add.contact} onChange={(e) => setAdd({ ...add, contact: e.target.value })} /></Field>
        </Fields>
        <div><Btn kind="primary" onClick={() => void addCompany()}>Add to the tracker</Btn></div>
      </Fold>
      {canEdit && previous.length > 0 && (
        <Fold icon="download" title="Import companies from a previous season">
          <div className="biz-row">
            <Field label="Season">
              <select className="k-input" value={importFrom} onChange={(e) => setImportFrom(e.target.value)}>
                <option value="">Pick a season…</option>
                {previous.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Btn disabled={!importFrom} onClick={() => void business.importSponsors(importFrom).then((n) => { setNote(n ? `Added ${n} ${n === 1 ? "company" : "companies"}.` : "Everything from that season is already here."); return load(season); }, (e) => setError(e instanceof Error ? e.message : "That didn't import."))}>Import</Btn>
          </div>
          <p className="k-hint">Brings over each company, its contact and its notes. It does not bring statuses. A company that was accepted in any earlier season is marked Prior sponsor automatically.</p>
        </Fold>
      )}
      {note && <p className="k-hint" role="status">{note}</p>}
      <Toggle label="Wrap text (show everything that is cut off)" checked={wrap} onChange={setWrap} />
      <Tabs items={[{ id: "all", label: `All ${rows.length}` }, ...counts.map((n, i) => ({ id: String(i), label: `Stage ${i} · ${n}` }))]} value={stage} onChange={setStage} />
      <PrivateNote>
        Everyone sees the company, its stage and the student contact, so two people never pitch the same company and you know who to ask. Operations, leads, boosters, and mentors can see the company contact, amounts, and notes, and change anything in the tracker.
        {canEdit ? ` You are seeing them because you are ${whyYouSee(me)}. Click any text to change it.` : ""}
      </PrivateNote>
      <div className={`biz-table${wrap ? " biz-wrap" : ""}`}>
        <DataTable columns={columns} rows={shown} rowKey={(r) => r._id} statusKey="status" empty={rows.length ? "Nothing at this stage." : "No companies yet this season. Add one above."} />
      </div>
      <Stages stages={business.SPONSOR_STAGES} notes={STAGE_NOTES} footer="A student's pitch writes here after Operations approves it. Reply buttons on the pitch page move the company along." />
      <PeopleList id="biz-people" />
    </Screen>
  );
}
