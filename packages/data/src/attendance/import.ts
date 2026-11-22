// Importing sign-ins from the old Google Sheet's Data tab (columns A and B: timestamp, student ID). Plain functions, so
// the screen, the server and the tests share them. Browser-safe.

/** One sign-in read from the Sheet: the day and time as the team wrote them (team time). */
export interface ImportRow {
  studentId: string;
  /** yyyy-mm-dd */
  date: string;
  /** HH:MM, "" when the Sheet only has the day (midnight). */
  time: string;
}

export interface ParsedSheet {
  rows: ImportRow[];
  /** Lines that were not a sign-in (the header, blank lines, an ID like "1"). */
  skipped: number;
}

const STAMP = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

/** Reads what was copied from the Sheet's Data tab: one sign-in per line, columns split by a tab or a comma. The same
 *  person on the same day is kept once (the earliest time). */
export function parseSheet(text: string): ParsedSheet {
  const byKey = new Map<string, ImportRow>();
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [stamp = "", id = ""] = line.split(/\t|,/).map((c) => c.trim().replace(/^"|"$/g, ""));
    const m = STAMP.exec(stamp);
    const studentId = id.replace(/\D/g, "");
    if (!m || !/^\d{6,12}$/.test(studentId) || Number(m[1]) < 1 || Number(m[1]) > 12 || Number(m[2]) < 1 || Number(m[2]) > 31) {
      skipped++;
      continue;
    }
    const date = `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    // A stamp with no time, or exactly midnight, was typed by hand: the time is unknown.
    const hh = m[4] === undefined ? 0 : Number(m[4]);
    const mm = m[5] === undefined ? 0 : Number(m[5]);
    const ss = m[6] === undefined ? 0 : Number(m[6]);
    const time = hh === 0 && mm === 0 && ss === 0 ? "" : `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    const key = `${studentId}|${date}`;
    const old = byKey.get(key);
    if (!old) byKey.set(key, { studentId, date, time });
    else if (time && (!old.time || time < old.time)) old.time = time;
  }
  return { rows: [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.studentId.localeCompare(b.studentId)), skipped };
}

/** A team date and time as an ISO time (Pacific, with daylight saving). */
export function teamIso(date: string, hhmm: string): string {
  const guess = new Date(`${date}T${hhmm}:00Z`);
  const part = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", timeZoneName: "longOffset" }).formatToParts(guess).find((p) => p.type === "timeZoneName")?.value ?? "GMT-08:00";
  const offset = part === "GMT" ? "+00:00" : part.replace("GMT", "");
  return new Date(`${date}T${hhmm}:00${offset}`).toISOString();
}
