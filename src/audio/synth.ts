/**
 * Briques de synthèse des effets : tons enveloppés, bruits filtrés, cloches additives, FM.
 * Chaque brique crée ses nœuds, les démarre et les ARRÊTE (jamais de source orpheline),
 * puis repousse `voice.end` pour le compte de la polyphonie.
 */
import type { Engine, NoiseKind } from './engine';

/** Contexte d'une voix d'effet en cours de construction. */
export interface Voice {
  readonly e: Engine;
  readonly ac: BaseAudioContext;
  /** Entrée de la voix (gain de volume → panoramique → bus). */
  readonly out: AudioNode;
  /** Instant de départ absolu. */
  readonly t: number;
  /** Multiplicateur de hauteur (option `pitch` × légère variation aléatoire). */
  readonly p: number;
  /** Fin estimée (mise à jour par les briques). */
  end: number;
}

/** Partiel additif : [rapport de fréquence, amplitude relative, déclin (s)]. */
export type Partial = readonly [ratio: number, amp: number, decay: number];

export const rr = (a: number, b: number): number => a + (b - a) * Math.random();
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

export function clampF(ac: BaseAudioContext, f: number): number {
  return Math.min(Math.max(f, 12), ac.sampleRate * 0.45);
}

/**
 * Enveloppe percussive : 0 → crête (attaque linéaire) → maintien → déclin exponentiel
 * jusqu'à −80 dB. Renvoie l'instant de fin.
 */
export function envelope(param: AudioParam, t: number, a: number, peak: number, hold: number, d: number): number {
  const p = Math.max(peak, 2e-4);
  const att = Math.max(a, 0.0008);
  const dec = Math.max(d, 0.004);
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(p, t + att);
  const t2 = t + att + hold;
  if (hold > 0) param.setValueAtTime(p, t2);
  param.exponentialRampToValueAtTime(1e-4, t2 + dec);
  const end = t2 + dec;
  param.setValueAtTime(0, end);
  return end;
}

/** Oscillateur basse fréquence branché sur un paramètre (vibrato, panoramique tournant…). */
export function lfo(
  v: Voice,
  param: AudioParam,
  rate: number,
  depth: number,
  t: number,
  end: number,
  rate2?: number,
  type: OscillatorType = 'sine',
): void {
  const o = v.ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(rate, t);
  if (rate2 !== undefined) o.frequency.linearRampToValueAtTime(rate2, end);
  const g = v.ac.createGain();
  g.gain.value = depth;
  o.connect(g);
  g.connect(param);
  o.start(t);
  o.stop(end + 0.02);
}

export function biquad(ac: BaseAudioContext, type: BiquadFilterType, f: number, q: number): BiquadFilterNode {
  const b = ac.createBiquadFilter();
  b.type = type;
  b.frequency.value = clampF(ac, f);
  b.Q.value = q;
  return b;
}

// ─────────────────────────────────────────── Tons

export interface ToneOpts {
  type?: OscillatorType;
  f: number;
  /** Fréquence d'arrivée (glissando exponentiel). */
  f2?: number;
  /** Fréquence finale (second segment, jusqu'à la fin de l'enveloppe). */
  f3?: number;
  /** Durée du premier glissando (défaut : toute l'enveloppe). */
  glide?: number;
  at?: number;
  a?: number;
  hold?: number;
  d: number;
  g: number;
  detune?: number;
  /** Vibrato : fréquence (Hz) et profondeur (cents). */
  vib?: number;
  vibDepth?: number;
  lp?: number;
  hp?: number;
  bp?: number;
  q?: number;
  dest?: AudioNode;
  /** Ignore le multiplicateur de hauteur de la voix. */
  fixed?: boolean;
}

export function tone(v: Voice, o: ToneOpts): void {
  const { ac } = v;
  const t = v.t + (o.at ?? 0);
  const k = o.fixed ? 1 : v.p;
  const a = o.a ?? 0.002;
  const hold = o.hold ?? 0;
  const osc = ac.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(clampF(ac, o.f * k), t);
  if (o.f2 !== undefined) {
    const gl = o.glide ?? a + hold + o.d;
    osc.frequency.exponentialRampToValueAtTime(clampF(ac, o.f2 * k), t + Math.max(gl, 0.005));
    if (o.f3 !== undefined && a + hold + o.d > gl) {
      osc.frequency.exponentialRampToValueAtTime(clampF(ac, o.f3 * k), t + a + hold + o.d);
    }
  }
  if (o.detune) osc.detune.setValueAtTime(o.detune, t);
  const g = ac.createGain();
  g.gain.value = 0;
  const end = envelope(g.gain, t, a, o.g, hold, o.d);
  if (o.vib) lfo(v, osc.detune, o.vib, o.vibDepth ?? 20, t, end);
  let node: AudioNode = osc;
  if (o.bp) {
    const f = biquad(ac, 'bandpass', o.bp * k, o.q ?? 1);
    node.connect(f);
    node = f;
  }
  if (o.hp) {
    const f = biquad(ac, 'highpass', o.hp * k, 0.7);
    node.connect(f);
    node = f;
  }
  if (o.lp) {
    const f = biquad(ac, 'lowpass', o.lp * k, 0.7);
    node.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(o.dest ?? v.out);
  osc.start(t);
  osc.stop(end + 0.02);
  v.end = Math.max(v.end, end + 0.02);
}

// ─────────────────────────────────────────── Bruits

export interface NoiseOpts {
  kind?: NoiseKind;
  /** Filtre principal (défaut passe-bande) ; absent si `f` n'est pas donné. */
  type?: BiquadFilterType;
  f?: number;
  f2?: number;
  f3?: number;
  /** Durée du balayage f → f2 (défaut : attaque + maintien). */
  sweep?: number;
  q?: number;
  lp?: number;
  hp?: number;
  at?: number;
  a?: number;
  hold?: number;
  d: number;
  g: number;
  rate?: number;
  dest?: AudioNode;
  fixed?: boolean;
}

export function noise(v: Voice, o: NoiseOpts): void {
  const { ac } = v;
  const t = v.t + (o.at ?? 0);
  const k = o.fixed ? 1 : v.p;
  const a = o.a ?? 0.002;
  const hold = o.hold ?? 0;
  const src = ac.createBufferSource();
  const buf = v.e.buffers[o.kind ?? 'white'];
  src.buffer = buf;
  src.loop = true;
  if (o.rate) src.playbackRate.value = o.rate;
  let node: AudioNode = src;
  if (o.f !== undefined) {
    const flt = biquad(ac, o.type ?? 'bandpass', o.f * k, o.q ?? 1);
    if (o.f2 !== undefined) {
      const sw = o.sweep ?? Math.max(a + hold, 0.01);
      flt.frequency.setValueAtTime(clampF(ac, o.f * k), t);
      flt.frequency.exponentialRampToValueAtTime(clampF(ac, o.f2 * k), t + sw);
      if (o.f3 !== undefined && a + hold + o.d > sw) {
        flt.frequency.exponentialRampToValueAtTime(clampF(ac, o.f3 * k), t + a + hold + o.d);
      }
    }
    node.connect(flt);
    node = flt;
  }
  if (o.hp) {
    const f = biquad(ac, 'highpass', o.hp, 0.7);
    node.connect(f);
    node = f;
  }
  if (o.lp) {
    const f = biquad(ac, 'lowpass', o.lp, 0.7);
    node.connect(f);
    node = f;
  }
  const g = ac.createGain();
  g.gain.value = 0;
  const end = envelope(g.gain, t, a, o.g, hold, o.d);
  node.connect(g);
  g.connect(o.dest ?? v.out);
  src.start(t, Math.random() * (buf.duration - 0.05));
  src.stop(end + 0.02);
  v.end = Math.max(v.end, end + 0.02);
}

/** Petit clic d'attaque (bruit bref filtré). */
export function click(v: Voice, at: number, g: number, f = 3000, d = 0.012): void {
  noise(v, { kind: 'white', type: 'bandpass', f, q: 1.2, at, a: 0.0006, d, g });
}

// ─────────────────────────────────────────── Cloches additives & FM

export function bell(
  v: Voice,
  f: number,
  at: number,
  g: number,
  parts: readonly Partial[],
  opts?: { a?: number; dest?: AudioNode; fixed?: boolean; decayMul?: number },
): void {
  const k = opts?.fixed ? 1 : v.p;
  const dm = opts?.decayMul ?? 1;
  for (const [r, amp, d] of parts) {
    if (f * r * k > v.ac.sampleRate * 0.42) continue;
    tone(v, { f: f * r, at, a: opts?.a ?? 0.0015, d: d * dm, g: g * amp, dest: opts?.dest, fixed: opts?.fixed });
  }
}

export interface FmOpts {
  f: number;
  ratio: number;
  /** Indice de modulation initial (× fréquence porteuse). */
  index: number;
  index2?: number;
  idecay?: number;
  at?: number;
  a?: number;
  hold?: number;
  d: number;
  g: number;
  dest?: AudioNode;
  fixed?: boolean;
}

export function fm(v: Voice, o: FmOpts): void {
  const { ac } = v;
  const t = v.t + (o.at ?? 0);
  const k = o.fixed ? 1 : v.p;
  const f = clampF(ac, o.f * k);
  const car = ac.createOscillator();
  car.frequency.value = f;
  const mod = ac.createOscillator();
  mod.frequency.value = clampF(ac, f * o.ratio);
  const mg = ac.createGain();
  mg.gain.setValueAtTime(o.index * f, t);
  mg.gain.exponentialRampToValueAtTime(Math.max((o.index2 ?? o.index * 0.1) * f, 0.01), t + (o.idecay ?? 0.3));
  mod.connect(mg);
  mg.connect(car.frequency);
  const g = ac.createGain();
  g.gain.value = 0;
  const end = envelope(g.gain, t, o.a ?? 0.002, o.g, o.hold ?? 0, o.d);
  car.connect(g);
  g.connect(o.dest ?? v.out);
  car.start(t);
  mod.start(t);
  car.stop(end + 0.02);
  mod.stop(end + 0.02);
  v.end = Math.max(v.end, end + 0.02);
}

/** Nœud intermédiaire temporaire (sous-mélange d'une voix, ex. panoramique tournant). */
export function subBus(v: Voice, gain = 1): GainNode {
  const g = v.ac.createGain();
  g.gain.value = gain;
  g.connect(v.out);
  return g;
}

/** Sous-bus dont le gain est modulé (trémolo / roulis) pendant [t, end]. */
export function wobbleBus(v: Voice, rate: number, depth: number, at: number, dur: number, base = 1): GainNode {
  const g = v.ac.createGain();
  g.gain.value = base;
  g.connect(v.out);
  const t = v.t + at;
  lfo(v, g.gain, rate, depth, t, t + dur);
  return g;
}

// ─────────────────────────────────────────── Timbres partagés

/** Porcelaine fine : partiels inharmoniques courts. */
export const PORCELAIN: readonly Partial[] = [
  [1, 1, 0.24],
  [1.53, 0.42, 0.15],
  [2.71, 0.22, 0.09],
  [3.92, 0.1, 0.05],
];

/** Cloche de comptoir (« ding ») : fondamental battant + partiels de plaque. */
export const SERVICE_BELL: readonly Partial[] = [
  [1, 1, 1.3],
  [1.0032, 0.45, 1.1],
  [2.0, 0.22, 0.7],
  [2.76, 0.28, 0.5],
  [5.4, 0.08, 0.2],
];

/** Argenterie : tintement clair et doux. */
export const SILVER: readonly Partial[] = [
  [1, 1, 0.9],
  [1.004, 0.5, 0.8],
  [2.32, 0.28, 0.4],
  [4.25, 0.12, 0.2],
];

/** Pièce d'or. */
export const COIN: readonly Partial[] = [
  [1, 1, 0.28],
  [2.41, 0.32, 0.14],
  [4.12, 0.12, 0.07],
];

/** Verre à pied. */
export const GLASS: readonly Partial[] = [
  [1, 1, 0.35],
  [2.68, 0.3, 0.16],
  [5.1, 0.08, 0.07],
];

/** Célesta / boîte à musique (presque harmonique). */
export const CELESTA: readonly Partial[] = [
  [1, 1, 0.9],
  [2.0, 0.18, 0.4],
  [4.0, 0.08, 0.15],
];
