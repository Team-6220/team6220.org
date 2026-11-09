import type { Match } from "@goldsim/core";
import { sfx } from "./sound.js";

export interface MatchAudio {
  /** Call once per rendered frame (cheap): countdown ticks and the intake hum. */
  update(): void;
  dispose(): void;
}

interface Options {
  /** Robots whose launch, intake and climb sounds are played at full volume (human-driven or selected). */
  focus: () => Set<number>;
  /** False while paused, so ticks and the hum stay quiet. */
  active: () => boolean;
}

/** Phases whose id or label says "end game" get the horn. (Game-agnostic heuristic; modules need no extra data.) */
const END_GAME = /end[\s_-]?game/i;

/**
 * Plays sounds for a match from its event stream. Purely cosmetic: it only reads the match.
 * Quiet global score dings are played for every robot; launch, intake and climb sounds only for focus robots.
 */
export function attachMatchAudio(match: Match, opts: Options): MatchAudio {
  const phases = match.phases;
  const lastIndex = phases.length - 1;
  const ticked = new Set<string>();
  let lastHum = 0;

  sfx.unlock();
  sfx.play("matchStart");

  const off = match.onEvent((e) => {
    if (!opts.active()) return;
    const focus = opts.focus();
    switch (e.type) {
      case "phase_start": {
        const idx = phases.findIndex((p) => p.id === e.phase);
        if (idx <= 0) break;
        const prev = phases[idx - 1]!;
        const cur = phases[idx]!;
        if (END_GAME.test(cur.id) || END_GAME.test(cur.label)) sfx.play("endGame");
        else if (prev.robotsEnabled && !cur.robotsEnabled) sfx.play("autoEnd");
        else if ((!prev.robotsEnabled && cur.robotsEnabled) || (prev.period === "auto" && cur.period === "teleop")) sfx.play("teleopStart");
        break;
      }
      case "phase_end":
        if (match.inPostMatch && e.phase === phases[lastIndex]?.id) sfx.play("matchEnd");
        break;
      case "shot_launched":
        if (focus.has(e.robot)) sfx.play("launch");
        break;
      case "piece_scored": {
        const mine = e.robot !== null && focus.has(e.robot);
        sfx.play(e.active ? "scoreActive" : "scoreInactive", { gain: mine ? 1 : 0.45 });
        break;
      }
      case "climb_started":
        if (focus.has(e.robot)) sfx.play("climbEngage");
        break;
      case "climb_level":
        sfx.play("climbLevel", { level: e.level, gain: focus.has(e.robot) ? 1 : 0.4 });
        break;
      case "foul":
        sfx.play("foul", { gain: focus.has(e.robot) ? 1 : 0.6 });
        break;
      default:
        break;
    }
  });

  /** True when the current phase ends the robots' control (period change, robots disabled, or end of match). */
  const phaseEndsControl = (): boolean => {
    const idx = phases.indexOf(match.phase);
    const next = phases[idx + 1];
    return !next || next.period !== match.phase.period || next.robotsEnabled !== match.phase.robotsEnabled;
  };

  return {
    update() {
      if (!opts.active()) {
        sfx.stopLoop();
        return;
      }
      // Countdown ticks for the last three seconds before control ends.
      if (!match.isOver && !match.inPostMatch && phaseEndsControl()) {
        const left = match.phaseTimeLeft;
        for (const n of [3, 2, 1]) {
          const key = `${phases.indexOf(match.phase)}:${n}`;
          if (left <= n && left > n - 0.5 && !ticked.has(key)) {
            ticked.add(key);
            sfx.play("countdown");
          }
        }
      }
      // Intake hum while any focus robot is pulling pieces in (checked ~10x per second).
      const now = performance.now();
      if (now - lastHum > 100) {
        lastHum = now;
        const focus = opts.focus();
        let intaking = false;
        if (focus.size && !match.isOver && match.robotsEnabled) {
          for (const v of match.robotViews()) {
            if (focus.has(v.index) && v.mechanisms.some((m) => m.base === "intake" && m.active)) {
              intaking = true;
              break;
            }
          }
        }
        if (intaking) sfx.startLoop();
        else sfx.stopLoop();
      }
    },
    dispose() {
      off();
      sfx.stopLoop();
    },
  };
}
