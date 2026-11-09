import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { attendance, auth, AttendanceError, type SignInResult } from "@team6220/data";
import { errorMessage, STUDENT_ID } from "./util";

type Feedback = { tone: "ok" | "warn" | "error"; title: string; detail?: string };

const FEEDBACK_MS = 5000;

/**
 * Full-screen sign-in kiosk. Works with a USB/Bluetooth barcode or QR scanner that "types" the ID and presses
 * Enter, or with the on-screen keyboard. The input keeps focus so scans always land in it.
 */
export default function Kiosk({ adminName, onClosed }: { adminName: string; onClosed: (message?: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [id, setId] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();
  const [register, setRegister] = useState<string>(); // student ID being registered
  const [recent, setRecent] = useState<{ name: string; time: string }[]>([]);
  const [sound, setSound] = useState(true);
  const [confirmClose, setConfirmClose] = useState(false);
  const closing = useRef(false);

  const focusInput = useCallback(() => {
    if (!register) inputRef.current?.focus();
  }, [register]);

  const close = useCallback(
    async (message?: string, signOut = false) => {
      if (closing.current) return;
      closing.current = true;
      try {
        await attendance.closeKiosk();
      } catch {
        // already closed or offline: the server closes it at its expiry time anyway
      }
      if (document.fullscreenElement) await document.exitFullscreen?.().catch(() => {});
      if (signOut && !attendance.demoRole()) {
        await auth.logout("/apps/attendance");
        return;
      }
      if (signOut) attendance.setDemoRole("signed-out");
      onClosed(message);
    },
    [onClosed],
  );

  // Signing out (in any tab) or the kiosk expiring closes the kiosk.
  useEffect(() => {
    const check = () => {
      if (!attendance.isSignedIn()) void close("The kiosk closed because the admin signed out.");
      else if (!attendance.currentKiosk()) void close("The kiosk closed (it was open for the maximum time).");
    };
    const timer = window.setInterval(check, 5000);
    window.addEventListener("storage", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", check);
    };
  }, [close]);

  // Clear feedback after a few seconds and keep the input focused.
  useEffect(() => {
    if (!feedback) return;
    const t = window.setTimeout(() => setFeedback(undefined), FEEDBACK_MS);
    return () => window.clearTimeout(t);
  }, [feedback]);
  useEffect(focusInput, [focusInput, busy, feedback]);

  function show(result: SignInResult) {
    if (result.status === "signed-in") {
      setFeedback({ tone: "ok", title: result.message });
      setRecent((r) => [{ name: result.name ?? "", time: result.time ?? "" }, ...r].slice(0, 8));
      beep(sound, "ok");
    } else if (result.status === "duplicate") {
      setFeedback({ tone: "warn", title: `Already signed in, ${result.name}`, detail: `You signed in today at ${result.time}.` });
      beep(sound, "warn");
    } else {
      setFeedback({ tone: "error", title: result.message });
      beep(sound, "error");
    }
  }

  async function handleError(err: unknown) {
    if (err instanceof AttendanceError && err.code === "kiosk-closed") {
      await close(err.message);
      return;
    }
    setFeedback({ tone: "error", title: "Not signed in", detail: errorMessage(err, "Something went wrong. Try again.") });
    beep(sound, "error");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = id.trim();
    if (!value || busy) return;
    setId("");
    if (!STUDENT_ID.test(value)) {
      setFeedback({ tone: "error", title: "That isn't a student ID", detail: "Student IDs are exactly 10 digits." });
      beep(sound, "error");
      return;
    }
    setBusy(true);
    try {
      const result = await attendance.signIn(value);
      if (result.status === "needs-registration") {
        setFeedback(undefined);
        setRegister(value);
      } else {
        show(result);
      }
    } catch (err) {
      await handleError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="kiosk" role="application" aria-label="Attendance kiosk" onClick={focusInput}>
      <header className="kiosk__bar">
        <div>
          <strong>Attendance kiosk</strong>
          <span className="kiosk__sub">
            Opened by {adminName}
            {attendance.demoRole() ? " · demo data" : ""}
          </span>
        </div>
        <div className="kiosk__tools">
          <label className="kiosk__sound">
            <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /> Sound
          </label>
          {confirmClose ? (
            <>
              <button type="button" className="t-button" onClick={() => void close("The kiosk is closed.")}>
                Close kiosk
              </button>
              <button type="button" className="t-button t-button--quiet" onClick={() => void close("Kiosk closed and signed out.", true)}>
                Close and sign out
              </button>
              <button type="button" className="t-button t-button--quiet" onClick={() => setConfirmClose(false)}>
                Keep open
              </button>
            </>
          ) : (
            <button type="button" className="t-button t-button--quiet" onClick={() => setConfirmClose(true)}>
              Close kiosk…
            </button>
          )}
        </div>
      </header>

      <main className="kiosk__main">
        {register ? (
          <RegisterForm
            studentId={register}
            onDone={(result) => {
              setRegister(undefined);
              if (result) show(result);
            }}
            onError={async (err) => {
              setRegister(undefined);
              await handleError(err);
            }}
          />
        ) : (
          <form className="kiosk__form" onSubmit={submit}>
            <label htmlFor="kiosk-id" className="kiosk__label">
              Scan your ID card or type your student ID
            </label>
            <div className="kiosk__entry">
              <input
                id="kiosk-id"
                ref={inputRef}
                className="kiosk__input"
                inputMode="numeric"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                maxLength={32}
                value={id}
                onChange={(e) => setId(e.target.value)}
                aria-describedby="kiosk-feedback"
              />
              <button type="submit" className="t-button kiosk__go" disabled={busy || !id.trim()}>
                {busy ? "…" : "Sign in"}
              </button>
            </div>
          </form>
        )}

        <div id="kiosk-feedback" className="kiosk__feedback-slot" role="status" aria-live="assertive">
          {busy && <div className="kiosk__feedback kiosk__feedback--busy">Signing in…</div>}
          {!busy && feedback && (
            <div className={`kiosk__feedback kiosk__feedback--${feedback.tone}`}>
              <p className="kiosk__feedback-title">{feedback.title}</p>
              {feedback.detail && <p>{feedback.detail}</p>}
            </div>
          )}
        </div>

        {recent.length > 0 && (
          <section className="kiosk__recent" aria-label="Just signed in">
            <h2>Just signed in</h2>
            <ul>
              {recent.map((r, i) => (
                <li key={i}>
                  <span>{r.name}</span>
                  <span className="kiosk__time">{r.time}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

function RegisterForm({
  studentId,
  onDone,
  onError,
}: {
  studentId: string;
  onDone: (result?: SignInResult) => void;
  onError: (err: unknown) => void;
}) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => firstRef.current?.focus(), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!first.trim() || !last.trim()) {
      setError("Type your first and last name.");
      return;
    }
    setBusy(true);
    try {
      const result = await attendance.register(studentId, first, last);
      if (result.status === "invalid") {
        setError(result.message);
        setBusy(false);
      } else {
        onDone(result);
      }
    } catch (err) {
      onError(err);
    }
  }

  return (
    <form className="kiosk__form kiosk__register" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
      <h2>New here? Add your name</h2>
      <p>
        We don't have student ID <b>{studentId}</b> yet. Type your name once and you're signed in.
      </p>
      <div className="kiosk__names">
        <label>
          First name
          <input ref={firstRef} value={first} onChange={(e) => setFirst(e.target.value)} maxLength={50} autoComplete="off" />
        </label>
        <label>
          Last name
          <input value={last} onChange={(e) => setLast(e.target.value)} maxLength={50} autoComplete="off" />
        </label>
      </div>
      {error && (
        <p className="kiosk__inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="kiosk__entry">
        <button type="submit" className="t-button kiosk__go" disabled={busy}>
          {busy ? "Saving…" : "Sign me in"}
        </button>
        <button type="button" className="t-button t-button--quiet" onClick={() => onDone()} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

let audio: AudioContext | undefined;
/** Short beep: high for OK, two low for problems. Ignored where audio isn't allowed. */
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
