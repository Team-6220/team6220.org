import { useEffect, useMemo, useState } from "react";
import { AREAS, clip, diffContent, jsonSchemaOf, parseContent, type AreaId } from "@team6220/content";
import { site } from "@team6220/data";
import Field from "./Field";
import { setAt, type Path, type Schema } from "./schema";

type Load = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; original: unknown; source: "main" | "bundled" };
type Sent =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "error"; message: string }
  | { kind: "done"; result: site.SubmitResult; real: boolean };

/** The editor for one area: a form generated from its schema, a live "what will change" list, and Submit. */
export default function Editor({ areaId }: { areaId: AreaId }) {
  const area = AREAS[areaId];
  const schema = useMemo(() => jsonSchemaOf(areaId) as Schema, [areaId]);
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [draft, setDraft] = useState<unknown>(undefined);
  const [sent, setSent] = useState<Sent>({ kind: "idle" });

  const fetchArea = () => {
    setLoad({ kind: "loading" });
    setSent({ kind: "idle" });
    site
      .load(areaId)
      .then(({ value, source }) => {
        setDraft(value);
        setLoad({ kind: "ready", original: value, source });
      })
      .catch((err) => setLoad({ kind: "error", message: err instanceof Error ? err.message : "Couldn't load the content." }));
  };
  useEffect(fetchArea, [areaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const check = useMemo(() => (load.kind === "ready" ? parseContent(areaId, draft) : null), [load.kind, areaId, draft]);
  const errors = useMemo(() => {
    const out: Record<string, string[]> = {};
    if (check && !check.ok) for (const i of check.issues) (out[i.path] ??= []).push(i.message);
    return out;
  }, [check]);
  const changes = useMemo(
    () => (load.kind === "ready" && check?.ok ? diffContent(load.original, check.value) : []),
    [load, check],
  );

  if (load.kind === "loading") return <p className="site__muted" role="status">Loading {area.label.toLowerCase()}…</p>;
  if (load.kind === "error") {
    return (
      <div className="site__panel" role="alert">
        <p>{load.message}</p>
        <button type="button" className="t-button" onClick={fetchArea}>
          Try again
        </button>
      </div>
    );
  }

  const valid = !!check?.ok;
  const problems = Object.entries(errors);
  const real = site.opensRealPullRequests();

  async function submit() {
    if (!check?.ok) return;
    setSent({ kind: "sending" });
    try {
      const result = await site.submit(areaId, check.value);
      setSent({ kind: "done", result, real });
    } catch (err) {
      const issues = (err as { issues?: { path: string; message: string }[] }).issues;
      const extra = issues?.length ? ` ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}` : "";
      setSent({ kind: "error", message: (err instanceof Error ? err.message : "Couldn't submit.") + extra });
    }
  }

  const onChange = (path: Path, value: unknown) => {
    setSent((s) => (s.kind === "done" || s.kind === "error" ? { kind: "idle" } : s));
    setDraft((d: unknown) => setAt(d, path, value));
  };

  return (
    <div className="site__editor">
      <p className="site__muted">
        Editing <code>{area.path}</code> {load.source === "main" ? "as it is on the main branch." : "as bundled with this build."} Nothing goes live until a webmaster merges the pull request.
      </p>

      <form
        className="site__form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        noValidate
      >
        <Field schema={schema} value={draft} path={[]} errors={errors} onChange={onChange} />

        <section className="site__panel" aria-labelledby="site-changes">
          <h2 id="site-changes">What will change</h2>
          {!valid && (
            <div role="alert">
              <p className="site__error">Fix these before submitting:</p>
              <ul>
                {problems.map(([path, messages]) => (
                  <li key={path}>
                    <code>{path || "(whole file)"}</code>: {messages.join("; ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {valid && changes.length === 0 && <p className="site__muted">No changes yet.</p>}
          {valid && changes.length > 0 && (
            <ul className="site__diff" aria-label="Changes">
              {changes.map((c) => (
                <li key={c.path} className={`site__diff-${c.kind}`}>
                  <code>{c.path}</code>
                  {c.kind !== "added" && (
                    <>
                      {" "}
                      <del>{clip(c.before)}</del>
                    </>
                  )}
                  {c.kind !== "removed" && (
                    <>
                      {" "}
                      <ins>{clip(c.after)}</ins>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="site__actions">
            <button type="submit" className="t-button" disabled={!valid || changes.length === 0 || sent.kind === "sending"}>
              {sent.kind === "sending" ? "Submitting…" : real ? "Submit for review (opens a pull request)" : "Submit (demo)"}
            </button>
            <button type="button" className="t-button t-button--quiet" onClick={() => setDraft(load.original)} disabled={changes.length === 0 && valid}>
              Undo my edits
            </button>
          </p>
          {!real && <p className="site__hint">Demo: no pull request is opened. This shows the checks and the changes a real submit would send.</p>}
        </section>
      </form>

      {sent.kind === "error" && (
        <p className="site__error" role="alert">
          {sent.message}
        </p>
      )}
      {sent.kind === "done" && (
        <div className="site__panel site__panel--ok" role="status">
          {sent.real ? (
            <>
              <h2>Pull request opened</h2>
              <p>
                A webmaster has to review and merge it before the site changes.{" "}
                <a href={sent.result.pullRequest.url} target="_blank" rel="noopener">
                  View pull request #{sent.result.pullRequest.number} on GitHub ↗
                </a>
              </p>
            </>
          ) : (
            <>
              <h2>Demo: no pull request is opened</h2>
              <p>
                A real submit would open a pull request from branch <code>{sent.result.pullRequest.branch}</code> with {sent.result.changes.length}{" "}
                change{sent.result.changes.length === 1 ? "" : "s"} to <code>{area.path}</code>.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
