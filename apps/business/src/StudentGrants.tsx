// /apps/business/grants: Grants, for 1-2-3-100. Apply for two. Step 1 is getting approval to apply; step 2 is sending the
// submitted application. The grant goes on the Grant tracker once Operations approves step 2.
import { useEffect, useState } from "react";
import { business } from "@team6220/data";
import { Btn, Chips, Field, Fields, Note, PageHeader, Screen } from "@team6220/ui";
import { PeopleList, businessHref } from "./shared";
import { ErrorNote, FileDrop, PdfHelp, Step, stateOf, useAct, useMy } from "./student";

const BLANK = { title: "", organization: "", link: "", deadline: "", asking: "", amount: "", notes: "", submittedOn: "", resultNotes: "" };

export function StudentGrants() {
  const { my, error, reload, setError } = useMy();
  const { act, busy } = useAct(reload, setError);
  const [slot, setSlot] = useState("1");
  const grant = my?.records.grants.find((g) => g.slot === Number(slot)) ?? null;
  const [form, setForm] = useState(BLANK);
  useEffect(() => {
    setForm(grant ? { title: grant.title, organization: grant.organization, link: grant.link, deadline: grant.deadline, asking: grant.asking, amount: grant.amount, notes: grant.notes, submittedOn: grant.submittedOn, resultNotes: grant.resultNotes } : BLANK);
  }, [grant?._id, grant?.plan.status, grant?.result.status, slot]);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  if (!my) return <Screen><PageHeader title="Grants" back={{ label: "My 1-2-3-100", href: businessHref("my") }} />{error ? <ErrorNote message={error} /> : <p className="k-hint" role="status">Loading…</p>}</Screen>;
  if (my.records.choice?.option !== "grant") return <Screen><PageHeader title="Grants" back={{ label: "My 1-2-3-100", href: businessHref("my") }} /><Note>You picked something else. Choose Grants on <a className="k-link" href={businessHref("my")}>My 1-2-3-100</a> to do this one.</Note></Screen>;

  const done = my.records.grants.filter((g) => business.isApproved(g.result)).length;
  const waiting = my.records.grants.filter((g) => g.plan.status === "waiting" || g.result.status === "waiting").length;
  const planOpen = !grant || business.isOpen(grant.plan);
  const approved = !!grant && grant.plan.status === "approved";
  const resultOpen = approved && business.isOpen(grant!.result);
  const save = () => business.itemSave("grant", form, grant ? { id: grant._id } : { slot: Number(slot) });
  const ensure = async () => grant ?? (await save());

  return (
    <Screen>
      <PageHeader title="Grants" sub="Apply for two grants. Step 1 is getting approval to apply. Step 2 is sending the submitted application." back={{ label: "My 1-2-3-100", href: businessHref("my") }} />
      <div className="biz-row"><strong>Your grants</strong><span className="k-hint">{done} of 2 done{waiting ? ` · ${waiting} waiting on Operations` : ""}</span></div>
      <Chips items={[{ id: "1", label: "Grant 1" }, { id: "2", label: "Grant 2" }]} value={slot} onChange={setSlot} />
      <ErrorNote message={error} />
      <Step n={1} title="Plan and review" state={grant ? stateOf(grant.plan.status) : "your-turn"} note={grant?.plan.status === "sent-back" ? `Operations sent it back: ${grant.plan.note}` : "Type it in, add your application, then send it to Operations."}>
        {planOpen && <p className="biz-warn"><b>Do not submit it to the grant yet.</b> DO NOT SUBMIT THE APPLICATION YET. Only upload it here, so Operations can review it. Wait until Operations approves step 1. Then submit it to the grant and come back for step 2.</p>}
        <Fields cols={2}>
          <Field label="Grant title"><input className="k-input" value={form.title} onChange={set("title")} disabled={!planOpen} /></Field>
          <Field label="Organization or company (optional)" hint="Who gives the grant, if there is one"><input className="k-input" value={form.organization} onChange={set("organization")} disabled={!planOpen} /></Field>
          <Field label="Application link"><input className="k-input" type="url" value={form.link} onChange={set("link")} disabled={!planOpen} /></Field>
          <Field label="Deadline" hint="Type it in from the application. Type Rolling if it never closes"><input className="k-input" value={form.deadline} onChange={set("deadline")} disabled={!planOpen} /></Field>
        </Fields>
        <Field label="What we are asking for"><textarea className="k-input" rows={3} value={form.asking} onChange={set("asking")} disabled={!planOpen} /></Field>
        <Field label="Amount requested"><span className="biz-money-in">$ <input className="k-input" inputMode="decimal" value={form.amount} onChange={set("amount")} disabled={!planOpen} /></span></Field>
        <FileDrop label="Your application before you submit it (PDF is best, or screenshots)" hint="Drop a PDF here, or screenshots of every page" file={grant?.application ?? null} disabled={!planOpen} onFile={(f) => void act(async () => { const g = await ensure(); await business.itemSave("grant", form, { id: g._id }); await business.attach("grant", g._id, "application", f); })} />
        <PdfHelp />
        <p className="k-hint">This is for Operations to review. It is not kept once you send the finished version in step 2.</p>
        <Field label="Notes or questions for Operations" hint="Optional. Operations sees this when they review"><textarea className="k-input" rows={3} value={form.notes} onChange={set("notes")} disabled={!planOpen} /></Field>
        {planOpen && <div><Btn kind="primary" disabled={busy} onClick={() => void act(async () => { const g = await save(); await business.itemSend("grant", g._id, "plan"); })}>Send to Operations for approval</Btn></div>}
      </Step>
      <Step n={2} title="Submit and send the final version" state={grant?.result.status === "approved" ? "done" : approved ? stateOf(grant!.result.status) : "locked"} note={approved ? "Submit it, then send the submitted version here" : "Opens after approval. Submit it only after Operations approves step 1"}>
        <Fields cols={2}>
          <Field label="Date you submitted"><input className="k-input" type="date" value={form.submittedOn} onChange={set("submittedOn")} disabled={!resultOpen} /></Field>
        </Fields>
        <FileDrop label="The submitted application (PDF is best, or screenshots)" hint="Drop the final PDF here, or screenshots of every page" file={grant?.finalFile ?? null} disabled={!resultOpen} onFile={(f) => void act(() => business.attach("grant", grant!._id, "finalFile", f))} />
        <PdfHelp />
        <Field label="Notes or questions for Operations" hint="Optional. Operations sees this when they review"><textarea className="k-input" rows={3} value={form.resultNotes} onChange={set("resultNotes")} disabled={!resultOpen} /></Field>
        <div><Btn kind="primary" disabled={!resultOpen || busy} onClick={() => void act(async () => { await business.itemSave("grant", { submittedOn: form.submittedOn, resultNotes: form.resultNotes }, { id: grant!._id }); await business.itemSend("grant", grant!._id, "result"); })}>Send to Operations</Btn></div>
        <p className="k-hint">When you finish, this grant is added to the Grant tracker for you. The outcome and amount are filled in there when the grant answers.</p>
      </Step>
      <PeopleList id="biz-people" />
    </Screen>
  );
}
