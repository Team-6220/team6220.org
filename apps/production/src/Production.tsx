// /apps/production: part requests, the manufacturing tracker and the print queue.
// Plan: docs/operations/PRODUCTION.md. Two sections, Design and Manufacturing, each with its own screens.
import { useCallback, useEffect, useState } from "react";
import { auth, ops, production, type OpsViewer, type Part, type PartMethod, type Project } from "@team6220/data";
import { AppShell, type AppShellState } from "@team6220/ui";
import { PartCard } from "./PartCard";
import { RequestForm } from "./RequestForm";

type Screen = "request" | "mine" | "prints" | "tracker" | "shapeoko" | "planner" | "optimizer";
const SECTIONS: { name: string; screens: [Screen, string][] }[] = [
  { name: "Design", screens: [["request", "Request a part"], ["mine", "My requests"], ["prints", "Print queue"]] },
  { name: "Manufacturing", screens: [["tracker", "Tracker"], ["shapeoko", "Shapeoko pending"], ["planner", "Cut planner"], ["optimizer", "Cut optimizer"]] },
];
type Message = { tone: "ok" | "error"; text: string } | null;

export default function Production() {
  const [viewer, setViewer] = useState<OpsViewer | null>(null);
  const [loadError, setLoadError] = useState("");
  const [parts, setParts] = useState<Part[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  // Opened from an Icarus task: /apps/production?task=<task id>&project=<project id>
  const [forTask] = useState(() => {
    const query = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    const taskId = query.get("task") ?? "";
    return taskId ? { taskId, projectId: query.get("project") ?? "" } : undefined;
  });
  const [screen, setScreen] = useState<Screen>(forTask ? "request" : "tracker");
  const [message, setMessage] = useState<Message>(null);

  const reload = useCallback(async () => {
    const [allParts, allProjects] = await Promise.all([production.listParts(), ops.listProjects()]);
    setParts(allParts);
    setProjects(allProjects);
  }, []);

  useEffect(() => {
    ops.readDemoFromUrl();
    (async () => {
      const who = await ops.getViewer();
      setViewer(who);
      if (who.kind === "member") await reload();
    })().catch((err) => setLoadError(err instanceof Error ? err.message : "We couldn't load Production."));
  }, [reload]);

  const me = viewer?.kind === "member" ? viewer.me : null;

  /** Runs a change, shows what happened, and reloads either way. */
  async function run(change: () => Promise<string | void>) {
    try {
      const text = await change();
      setMessage(text ? { tone: "ok", text } : null);
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "That didn't work. Try again." });
    }
    await reload();
  }
  const onStep = (part: Part, change: (p: Part) => Part) => run(async () => void (await production.step(part._id, me!, change)));

  const state: AppShellState = loadError ? "error" : !viewer ? "loading" : viewer.kind !== "member" ? viewer.kind : parts ? "ready" : "loading";
  const open = (parts ?? []).filter(production.isOpen);
  const cards = (list: Part[], empty: string) =>
    list.length ? <div className="prod__cards">{list.map((p) => <PartCard key={p._id} part={p} me={me!} projects={projects} onStep={onStep} />)}</div> : <p className="t-muted">{empty}</p>;

  return (
    <AppShell
      title="Production"
      state={state}
      who={me?.name}
      errorMessage={loadError}
      notice={ops.demoNotice()}
      onSignIn={() => void auth.login("/apps/production")}
    >
      {me && parts && (
        <div className="prod">
          <nav className="prod__nav" aria-label="Screens">
            {SECTIONS.map((section) => (
              <div key={section.name} className="prod__section">
                <span className="prod__section-name">{section.name}</span>
                {section.screens.map(([id, label]) => (
                  <button key={id} type="button" className={screen === id ? "prod__tab prod__tab--on" : "prod__tab"} onClick={() => setScreen(id)}>
                    {label}
                    {id === "shapeoko" && ` (${open.filter((p) => p.status === "pending-setup").length})`}
                    {id === "prints" && ` (${open.filter((p) => p.method === "print").length})`}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          {message && <p className={`t-status t-status--${message.tone}`} role="status">{message.text}</p>}

          {screen === "request" && (me.roles.team
            ? <RequestForm projects={projects} forTask={forTask} onSubmit={(request) => run(async () => `Submitted ${production.partLabel((await production.requestParts([request], me))[0])}.`)} />
            : <p className="t-muted">Your account can look at Production but not request parts.</p>)}
          {screen === "mine" && cards(parts.filter((p) => p.designerId === me.id), "You haven't requested any parts yet.")}
          {screen === "prints" && cards(open.filter((p) => p.method === "print"), "The print queue is empty.")}
          {screen === "tracker" && <Tracker parts={open.filter((p) => p.status !== "pending-setup")} meId={me.id} cards={cards} />}
          {screen === "shapeoko" && cards(open.filter((p) => p.status === "pending-setup"), "No Shapeoko parts are waiting for setup.")}
          {(screen === "planner" || screen === "optimizer") && (
            <section className="t-panel t-panel--notice">
              <h2>{screen === "planner" ? "Cut planner" : "Cut optimizer"}: not moved here yet</h2>
              <p>
                This screen is planned for a later build step. Until then the cut planner is still in{" "}
                <a href="/apps/inventory">Inventory</a>, under Raw Materials.
              </p>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}

/** Manufacturing > Tracker: what to make next, with filters for the shop floor. */
function Tracker({ parts, meId, cards }: { parts: Part[]; meId: string; cards: (list: Part[], empty: string) => JSX.Element }) {
  const [method, setMethod] = useState<PartMethod | "">("");
  const [material, setMaterial] = useState("");
  const [show, setShow] = useState<"all" | "mine" | "unclaimed">("all");
  const materials = [...new Set(parts.map((p) => p.material))].sort();
  const shown = parts.filter(
    (p) =>
      (!method || p.method === method) &&
      (!material || p.material === material) &&
      (show === "all" || (show === "mine" ? production.currentWork(p)?.memberId === meId : p.status === "ready" || p.status === "handed-back")),
  );
  return (
    <>
      <div className="prod__filters">
        <select value={show} onChange={(e) => setShow(e.target.value as typeof show)} aria-label="Show">
          <option value="all">Everything open</option>
          <option value="unclaimed">Nobody has it</option>
          <option value="mine">I have it</option>
        </select>
        <select value={method} onChange={(e) => setMethod(e.target.value as PartMethod | "")} aria-label="Method">
          <option value="">Every method</option>
          {(Object.keys(production.METHOD_LABELS) as PartMethod[]).map((m) => <option key={m} value={m}>{production.METHOD_LABELS[m]}</option>)}
        </select>
        <select value={material} onChange={(e) => setMaterial(e.target.value)} aria-label="Material">
          <option value="">Every material</option>
          {materials.map((m) => <option key={m}>{m}</option>)}
        </select>
        <span className="t-muted">{shown.length} parts, most urgent first</span>
      </div>
      {cards(shown, "Nothing to make with these filters.")}
    </>
  );
}
