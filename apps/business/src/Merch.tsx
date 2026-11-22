// /apps/business/merch: sell $100 of merch, for 1-2-3-100. Every sale says who bought it.
import { useState } from "react";
import { business } from "@team6220/data";
import { Btn, DataTable, Field, Note, PageHeader, Screen, Section, type Column } from "@team6220/ui";
import { businessHref } from "./shared";
import { ErrorNote, Meter, Step, shortDate, useAct, useMy } from "./student";

const PAYMENTS = ["Cash", "Check", "Zelle", "Venmo", "Other"];

export function Merch() {
  const { my, error, reload, setError } = useMy();
  const { act, busy } = useAct(reload, setError);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [boughtBy, setBoughtBy] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState({ item: "", price: "", boughtBy: "" });
  const [payment, setPayment] = useState("Cash");

  if (!my) return <Screen><PageHeader title="$100 · Merch" back={{ label: "My 1-2-3-100", href: businessHref("my") }} />{error ? <ErrorNote message={error} /> : <p className="k-hint" role="status">Loading…</p>}</Screen>;
  if (my.records.choice?.option !== "merch") return <Screen><PageHeader title="$100 · Merch" back={{ label: "My 1-2-3-100", href: businessHref("my") }} /><Note>You picked something else. Choose Merch on <a className="k-link" href={businessHref("my")}>My 1-2-3-100</a> to do this one.</Note></Screen>;

  const sold = business.merchTotal(my.records.sales);
  const confirmed = my.records.choice.merchDone.status;
  const locked = confirmed === "approved";
  const step = (item: string, by: number) => setCounts({ ...counts, [item]: Math.max(0, (counts[item] ?? 0) + by) });
  const lines = [
    ...business.MERCH_ITEMS.filter((m) => (counts[m.name] ?? 0) > 0).map((m) => ({ item: m.name, quantity: counts[m.name], price: m.price, boughtBy: boughtBy[m.name] ?? "" })),
    ...(custom.item.trim() ? [{ item: `Custom: ${custom.item.trim()}`, quantity: 1, price: Number(custom.price), boughtBy: custom.boughtBy }] : []),
  ];
  const add = () => act(async () => {
    if (!lines.length) throw new Error("Add at least one item first.");
    for (const line of lines) await business.merchAdd({ ...line, payment });
    setCounts({});
    setBoughtBy({});
    setCustom({ item: "", price: "", boughtBy: "" });
  });
  const columns: Column<business.My["records"]["sales"][number]>[] = [
    { key: "item", label: "Item", width: "minmax(0, 2fr)", menu: ["text"], value: (s) => s.item, render: (s) => `${s.item} ×${s.quantity}` },
    { key: "boughtBy", label: "Bought by", width: "minmax(0, 1.5fr)", menu: ["text"] },
    { key: "price", label: "Price", width: "90px", menu: ["num"], value: (s) => s.quantity * s.price, render: (s) => `$${s.quantity * s.price}` },
    { key: "date", label: "Date", width: "90px", menu: ["date"], render: (s) => shortDate(s.date) },
    { key: "payment", label: "Money given to a booster by", width: "minmax(0, 1.3fr)", menu: ["group"], render: (s) => s.payment || "·" },
  ];

  return (
    <Screen>
      <PageHeader title="$100 · Merch" sub={`Sell $${business.MERCH_GOAL} of merch to friends, teachers and parents. Operations confirms at the end that you are done.`} back={{ label: "My 1-2-3-100", href: businessHref("my") }} />
      <Meter big={`$${sold}`} label={`of $${business.MERCH_GOAL} sold`} value={sold} max={business.MERCH_GOAL} right={`$${Math.max(0, business.MERCH_GOAL - sold)} to go`} />
      <ErrorNote message={error} />
      <Section title="Add a sale">
        <Note tone="blue">Every time you add an item, or add one more, say who bought it. It does not have to be a name. A description like "friend", "Mr. Jones" or "family member" is fine.</Note>
        <div className="k-box biz-sale">
          {business.MERCH_ITEMS.map((m) => (
            <div key={m.name} className="biz-sale-line">
              <span>{m.name}</span><span className="k-hint">${m.price}</span>
              <span className="biz-qty">
                <button type="button" aria-label={`One fewer ${m.name}`} onClick={() => step(m.name, -1)} disabled={locked}>−</button>
                <span>{counts[m.name] ?? 0}</span>
                <button type="button" aria-label={`One more ${m.name}`} className="is-plus" onClick={() => step(m.name, 1)} disabled={locked}>+</button>
              </span>
              {(counts[m.name] ?? 0) > 0 && (
                <label className="biz-sale-by"><span className="k-hint">Bought by</span><input className="k-input" value={boughtBy[m.name] ?? ""} onChange={(e) => setBoughtBy({ ...boughtBy, [m.name]: e.target.value })} /></label>
              )}
            </div>
          ))}
          <hr />
          <strong>Custom item</strong>
          <div className="biz-custom">
            <input className="k-input" placeholder="What was it?" value={custom.item} onChange={(e) => setCustom({ ...custom, item: e.target.value })} disabled={locked} />
            <span className="biz-money-in">$ <input className="k-input" placeholder="price" inputMode="decimal" value={custom.price} onChange={(e) => setCustom({ ...custom, price: e.target.value })} disabled={locked} /></span>
            <input className="k-input" placeholder="Required: who bought it?" value={custom.boughtBy} onChange={(e) => setCustom({ ...custom, boughtBy: e.target.value })} disabled={locked} />
          </div>
          <Field label="Money given to a booster by">
            <select className="k-input" value={payment} onChange={(e) => setPayment(e.target.value)} disabled={locked}>{PAYMENTS.map((p) => <option key={p}>{p}</option>)}</select>
          </Field>
        </div>
        <div><Btn kind="primary" disabled={busy || locked} onClick={() => void add()}>Add this sale</Btn></div>
      </Section>
      <Section title="Your sales">
        <DataTable columns={columns} rows={my.records.sales} rowKey={(s) => s._id} actions={locked ? undefined : (s) => <Btn icon="remove" title="Remove this sale" onClick={() => void act(() => business.merchRemove(s._id))} />} empty="No sales yet." />
      </Section>
      <Step pill={false} title={`When you reach $${business.MERCH_GOAL}`} state={locked ? "approved" : confirmed === "waiting" ? "waiting" : confirmed === "sent-back" ? "sent-back" : sold >= business.MERCH_GOAL ? "your-turn" : "locked"} note="Tell Operations so you are marked done">
        {confirmed === "sent-back" && <Note tone="warn">Operations sent it back: {my.records.choice.merchDone.note}</Note>}
        <div><Btn kind="primary" disabled={busy || sold < business.MERCH_GOAL || confirmed === "waiting" || locked} onClick={() => void act(() => business.merchDone())}>Tell Operations I'm done</Btn></div>
      </Step>
    </Screen>
  );
}
