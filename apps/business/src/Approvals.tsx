// /apps/business/approvals: what students have sent, waiting for Operations. Everyone in Operations and every lead can approve;
// mentors and boosters see everything but do not approve here. Click a row to open everything from that student.
import { useEffect, useState } from "react";
import { business } from "@team6220/data";
import { DataTable, Note, PageHeader, Pill, Screen, Tabs, type Column } from "@team6220/ui";
import { businessHref } from "./shared";
import { ErrorNote, shortDate } from "./student";

type Tab = "waiting" | "approved" | "sent-back";
const STEP_NAME = { plan: "Plan", result: "Result", done: "Done?" } as const;

export const reviewHref = (kind: string, id: string) => `${businessHref("review")}?kind=${kind}&id=${encodeURIComponent(id)}`;

export function Approvals() {
  const [data, setData] = useState<Awaited<ReturnType<typeof business.approvals>> | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("waiting");
  useEffect(() => void business.approvals().then(setData, (e) => setError(e instanceof Error ? e.message : "We couldn't load the approvals.")), []);

  if (!data) return <Screen><PageHeader title="Approvals" />{error ? <ErrorNote message={error} /> : <p className="k-hint" role="status">Loading…</p>}</Screen>;
  const count = (status: Tab) => data.rows.filter((r) => r.status === status).length;
  const rows = data.rows.filter((r) => r.status === tab);
  const columns: Column<business.ApprovalRow>[] = [
    { key: "student", label: "Student", width: "minmax(0, 1.2fr)", menu: ["text"], render: (r) => <a className="k-link" href={reviewHref(r.kind, r.id)}>{r.student}</a> },
    { key: "option", label: "Option", width: "minmax(0, 1.2fr)", menu: ["group"] },
    { key: "what", label: "What", width: "minmax(0, 2fr)", menu: ["text"] },
    { key: "step", label: "Step", width: "100px", menu: ["group"], value: (r) => STEP_NAME[r.step], render: (r) => <Pill tone={r.step === "result" ? "blue" : "calm"}>{STEP_NAME[r.step]}</Pill> },
    { key: "sentAt", label: "Sent", width: "90px", menu: ["date"], render: (r) => shortDate(r.sentAt) },
  ];
  return (
    <Screen>
      <PageHeader title="Approvals" sub="Everyone in Operations and every lead can approve. Click a student to open everything waiting for them." />
      <Tabs items={[{ id: "waiting", label: `Waiting ${count("waiting")}` }, { id: "approved", label: "Approved" }, { id: "sent-back", label: "Sent back" }]} value={tab} onChange={setTab} />
      <DataTable columns={columns} rows={rows} rowKey={(r) => `${r.kind}:${r.id}:${r.step}`} onRowClick={(r) => location.assign(reviewHref(r.kind, r.id))} empty={tab === "waiting" ? "Nothing is waiting. Nice." : "Nothing here yet."} />
      <Note>Restaurant days: {data.restaurantUsed} of {data.restaurantLimit} used this year. The limit is set in the 1-2-3-100 settings. Plan approvals let the student start. Result approvals make it count and write to the Sponsorship or Grant tracker. Restaurant days only need the plan approved, then Operations sees it is set up. Merch only needs the end confirmation.</Note>
    </Screen>
  );
}
