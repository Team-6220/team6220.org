import { GameModuleFiles, type GameModuleData } from "./game.js";
import { formatIssues, validate } from "./validate.js";

export interface GameCheckReport {
  errors: string[];
  warnings: string[];
  summary: string[];
}

type RawFiles = Partial<Record<keyof typeof GameModuleFiles, unknown>>;

/** Schema-validates each module file. Returns the typed module only if every file is valid. */
export function validateModuleFiles(files: RawFiles): { module?: GameModuleData; errors: string[] } {
  const errors: string[] = [];
  const parsed: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(GameModuleFiles)) {
    const raw = files[name as keyof RawFiles];
    if (raw === undefined) {
      errors.push(`${name} is missing. Every game module needs it (see docs/AUTHORING.md).`);
      continue;
    }
    const result = validate(schema, raw);
    if (result.ok) parsed[name] = result.value;
    else errors.push(`${name} does not match its schema:\n${formatIssues(result.issues)}`);
  }
  if (errors.length) return { errors };
  return {
    errors,
    module: {
      game: parsed["game.json"],
      field: parsed["field.json"],
      pieces: parsed["pieces.json"],
      scoring: parsed["scoring.json"],
      rules: parsed["rules.json"],
      mechanisms: parsed["mechanisms.json"],
      namedCommands: parsed["named-commands.json"],
      stats: parsed["stats.json"],
    } as GameModuleData,
  };
}

/** Cross-file checks that a schema cannot express. Messages describe the game-level cause. */
export function checkModule(m: GameModuleData): GameCheckReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const summary: string[] = [];

  // Element ids
  const elementIds = new Set<string>();
  for (const el of m.field.elements) {
    if (elementIds.has(el.id)) errors.push(`field.json: two elements share the id "${el.id}". Ids must be unique.`);
    elementIds.add(el.id);
  }
  const byKind = (kind: string) => m.field.elements.filter((e) => e.kind === kind).map((e) => e.id);

  // Pieces
  const pieceIds = new Set(m.pieces.types.map((p) => p.id));
  if (!pieceIds.has(m.pieces.preload.piece))
    errors.push(`pieces.json: preload uses piece "${m.pieces.preload.piece}", which is not a declared piece type.`);
  let fixedPlaced = 0;
  let remainderSources = 0;
  for (const el of m.field.elements) {
    if (el.kind === "pieceSource") {
      if (!pieceIds.has(el.piece))
        errors.push(`field.json: piece source "${el.id}" places "${el.piece}", which is not in pieces.json.`);
      const copies = el.mirror ? 2 : 1;
      if (el.count === "remainder") remainderSources += copies;
      else fixedPlaced += el.count * copies;
    }
    if (el.kind === "feeder") fixedPlaced += el.stock * (el.mirror ? 2 : 1);
  }
  const maxPreload = m.pieces.preload.max * m.game.robotsPerAlliance * 2;
  if (remainderSources > 1)
    errors.push(`field.json: only one piece source may use count "remainder" (found ${remainderSources} copies).`);
  const remainder = m.pieces.totalCount - fixedPlaced - maxPreload;
  if (remainderSources === 1) {
    if (remainder < 0)
      errors.push(
        `Piece staging adds up to more than totalCount (${m.pieces.totalCount}): ${fixedPlaced} placed + up to ${maxPreload} preloaded.`,
      );
    summary.push(`Pieces: ${m.pieces.totalCount} total; ${fixedPlaced} fixed; up to ${maxPreload} preloaded; remainder ${remainder} (more if robots preload less).`);
  } else if (fixedPlaced + maxPreload !== m.pieces.totalCount) {
    warnings.push(`Placed pieces (${fixedPlaced}) + max preloads (${maxPreload}) != totalCount (${m.pieces.totalCount}).`);
  }

  // Timeline
  const phaseIds = new Set<string>();
  let total = 0;
  let usesGroups = false;
  for (const p of m.game.timeline.phases) {
    if (phaseIds.has(p.id)) errors.push(`game.json: phase id "${p.id}" is used twice.`);
    phaseIds.add(p.id);
    total += p.duration;
    for (const [elId, activity] of Object.entries(p.elementActive ?? {})) {
      if (!elementIds.has(elId))
        errors.push(`game.json: phase ${p.id} sets activity for "${elId}", but no field element has that id.`);
      if (activity === "groupA" || activity === "groupB") usesGroups = true;
    }
  }
  if (usesGroups && !m.game.groupsHook)
    errors.push(`game.json: phases use groupA/groupB but no groupsHook decides which alliance is in each group.`);
  const enabled = m.game.timeline.phases.filter((p) => p.robotsEnabled).reduce((s, p) => s + p.duration, 0);
  summary.push(`Timeline: ${m.game.timeline.phases.map((p) => `${p.id} ${p.duration}s`).join(", ")}; total ${total}s (${enabled}s with robots enabled).`);

  // Start positions
  if (m.field.startPositions.length < m.game.robotsPerAlliance)
    errors.push(
      `field.json: ${m.field.startPositions.length} start positions for ${m.game.robotsPerAlliance} robots per alliance.`,
    );

  // Profiles and RPs
  const profiles = m.game.thresholdProfiles;
  if (!profiles[m.game.defaultProfile])
    errors.push(`game.json: defaultProfile "${m.game.defaultProfile}" is not one of the threshold profiles.`);
  const incremented = new Set(m.scoring.rules.flatMap((r) => r.effects.map((e) => e.counter).filter(Boolean)));
  for (const bonus of m.scoring.rankingPoints.bonus) {
    for (const [name, profile] of Object.entries(profiles))
      if (profile[bonus.thresholdKey] === undefined)
        errors.push(`Bonus RP ${bonus.id}: threshold profile "${name}" has no value for "${bonus.thresholdKey}".`);
    if (!incremented.has(bonus.counter))
      errors.push(`Bonus RP ${bonus.id} reads counter "${bonus.counter}", but no scoring rule increments it.`);
  }

  // Scoring rules
  const ruleIds = new Set<string>();
  for (const r of m.scoring.rules) {
    if (ruleIds.has(r.id)) errors.push(`scoring.json: rule id "${r.id}" is used twice.`);
    ruleIds.add(r.id);
    for (const e of r.effects) {
      if (e.points === undefined && e.counter === undefined)
        warnings.push(`scoring.json: rule ${r.id} has an effect with neither points nor a counter.`);
      if (e.points !== undefined && e.points < 0)
        warnings.push(`scoring.json: rule ${r.id} subtracts points; fouls should award points to the opponent instead.`);
    }
    for (const c of r.when ?? []) {
      if (c.field === "phase" && typeof c.value === "string" && !phaseIds.has(c.value))
        errors.push(`scoring.json: rule ${r.id} checks phase "${c.value}", which is not in the timeline.`);
      if (c.field === "target" && typeof c.value === "string" && !elementIds.has(c.value))
        errors.push(`scoring.json: rule ${r.id} checks target "${c.value}", which is not a field element.`);
    }
  }

  // Rules coverage
  const statusCount = { implemented: 0, approximated: 0, not_implemented: 0 };
  for (const rule of m.rules.rules) {
    statusCount[rule.status]++;
    if (rule.status !== "implemented" && !rule.reason)
      warnings.push(`rules.json: ${rule.id} is ${rule.status} but has no reason.`);
    if (rule.penalty && m.scoring.fouls[rule.penalty] === undefined)
      errors.push(`rules.json: ${rule.id} uses penalty "${rule.penalty}", which is not in scoring.json fouls.`);
    if (rule.detector && !rule.penalty) errors.push(`rules.json: ${rule.id} has a detector but no penalty.`);
    if (rule.detector && rule.status === "not_implemented")
      warnings.push(`rules.json: ${rule.id} has a detector but is marked not_implemented.`);
    const d = rule.detector;
    if (d?.type === "launchOutsideZone") {
      if (!byKind("zone").includes(d.zone)) errors.push(`rules.json: ${rule.id} refers to zone "${d.zone}", which does not exist.`);
      if (!byKind("sink").includes(d.target))
        errors.push(`rules.json: ${rule.id} refers to target "${d.target}", which is not a sink.`);
    }
  }
  summary.push(
    `Rules: ${statusCount.implemented} implemented, ${statusCount.approximated} approximated, ${statusCount.not_implemented} not implemented.`,
  );

  // Mechanisms
  for (const t of m.mechanisms.types)
    if (!CORE_MECHANISM_TYPES.includes(t.base))
      errors.push(`mechanisms.json: custom type "${t.id}" builds on "${t.base}", which is not a core mechanism type.`);

  return { errors, warnings, summary };
}

export const CORE_MECHANISM_TYPES = ["intake", "storage", "transfer", "shooter", "placer", "climber", "blocker"];
