// /apps/business/restaurant: Restaurant day, for 1-2-3-100. Step 1 is getting approval; step 2 is getting it fully set up.
import { useEffect, useState } from "react";
import { business } from "@team6220/data";
import { Btn, Field, Fields, Note, PageHeader, Screen } from "@team6220/ui";
import { PeopleList, businessHref } from "./shared";
import { ErrorNote, FileDrop, Meter, PdfHelp, Step, stateOf, useAct, useMy } from "./student";

export function Restaurant() {
  const { my, error, reload, setError } = useMy();
  const { act, busy } = useAct(reload, setError);
  const day = my?.records.restaurant[0] ?? null;
  const [form, setForm] = useState({ restaurant: "", partner: "", date: "", allDay: false, startTime: "16:00", endTime: "20:00", address: "", link: "", notes: "", setupNotes: "" });
  const [distance, setDistance] = useState<{ miles: number | null; far: boolean } | null>(null);
  useEffect(() => {
    if (day) setForm({ restaurant: day.restaurant, partner: day.partner, date: day.date, allDay: day.allDay, startTime: day.startTime || "16:00", endTime: day.endTime || "20:00", address: day.address, link: day.link, notes: day.notes, setupNotes: day.setupNotes });
  }, [day?._id, day?.plan.status]);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  if (!my) return <Screen><PageHeader title="Restaurant day" back={{ label: "My 1-2-3-100", href: businessHref("my") }} />{error ? <ErrorNote message={error} /> : <p className="k-hint" role="status">Loading…</p>}</Screen>;
  if (my.records.choice?.option !== "restaurant") return <Screen><PageHeader title="Restaurant day" back={{ label: "My 1-2-3-100", href: businessHref("my") }} /><Note>You picked something else. Choose Restaurant day on <a className="k-link" href={businessHref("my")}>My 1-2-3-100</a> to do this one.</Note></Screen>;

  const full = my.restaurantUsed >= my.settings.restaurantLimit && !day;
  const open = !day || day.plan.status === "draft" || day.plan.status === "sent-back";
  const approved = !!day && day.plan.status === "approved";
  const check = async () => {
    if (form.address.trim().length < 6) return setDistance(null);
    try { setDistance(await business.distance(form.address)); } catch { setDistance(null); }
  };
  const saveFields = (extra: Record<string, unknown> = {}) => business.itemSave("restaurant", { ...form, ...extra }, day ? { id: day._id } : { slot: 1 });
  const send = () => act(async () => { const item = await saveFields(); await business.itemSend("restaurant", item._id, "plan"); });

  return (
    <Screen>
      <PageHeader title="Restaurant day" sub="Set up one restaurant fundraiser day with a partner. Step 1 is getting approval. Step 2 is getting it fully set up." back={{ label: "My 1-2-3-100", href: businessHref("my") }} />
      <Meter big={`${my.restaurantUsed} of ${my.settings.restaurantLimit}`} label="restaurant days used this year" value={my.restaurantUsed} max={my.settings.restaurantLimit} right={`${Math.max(0, my.settings.restaurantLimit - my.restaurantUsed)} left`} note={`Once all ${my.settings.restaurantLimit} are taken, no one can set up another restaurant day. Leads can change the limit in the 1-2-3-100 settings. When it is full, this page says so and step 1 is closed.`} />
      <ErrorNote message={error} />
      {full && <Note tone="warn">All {my.settings.restaurantLimit} restaurant days this year are taken, so step 1 is closed. Pick another option on My 1-2-3-100.</Note>}
      <Step n={1} title="Get approval to do the fundraiser" state={full ? "locked" : day ? stateOf(day.plan.status) : "your-turn"} note={day?.plan.status === "sent-back" ? `Operations sent it back: ${day.plan.note}` : day?.plan.status === "approved" ? `Operations approved this plan${day.plan.decidedAt ? ` on ${day.plan.decidedAt.slice(0, 10)}` : ""}` : day?.plan.status === "waiting" ? "Operations is reading it" : "Type it in, then send it to Operations"}>
        <Fields cols={2}>
          <Field label="Restaurant"><input className="k-input" placeholder="Type the restaurant's name" value={form.restaurant} onChange={set("restaurant")} disabled={!open || full} /></Field>
          <Field label="Partner (required)" hint="The other student doing this with you. One of you fills this out for both of you"><input className="k-input" list="biz-people" value={form.partner} onChange={set("partner")} disabled={!open || full} /></Field>
          <Field label="Date"><input className="k-input" type="date" value={form.date} onChange={set("date")} disabled={!open || full} /></Field>
          <Field label="Time">
            <div className="biz-times">
              <label className="k-toggle"><input type="checkbox" checked={form.allDay} onChange={(e) => setForm({ ...form, allDay: e.target.checked })} disabled={!open || full} />All day</label>
              {!form.allDay && <><input className="k-input" type="time" value={form.startTime} onChange={set("startTime")} disabled={!open} /> to <input className="k-input" type="time" value={form.endTime} onChange={set("endTime")} disabled={!open} /></>}
            </div>
          </Field>
        </Fields>
        <Field label="Address" hint="We work out the distance from Los Alamitos High School for you">
          <input className="k-input" placeholder="Street, city" value={form.address} onChange={set("address")} onBlur={() => void check()} disabled={!open || full} />
        </Field>
        {distance?.miles != null && (distance.far
          ? <p className="biz-warn">⚠ About {distance.miles} miles from Los Alamitos High School. Over {business.FAR_MILES} miles: Operations may ask you to pick somewhere closer.</p>
          : <p className="biz-good">✓ About {distance.miles} miles from Los Alamitos High School (calculated from the address)</p>)}
        <Field label="Their fundraiser page or contact (optional)" hint="A link or an email, if they have one"><input className="k-input" value={form.link} onChange={set("link")} disabled={!open || full} /></Field>
        <Field label="Notes or questions for Operations" hint="Optional. Operations sees this when they review"><textarea className="k-input" rows={3} value={form.notes} onChange={set("notes")} disabled={!open || full} /></Field>
        {open && !full && <div><Btn kind="primary" disabled={busy} onClick={() => void send()}>Send to Operations for approval</Btn></div>}
      </Step>
      <Step n={2} title="Fully set up" state={day?.setUp ? "done" : approved ? "your-turn" : "locked"} note={approved ? "Upload the flyer and your proof, then tell Operations" : "Opens after Operations approves step 1"}>
        <FileDrop label="Flyer" hint="Drop your flyer here, or click to choose" file={day?.flyer ?? null} disabled={!approved || day?.setUp} onFile={(f) => void act(() => business.attach("restaurant", day!._id, "flyer", f))} />
        <FileDrop label="Proof you contacted the restaurant (PDF or screenshot)" hint="Drop a PDF or screenshots of your email or messages with the restaurant" file={day?.proof ?? null} disabled={!approved || day?.setUp} onFile={(f) => void act(() => business.attach("restaurant", day!._id, "proof", f))} />
        <PdfHelp />
        <Field label="Notes or questions for Operations" hint="Optional. Operations sees this when they review"><textarea className="k-input" rows={3} value={form.setupNotes} onChange={set("setupNotes")} disabled={!approved || day?.setUp} /></Field>
        <div><Btn kind="primary" disabled={!approved || busy || day?.setUp} onClick={() => void act(async () => { await business.itemSave("restaurant", { setupNotes: form.setupNotes }, { id: day!._id }); await business.itemSend("restaurant", day!._id, "setup"); })}>Tell Operations it's all set up</Btn></div>
      </Step>
      <Note>There is no result to approve for restaurant days. Once Operations sees that it is fully set up, you are done.</Note>
      <PeopleList id="biz-people" />
    </Screen>
  );
}
