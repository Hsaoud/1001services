/**
 * Un peu d'harmonie jazz : qualités d'accords, voicings sans fondamentale (main gauche
 * « à la Bill Evans ») conduits au plus près, grilles écrites en chiffrage, motifs mélodiques.
 */
import type { Rng } from '../core/rng';

export type Quality = 'maj9' | 'maj69' | 'm9' | 'm6' | 'dom13' | 'dom9' | 'dom7b9' | 'sus' | 'm7b5' | 'maj7s11';

interface QualityDef {
  /** Notes de l'accord (demi-tons depuis la fondamentale). */
  tones: readonly number[];
  /** Formes de voicing (A / B) en demi-tons depuis la fondamentale. */
  shapes: readonly (readonly number[])[];
  /** Gamme mélodique « sûre » (sans notes à éviter). */
  scale: readonly number[];
  /** Quinte (juste ou diminuée) pour la basse. */
  fifth: number;
}

export const QUALITIES: Readonly<Record<Quality, QualityDef>> = {
  maj9: { tones: [0, 4, 7, 11, 14], shapes: [[4, 7, 11, 14], [11, 14, 16, 19]], scale: [0, 2, 4, 7, 9, 11], fifth: 7 },
  maj69: { tones: [0, 4, 7, 9, 14], shapes: [[4, 9, 14, 19], [2, 4, 7, 9]], scale: [0, 2, 4, 7, 9], fifth: 7 },
  m9: { tones: [0, 3, 7, 10, 14], shapes: [[3, 7, 10, 14], [10, 14, 15, 19]], scale: [0, 2, 3, 5, 7, 9, 10], fifth: 7 },
  m6: { tones: [0, 3, 7, 9, 14], shapes: [[3, 7, 9, 14], [9, 14, 15, 19]], scale: [0, 2, 3, 5, 7, 9], fifth: 7 },
  dom13: { tones: [0, 4, 10, 14, 21], shapes: [[10, 14, 16, 21], [4, 9, 10, 14]], scale: [0, 2, 4, 7, 9, 10], fifth: 7 },
  dom9: { tones: [0, 4, 7, 10, 14], shapes: [[10, 14, 16, 19], [4, 7, 10, 14]], scale: [0, 2, 4, 7, 9, 10], fifth: 7 },
  dom7b9: { tones: [0, 4, 7, 10, 13], shapes: [[10, 13, 16, 19], [4, 7, 10, 13]], scale: [0, 1, 4, 5, 7, 8, 10], fifth: 7 },
  sus: { tones: [0, 5, 7, 10, 14], shapes: [[10, 14, 17, 21], [5, 10, 14, 19]], scale: [0, 2, 5, 7, 9, 10], fifth: 7 },
  m7b5: { tones: [0, 3, 6, 10], shapes: [[3, 6, 10, 12], [10, 12, 15, 18]], scale: [0, 2, 3, 5, 6, 8, 10], fifth: 6 },
  maj7s11: { tones: [0, 4, 7, 11, 18], shapes: [[4, 7, 11, 18], [11, 14, 16, 18]], scale: [0, 2, 4, 6, 7, 9, 11], fifth: 7 },
};

export interface Chord {
  /** Classe de hauteur de la fondamentale (do = 0). */
  root: number;
  q: Quality;
}

const ROOTS: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SUFFIX: Readonly<Record<string, Quality>> = {
  maj9: 'maj9',
  maj7: 'maj9',
  '6/9': 'maj69',
  '69': 'maj69',
  m9: 'm9',
  m7: 'm9',
  m6: 'm6',
  '13': 'dom13',
  '9': 'dom9',
  '7': 'dom9',
  '7b9': 'dom7b9',
  '13sus': 'sus',
  sus: 'sus',
  m7b5: 'm7b5',
  'maj7#11': 'maj7s11',
};

/** « Bb13 », « F#m7b5 », « Ebmaj9 »… (qualité inconnue → maj9). */
export function parseChord(s: string): Chord {
  const m = /^([A-G])([b#]?)(.*)$/.exec(s.trim());
  if (!m) return { root: 0, q: 'maj9' };
  const acc = m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0;
  return { root: (ROOTS[m[1]] + acc + 12) % 12, q: SUFFIX[m[3]] ?? 'maj9' };
}

/** Grille « Fmaj9 | Dm9 | Gm9 C13 » → mesures (1 ou 2 accords par mesure). */
export function parseChart(s: string): Chord[][] {
  return s
    .split('|')
    .map((bar) => bar.trim().split(/\s+/).filter(Boolean).map(parseChord))
    .filter((bar) => bar.length > 0);
}

export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** Note de classe `pc` la plus proche de `ref`, bornée à [lo, hi]. */
export function nearestPc(pc: number, ref: number, lo: number, hi: number): number {
  let best = lo;
  let bestD = Infinity;
  for (let m = lo; m <= hi; m++) {
    if ((((m - pc) % 12) + 12) % 12 !== 0) continue;
    const d = Math.abs(m - ref);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

/** Ramène une note dans [lo, hi] par octaves. */
export function fold(m: number, lo: number, hi: number): number {
  let n = m;
  while (n < lo) n += 12;
  while (n > hi) n -= 12;
  return n;
}

/**
 * Voicing sans fondamentale conduit au plus près du précédent (mouvement minimal),
 * avec un soupçon de hasard pour varier les renversements.
 */
export function voiceChord(ch: Chord, prev: readonly number[] | null, rng: Rng, lo = 50, hi = 76): number[] {
  const def = QUALITIES[ch.q];
  let best: number[] | null = null;
  let bestCost = Infinity;
  for (const shape of def.shapes) {
    for (let base = ch.root + 24; base <= ch.root + 84; base += 12) {
      const notes = shape.map((i) => base + i);
      if (notes[0] < lo || notes[notes.length - 1] > hi) continue;
      let cost: number;
      if (prev && prev.length === notes.length) {
        cost = 0;
        for (let i = 0; i < notes.length; i++) cost += Math.abs(notes[i] - prev[i]);
      } else {
        const mean = notes.reduce((s, n) => s + n, 0) / notes.length;
        cost = Math.abs(mean - (lo + hi) / 2) * 2;
      }
      cost += rng.next() * 2.5;
      if (cost < bestCost) {
        bestCost = cost;
        best = notes;
      }
    }
  }
  if (best) return best;
  // Repli : première forme ramenée au centre de la tessiture
  const shape = def.shapes[0];
  const center = (lo + hi) / 2;
  const base = nearestPc(ch.root, center - 6, 24, 96);
  return shape.map((i) => base + i);
}

/** Notes de la gamme de l'accord dans [lo, hi], triées. */
export function scalePitches(ch: Chord, lo: number, hi: number): number[] {
  const set = new Set(QUALITIES[ch.q].scale.map((i) => (ch.root + i) % 12));
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (set.has(m % 12)) out.push(m);
  return out;
}

/** Note de l'accord (fondamentale, tierce, quinte, septième, neuvième) la plus proche. */
export function nearestChordTone(ch: Chord, ref: number, lo: number, hi: number, skipRoot = false): number {
  const tones = QUALITIES[ch.q].tones.filter((i) => !(skipRoot && i % 12 === 0)).map((i) => (ch.root + i) % 12);
  let best = ref;
  let bestD = Infinity;
  for (let m = lo; m <= hi; m++) {
    if (!tones.includes(m % 12)) continue;
    const d = Math.abs(m - ref);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

// ─────────────────────────────────────────── Motifs mélodiques

export interface MotifNote {
  /** Position en temps depuis le début de la phrase (multiple de 0,5). */
  on: number;
  /** Durée en temps. */
  dur: number;
  /** Pas de gamme depuis la note précédente. */
  step: number;
  /** Vélocité relative. */
  vel: number;
}

export type Motif = MotifNote[];

/**
 * Motif rythmico-mélodique : positions sur la grille de croches, légère préférence
 * pour les temps forts, contour surtout conjoint, souffle en fin de phrase.
 */
export function makeMotif(rng: Rng, beats: number, density: number, bpb: number, stacc = 0.25, off = 0.45): Motif {
  const slots: number[] = [];
  const usable = beats - (bpb >= 4 ? 1.5 : 1); // respiration en fin de phrase
  for (let s = 0; s < usable; s += 0.5) {
    const strong = s % 1 === 0;
    const p = density * (strong ? 0.75 : off) * (s === 0 ? 1.3 : 1);
    if (rng.chance(Math.min(0.95, p))) slots.push(s);
  }
  if (slots.length < 2) slots.splice(0, slots.length, 0, 1);
  const steps = [0, 1, -1, 1, -1, 2, -2, 0, 3, -3, 1, -1];
  let dir = rng.chance(0.5) ? 1 : -1;
  return slots.map((on, i) => {
    const next = i + 1 < slots.length ? slots[i + 1] : beats - 0.5;
    const gap = next - on;
    const dur = i === slots.length - 1 ? Math.min(2, Math.max(1, gap)) : rng.chance(stacc) ? Math.min(0.45, gap) : gap * 0.92;
    let step = i === 0 ? 0 : rng.pick(steps);
    if (rng.chance(0.65)) step = Math.abs(step) * dir;
    if (rng.chance(0.2)) dir = -dir;
    const vel = (on % 1 === 0 ? 0.85 : 0.7) + rng.range(-0.08, 0.08);
    return { on, dur, step, vel };
  });
}
