import {
  aggregateByDesign,
  analyzeContributions,
  allianceObservations,
  binnedResponse,
  comparisonTable,
  contributionTable,
  coverageCounts,
  coverageTable,
  effectHeadline,
  histogram,
  meanCI,
  outcomeDefs,
  parameterEffect,
  rpRatesTable,
  winProbability,
  type OutcomeDef,
  type Sample,
  type Table,
} from "@goldsim/analytics";
import type { BatchResultsFile, SweepParam } from "@goldsim/batch";
import { navigate } from "../router.js";
import { session } from "../app-state.js";
import { clear, h, title } from "../ui/dom.js";
import { onThemeChange } from "../ui/theme.js";
import { exportResultsFile, importResultsFile } from "./files.js";
import { barChart, effectChart, histogramChart } from "./charts.js";
import { glossaryPanel, help } from "./help.js";
import { describeTarget, fullParamLabel, slotName } from "./names.js";
import { runKind, runsPanel } from "./runs.js";
import { addRun, ciText, fmt, fmtDuration, labHooks, labState, put, tableView } from "./util.js";

type Row = BatchResultsFile["results"][number];

interface ParamInfo {
  id: string;
  label: string;
  short: string;
  unit: string;
}

function shortOfLabel(label: string): string {
  const last = label.split(" · ").pop() ?? label;
  return last.replace(/\s*\([^)]*\)\s*$/, "");
}

/** Readable name for a swept setting, also for files saved before labels existed. */
function paramInfo(file: BatchResultsFile, p: SweepParam): ParamInfo {
  const random = file.settings.random;
  const robot = file.settings.base.robots[p.target.robot];
  const design = random ? random.subjects[0] : robot?.design;
  const opt = describeTarget(design, p.target.kind === "design" ? { kind: "design", path: p.target.path } : { kind: "profile", knob: p.target.knob }, session.game);
  const owner = random ? "Test robot" : robot ? slotName(robot.alliance, robot.station) : "Robot";
  const label = p.label ?? (opt ? fullParamLabel(owner, opt) : p.id);
  return { id: p.id, label, short: opt?.short ?? shortOfLabel(label), unit: p.unit ?? opt?.unit ?? "" };
}

function robotChoices(file: BatchResultsFile): { index: number; label: string }[] {
  const { robots, drivers } = file.settings.base;
  return robots.map((r, i) => {
    const d = drivers[i];
    return { index: i, label: `${slotName(r.alliance, r.station)} · ${r.design.name}${d?.kind === "agent" ? ` (${d.profile.label})` : " (idle)"}` };
  });
}

function subjectNames(file: BatchResultsFile): string[] {
  return [...new Set(file.results.map((r) => (r.subject !== undefined ? r.result.robots[r.subject]?.name : undefined)).filter((n): n is string => !!n))];
}

/** Plain description of what a run tested. */
function describeRun(file: BatchResultsFile): HTMLElement {
  const { settings } = file;
  const lines: (Node | string)[] = [];
  const random = settings.random;
  if (random) {
    lines.push(
      h("li", null, h("b", null, "Robots tested: "), random.subjects.map((d) => d.name).join(", "), `. Each played ${random.matches} matches${settings.configs.length > 1 ? " at every setting" : ""}, always on a random alliance and station.`),
      h(
        "li",
        null,
        h("b", null, "Everyone else: "),
        `partners and opponents were drawn at random from ${random.pool.length} design${random.pool.length === 1 ? "" : "s"}, driven by `,
        random.others.kind === "fixed" ? `the "${random.others.profile.label}" strategy.` : random.others.skill ? `random strategies at ${random.others.skill} skill.` : "random strategies at mixed skill levels.",
      ),
    );
  } else {
    lines.push(h("li", null, h("b", null, "Lineup: "), robotChoices(file).map((r) => r.label).join("; ")));
  }
  if (settings.params.length)
    for (const p of settings.params) {
      const info = paramInfo(file, p);
      const vals = p.values ?? settings.configs.map((c) => c.values[p.id]).filter((v): v is number => v !== undefined);
      const lo = Math.min(...vals);
      const hi = Math.max(...vals);
      lines.push(
        h(
          "li",
          null,
          h("b", null, "Changed: "),
          info.label,
          ` from ${fmt(lo)} to ${fmt(hi)}${info.unit ? ` ${info.unit}` : ""} `,
          p.values ? `(${p.values.length} chosen values)` : `(${settings.configs.length} values spread evenly across the range)`,
          ".",
        ),
      );
    }
  else lines.push(h("li", null, "Nothing was changed: every match used the robots as designed."));
  const seeds = settings.seeds.length;
  lines.push(
    h(
      "li",
      null,
      h("b", null, "Matches: "),
      `${file.results.length} played${random ? "" : ` (${settings.configs.length} setting${settings.configs.length === 1 ? "" : "s"} × ${seeds} match${seeds === 1 ? "" : "es"} each)`} in ${fmtDuration(file.elapsedMs)}.`,
    ),
  );
  return h("div", { class: "panel col" }, h("h2", null, "What was tested"), h("ul", { class: "small", style: "margin:0;padding-left:18px;line-height:1.5" }, lines));
}

function pieceName(): string {
  return session.game.pieces.types[0]?.label ?? "piece";
}

const STATUS_TAG: Record<string, string> = { implemented: "good", approximated: "warn", not_implemented: "bad" };

export function dashboardScreen(root: HTMLElement): () => void {
  const body = h("div", { class: "lab" });
  root.appendChild(body);
  let outcomeId = "robotPoints";
  let paramId: string | null = null;
  let robotChoice: number | null = null;
  let subjectFilter = "all";
  let lastRun = -1;

  const render = () => {
    clear(body);
    const runs = labState.runs;
    put(
      body,
      h(
        "div",
        { class: "row center" },
        title("h1", "Results", { class: "grow" }),
        h(
          "button",
          {
            class: "btn",
            onclick: () =>
              importResultsFile((f) => {
                addRun(f);
                render();
              }),
          },
          "Import a saved run…",
        ),
        h("button", { class: "btn", onclick: () => navigate("/lab/batch") }, "New run"),
      ),
      h("p", { class: "lab-intro muted" }, "Open a run to see what the simulated matches say. The page explains each chart in plain words; the guide below defines every term."),
      glossaryPanel("Short explanations of every term on these pages."),
    );
    if (!runs.length) {
      put(body, h("div", { class: "panel" }, h("p", null, "No runs yet. Start one on the Batch page, or import a run you saved earlier.")));
      return;
    }
    if (labState.selectedRun < 0 || labState.selectedRun >= runs.length) labState.selectedRun = runs.length - 1;
    if (lastRun !== labState.selectedRun) {
      lastRun = labState.selectedRun;
      paramId = null;
      robotChoice = null;
      subjectFilter = "all";
      outcomeId = "robotPoints";
    }
    put(body, runsPanel({ selected: labState.selectedRun, onOpen: (i) => ((labState.selectedRun = i), render()), onChange: render }));
    const file = runs[labState.selectedRun]!;
    const rows = file.results;
    put(
      body,
      h(
        "div",
        { class: "panel row center lab-runbar" },
        h("span", { class: "grow" }, h("b", null, file.name), h("span", { class: "small muted" }, ` · ${runKind(file)} · ${rows.length} matches · ${file.status} · ${file.module.id} v${file.module.version} (manual ${file.module.manualVersion}) · engine ${file.engineVersion}${file.errors.length ? ` · ${file.errors.length} failed` : ""}`)),
        h("button", { class: "btn", title: "Download this run to your computer", onclick: () => exportResultsFile(file) }, "Export this run"),
      ),
    );
    if (!rows.length) {
      put(body, h("div", { class: "panel" }, h("p", null, "This run has no finished matches.")));
      return;
    }
    put(body, describeRun(file));

    const piece = pieceName();
    const outs = outcomeDefs(piece);
    const random = file.settings.random;
    const choices = robotChoices(file);
    const params = file.settings.params;
    const infos = params.map((p) => paramInfo(file, p));
    if (paramId === null || !infos.some((i) => i.id === paramId)) paramId = infos[0]?.id ?? null;
    if (robotChoice === null) robotChoice = params[0] ? params[0].target.robot : 0;
    const outcome = outs.find((o) => o.id === outcomeId) ?? outs[0]!;

    const subjectRows = random && subjectFilter !== "all" ? rows.filter((r) => r.result.robots[r.subject ?? 0]?.name === subjectFilter) : rows;
    const robotOf = (r: Row) => (random ? (r.subject ?? 0) : (robotChoice ?? 0));
    const valueOf = (r: Row, o: OutcomeDef): number => o.value(r.summary, robotOf(r)) ?? NaN;

    // ---- Setting -> result explorer ---------------------------------------
    if (params.length) {
      const info = infos.find((i) => i.id === paramId)!;
      const samples: Sample[] = subjectRows.map((r) => ({ params: r.values, outcome: valueOf(r, outcome) }));
      const effect = parameterEffect(samples, info.id);
      const overall = meanCI(samples.map((s) => s.outcome).filter(Number.isFinite));
      const subjectLabel = random ? "the test robot" : (choices[robotChoice]?.label.split(" · ")[0] ?? "the robot");
      const headline = effect
        ? effectHeadline(effect, { paramLabel: info.short, unit: info.unit, outcome, subject: outcome.perRobot ? subjectLabel : undefined, meanOutcome: overall.mean })
        : "There isn't enough variety in this setting (or not enough matches) to say anything yet.";
      const pts = binnedResponse(samples, info.id, 8);
      const binned = new Set(samples.map((s) => s.params[info.id])).size > 12;
      const tbl: Table = {
        title: `${outcome.label} by ${info.short}`,
        columns: [
          { key: "setting", label: `${info.short}${info.unit ? ` (${info.unit})` : ""}` },
          { key: "n", label: "Matches" },
          { key: "mean", label: `Average ${outcome.label.toLowerCase()}` },
          { key: "lo", label: "95% range low" },
          { key: "hi", label: "95% range high" },
        ],
        rows: pts.map((p) => ({ setting: p.from === p.to ? p.value : `${fmt(p.from)} to ${fmt(p.to)}`, n: p.n, mean: p.mean, lo: p.lo, hi: p.hi })),
      };
      put(
        body,
        h(
          "div",
          { class: "panel col" },
          h("div", { class: "row center" }, h("h2", { class: "grow" }, "Setting → result"), help("Each faint square is one match. The gold line is the average result at each tested value, and the shaded band is its 95% range: where the true average very likely lies. A flat line, or a band that easily contains a flat line, means the setting made no clear difference.")),
          h("p", { class: "small muted", style: "margin:0" }, "Choose a setting and a result to see how one changes the other."),
          h(
            "div",
            { class: "lab-form" },
            infos.length > 1
              ? h("label", { class: "lab-field" }, h("span", { class: "small muted" }, "Setting that was changed"), h("select", { onchange: (e: Event) => ((paramId = (e.target as HTMLSelectElement).value), render()) }, infos.map((i) => h("option", { value: i.id, selected: i.id === paramId }, i.label))))
              : h("div", { class: "lab-field" }, h("span", { class: "small muted" }, "Setting that was changed"), h("b", null, info.label)),
            h(
              "label",
              { class: "lab-field" },
              h("span", { class: "small muted" }, "Result to measure"),
              h("select", { onchange: (e: Event) => ((outcomeId = (e.target as HTMLSelectElement).value), render()) }, outs.map((o) => h("option", { value: o.id, selected: o.id === outcome.id }, o.label))),
              h("span", { class: "small muted" }, outcome.help),
            ),
            random
              ? subjectNames(file).length > 1
                ? h("label", { class: "lab-field" }, h("span", { class: "small muted" }, "Robot under test"), h("select", { onchange: (e: Event) => ((subjectFilter = (e.target as HTMLSelectElement).value), render()) }, [h("option", { value: "all", selected: subjectFilter === "all" }, "All")].concat(subjectNames(file).map((n) => h("option", { value: n, selected: subjectFilter === n }, n)))))
                : null
              : h("label", { class: "lab-field" }, h("span", { class: "small muted" }, "Robot to measure"), h("select", { onchange: (e: Event) => ((robotChoice = Number((e.target as HTMLSelectElement).value)), render()) }, choices.map((c) => h("option", { value: String(c.index), selected: c.index === robotChoice }, c.label)))),
          ),
          h("p", { class: `lab-headline${effect?.clear ? "" : " warn"}` }, headline),
          effectChart({
            points: pts,
            dots: samples.map((s, i) => ({ x: s.params[info.id]!, y: s.outcome, tip: `Seed ${subjectRows[i]!.seed}: ${Number.isFinite(s.outcome) ? outcome.format(s.outcome) : "n/a"}` })),
            xLabel: `${info.short}${info.unit ? ` (${info.unit})` : ""}`,
            yLabel: `${outcome.label}${outcome.unit && outcome.unit !== "%" ? ` (${outcome.unit})` : ""}`,
            yFormat: outcome.format,
            overallMean: overall.mean,
          }),
          binned ? h("p", { class: "small muted", style: "margin:0" }, "Every match had its own value (spread across a range), so the line groups nearby values into 8 ranges. The faint squares are the individual matches.") : null,
          h("details", null, h("summary", { class: "small" }, "Numbers behind the chart"), tableView(tbl)),
        ),
      );

      // What matters most
      const rank = params
        .map((p) => {
          const i = paramInfo(file, p);
          const e = parameterEffect(samples, i.id);
          return { info: i, effect: e };
        })
        .filter((x) => x.effect)
        .sort((a, b) => b.effect!.r2 - a.effect!.r2);
      put(
        body,
        h(
          "div",
          { class: "panel col" },
          h("div", { class: "row center" }, h("h2", { class: "grow" }, "What matters most"), help("Ranks the changed settings by how much of the match-to-match variation in the chosen result each one explains. Grey bars mean the sim can't tell the setting apart from luck.")),
          rank.length
            ? h(
                "div",
                { class: "lab-rank" },
                rank.flatMap((x, k) => [
                  h("div", null, h("b", null, `${k + 1}. ${x.info.short}`), h("div", { class: "small muted" }, x.effect!.clear ? `Clear ${x.effect!.change > 0 ? "increase" : "decrease"}: ${x.effect!.change > 0 ? "+" : "−"}${outcome.format(Math.abs(x.effect!.change))} across the tested range` : "No clear effect")),
                  h("div", null, h("div", { class: `bar${x.effect!.clear ? "" : " none"}` }, h("div", { style: `width:${Math.max(1, Math.min(100, x.effect!.r2 * 100)).toFixed(1)}%` })), h("div", { class: "small muted" }, `explains ${(x.effect!.r2 * 100).toFixed(1)}% of the variation in ${outcome.label.toLowerCase()}`)),
                ]),
              )
            : h("p", { class: "small muted" }, "Needs at least two different values and a few matches."),
        ),
      );
    } else if (random) {
      // Archetype test without a sweep: how each tested design did, averaged over random lineups.
      const names = subjectNames(file);
      const cols = outs.filter((o) => ["robotPoints", "scored", "accuracy", "climb", "win", "rp"].includes(o.id));
      const t: Table = {
        title: "How each tested design did",
        columns: [{ key: "design", label: "Design" }, { key: "n", label: "Matches" }, ...cols.map((o) => ({ key: o.id, label: o.label }))],
        rows: names.map((n) => {
          const mine = rows.filter((r) => r.result.robots[r.subject ?? 0]?.name === n);
          const row: Table["rows"][number] = { design: n, n: mine.length };
          for (const o of cols) {
            const ci = meanCI(mine.map((r) => valueOf(r, o)).filter(Number.isFinite));
            row[o.id] = ciText(ci.mean, ci.lo, ci.hi);
          }
          return row;
        }),
      };
      put(body, h("h2", null, "How each tested design did"), tableView(t), h("p", { class: "small muted" }, "Averages over every random alliance, station, and strategy, with the 95% range in brackets. Overlapping ranges mean no clear difference between designs yet."));
    }

    // ---- Designs compared ---------------------------------------------------
    const summaries = rows.map((r) => r.summary);
    const results = rows.map((r) => r.result);
    const comp = comparisonTable(aggregateByDesign(summaries));
    const ciCols = new Set(comp.columns.filter((c) => c.key.endsWith("_lo") || c.key.endsWith("_hi")).map((c) => c.key));
    put(
      body,
      h("h2", null, "Designs compared"),
      h("p", { class: "small muted", style: "margin-top:0" }, "The average result of every design that played in this run. Each number has its 95% range in brackets. Overlapping ranges mean the sim can't yet say one design is better."),
      tableView(comp, { hide: (k) => ciCols.has(k), cell: (k, v, row) => (ciCols.has(`${k}_lo`) ? ciText(v, row[`${k}_lo`], row[`${k}_hi`]) : null) }),
    );

    // ---- Distribution ---------------------------------------------------------
    const win = winProbability(results, "blue");
    if (random) {
      const wins = subjectRows.map((r) => valueOf(r, outs.find((o) => o.id === "win")!)).filter(Number.isFinite);
      const ci = meanCI(subjectRows.map((r) => valueOf(r, outcome)).filter(Number.isFinite));
      put(
        body,
        h(
          "div",
          { class: "grid2" },
          h("div", { class: "panel" }, h("h3", null, `${outcome.label}: average ${ciText(ci.mean, ci.lo, ci.hi)}`), h("p", { class: "small muted", style: "margin-top:0" }, "How the result was spread over the matches. A wide spread means luck of the lineup matters a lot."), histogramChart(histogram(subjectRows.map((r) => valueOf(r, outcome)).filter(Number.isFinite)), outcome.label)),
          h("div", { class: "panel" }, h("h3", null, "Alliance win rate"), h("p", null, h("b", null, `${fmt(meanCI(wins).mean * 100, 1)}%`), ` of matches won by the robot's alliance (a tie counts as half).`)),
        ),
      );
    } else {
      const blue = results.map((r) => r.score.blue.total);
      const red = results.map((r) => r.score.red.total);
      put(
        body,
        h("h2", null, "How the alliances scored"),
        h(
          "div",
          { class: "grid2" },
          h("div", { class: "panel" }, h("h3", null, `Blue score: average ${ciText(meanCI(blue).mean, meanCI(blue).lo, meanCI(blue).hi)}`), histogramChart(histogram(blue), "Points", "blue")),
          h("div", { class: "panel" }, h("h3", null, `Red score: average ${ciText(meanCI(red).mean, meanCI(red).lo, meanCI(red).hi)}`), histogramChart(histogram(red), "Points", "red")),
        ),
        h("div", { class: "panel" }, h("span", null, "Blue won ", h("b", null, `${fmt(win.probability * 100, 1)}%`), ` of matches (ties count half): ${win.wins} of ${win.n} outright [${fmt(win.ci.lo * 100, 1)}% to ${fmt(win.ci.hi * 100, 1)}%], ${win.ties} tied.`)),
      );
    }

    // ---- Contribution (EPA-style) ------------------------------------------------
    const analysis = analyzeContributions(allianceObservations(results));
    const designNames = [...new Set(file.settings.base.robots.map((r) => r.design.name))];
    put(
      body,
      h("div", { class: "row center" }, h("h2", { class: "grow" }, "How much each design adds (EPA-style)"), help("An estimate of how many points one robot of each design adds to its alliance, found by comparing many different alliance lineups. It only works when the lineups vary; with the same six robots every match there's no way to tell who earned the points.")),
    );
    if (analysis.status !== "ok") {
      put(
        body,
        h(
          "div",
          { class: "panel col" },
          h("p", { class: "lab-headline warn" }, analysis.message),
          h("p", { class: "small muted", style: "margin:0" }, `This run had ${analysis.observations / 2} matches with ${analysis.distinctLineups} different alliance lineup${analysis.distinctLineups === 1 ? "" : "s"}. To estimate contributions, put the designs on random alliances.`),
          h("div", { class: "controls" }, h("button", { class: "btn primary", onclick: () => labHooks.testArchetype?.(designNames) }, "Re-run with random alliances")),
        ),
      );
    } else {
      put(
        body,
        h("p", { class: `small ${analysis.rows.every((r) => r.reliable) ? "muted" : ""}` }, analysis.message),
        h(
          "div",
          { class: "grid2" },
          h("div", { class: "panel" }, barChart(analysis.rows.map((c) => ({ label: c.design, value: c.contribution, err: 1.96 * c.standardError })), "Points added per match by one robot (bars show the 95% range)")),
          tableView(contributionTable(analysis.rows), { cell: (k, v, row) => (k === "design" && analysis.rows.find((r) => r.design === row.design)?.reliable === false ? `${v} (wide range)` : null) }),
        ),
      );
    }

    // ---- Ranking points and rules ------------------------------------------------------
    const cov = coverageCounts(results[0]!);
    put(
      body,
      h("h2", null, "Ranking points"),
      h("p", { class: "small muted", style: "margin-top:0" }, "How often each alliance earned each bonus ranking point. Thresholds depend on the event type chosen when the run started."),
      tableView(rpRatesTable(summaries)),
      h("h2", null, "Which rules the sim checks"),
      h(
        "p",
        null,
        h("span", { class: "tag good" }, `${cov.implemented ?? 0} enforced`),
        h("span", { class: "tag warn" }, `${cov.approximated ?? 0} roughly modeled`),
        h("span", { class: "tag bad" }, `${cov.not_implemented ?? 0} ignored`),
        h("span", { class: "small muted" }, " These results only reflect the rules that are enforced or roughly modeled."),
      ),
      tableView(coverageTable(results[0]!), { cell: (k, v) => (k === "status" ? h("span", { class: `tag ${STATUS_TAG[String(v)] ?? ""}` }, String(v).replace("_", " ")) : null) }),
    );
    if (file.errors.length) put(body, h("details", { class: "panel" }, h("summary", null, `${file.errors.length} matches failed`), h("ul", { class: "small mono" }, file.errors.slice(0, 50).map((e) => h("li", null, `${e.jobId}: ${e.message}`)))));
  };

  render();
  return onThemeChange(() => render());
}
