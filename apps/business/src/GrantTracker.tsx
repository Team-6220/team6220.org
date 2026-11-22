// /apps/business/grant-tracker: every grant we could apply to, and how far along it is. Everyone sees the grant and its
// stage; Operations, leads, mentors and boosters also see writers, outcomes and amounts, and click any text to change it.
import { useEffect, useMemo, useState } from "react";
import { business, type Grant, type GrantPublic } from "@team6220/data";
import { Box, Btn, DataTable, Field, Fields, Note, PageHeader, Screen, StatusChip, Tabs, Toggle, type Column } from "@team6220/ui";
import { EditMoney, EditText, Fold, GRANT_OPTIONS, PeopleList, SeasonChips, Stages } from "./shared";

type Row = Grant | GrantPublic;
const isFull = (r: Row): r is Grant => "writer" in r;

const STAGE_NOTES = ["Is it a good fit?", "A student is writing it", "Waiting for a reply", "Checking in", "Accepted or declined", "Money or items arrived"];

export function GrantTracker({ canEdit }: { canEdit: boolean }) {
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

  const columns: Column<Row>[] = [
    { key: "title", label: "Grant", width: "minmax(0, 1.5fr)", menu: ["text"], render: (r) => (
      <span className="biz-company">
        {r.link ? <a className="k-link" href={r.link} target="_blank" rel="noreferrer"><strong>{r.title}</strong></a> : <strong>{r.title}</strong>}
        {isFull(r) && r.organization && <span className="k-hint">{r.organization}</span>}
        {r.prior && <span className="k-hint">Prior funder</span>}
      </span>
    ) },
    ...(canEdit ? [{ key: "writer", label: "Writer", width: "130px", menu: ["text"], render: (r: Row) => isFull(r) ? <EditText value={r.writer} label="Writer" list="biz-people" onSave={(writer) => change(r, { writer })} /> : null }] as Column<Row>[] : []),
    { key: "status", label: "Status", width: "180px", menu: ["group"], render: (r) => <StatusChip value={r.status} options={GRANT_OPTIONS} label={`${r.title} status`} onChange={canEdit ? (status) => change(r, { status: status as Grant["status"] }) : undefined} /> },
    { key: "deadline", label: "Deadline", width: "130px", menu: ["text"], render: (r) => canEdit ? <EditText value={r.deadline} label="Deadline" multiline onSave={(deadline) => change(r, { deadline })} /> : r.deadline || "" },
    ...(canEdit ? [
      { key: "amount", label: "Received", width: "minmax(0, 1fr)", menu: ["text"], render: (r: Row) => isFull(r) ? <EditMoney value={r.amount} label="Received" onSave={(amount) => change(r, { amount })} /> : null },
      { key: "notes", label: "Notes", width: "minmax(0, 1.5fr)", render: (r: Row) => isFull(r) ? <EditText value={r.notes} label="Notes" multiline onSave={(notes) => change(r, { notes })} /> : null },
    ] as Column<Row>[] : []),
  ];

  if (error && !list) return <Screen><PageHeader title="Grant tracker" /><Note tone="bad">{error}</Note></Screen>;
  if (!list) return <Screen><p className="k-hint" role="status">Loading…</p></Screen>;
  const previous = list.seasons.filter((s) => s !== list.season);

  return (
    <Screen>
      <PageHeader title="Grant tracker" sub="Every grant we could apply to, and how far along it is." />
      <SeasonChips seasons={list.seasons} value={list.season} onChange={(s) => void load(s)} />
      <Note tone="blue">{canEdit ? "Everyone sees the grant and its stage. Writers, outcomes and amounts are for Operations, leads, boosters and mentors, who can also change anything in the tracker. Click any text to change it. Grant titles stay as links." : "You can see each grant and its stage. Operations, leads, boosters and mentors see writers, outcomes and amounts."}</Note>
      {error && <Note tone="bad">{error}</Note>}
      {note && <p className="k-hint" role="status">{note}</p>}
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
      <Toggle label="Wrap text (show everything that is cut off)" checked={wrap} onChange={setWrap} />
      <Tabs items={[{ id: "all", label: `All ${rows.length}` }, ...counts.map((n, i) => ({ id: String(i), label: `Stage ${i} · ${n}` }))]} value={stage} onChange={setStage} />
      <div className={`biz-table${wrap ? " biz-wrap" : ""}`}>
        <DataTable columns={columns} rows={shown} rowKey={(r) => r._id} statusKey="status" actions={canEdit ? (r) => <Btn icon="edit" title={`Edit ${r.title}`} onClick={() => setEditing(r._id)} /> : undefined} empty={rows.length ? "Nothing at this stage." : "No grants yet this season. Add one above."} />
      </div>
      {canEdit && rows.filter(isFull).filter((g) => g.status === "5. Received").map((g) => (
        <p key={g._id} className="biz-offer">
          {added.includes(g._id) || g.sponsored ? <>{g.organization || g.title} is on the Sponsor tracker with the note "Received through {g.title}".</> : (
            <>Received. Add <b>{g.organization || g.title}</b> to the Sponsor tracker? It gets the note <i>Received through {g.title}</i>.{" "}
              <Btn small onClick={() => void business.grantToSponsor(g._id).then(() => setAdded((a) => [...a, g._id]), (e) => setError(e instanceof Error ? e.message : "That didn't save."))}>Add to Sponsor tracker</Btn></>
          )}
        </p>
      ))}
      {canEdit && editRow && isFull(editRow) && (
        <Box>
          <div className="k-form">
            <h3>Editing: {editRow.title}</h3>
            <Fields cols={2}>
              <Field label="Grant title"><EditText value={editRow.title} label="Grant title" onSave={(title) => change(editRow, { title })} /></Field>
              <Field label="Organization or company"><EditText value={editRow.organization} label="Organization or company" onSave={(organization) => change(editRow, { organization })} /></Field>
              <Field label="Application link"><EditText value={editRow.link} label="Application link" type="url" onSave={(link) => change(editRow, { link })} /></Field>
              <Field label="Deadline"><EditText value={editRow.deadline} label="Deadline (date or Rolling)" onSave={(deadline) => change(editRow, { deadline })} /></Field>
            </Fields>
            <Field label="Questions from the application (optional, but highly recommended)" hint="These load into the Answer bank under Longer answers, so the next person has them."><EditText value={editRow.questions} label="Questions" multiline onSave={(questions) => change(editRow, { questions })} /></Field>
            <div><Btn onClick={() => setEditing(null)}>Done</Btn></div>
          </div>
        </Box>
      )}
      <Stages stages={business.GRANT_STAGES} notes={STAGE_NOTES} footer="A student's grant writes a row here after Operations approves it. The live grant list (grants we can apply to) stays in its spreadsheet." />
      <PeopleList id="biz-people" />
    </Screen>
  );
}
