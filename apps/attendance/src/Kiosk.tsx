// The sign-in kiosk (Attendance Admins open it on the meeting room's screen). Students type or scan their student ID,
// no login needed: the kiosk holds its own token. Sign out is for leaving early. An ID the roster doesn't have can add
// a name, when Attendance's settings allow it.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { attendance, OpsError, ops, type KioskRow, type KioskSession, type SignInResult } from "@team6220/data";
import { Btn, Note, PageHeader, Screen, Section, Tabs } from "@team6220/ui";
import { errorMessage, formatTime, longDay } from "./util";

type Mode = "in" | "out";
type Shown = { result: SignInResult; id: string };

let audio: AudioContext | undefined;
/** A short beep: high for OK, two low for problems. Silent where audio isn't allowed. */
function beep(enabled: boolean, kind: "ok" | "warn" | "error") {
  if (!enabled) return;
  try {
    audio ??= new AudioContext();
    const tones = kind === "ok" ? [880] : kind === "warn" ? [520, 520] : [220, 220];
    tones.forEach((freq, i) => {
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.frequency.value = freq;
      gain.gain.value = 0.15;
      osc.connect(gain).connect(audio!.destination);
      const start = audio!.currentTime + i * 0.18;
      osc.start(start);
      osc.stop(start + 0.12);
    });
  } catch {
    // no audio: silent
  }
}

export function Kiosk() {
  const [kiosk, setKiosk] = useState<KioskSession | null>(() => attendance.currentKiosk());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const open = async () => {
    setBusy(true);
    setError("");
    try {
      setKiosk(await attendance.openKiosk());
    } catch (err) {
      setError(errorMessage(err, "We couldn't open the kiosk."));
    }
    setBusy(false);
  };
  const close = async () => {
    await attendance.closeKiosk().catch(() => undefined);
    setKiosk(null);
  };

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  if (!kiosk) {
    return (
      <Screen>
        <PageHeader title="Take attendance" sub={longDay(today)} back={{ label: "Attendance", href: "/apps/attendance" }} />
        <Note>Open the kiosk on the screen in the meeting room. Students then sign in with their student ID, with no login. It closes by itself after a few hours, or when you close it.</Note>
        {error && <Note tone="bad">{error}</Note>}
        <div><Btn kind="primary" disabled={busy} onClick={open}>{busy ? "Opening…" : "Open kiosk"}</Btn></div>
      </Screen>
    );
  }
  return <Open today={today} onClose={close} onClosed={() => setKiosk(null)} />;
}

function Open({ today, onClose, onClosed }: { today: string; onClose: () => void; onClosed: () => void }) {
  const [mode, setMode] = useState<Mode>("in");
  const [id, setId] = useState("");
  const [shown, setShown] = useState<Shown | null>(null);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [rows, setRows] = useState<KioskRow[]>([]);
  const [sound, setSound] = useState(true);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const demo = ops.isDemo();

  const refresh = useCallback(async () => {
    try {
      setRows(await attendance.kioskToday());
    } catch (err) {
      if (err instanceof OpsError && err.code === "kiosk-closed") onClosed();
    }
  }, [onClosed]);
  useEffect(() => void refresh(), [refresh]);
  useEffect(() => input.current?.focus(), [shown, mode]);

  const show = (result: SignInResult, typed: string) => {
    setShown({ result, id: typed });
    beep(sound, result.status === "signed-in" || result.status === "signed-out" ? "ok" : result.status === "needs-registration" ? "warn" : "error");
  };
  const submit = async (typed: string, how: Mode = mode) => {
    if (!typed.trim() || busy) return;
    setBusy(true);
    try {
      show(await attendance.signIn(typed, how), typed.trim());
      setId("");
      void refresh();
    } catch (err) {
      if (err instanceof OpsError && err.code === "kiosk-closed") return onClosed();
      show({ status: "invalid", message: errorMessage(err, "That didn't work. Try again.") }, typed);
    }
    setBusy(false);
  };
  const register = async (event: FormEvent) => {
    event.preventDefault();
    if (!shown || busy) return;
    setBusy(true);
    try {
      show(await attendance.register(shown.id, first, last), shown.id);
      setFirst("");
      setLast("");
      void refresh();
    } catch (err) {
      show({ status: "needs-registration", message: errorMessage(err, "We couldn't add that name.") }, shown.id);
    }
    setBusy(false);
  };

  const result = shown?.result;
  const tone = result?.status === "signed-in" || result?.status === "signed-out" ? "ok" : result?.status === "needs-registration" || result?.status === "duplicate" || result?.status === "not-signed-in" ? "warn" : "bad";
  return (
    <Screen>
      <PageHeader
        title="Take attendance"
        sub={longDay(today)}
        actions={
          <>
            <Btn onClick={() => setSound(!sound)}>{sound ? "Sound on" : "Sound off"}</Btn>
            <Btn icon="expand" title="Full screen" onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}>Full screen</Btn>
            <Btn kind="primary" onClick={onClose}>Close kiosk</Btn>
          </>
        }
      />
      <Tabs items={[{ id: "in", label: "Sign in" }, { id: "out", label: "Sign out (leaving early)" }]} value={mode} onChange={(m) => { setMode(m); setShown(null); }} />
      <form className="att-id" onSubmit={(e) => { e.preventDefault(); void submit(id); }}>
        <label htmlFor="att-id-input">Scan your ID card or type your student ID</label>
        <input id="att-id-input" ref={input} className="k-input att-id-input" inputMode="numeric" autoComplete="off" placeholder="Student ID" value={id} onChange={(e) => setId(e.target.value.replace(/\D/g, "").slice(0, 12))} disabled={busy} />
      </form>
      {result && (
        <Note tone={tone === "ok" ? "ok" : tone === "warn" ? "warn" : "bad"}>
          {result.name && (result.status === "signed-in" || result.status === "signed-out") && <strong>{result.status === "signed-in" ? `Welcome, ${result.name}! ` : `See you next time, ${result.name}! `}</strong>}
          {result.message}
        </Note>
      )}
      {result?.status === "needs-registration" && (
        <form className="k-box att-register" onSubmit={register}>
          <strong>New here? Add your name</strong>
          <span className="k-hint">Use your real first and last name. Made-up names are removed.</span>
          <div className="att-register-row">
            <input className="k-input" placeholder="First name" aria-label="First name" value={first} onChange={(e) => setFirst(e.target.value)} />
            <input className="k-input" placeholder="Last name" aria-label="Last name" value={last} onChange={(e) => setLast(e.target.value)} />
            <Btn kind="primary" type="submit" disabled={busy || !first.trim() || !last.trim()}>Sign in</Btn>
          </div>
        </form>
      )}
      {demo && (
        <Section title="Random quick sign in (demo only)">
          <div className="att-quick">
            {["4829173650", "1057382946", "7731905284", "2946018357", "6182430795"].map((q) => <Btn key={q} onClick={() => void submit(q)}>{q}</Btn>)}
          </div>
        </Section>
      )}
      <Section title={`Signed in today · ${rows.length}`}>
        <ul className="att-today">
          {rows.map((r, i) => (
            <li key={r.name + r.signedInAt} className={i === 0 && result?.status === "signed-in" ? "is-new" : ""}>
              <span>{r.name}</span>
              <span className="k-hint">{formatTime(r.signedInAt)}{r.signedOutAt && ` · left ${formatTime(r.signedOutAt)}`}</span>
            </li>
          ))}
        </ul>
      </Section>
    </Screen>
  );
}
