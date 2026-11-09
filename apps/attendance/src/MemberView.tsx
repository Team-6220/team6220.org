import { useCallback, useEffect, useState, type FormEvent } from "react";
import { attendance, type DayEntry, type DaySummary, type LookupResult } from "@team6220/data";
import { errorMessage, formatDay, formatTime, STUDENT_ID } from "./util";

const REMEMBER_KEY = "team6220.attendance.myId";

/** What an approved team member sees: today's list, "did I sign in?", past meetings. Admins also get the kiosk. */
export default function MemberView({ isAdmin, onKioskOpened }: { isAdmin: boolean; onKioskOpened: () => void }) {
  if (!attendance.isConfigured()) {
    return (
      <div className="att__panel att__panel--notice" role="status">
        <h2>Not connected yet</h2>
        <p>
          The new attendance screen isn't connected to the attendance sheet yet. Keep using the current attendance app
          until a web admin finishes the setup.
        </p>
      </div>
    );
  }
  return (
    <div className="att__stack">
      {isAdmin && <KioskLauncher onOpened={onKioskOpened} />}
      <Today />
      <MyCheck />
      <History />
    </div>
  );
}

function KioskLauncher({ onOpened }: { onOpened: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <section className="att__panel att__panel--admin" aria-labelledby="kiosk-h">
      <h2 id="kiosk-h">Take attendance</h2>
      <p>
        Opens the sign-in kiosk on <b>this device</b>. Students scan their ID card or type their student ID; they don't
        need to sign in. Close the kiosk when the meeting starts, or it closes by itself after a few hours.
      </p>
      <button
        type="button"
        className="t-button att__big-button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(undefined);
          // Full screen needs the click itself, so ask before waiting for the server.
          document.documentElement.requestFullscreen?.().catch(() => {});
          try {
            await attendance.openKiosk();
            onOpened();
          } catch (err) {
            if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
            setError(errorMessage(err, "Couldn't open the kiosk."));
            setBusy(false);
          }
        }}
      >
        {busy ? "Opening…" : "Open kiosk"}
      </button>
      {error && (
        <p className="att__error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function useLoad<T>(fn: () => Promise<T>) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(true);
  const reload = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      setData(await fn());
    } catch (err) {
      setError(errorMessage(err, "Couldn't load attendance."));
    } finally {
      setBusy(false);
    }
  }, [fn]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, busy, reload };
}

function Today() {
  const { data, error, busy, reload } = useLoad(attendance.today);
  const [filter, setFilter] = useState("");
  const shown = (data ?? []).filter((e) => e.name.toLowerCase().includes(filter.trim().toLowerCase()));
  return (
    <section className="att__panel" aria-labelledby="today-h">
      <div className="att__row">
        <h2 id="today-h">
          Today{data ? <span className="att__count"> · {data.length} signed in</span> : null}
        </h2>
        <button type="button" className="t-button t-button--quiet" onClick={() => void reload()} disabled={busy}>
          {busy ? "Loading…" : "Refresh"}
        </button>
      </div>
      {error && (
        <p className="att__error" role="alert">
          {error}
        </p>
      )}
      {data && data.length > 8 && (
        <label className="att__field">
          <span>Find a name</span>
          <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} autoComplete="off" />
        </label>
      )}
      {data && data.length === 0 && <p className="att__muted">Nobody has signed in yet today.</p>}
      {data && data.length > 0 && <EntryList entries={shown} />}
    </section>
  );
}

function EntryList({ entries }: { entries: DayEntry[] }) {
  return (
    <ol className="att__list">
      {entries.map((e, i) => (
        <li key={`${e.at}-${i}`}>
          <span className="att__name">{e.name}</span>
          <time dateTime={e.at}>{formatTime(e.at, e.time)}</time>
        </li>
      ))}
    </ol>
  );
}

function readRemembered(): string {
  try {
    return window.localStorage.getItem(REMEMBER_KEY) ?? "";
  } catch {
    return "";
  }
}

function MyCheck() {
  const [id, setId] = useState(readRemembered);
  const [remember, setRemember] = useState(() => readRemembered() !== "");
  const [result, setResult] = useState<LookupResult>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setResult(undefined);
    const value = id.trim();
    if (!STUDENT_ID.test(value)) {
      setError("Student IDs are exactly 10 digits.");
      return;
    }
    try {
      if (remember) window.localStorage.setItem(REMEMBER_KEY, value);
      else window.localStorage.removeItem(REMEMBER_KEY);
    } catch {
      // storage blocked: just don't remember
    }
    setBusy(true);
    try {
      setResult(await attendance.lookup(value));
    } catch (err) {
      setError(errorMessage(err, "Couldn't check that ID."));
    } finally {
      setBusy(false);
    }
  }

  const todayEntry = result?.signedInToday ? result.signIns[0] : undefined;
  return (
    <section className="att__panel" aria-labelledby="mine-h">
      <h2 id="mine-h">Did I sign in?</h2>
      <form className="att__inline-form" onSubmit={submit}>
        <label className="att__field">
          <span>Your student ID</span>
          <input
            inputMode="numeric"
            autoComplete="off"
            maxLength={10}
            value={id}
            onChange={(e) => setId(e.target.value.replace(/\D/g, ""))}
            placeholder="10 digits"
          />
        </label>
        <button type="submit" className="t-button" disabled={busy}>
          {busy ? "Checking…" : "Check"}
        </button>
      </form>
      <label className="att__check">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember my ID on
        this device
      </label>
      {error && (
        <p className="att__error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="att__result" role="status">
          {todayEntry ? (
            <p className="att__ok">You signed in today at {formatTime(todayEntry.at, todayEntry.time)}.</p>
          ) : (
            <p className="att__warn">No sign-in for this ID today.</p>
          )}
          {result.signIns.length > 0 ? (
            <>
              <h3>Recent sign-ins ({result.signIns.length} in total)</h3>
              <ul className="att__list att__list--plain">
                {result.signIns.slice(0, 10).map((s) => (
                  <li key={s.at}>
                    <span>{formatDay(s.date)}</span>
                    <time dateTime={s.at}>{formatTime(s.at, s.time)}</time>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="att__muted">No sign-ins found for this ID. Check the number, or sign in at the kiosk.</p>
          )}
        </div>
      )}
    </section>
  );
}

function History() {
  const { data: days, error, busy } = useLoad(attendance.historyDays);
  const [date, setDate] = useState("");
  const [entries, setEntries] = useState<DayEntry[]>();
  const [dayError, setDayError] = useState<string>();

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    setEntries(undefined);
    setDayError(undefined);
    attendance
      .historyFor(date)
      .then((list) => !cancelled && setEntries(list))
      .catch((err) => !cancelled && setDayError(errorMessage(err, "Couldn't load that day.")));
    return () => {
      cancelled = true;
    };
  }, [date]);

  return (
    <section className="att__panel" aria-labelledby="hist-h">
      <h2 id="hist-h">Past meetings</h2>
      {busy && <p className="att__muted">Loading…</p>}
      {error && (
        <p className="att__error" role="alert">
          {error}
        </p>
      )}
      {days && days.length === 0 && <p className="att__muted">No sign-ins yet.</p>}
      {days && days.length > 0 && (
        <label className="att__field">
          <span>Day</span>
          <select value={date} onChange={(e) => setDate(e.target.value)}>
            <option value="">Choose a day…</option>
            {days.map((d: DaySummary) => (
              <option key={d.date} value={d.date}>
                {formatDay(d.date)} ({d.count})
              </option>
            ))}
          </select>
        </label>
      )}
      {dayError && (
        <p className="att__error" role="alert">
          {dayError}
        </p>
      )}
      {date && !entries && !dayError && <p className="att__muted">Loading…</p>}
      {entries && <EntryList entries={entries} />}
    </section>
  );
}
