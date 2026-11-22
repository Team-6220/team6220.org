// /apps/business/pitches: Sponsor pitches, for 1-2-3-100. Three pitches (email, in person or phone), each with a plan,
// the sending, and a result. The company is on the Sponsor tracker from the moment Operations approves the plan.
import { useEffect, useState } from "react";
import { business, calendar, type Me } from "@team6220/data";
import { Btn, Chips, Field, Fields, Icon, Note, PageHeader, Pill, Screen } from "@team6220/ui";
import { businessHref } from "./shared";
import { ErrorNote, Step, shortDate, stateOf, useAct, useMy } from "./student";

const REPLY_BUTTONS: [business.Pitch["reply"], string][] = [["none", "No reply yet"], ["replied", "They replied"], ["yes", "They said yes"], ["no", "They said no"], ["money", "We received it: money"], ["inkind", "We received it: in-kind"]];
const RESULT_STATUS: [string, string][] = [["pending", "Pending (waiting for a reply)"], ["discussing", "Discussing"], ["accepted", "Accepted"], ["declined", "Declined"], ["money", "Received money"], ["inkind", "Received in-kind"]];
const PILLARS = ["Student-led", "You get out what you put in", "Continuity", "Self-teaching", "Best idea wins", "Innovation"];
const METHODS: [business.Pitch["method"], string, string][] = [["email", "Email", "mail"], ["person", "In person", "me"], ["phone", "Phone call", "bell"]];

export function Pitches({ me }: { me: Me }) {
  const { my, error, reload, setError } = useMy();
  const { act, busy } = useAct(reload, setError);
  const [slot, setSlot] = useState("");
  const [mail, setMail] = useState<{ templates: business.EmailTemplate[]; cc: string }>({ templates: [], cc: "" });
  useEffect(() => void business.templates().then(setMail, () => undefined), []);
  const pitches = my?.records.pitches ?? [];
  useEffect(() => {
    if (my && !slot) setSlot(String(pitches.find((p) => !business.isApproved(p.resultApproval))?.slot ?? (pitches.length < 3 ? pitches.length + 1 : 1)));
  }, [my]);
  const pitch = pitches.find((p) => p.slot === Number(slot)) ?? null;
  const [form, setForm] = useState({ company: "", contactName: "", contactEmail: "", contactPhone: "", method: "email" as business.Pitch["method"], why: "" });
  const [visit, setVisit] = useState({ date: "", who: "", what: "" });
  const [template, setTemplate] = useState("Main");
  const [sent, setSent] = useState({ on: calendar.today(), by: "email" });
  const [result, setResult] = useState({ status: "pending", support: "Sponsorship (money)", amount: "", tier: "", expires: false, endDate: "", followUpsDone: false, notes: "" });
  useEffect(() => {
    setForm(pitch ? { company: pitch.company, contactName: pitch.contactName, contactEmail: pitch.contactEmail, contactPhone: pitch.contactPhone, method: pitch.method, why: pitch.why } : { company: "", contactName: "", contactEmail: "", contactPhone: "", method: "email", why: "" });
    setVisit(pitch?.visit ?? { date: "", who: "", what: "" });
    setResult(pitch && pitch.result.status ? { ...pitch.result } : { status: "pending", support: "Sponsorship (money)", amount: "", tier: "", expires: false, endDate: "", followUpsDone: false, notes: "" });
  }, [pitch?._id, pitch?.plan.status, pitch?.resultApproval.status, slot]);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  if (!my) return <Screen><PageHeader title="Sponsor pitches" back={{ label: "My 1-2-3-100", href: businessHref("my") }} />{error ? <ErrorNote message={error} /> : <p className="k-hint" role="status">Loading…</p>}</Screen>;
  if (my.records.choice?.option !== "sponsor") return <Screen><PageHeader title="Sponsor pitches" back={{ label: "My 1-2-3-100", href: businessHref("my") }} /><Note>You picked something else. Choose Sponsor pitches on <a className="k-link" href={businessHref("my")}>My 1-2-3-100</a> to do this one.</Note></Screen>;

  const minWords = my.settings.minWords;
  const words = business.wordCount(form.why);
  const done = pitches.filter((p) => business.isApproved(p.resultApproval));
  const planOpen = !pitch || business.isOpen(pitch.plan);
  const approved = !!pitch && pitch.plan.status === "approved";
  const sentOn = !!pitch?.sentOn;
  const resultOpen = !!pitch && (sentOn || !!pitch.visit.date) && business.isOpen(pitch.resultApproval);
  const save = () => business.itemSave("pitch", form, pitch ? { id: pitch._id } : { slot: Number(slot) });
  const filled = pitch ? business.fillTemplate(mail.templates.find((t) => t.name === template)?.body ?? "", { Contact: pitch.contactName, Company: pitch.company, "Why this company fits us": pitch.why, "Your name": me.name, "Your subteam": me.subteams[0] ?? "" }) : "";
  const subject = pitch ? business.fillTemplate(mail.templates.find((t) => t.name === template)?.subject ?? "", { Company: pitch.company }) : "";
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(pitch?.contactEmail ?? "")}&cc=${encodeURIComponent(mail.cc)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(filled)}`;
  const mailto = `mailto:${pitch?.contactEmail ?? ""}?cc=${encodeURIComponent(mail.cc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(filled)}`;
  const copyRich = () => {
    const html = filled.split("\n\n").map((p) => `<p>${p.replace(/\n/g, "<br>").replace(new RegExp(pitch?.company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") || "$^", "g"), `<b>${pitch?.company}</b>`)}</p>`).join("");
    void navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([filled], { type: "text/plain" }) })]).catch(() => undefined);
  };

  return (
    <Screen>
      <PageHeader title="Sponsor pitches" sub={`Send three pitches (email, in person or phone), plus ${my.settings.followUps} follow-ups if there is no reply.`} back={{ label: "My 1-2-3-100", href: businessHref("my") }} />
      <div className="biz-row">
        <div className="k-box biz-count"><span className="biz-tile-label">Pitches done</span><strong>{done.length} of 3</strong><span className="k-hint">{done.map((p) => `${p.company} approved`).join(", ") || "none yet"}</span></div>
        <Note>Check the <a className="k-link" href={businessHref("sponsor-tracker")}>Sponsor tracker</a> first so nobody pitches the same company twice.</Note>
      </div>
      <Chips items={[{ id: "1", label: "Pitch 1" }, { id: "2", label: "Pitch 2" }, { id: "3", label: "Pitch 3" }]} value={slot} onChange={setSlot} />
      <ErrorNote message={error} />

      <Step n={1} title="Research and plan" state={pitch ? stateOf(pitch.plan.status) : "your-turn"} note={pitch?.plan.status === "approved" ? `Operations approved this plan${pitch.plan.decidedAt ? ` on ${shortDate(pitch.plan.decidedAt)}` : ""}` : pitch?.plan.status === "sent-back" ? `Operations sent it back: ${pitch.plan.note}` : pitch?.plan.status === "waiting" ? "Operations is reading it" : "Type it in, then send it to Operations"}>
        <Fields cols={2}>
          <Field label="Company" hint="Check the Sponsor tracker first, or type a new one"><input className="k-input" value={form.company} onChange={set("company")} disabled={!planOpen} /></Field>
          <Field label="Contact name" hint="Someone in charge of business or outreach"><input className="k-input" value={form.contactName} onChange={set("contactName")} disabled={!planOpen} /></Field>
          <Field label="Contact email"><input className="k-input" type="email" value={form.contactEmail} onChange={set("contactEmail")} disabled={!planOpen} /></Field>
          <Field label="Phone"><input className="k-input" type="tel" value={form.contactPhone} onChange={set("contactPhone")} disabled={!planOpen} /></Field>
        </Fields>
        <div><span className="biz-drop-label">How will you reach out?</span>
          <div className="k-chips" role="group">
            {METHODS.map(([id, label, icon]) => <button key={id} type="button" className="k-chip" aria-pressed={form.method === id} disabled={!planOpen} onClick={() => setForm({ ...form, method: id })}><Icon name={icon} inline /> {label}</button>)}
          </div>
          <p className="k-hint">In-person visits and phone calls count as one of your three. They skip the email step.</p>
        </div>
        <Field label="Why this company fits us">
          <textarea className="k-input" rows={5} value={form.why} onChange={set("why")} disabled={!planOpen} />
        </Field>
        <p className="biz-words"><b className={words >= minWords ? "is-ok" : ""}>{words} words</b> of at least {minWords} needed (leads can change this in the settings). Ideas: how local they are, which of our pillars they share, what we love about their work.</p>
        <div className="k-chips">{PILLARS.map((p) => <span key={p} className="k-chip">{p}</span>)}</div>
        {planOpen && <div><Btn kind="primary" disabled={busy} onClick={() => void act(async () => { const p = await save(); await business.itemSend("pitch", p._id, "plan"); })}>Send plan to Operations</Btn></div>}
      </Step>

      <Step n={2} title="Send it" state={sentOn || pitch?.visit.date ? "done" : approved ? "your-turn" : "locked"} note={approved ? "Fill in the message, then send it" : "Opens after Operations approves your plan"}>
        {approved && pitch!.method !== "email" && (
          <>
            <Note tone="blue">In-person visits and phone calls skip the email step. Log what happened here.</Note>
            <Fields cols={2}>
              <Field label="Date of the visit or call"><input className="k-input" type="date" value={visit.date} onChange={(e) => setVisit({ ...visit, date: e.target.value })} /></Field>
              <Field label="Who you spoke with"><input className="k-input" value={visit.who} onChange={(e) => setVisit({ ...visit, who: e.target.value })} /></Field>
            </Fields>
            <Field label="What happened"><textarea className="k-input" rows={3} value={visit.what} onChange={(e) => setVisit({ ...visit, what: e.target.value })} /></Field>
            <div><Btn kind="primary" disabled={busy || !visit.date} onClick={() => void act(async () => { await business.itemSave("pitch", { visit }, { id: pitch!._id }); await business.pitchSent(pitch!._id, visit.date, pitch!.method); })}>Save what happened</Btn></div>
          </>
        )}
        {approved && pitch!.method === "email" && (
          <div className="biz-mail">
            <div className="biz-mail-form">
              <Field label="Template"><select className="k-input" value={template} onChange={(e) => setTemplate(e.target.value)}>{mail.templates.map((t) => <option key={t._id}>{t.name}</option>)}</select></Field>
              <Field label="Your name" hint="Filled in from your account"><input className="k-input" value={me.name} readOnly /></Field>
              <Field label="Your subteam" hint="Filled in from your account"><input className="k-input" value={me.subteams[0] ?? ""} readOnly /></Field>
              <p className="k-hint"><b>From:</b> business@team6220.org<br /><b>Copied automatically:</b> a mentor, the lead mentor and operations@team6220.org</p>
              <div className="biz-row">
                <a className="k-btn k-btn--primary" href={gmail} target="_blank" rel="noreferrer">Open in Gmail</a>
                <Btn onClick={copyRich}>Copy with formatting</Btn>
                <a className="k-btn k-btn--quiet" href={mailto}>Other email app</a>
              </div>
              <p className="k-hint">Sign in to Gmail as business@team6220.org. The Gmail button writes plain text. Use Copy with formatting to keep the bold and links, then paste into the message. Gmail cannot attach a file for you: download the sponsorship packet, then attach it to the message.</p>
            </div>
            <div className="k-box biz-preview"><strong>{subject}</strong>{filled.split("\n\n").map((p, i) => <p key={i}>{p}</p>)}</div>
          </div>
        )}
      </Step>

      {approved && pitch!.method === "email" && (
        <section className="biz-after">
          <h3 className="k-hint">AFTER YOU SEND IT</h3>
          <div className="k-box biz-reply">
            <div className="biz-row"><strong>Did they reply?</strong><span className="k-hint">Tracker status: {business.REPLY_STATUS[pitch!.reply]}</span></div>
            <div className="k-chips" role="group">{REPLY_BUTTONS.map(([id, label]) => <button key={id} type="button" className="k-chip" aria-pressed={pitch!.reply === id} disabled={!sentOn || busy} onClick={() => void act(() => business.pitchReply(pitch!._id, id))}>{label}</button>)}</div>
            <p className="k-hint">These buttons update this company in the Sponsor tracker. Follow-up reminders stop when they reply.</p>
          </div>
          <div className="k-box biz-timeline">
            <div><strong>First email</strong><span>{sentOn ? `Sent ${shortDate(pitch!.sentOn)} from business@team6220.org` : "Not sent yet"}</span><Pill tone={sentOn ? "ok" : "calm"}>{sentOn ? "Done" : "Not yet"}</Pill></div>
            {pitch!.followUps.map((f) => (
              <div key={f.n}><strong>Follow-up {f.n}</strong><span>Due {shortDate(f.dueOn)}. Use the Follow-up {f.n} template. Skip it if they replied.</span>
                {f.sentOn ? <Pill tone="ok">Done</Pill> : pitch!.reply !== "none" ? <Pill tone="calm">Not needed</Pill> : <><Pill tone={f.dueOn <= calendar.today() ? "warn" : "calm"}>{f.dueOn <= calendar.today() ? "Due now" : "Not yet"}</Pill><Btn small onClick={() => void act(() => business.followUpSent(pitch!._id, f.n))}>I sent it</Btn></>}
              </div>
            ))}
          </div>
          {!sentOn && (
            <div className="k-box biz-reply">
              <Fields cols={2}>
                <Field label="Date sent"><input className="k-input" type="date" value={sent.on} onChange={(e) => setSent({ ...sent, on: e.target.value })} /></Field>
                <Field label="Sent by"><select className="k-input" value={sent.by} onChange={(e) => setSent({ ...sent, by: e.target.value })}><option value="email">Email from business@team6220.org</option><option value="other">Another email address</option></select></Field>
              </Fields>
              <div><Btn kind="primary" disabled={busy} onClick={() => void act(() => business.pitchSent(pitch!._id, sent.on, sent.by))}>I sent it</Btn></div>
              <p className="k-hint">Follow-up reminders are created for you when you mark the first pitch as sent. They come by Discord, a badge on this app and Apps home, and push notifications.</p>
            </div>
          )}
        </section>
      )}

      <Step n={3} title="The result" state={pitch && business.isApproved(pitch.resultApproval) ? "approved" : pitch ? (resultOpen ? (pitch.resultApproval.status === "sent-back" ? "sent-back" : "your-turn") : pitch.resultApproval.status === "waiting" ? "waiting" : "locked") : "locked"} note="When it is decided">
        <Fields cols={2}>
          <Field label="Where is it now?"><select className="k-input" value={result.status} onChange={(e) => setResult({ ...result, status: e.target.value })} disabled={!resultOpen}>{RESULT_STATUS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field>
          <Field label="Type of support"><select className="k-input" value={result.support} onChange={(e) => setResult({ ...result, support: e.target.value })} disabled={!resultOpen}>{business.SUPPORT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Amount or what they are giving"><input className="k-input" value={result.amount} onChange={(e) => setResult({ ...result, amount: e.target.value })} disabled={!resultOpen} /></Field>
          <Field label="Sponsor tier"><select className="k-input" value={result.tier} onChange={(e) => setResult({ ...result, tier: e.target.value })} disabled={!resultOpen}><option value="">Not decided</option>{business.TIERS.map((t) => <option key={t}>{t}</option>)}</select></Field>
        </Fields>
        <Fields cols={2}>
          <Field label="Does the service expire?"><div className="k-chips" role="group">{["No", "Yes"].map((v) => <button key={v} type="button" className="k-chip" aria-pressed={result.expires === (v === "Yes")} disabled={!resultOpen} onClick={() => setResult({ ...result, expires: v === "Yes" })}>{v}</button>)}</div></Field>
          {result.expires && <Field label="End date"><input className="k-input" type="date" value={result.endDate} onChange={(e) => setResult({ ...result, endDate: e.target.value })} disabled={!resultOpen} /></Field>}
        </Fields>
        <label className="k-toggle"><input type="checkbox" checked={result.followUpsDone} onChange={(e) => setResult({ ...result, followUpsDone: e.target.checked })} disabled={!resultOpen} />Follow-ups complete?</label>
        <Field label="Notes or questions for Operations"><textarea className="k-input" rows={3} value={result.notes} onChange={(e) => setResult({ ...result, notes: e.target.value })} disabled={!resultOpen} /></Field>
        <div><Btn kind="primary" disabled={!resultOpen || busy} onClick={() => void act(async () => { await business.itemSave("pitch", { result }, { id: pitch!._id }); await business.itemSend("pitch", pitch!._id, "result"); })}>Send result to Operations</Btn></div>
      </Step>
    </Screen>
  );
}
