// /apps/business/grant-tracker: every grant we could apply to, and how far along it is. Everyone sees the grant and its
// stage; Operations, leads, mentors and boosters also see writers, outcomes and amounts, and click any text to change it.
import { useEffect, useMemo, useState } from "react";
import { business, type Grant, type GrantPublic, type Me } from "@team6220/data";
import { Btn, DataTable, Field, Fields, Note, PageHeader, Screen, Section, StatusChip, Tabs, Toggle, type Column } from "@team6220/ui";
import { EditMoney, EditText, ExportMenu, Fold, GRANT_OPTIONS, PeopleList, PrivateNote, SeasonChips, Stages } from "./shared";

type Row = Grant | GrantPublic;
const isFull = (r: Row): r is Grant => "writer" in r;

const STAGE_NOTES = ["Is it a good fit?", "A student is writing it", "Waiting for a reply", "Checking in", "Accepted or declined", "Money or items arrived"];

export function GrantTracker({ me }: { me: Me }) {
  const canEdit = me.roles.business;
  const [list, setList] = useState<business.GrantList | null>(null);
  const [season, setSeason] = useState<string | undefined>();
  const [stage, setStage] = useState("all");
  const [wrap, setWrap] = useState(false);
  const [error, setError] = useState("");
  const [add, setAdd] = useState({ title: "", link: "" });
  const [importFrom, setImportFrom] = useState("");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  /** Received grants just added to the Sponsor tracker, by id. */
  const [added, setAdded] = useState<string[]>([]);

  const load = (s?: string) => business.grants(s).then((l) => { setList(l); setSeason(l.season); }, (e) => setError(e instanceof Error ? e.message : "We couldn't load the tracker."));
  useEffect(() => void load(), []);

  const rows = list?.rows ?? [];
  const shown = stage === "all" ? rows : rows.filter((r) => business.stageOf(r.status) === Number(stage));
  const counts = useMemo(() => [0, 1, 2, 3, 4, 5].map((n) => rows.filter((r) => business.stageOf(r.status) === n).length), [rows]);
  const editRow = rows.find((r) => r._id === editing);

  const change = async (row: Row, fields: Partial<Grant>) => {
    setError("");
    try {
      const saved = await business.saveGrant({ _id: row._id, ...fields });
      setList((l) => l && { ...l, rows: l.rows.map((r) => (r._id === saved._id ? saved : r)) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save. Try again.");
      void load(season);
    }
  };

  const addGrant = async () => {
    setError("");
    try {
      await business.addGrant(add);
      setAdd({ title: "", link: "" });
      await load(season);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save. Try again.");
    }
  };

  /** Under a received grant: offer its giver to the Sponsor tracker. */
  const offer = (r: Row) => {
    if (!canEdit || !isFull(r) || r.status !== "5. Received") return null;
    const name = r.organization || r.title;
    return (
      <div className="biz-offer">
        {added.includes(r._id) || r.sponsored ? (
          <span>Added to the Sponsor tracker with the note: Received through {r.title}</span>
        ) : (
          <>
            <span>Received. Add <b>{name}</b> to the Sponsor tracker? It gets the note <i>Received through {r.title}</i>.</span>
            <Btn kind="primary" small onClick={() => void business.grantToSponsor(r._id).then(() => setAdded((a) => [...a, r._id]), (e) => setError(e instanceof Error ? e.message : "That didn't save."))}>Add to Sponsor tracker</Btn>
          </>
        )}
      </div>
    );
  };

  const columns: Column<Row>[] = [
    { key: "title", label: "Grant", width: "minmax(0, 1.5fr)", menu: ["text"], render: (r) => (
      <span className="biz-company">
        {r.link ? <a className="k-link" href={r.link} target="_blank" rel="noreferrer">{r.title}</a> : <strong>{r.title}</strong>}
        {isFull(r) && r.organization && <span className="k-hint biz-prior">{r.organization}</span>}
        {r.prior && <span className="k-hint biz-prior">Prior funder</span>}
      </span>
    ) },
    ...(canEdit ? [{ key: "writer", label: "Writer", width: "130px", menu: ["text"], render: (r: Row) => isFull(r) ? <EditText value={r.writer} label="Writer" list="biz-people" placeholder="Type a name" onSave={(writer) => change(r, { writer })} /> : null }] as Column<Row>[] : []),
    { key: "status", label: "Status", width: "180px", menu: ["group"], divider: true, render: (r) => <StatusChip value={r.status} options={GRANT_OPTIONS} label={`${r.title} status`} onChange={canEdit ? (status) => change(r, { status: status as Grant["status"] }) : undefined} /> },
    { key: "deadline", label: "Deadline", width: "130px", menu: ["text"], divider: true, render: (r) => canEdit ? <EditText value={r.deadline} label="Deadline" multiline onSave={(deadline) => change(r, { deadline })} /> : r.deadline || "" },
    ...(canEdit ? [
      { key: "amount", label: "Received", width: "minmax(0, 1fr)", menu: ["text"], render: (r: Row) => isFull(r) ? <EditMoney value={r.amount} label="Received" onSave={(amount) => change(r, { amount })} /> : null },
      { key: "notes", label: "Notes", width: "minmax(0, 1.5fr)", menu: ["text"], divider: true, render: (r: Row) => isFull(r) ? <EditText value={r.notes} label="Notes" multiline placeholder="Add a note" onSave={(notes) => change(r, { notes })} /> : null },
    ] as Column<Row>[] : []),
  ];

  const exportRows = () => [
    ["Grant", "Link", ...(canEdit ? ["Writer"] : []), "Status", "Deadline", ...(canEdit ? ["Received", "Notes"] : [])],
    ...shown.map((r) => [r.title, r.link, ...(isFull(r) ? [r.writer] : []), r.status, r.deadline, ...(isFull(r) ? [r.amount, r.notes] : [])]),
  ];

  if (error && !list) return <Screen><PageHeader title="Grant tracker" /><Note tone="bad">{error}</Note></Screen>;
  if (!list) return <Screen><p className="k-hint" role="status">Loading…</p></Screen>;
  const previous = list.seasons.filter((s) => s !== list.season);

  return (
    <Screen>
      <PageHeader title="Grant tracker" sub="Every grant we could apply to, and how far along it is." actions={<ExportMenu filename={`grant-tracker-${list.season}.csv`} rows={exportRows} />} />
      <SeasonChips seasons={list.seasons} value={list.season} onChange={(s) => void load(s)} />
      {error && <Note tone="bad">{error}</Note>}
      <Fold icon="plus" title="Add a grant">
        <p className="k-hint">Anyone can add a grant and its link. The rest is filled in as it moves along.</p>
        <Fields cols={2}>
          <Field label="Grant title"><input className="k-input" value={add.title} onChange={(e) => setAdd({ ...add, title: e.target.value })} /></Field>
          <Field label="Application link"><input className="k-input" type="url" value={add.link} onChange={(e) => setAdd({ ...add, link: e.target.value })} /></Field>
        </Fields>
        <div><Btn kind="primary" onClick={() => void addGrant()}>Add to the tracker</Btn></div>
      </Fold>
      {canEdit && previous.length > 0 && (
        <Fold icon="download" title="Import grants from a previous season">
          <div className="biz-row">
            <Field label="Season">
              <select className="k-input" value={importFrom} onChange={(e) => setImportFrom(e.target.value)}>
                <option value="">Pick a season…</option>
                {previous.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Btn disabled={!importFrom} onClick={() => void business.importGrants(importFrom).then((n) => { setNote(n ? `Added ${n} ${n === 1 ? "grant" : "grants"}.` : "Everything from that season is already here."); return load(season); }, (e) => setError(e instanceof Error ? e.message : "That didn't import."))}>Import</Btn>
          </div>
          <p className="k-hint">Brings over each grant, its link and its notes. It does not bring statuses. A grant that was accepted before is marked Prior funder automatically.</p>
        </Fold>
      )}
      {note && <p className="k-hint" role="status">{note}</p>}
      <Toggle label="Wrap text (show everything that is cut off)" checked={wrap} onChange={setWrap} />
      <Tabs items={[{ id: "all", label: `All ${rows.length}` }, ...counts.map((n, i) => ({ id: String(i), label: `Stage ${i} · ${n}` }))]} value={stage} onChange={setStage} />
      <PrivateNote>
        Everyone sees the grant and its stage. Writers, outcomes, and amounts are for Operations, leads, boosters, and mentors, who can also change anything in the tracker.
        {canEdit ? " Click any text to change it. Grant titles stay as links." : ""}
      </PrivateNote>
      <div className={`biz-table${wrap ? " biz-wrap" : ""}`}>
        <DataTable columns={columns} rows={shown} rowKey={(r) => r._id} statusKey="status" rowExtra={offer} actions={canEdit ? (r) => <Btn icon="edit" title={`Edit ${r.title}`} onClick={() => setEditing(r._id)} /> : undefined} empty={rows.length ? "Nothing at this stage." : "No grants yet this season. Add one above."} />
      </div>
      {canEdit && editRow && isFull(editRow) && <EditGrant key={editRow._id} grant={editRow} onSave={async (fields) => { await change(editRow, fields); setEditing(null); }} />}
      <Stages stages={business.GRANT_STAGES} notes={STAGE_NOTES} footer="A student's grant writes a row here after Operations approves it. The live grant list (grants we can apply to) stays in its spreadsheet." />
      <PeopleList id="biz-people" />
    </Screen>
  );
}

/** "Editing: <grant>": the fields that don't fit in a row, saved together with Save. */
function EditGrant({ grant, onSave }: { grant: Grant; onSave: (fields: Partial<Grant>) => Promise<void> }) {
  const [form, setForm] = useState({ title: grant.title, organization: grant.organization, link: grant.link, deadline: grant.deadline, questions: grant.questions, kind: grant.kind });
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });
  return (
    <Section title="Edit">
      <div className="k-box k-form">
        <div className="biz-edit-head"><strong>Editing: {grant.title}</strong><Btn kind="primary" small onClick={() => void onSave(form)}>Save</Btn></div>
        <Fields cols={2}>
          <Field label="Grant title"><input className="k-input" value={form.title} onChange={set("title")} /></Field>
          <Field label="Organization or company"><input className="k-input" value={form.organization} onChange={set("organization")} /></Field>
          <Field label="Application link"><input className="k-input" type="url" value={form.link} onChange={set("link")} /></Field>
          <Field label="Deadline"><input className="k-input" value={form.deadline} onChange={set("deadline")} /></Field>
          <Field label="Kind of funder" hint="Stats counts the grants we fill out by kind.">
            <select className="k-input" value={form.kind} onChange={set("kind")}>
              <option value=""></option>
              {business.GRANT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </Field>
        </Fields>
        <Field label="Questions from the application (optional, but highly recommended)" hint="These load into the Answer bank under Longer answers, so the next person has them.">
          <textarea className="k-input" rows={4} placeholder="Paste every question from the application here." value={form.questions} onChange={set("questions")} />
        </Field>
      </div>
    </Section>
  );
}
