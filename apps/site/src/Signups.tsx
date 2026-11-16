// Form signups (#76): pick a website form, see who filled it out, and copy every email at once to paste into an
// existing email (the To or Bcc line). Nothing here sends email.
import { useCallback, useEffect, useState } from "react";
import { site } from "@team6220/data";

type Range = "school-year" | "30-days" | "all";

const RANGES: { id: Range; label: string }[] = [
  { id: "school-year", label: "This school year (since Aug 1)" },
  { id: "30-days", label: "Last 30 days" },
  { id: "all", label: "All time" },
];

/** The first day of the range, or undefined for all time. The school year starts August 1. */
export function rangeStart(range: Range, now = new Date()): Date | undefined {
  if (range === "all") return undefined;
  if (range === "30-days")
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(year, 7, 1);
}

type Load =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; signups: site.Signup[]; demo: boolean };

export default function Signups() {
  const [formId, setFormId] = useState<site.SignupFormId>(
    site.SIGNUP_FORMS[0].id,
  );
  const [range, setRange] = useState<Range>("school-year");
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [copied, setCopied] = useState("");

  const fetchSignups = useCallback(async () => {
    setLoad({ kind: "loading" });
    setCopied("");
    try {
      const { signups, demo } = await site.listSignups(
        formId,
        rangeStart(range),
      );
      setLoad({ kind: "ready", signups, demo });
    } catch (err) {
      setLoad({
        kind: "error",
        message:
          err instanceof Error ? err.message : "Couldn't load the signups.",
      });
    }
  }, [formId, range]);

  useEffect(() => {
    void fetchSignups();
  }, [fetchSignups]);

  const emails = load.kind === "ready" ? site.uniqueEmails(load.signups) : [];

  async function copyEmails() {
    const text = load.kind === "ready" ? site.emailListText(load.signups) : "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(
        `Copied ${emails.length} email${emails.length === 1 ? "" : "s"}. Paste them into the To or Bcc line.`,
      );
    } catch {
      setCopied(
        "Your browser blocked copying. Select the list below and copy it by hand.",
      );
    }
  }

  return (
    <section aria-label="Form signups">
      <div className="site__bar">
        <label>
          <b>Form</b>{" "}
          <select
            value={formId}
            onChange={(e) => setFormId(e.target.value as site.SignupFormId)}
          >
            {site.SIGNUP_FORMS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <b>Signed up</b>{" "}
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as Range)}
          >
            {RANGES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {load.kind === "loading" && (
        <p className="t-muted" role="status">
          Loading signups…
        </p>
      )}
      {load.kind === "error" && (
        <div className="t-panel" role="alert">
          <p>{load.message}</p>
          <button
            type="button"
            className="t-button"
            onClick={() => void fetchSignups()}
          >
            Try again
          </button>
        </div>
      )}
      {load.kind === "ready" && (
        <>
          {load.demo && (
            <p className="site__hint">
              Demo: these are made-up signups. Real ones appear once the Site
              Manager runs on the server.
            </p>
          )}
          <div className="t-panel signups__copy">
            <p>
              <b>{load.signups.length}</b> signup
              {load.signups.length === 1 ? "" : "s"}, <b>{emails.length}</b>{" "}
              different email
              {emails.length === 1 ? "" : "s"}.
            </p>
            <div className="site__actions">
              <button
                type="button"
                className="t-button"
                disabled={emails.length === 0}
                onClick={() => void copyEmails()}
              >
                Copy all emails
              </button>
            </div>
            {copied && (
              <p className="site__hint" role="status">
                {copied}
              </p>
            )}
            {emails.length > 0 && (
              <textarea
                className="signups__emails"
                readOnly
                rows={3}
                value={emails.join(", ")}
                aria-label="All emails"
              />
            )}
          </div>
          {load.signups.length === 0 ? (
            <p className="t-muted">
              Nobody has filled out this form in that time.
            </p>
          ) : (
            <div className="signups__scroll">
              <table className="t-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Email</th>
                    <th scope="col">Signed up</th>
                    <th scope="col">Answers</th>
                  </tr>
                </thead>
                <tbody>
                  {load.signups.map((s) => (
                    <tr key={s.id}>
                      <td>{s.name || "—"}</td>
                      <td>{s.email || "—"}</td>
                      <td>
                        {s.submittedAt
                          ? new Date(s.submittedAt).toLocaleDateString()
                          : "—"}
                      </td>
                      <td>
                        {Object.entries(s.details)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" · ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
