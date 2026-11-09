/**
 * Sound effects, synthesized with the Web Audio API (no audio files, nothing copyrighted).
 * Cosmetic only: nothing here is read by the simulation.
 */

export type SfxName =
  | "matchStart"
  | "countdown"
  | "autoEnd"
  | "teleopStart"
  | "endGame"
  | "matchEnd"
  | "launch"
  | "scoreActive"
  | "scoreInactive"
  | "climbEngage"
  | "climbLevel"
  | "foul"
  | "bump";

interface PlayOpts {
  /** 0..1 multiplier on top of the master volume. */
  gain?: number;
  /** Climb level for "climbLevel" (1-3). */
  level?: number;
}

const KEY = "goldsim.sound";
/** Minimum seconds between two plays of the same effect, so rapid events never turn into noise. */
const MIN_GAP: Partial<Record<SfxName, number>> = { launch: 0.07, scoreActive: 0.1, scoreInactive: 0.12, bump: 0.2, foul: 0.4, countdown: 0.2 };
const MAX_VOICES = 14;

interface Saved {
  enabled: boolean;
  volume: number;
}

function loadSaved(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<Saved>;
      return { enabled: v.enabled !== false, volume: typeof v.volume === "number" ? Math.min(1, Math.max(0, v.volume)) : 0.35 };
    }
  } catch {
    // storage unavailable; fall back to defaults
  }
  return { enabled: true, volume: 0.35 };
}

class Sfx {
  enabled: boolean;
  volume: number;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastPlay = new Map<SfxName, number>();
  private voices = 0;
  private loop: { gain: GainNode; stop: () => void } | null = null;
  private listeners: (() => void)[] = [];

  constructor() {
    const s = loadSaved();
    this.enabled = s.enabled;
    this.volume = s.volume;
    if (typeof window !== "undefined") {
      const unlock = () => this.unlock();
      for (const ev of ["pointerdown", "keydown", "touchstart"] as const) window.addEventListener(ev, unlock, { passive: true });
    }
  }

  /** Creates or resumes the audio context. Browsers only allow this after a user gesture, so it is called from input events. */
  unlock(): void {
    if (!this.enabled) return;
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.stopLoop();
    else this.unlock();
    this.save();
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    this.save();
  }

  onChange(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((l) => l !== fn));
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ enabled: this.enabled, volume: this.volume }));
    } catch {
      // not persisted in private windows; the setting still applies this session
    }
    for (const l of this.listeners) l();
  }

  private ready(): { ctx: AudioContext; out: GainNode } | null {
    if (!this.enabled) return null;
    this.unlock();
    if (!this.ctx || !this.master || this.ctx.state !== "running") return null;
    return { ctx: this.ctx, out: this.master };
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.noise) {
      const len = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noise;
  }

  /** A tone with an exponential-decay envelope. Optional pitch glide to `endFreq`. */
  private tone(
    a: { ctx: AudioContext; out: GainNode },
    o: { type: OscillatorType; freq: number; endFreq?: number; start?: number; attack?: number; dur: number; gain: number; lowpass?: number },
  ): void {
    const { ctx, out } = a;
    const t0 = ctx.currentTime + (o.start ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.endFreq) osc.frequency.exponentialRampToValueAtTime(o.endFreq, t0 + o.dur);
    const attack = o.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    let node: AudioNode = osc;
    if (o.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = o.lowpass;
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(out);
    this.voices++;
    osc.onended = () => (this.voices = Math.max(0, this.voices - 1));
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.05);
  }

  /** A band-passed noise burst (whooshes, clicks, thuds). */
  private burst(
    a: { ctx: AudioContext; out: GainNode },
    o: { start?: number; dur: number; gain: number; freq: number; endFreq?: number; q?: number; type?: BiquadFilterType },
  ): void {
    const { ctx, out } = a;
    const t0 = ctx.currentTime + (o.start ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? "bandpass";
    f.Q.value = o.q ?? 1.2;
    f.frequency.setValueAtTime(o.freq, t0);
    if (o.endFreq) f.frequency.exponentialRampToValueAtTime(o.endFreq, t0 + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    this.voices++;
    src.onended = () => (this.voices = Math.max(0, this.voices - 1));
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + o.dur + 0.05);
  }

  play(name: SfxName, opts: PlayOpts = {}): void {
    const a = this.ready();
    if (!a) return;
    const now = a.ctx.currentTime;
    const gap = MIN_GAP[name];
    if (gap !== undefined) {
      const last = this.lastPlay.get(name) ?? -1;
      if (now - last < gap) return;
      this.lastPlay.set(name, now);
    }
    if (this.voices >= MAX_VOICES && name !== "matchEnd" && name !== "autoEnd" && name !== "matchStart") return;
    const k = Math.min(1, Math.max(0, opts.gain ?? 1));

    switch (name) {
      case "matchStart":
        // Long low horn
        this.tone(a, { type: "sawtooth", freq: 196, dur: 1.1, gain: 0.5 * k, attack: 0.03, lowpass: 1400 });
        this.tone(a, { type: "square", freq: 98, dur: 1.1, gain: 0.25 * k, attack: 0.03, lowpass: 800 });
        break;
      case "countdown":
        this.tone(a, { type: "sine", freq: 880, dur: 0.09, gain: 0.35 * k });
        break;
      case "autoEnd":
        this.tone(a, { type: "square", freq: 330, dur: 0.85, gain: 0.3 * k, attack: 0.02, lowpass: 1500 });
        this.tone(a, { type: "sawtooth", freq: 165, dur: 0.85, gain: 0.3 * k, attack: 0.02, lowpass: 900 });
        break;
      case "teleopStart":
        // Rising two-note bell
        this.tone(a, { type: "triangle", freq: 523.25, dur: 0.5, gain: 0.4 * k });
        this.tone(a, { type: "triangle", freq: 783.99, start: 0.18, dur: 0.7, gain: 0.4 * k });
        this.tone(a, { type: "sine", freq: 1567.98, start: 0.18, dur: 0.5, gain: 0.12 * k });
        break;
      case "endGame":
        // Two honks
        for (const s of [0, 0.45]) this.tone(a, { type: "sawtooth", freq: 196, start: s, dur: 0.35, gain: 0.4 * k, attack: 0.02, lowpass: 1200 });
        break;
      case "matchEnd":
        this.tone(a, { type: "sawtooth", freq: 174.6, endFreq: 164.8, dur: 1.7, gain: 0.5 * k, attack: 0.03, lowpass: 1300 });
        this.tone(a, { type: "square", freq: 87.3, dur: 1.7, gain: 0.25 * k, attack: 0.03, lowpass: 700 });
        break;
      case "launch": {
        const jitter = 0.9 + Math.random() * 0.2;
        this.burst(a, { dur: 0.1, gain: 0.5 * k, freq: 2200 * jitter, endFreq: 700 * jitter, q: 1.4 });
        this.tone(a, { type: "sine", freq: 340 * jitter, endFreq: 150, dur: 0.07, gain: 0.3 * k });
        break;
      }
      case "scoreActive": {
        const f = 1318.5 * (0.98 + Math.random() * 0.04);
        this.tone(a, { type: "sine", freq: f, dur: 0.3, gain: 0.32 * k });
        this.tone(a, { type: "sine", freq: f * 1.5, dur: 0.2, gain: 0.1 * k });
        break;
      }
      case "scoreInactive":
        this.tone(a, { type: "sine", freq: 120, endFreq: 55, dur: 0.14, gain: 0.4 * k });
        this.burst(a, { dur: 0.08, gain: 0.15 * k, freq: 300, type: "lowpass", q: 0.7 });
        break;
      case "climbEngage":
        this.tone(a, { type: "triangle", freq: 150, endFreq: 90, dur: 0.18, gain: 0.45 * k });
        this.burst(a, { dur: 0.12, gain: 0.2 * k, freq: 500, q: 0.8 });
        break;
      case "climbLevel": {
        const notes = [659.25, 783.99, 987.77];
        const n = Math.min(3, Math.max(1, opts.level ?? 1));
        for (let i = 0; i < n; i++) this.tone(a, { type: "triangle", freq: notes[i]!, start: i * 0.11, dur: 0.35, gain: 0.3 * k });
        break;
      }
      case "foul":
        this.tone(a, { type: "sawtooth", freq: 220, dur: 0.4, gain: 0.25 * k, lowpass: 1000 });
        this.tone(a, { type: "sawtooth", freq: 233.1, dur: 0.4, gain: 0.25 * k, lowpass: 1000 });
        break;
      case "bump":
        this.tone(a, { type: "sine", freq: 95, endFreq: 50, dur: 0.12, gain: 0.35 * k });
        break;
    }
  }

  /** Starts (or keeps) the looping intake hum. Call stopLoop() when no focus robot is intaking. */
  startLoop(): void {
    if (this.loop) return;
    const a = this.ready();
    if (!a) return;
    const { ctx, out } = a;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 92;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 17;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    osc.connect(f);
    f.connect(g);
    g.connect(out);
    g.gain.setTargetAtTime(0.09, ctx.currentTime, 0.04);
    osc.start();
    lfo.start();
    this.loop = {
      gain: g,
      stop: () => {
        const t = ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setTargetAtTime(0.0001, t, 0.05);
        osc.stop(t + 0.3);
        lfo.stop(t + 0.3);
      },
    };
  }

  stopLoop(): void {
    this.loop?.stop();
    this.loop = null;
  }
}

/** The one shared sound system. */
export const sfx = new Sfx();
