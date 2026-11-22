// /apps/business/review?kind=&id=: one thing a student sent, with everything Operations needs to approve it or send it back.
import { useEffect, useState } from "react";
import { business, type Me } from "@team6220/data";
import { Btn, DataTable, Field, KeyValue, Note, PageHeader, Pill, Screen, Section, type Column, type Tone } from "@team6220/ui";
import { businessHref } from "./shared";
import { ErrorNote, shortDate } from "./student";

type Item = Record<string, any>;
const TONE: Record<string, Tone> = { Done: "ok", Approved: "ok", Waiting: "blue", "Sent back": "bad", "Due now": "warn", "Your turn": "warn", "Not started": "calm" };
const param = (name: string) => new URLSearchParams(location.search).get(name) ?? "";

/** The lines Operations reads for each kind of thing, and which step is waiting. */
function describe(kind: string, item: Item): { step: "plan" | "result" | "done"; title: string; lines: [string, string][]; notes: string; file: { field: string; label: string } | null } {
  if (kind === "restaurant") return { step: "plan", title: `the plan for ${item.restaurant}`, notes: item.notes, file: null, lines: [["Restaurant", item.restaurant], ["Partner", item.partner], ["Date", item.date], ["Address", `${item.address}${item.miles ? ` (about ${item.miles} miles from the school)` : ""}`], ["Contact", item.link || "None"]] };
  if (kind === "grant") {
    const result = item.result?.status === "waiting";
    return { step: result ? "result" : "plan", title: `${result ? "the submitted application" : "the plan and application"} for ${item.title}`, notes: result ? item.resultNotes : item.notes, file: { field: result ? "finalFile" : "application", label: result ? "The submitted application" : "The application (PDF)" }, lines: [["Grant", item.title], ["Organization", item.organization || "None"], ["Deadline", item.deadline], ["Amount requested", item.amount ? `$${item.amount}` : ""], ["What we are asking for", item.asking]] };
  }
  if (kind === "pitch") {
    const result = item.resultApproval?.status === "waiting";
    return result
      ? { step: "result", title: `the result of the pitch to ${item.company}`, notes: item.result.notes, file: null, lines: [["Company", item.company], ["Where is it now?", item.result.status], ["Type of support", item.result.support], ["Amount", item.result.amount], ["Tier", item.result.tier || "Not decided"], ["Follow-ups complete", item.result.followUpsDone ? "Yes" : "No"]] }
      : { step: "plan", title: `the plan for a pitch to ${item.company}`, notes: "", file: null, lines: [["Company", item.company], ["Contact", [item.contactName, item.contactEmail, item.contactPhone].filter(Boolean).join(" · ")], ["How", item.method === "email" ? "Email" : item.method === "person" ? "In person" : "Phone call"], ["Why this company fits us", item.why]] };
  }
  return { step: "done", title: "that they sold $100 of merch", notes: "", file: null, lines: [] };
}

export function Review({ me }: { me: Me }) {
  const kind = param("kind") as business.ItemKind | "merch";
  const id = param("id");
  const [data, setData] = useState<business.Review | null>(null);
  const [error, setError] = useState("");
  const [back, setBack] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => business.review(kind, id).then(setData, (e) => setError(e instanceof Error ? e.message : "We couldn't open that."));
  useEffect(() => void load(), []);

  if (!data) return <Screen><PageHeader title="Review" back={{ label: "Approvals", href: businessHref("approvals") }} />{error ? <ErrorNote message={error} /> : <p className="k-hint" role="status">Loading…</p>}</Screen>;
  const item = data.item as Item;
  const info = describe(kind, kind === "merch" ? {} : item);
  const field = kind === "merch" ? "merchDone" : kind === "pitch" && info.step === "result" ? "resultApproval" : info.step === "result" ? "result" : "plan";
  const approval = item[field] as business.Approval;
  const option = { restaurant: "Restaurant day", grant: "Grants", pitch: "Sponsor pitches", merch: "Merch" }[kind];
  const decide = async (decision: "approve" | "back") => {
    setBusy(true);
    setError("");
    try {
      await business.decide(kind, id, info.step, decision, note);
      location.assign(businessHref("approvals"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
      setBusy(false);
    }
  };
  const columns: Column<business.ProgressRow>[] = [
    { key: "step", label: "Item", width: "minmax(0, 2fr)" },
    { key: "status", label: "Status", width: "120px", render: (r) => <Pill tone={TONE[r.status]}>{r.status}</Pill> },
  ];
  const sales = data.records.sales;

  return (
    <Screen>
      <PageHeader title={`${data.student.split(" ")[0]} · ${option}`} sub={`${approval.status === "waiting" ? "Waiting for Operations" : approval.status === "approved" ? "Approved" : "Not waiting"}: ${info.title}${approval.sentAt ? ` · sent ${shortDate(approval.sentAt)}` : ""}`} back={{ label: "Approvals", href: businessHref("approvals") }} />
      <ErrorNote message={error} />
      <div className="biz-review">
        <div className="biz-review-main">
          {info.file && (
            <Section title={info.file.label}>
              <div className="k-box biz-file-box">
                <p>{(item[info.file.field] as business.FileRef | null)?.name ?? "No file yet"}</p>
                {item[info.file.field] && <Btn onClick={() => void business.openFile(kind as business.ItemKind, id, info.file!.field).catch((e) => setError(e instanceof Error ? e.message : "That didn't open."))}>Open full size ↗</Btn>}
                <span className="k-hint">{data.student} uploaded this file. Only Operations and {data.student.split(" ")[0]} can open it.</span>
              </div>
            </Section>
          )}
          {kind === "merch" && (
            <Section title="Their sales">
              <KeyValue items={[...sales.map((s): [string, string] => [`${s.item} ×${s.quantity} · ${s.boughtBy}`, `$${s.quantity * s.price}`]), ["Total", `$${business.merchTotal(sales)}`]]} />
            </Section>
          )}
        </div>
        <div className="biz-review-side">
          {info.lines.length > 0 && <Section title="What they are asking for"><KeyValue items={info.lines.map(([k, v]) => [k, v || "None"] as [string, string])} /></Section>}
          {info.notes && <Section title="Notes and questions from the student"><Note tone="blue">{info.notes}</Note></Section>}
          <Section title="Other items from this student"><DataTable columns={columns} rows={data.rows} rowKey={(r) => r.step} /></Section>
          {approval.status === "waiting" && me.roles.bizApprover && (
            <div className="biz-decide">
              {back && <Field label="Tell them what to change" hint="They see this note and can fix it and send it again."><textarea className="k-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>}
              <div className="biz-row">
                {!back && <Btn kind="primary" disabled={busy} onClick={() => void decide("approve")}>Approve</Btn>}
                {back ? <Btn kind="primary" disabled={busy || !note.trim()} onClick={() => void decide("back")}>Send it back</Btn> : <Btn onClick={() => setBack(true)}>Send back with a note</Btn>}
                {back && <Btn onClick={() => setBack(false)}>Cancel</Btn>}
              </div>
            </div>
          )}
          {approval.status === "waiting" && !me.roles.bizApprover && <Note>Mentors and boosters can read everything here, but only Operations and the leads approve.</Note>}
        </div>
      </div>
    </Screen>
  );
}
