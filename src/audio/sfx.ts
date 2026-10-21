/**
 * Effets sonores de La Duchesse : une recette synthétisée par SfxId, courte et élégante,
 * avec légère variation aléatoire, limites de polyphonie par effet et plafond global.
 */
import type { SfxId } from '../types';
import type { SfxOptions } from './api';
import type { Engine } from './engine';
import {
  CELESTA,
  COIN,
  GLASS,
  PORCELAIN,
  SERVICE_BELL,
  SILVER,
  bell,
  biquad,
  click,
  envelope,
  fm,
  lfo,
  mtof,
  noise,
  pick,
  rr,
  tone,
  wobbleBus,
  type Partial,
  type Voice,
} from './synth';

interface SfxDef {
  /** Gain de la voix (équilibrage entre effets). */
  gain: number;
  /** Envoi vers la réverbération (0..1). */
  wet: number;
  /** Intervalle minimal entre deux déclenchements (s). */
  min: number;
  /** Voix simultanées max pour cet effet (la plus ancienne est coupée en fondu). */
  max: number;
  /** Variation aléatoire de hauteur (± fraction, défaut 0,03). */
  jitter?: number;
  build(v: Voice): void;
}

/** Plafond global de voix d'effets simultanées. */
const MAX_VOICES = 24;

/** Grande cloche à main royale : bourdon, fondamental battant, douzième caractéristique. */
const ROYAL: readonly Partial[] = [
  [0.5, 0.2, 4.2],
  [1, 1, 3.6],
  [1.0026, 0.5, 3.0],
  [2, 0.28, 2.2],
  [2.0045, 0.12, 1.8],
  [3, 0.48, 2.0],
  [3.006, 0.2, 1.6],
  [4.18, 0.13, 1.0],
  [5.43, 0.09, 0.65],
  [6.8, 0.05, 0.4],
  [8.3, 0.03, 0.25],
];

// ─────────────────────────────────────────── Gestes composés

/** Cuivre doux (deux scies désaccordées, filtre qui s'ouvre). */
function brass(v: Voice, m: number, at: number, hold: number, d: number, g: number): void {
  const { ac } = v;
  const t = v.t + at;
  const f = mtof(m) * v.p;
  const lp = biquad(ac, 'lowpass', f * 1.2, 1.1);
  lp.frequency.setValueAtTime(f * 1.2, t);
  lp.frequency.exponentialRampToValueAtTime(Math.min(f * 5, 4200), t + 0.06);
  lp.frequency.exponentialRampToValueAtTime(Math.min(f * 2.5, 2400), t + 0.06 + hold + d * 0.6);
  const amp = ac.createGain();
  amp.gain.value = 0;
  const end = envelope(amp.gain, t, 0.025, g, hold, d);
  for (const det of [-7, 7]) {
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.detune.value = det;
    o.frequency.setValueAtTime(f * 0.985, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.045);
    o.connect(lp);
    o.start(t);
    o.stop(end + 0.02);
  }
  lp.connect(amp);
  amp.connect(v.out);
  v.end = Math.max(v.end, end + 0.02);
}

/** Petit jappement de caniche : source en dent de scie, deux formants qui se referment. */
function yap(v: Voice, at: number, amp: number): void {
  const { ac } = v;
  const t = v.t + at;
  const k = v.p;
  const f0 = rr(640, 780) * k;
  const src = ac.createOscillator();
  src.type = 'sawtooth';
  src.frequency.setValueAtTime(f0 * 0.8, t);
  src.frequency.exponentialRampToValueAtTime(f0 * 1.12, t + 0.022);
  src.frequency.exponentialRampToValueAtTime(f0 * 0.68, t + 0.1);
  const env = ac.createGain();
  env.gain.value = 0;
  const end = envelope(env.gain, t, 0.006, amp, 0.03, 0.08);
  const formants: [number, number, number, number][] = [
    [1200, 800, 2.8, 1],
    [2350, 1650, 3.5, 0.5],
  ];
  for (const [fa, fb, q, g] of formants) {
    const bp = biquad(ac, 'bandpass', fa * k, q);
    bp.frequency.setValueAtTime(fa * k, t);
    bp.frequency.exponentialRampToValueAtTime(fb * k, t + 0.1);
    const gg = ac.createGain();
    gg.gain.value = g;
    src.connect(bp);
    bp.connect(gg);
    gg.connect(env);
  }
  // corps direct (adouci) : stabilise le niveau quelle que soit la hauteur tirée
  const body = biquad(ac, 'lowpass', 1800 * k, 0.5);
  const bodyG = ac.createGain();
  bodyG.gain.value = 0.35;
  src.connect(body);
  body.connect(bodyG);
  bodyG.connect(env);
  env.connect(v.out);
  src.start(t);
  src.stop(end + 0.02);
  v.end = Math.max(v.end, end + 0.02);
  noise(v, { kind: 'white', type: 'bandpass', f: 2600, q: 1.2, at, a: 0.004, d: 0.05, g: 0.06 * amp });
}

/** Bulle qui éclate (sinus à hauteur montante, très bref). */
function bubble(v: Voice, at: number, f: number, g: number): void {
  tone(v, { f, f2: f * rr(1.4, 1.9), glide: rr(0.025, 0.05), at, a: 0.002, d: rr(0.035, 0.06), g });
}

/** Tintement métallique bref (couverts, éclats). */
function ting(v: Voice, at: number, f: number, g: number, d: number, ratio = 1.47): void {
  tone(v, { f, at, a: 0.001, d, g });
  tone(v, { f: f * ratio, at, a: 0.001, d: d * 0.6, g: g * 0.45 });
}

let foot = 0;

// ─────────────────────────────────────────── Recettes

const DEFS: Record<SfxId, SfxDef> = {
  step: {
    gain: 0.28,
    wet: 0.04,
    min: 0.07,
    max: 3,
    jitter: 0.06,
    build(v) {
      foot ^= 1;
      const k = foot ? 1 : 0.92; // pied gauche / pied droit
      // talon de cuir souple : petit choc sourd sur le parquet
      tone(v, { f: rr(150, 175) * k, f2: 80, d: 0.08, a: 0.003, g: 0.3 });
      noise(v, { kind: 'pink', type: 'bandpass', f: rr(900, 1250) * k, q: 1.1, a: 0.002, d: 0.09, g: 2.6, lp: 3200 });
      // frottement du cuir
      noise(v, { kind: 'white', type: 'bandpass', f: rr(2200, 3000), q: 1.4, at: 0.012, a: 0.012, d: 0.05, g: 0.12 });
    },
  },

  dash: {
    gain: 1.23,
    wet: 0.2,
    min: 0.1,
    max: 2,
    build(v) {
      // souffle soyeux qui monte puis retombe
      noise(v, { kind: 'pink', type: 'bandpass', f: 450, f2: 2600, f3: 900, sweep: 0.13, q: 1.3, a: 0.07, d: 0.24, g: 0.9, lp: 6000 });
      noise(v, { kind: 'white', type: 'bandpass', f: 1800, f2: 5000, f3: 2500, sweep: 0.15, q: 2.4, a: 0.06, d: 0.18, g: 0.08 });
      // clochette minuscule
      const f = pick([2093, 2349.3, 2637]);
      bell(v, f, 0.07, 0.06, CELESTA, { decayMul: 0.5 });
    },
  },

  dash_empty: {
    gain: 0.343,
    wet: 0.05,
    min: 0.08,
    max: 2,
    build(v) {
      // tic mat : la jauge est vide
      tone(v, { type: 'triangle', f: 420, f2: 260, d: 0.1, g: 0.6, lp: 1600 });
      noise(v, { kind: 'pink', type: 'bandpass', f: 1100, q: 1, d: 0.06, g: 1.4 });
    },
  },

  pickup: {
    gain: 1.11,
    wet: 0.15,
    min: 0.05,
    max: 3,
    build(v) {
      // tasse de porcelaine qui tinte sur sa soucoupe
      const f = rr(1900, 2400);
      bell(v, f, 0, 0.12, PORCELAIN);
      click(v, 0, 0.1, 4000, 0.006);
      bell(v, f * rr(1.08, 1.15), 0.045 + rr(0, 0.02), 0.055, PORCELAIN);
    },
  },

  serve: {
    gain: 0.935,
    wet: 0.25,
    min: 0.06,
    max: 3,
    jitter: 0.015,
    build(v) {
      // l'assiette posée : « toc » sourd + petit tintement
      tone(v, { f: 210, f2: 140, d: 0.09, g: 0.3 });
      noise(v, { kind: 'pink', type: 'bandpass', f: 600, q: 1.2, d: 0.05, g: 0.35 });
      bell(v, rr(1250, 1400), 0.004, 0.045, PORCELAIN);
      // cloche claire de service (sol 6)
      bell(v, 1567.98, 0.07, 0.11, SERVICE_BELL);
    },
  },

  tip: {
    gain: 2.04,
    wet: 0.3,
    min: 0.08,
    max: 3,
    jitter: 0.01,
    build(v) {
      // arpège de pièces d'or (pentatonique de do)
      const base = pick([84, 86, 88]);
      const steps = [0, 4, 7, 12, 16];
      steps.forEach((s, i) => {
        const at = i * 0.05 + rr(-0.004, 0.004);
        bell(v, mtof(base + s), at, 0.075 * (1 - i * 0.08), COIN);
        click(v, at, 0.03, 6000, 0.004);
      });
      // poussière d'or
      for (let i = 0; i < 3; i++) {
        tone(v, { f: mtof(pick([100, 103, 105, 108])), at: 0.22 + rr(0, 0.2), d: 0.12, g: 0.018 });
      }
    },
  },

  wrong: {
    gain: 1.1,
    wet: 0.12,
    min: 0.2,
    max: 1,
    jitter: 0.01,
    build(v) {
      // deux notes graves et rondes (mi bémol → si bémol)
      const n1 = 311.13;
      const n2 = 233.08;
      tone(v, { type: 'triangle', f: n1, a: 0.012, hold: 0.06, d: 0.2, g: 0.3, lp: 1500 });
      tone(v, { f: n1 / 2, a: 0.012, hold: 0.06, d: 0.15, g: 0.05 });
      tone(v, { type: 'triangle', f: n2, f2: n2 * 0.985, at: 0.16, a: 0.012, hold: 0.1, d: 0.32, g: 0.32, lp: 1400 });
      tone(v, { f: n2 / 2, at: 0.16, a: 0.012, hold: 0.1, d: 0.25, g: 0.05 });
    },
  },

  hit: {
    gain: 1.29,
    wet: 0.15,
    min: 0.08,
    max: 2,
    build(v) {
      // bousculade
      tone(v, { f: 210, f2: 85, d: 0.14, g: 0.35 });
      noise(v, { kind: 'pink', type: 'bandpass', f: 700, q: 0.8, d: 0.1, g: 1.2 });
      // couverts qui s'entrechoquent
      const n = 7 + Math.floor(rr(0, 4));
      for (let i = 0; i < n; i++) {
        const at = 0.02 + Math.pow(Math.random(), 1.6) * 0.32;
        ting(v, at, rr(2600, 5200), 0.12 * (1 - at / 0.45), rr(0.05, 0.11));
      }
    },
  },

  tray_wobble: {
    gain: 1.54,
    wet: 0.2,
    min: 0.18,
    max: 2,
    build(v) {
      // verres qui s'entrechoquent sur le plateau qui penche
      const glasses = [rr(2200, 2600), rr(2900, 3400), rr(3600, 4000)];
      const n = 5 + Math.floor(rr(0, 3));
      let at = 0;
      for (let i = 0; i < n; i++) {
        bell(v, pick(glasses), at, 0.065 * (0.6 + 0.4 * Math.random()) * (1 - i / (n + 2)), GLASS);
        at += rr(0.04, 0.075);
      }
    },
  },

  tray_crash: {
    gain: 2.04,
    wet: 0.3,
    min: 0.3,
    max: 2,
    build(v) {
      // impact
      noise(v, { kind: 'white', type: 'highpass', f: 1800, a: 0.002, d: 0.35, g: 0.2, lp: 8500 });
      noise(v, { kind: 'pink', type: 'bandpass', f: 1200, q: 0.8, d: 0.2, g: 0.45 });
      tone(v, { f: 130, f2: 50, d: 0.2, g: 0.35 });
      // cascade d'éclats de porcelaine
      for (let i = 0; i < 15; i++) {
        const at = 0.01 + Math.pow(Math.random(), 1.8) * 0.9;
        const g = 0.075 * (1 - at * 0.8);
        ting(v, at, rr(1800, 5000), g, rr(0.05, 0.18), 1.62);
        if (Math.random() < 0.35) click(v, at, g, rr(3000, 6000), 0.006);
      }
      // gros morceaux qui rebondissent
      for (let j = 0; j < 2; j++) {
        const f = rr(900, 1300);
        let at = rr(0.1, 0.22);
        let g = 0.07;
        for (let b = 0; b < 4; b++) {
          bell(v, f, at, g, PORCELAIN);
          at += 0.13 * Math.pow(0.7, b);
          g *= 0.6;
        }
      }
    },
  },

  cloche_open: {
    gain: 1.49,
    wet: 0.4,
    min: 0.15,
    max: 2,
    build(v) {
      // le couvercle d'argent se décolle
      bell(v, rr(1700, 1900), 0, 0.06, SILVER);
      // souffle d'air qui monte
      noise(v, { kind: 'pink', type: 'bandpass', f: 900, f2: 4000, q: 1.2, a: 0.12, d: 0.35, g: 0.4, lp: 7000 });
      // scintillement argenté
      [2637, 3136, 3520, 4186].forEach((f, i) => {
        tone(v, { f, at: 0.06 + i * 0.045, a: 0.07, d: 0.5, g: 0.022, vib: rr(6, 9), vibDepth: 18 });
      });
    },
  },

  cloche_bonus: {
    gain: 1.74,
    wet: 0.45,
    min: 0.2,
    max: 2,
    jitter: 0.005,
    build(v) {
      // arpège doré (fa majeur 9) en célesta
      const notes = [77, 81, 84, 88, 91, 93, 96];
      notes.forEach((m, i) => bell(v, mtof(m), i * 0.055, 0.075 * (0.75 + (0.25 * i) / 6), CELESTA));
      // nappe dorée en dessous
      for (const m of [65, 69, 72, 76]) {
        tone(v, { type: 'triangle', f: mtof(m), a: 0.15, hold: 0.25, d: 0.65, g: 0.035, lp: 2000, detune: rr(-6, 6) });
      }
    },
  },

  trap_warn: {
    gain: 0.676,
    wet: 0.15,
    min: 0.25,
    max: 2,
    jitter: 0.01,
    build(v) {
      // sifflet d'alarme rose : deux montées bien lisibles
      const calls: [number, number, number][] = [
        [0, 760, 1250],
        [0.24, 860, 1450],
      ];
      for (const [at, f1, f2] of calls) {
        tone(v, { f: f1, f2, glide: 0.18, at, a: 0.02, hold: 0.12, d: 0.08, g: 0.28, vib: 11, vibDepth: 25 });
        tone(v, { type: 'triangle', f: f1 * 2, f2: f2 * 2, glide: 0.18, at, a: 0.02, hold: 0.12, d: 0.06, g: 0.04, lp: 3500 });
        noise(v, { kind: 'white', type: 'bandpass', f: f1 * 1.5, f2: f2 * 1.5, sweep: 0.18, q: 6, at, a: 0.02, hold: 0.1, d: 0.06, g: 0.07 });
      }
    },
  },

  foam_burst: {
    gain: 1.3,
    wet: 0.2,
    min: 0.12,
    max: 2,
    build(v) {
      // pop du siphon
      tone(v, { f: 420, f2: 140, glide: 0.04, d: 0.06, g: 0.4 });
      click(v, 0, 0.2, 1500);
      // pschhh de chantilly (souffle filtré, jamais strident)
      noise(v, { kind: 'white', type: 'bandpass', f: 3500, f2: 2200, q: 0.9, at: 0.01, a: 0.03, hold: 0.25, d: 0.35, g: 0.3, lp: 7000 });
      noise(v, { kind: 'pink', type: 'lowpass', f: 1200, at: 0.01, a: 0.02, hold: 0.15, d: 0.3, g: 0.25 });
      // bulles de crème
      for (let i = 0; i < 6; i++) bubble(v, 0.1 + rr(0, 0.55), rr(350, 800), 0.08);
    },
  },

  champagne_pop: {
    gain: 0.627,
    wet: 0.25,
    min: 0.15,
    max: 2,
    build(v) {
      // bouchon : claquement creux
      tone(v, { f: 820, f2: 300, glide: 0.035, d: 0.1, g: 0.5 });
      noise(v, { kind: 'white', type: 'bandpass', f: 1100, q: 3, d: 0.08, g: 1.6 });
      noise(v, { kind: 'pink', type: 'bandpass', f: 1800, q: 0.8, d: 0.03, g: 1.2 });
      // effervescence
      noise(v, { kind: 'crackle', type: 'bandpass', f: 3800, q: 0.7, at: 0.06, a: 0.08, hold: 0.3, d: 0.9, g: 0.35, lp: 7000 });
      noise(v, { kind: 'white', type: 'bandpass', f: 4500, q: 1, at: 0.06, a: 0.08, hold: 0.1, d: 0.6, g: 0.025 });
    },
  },

  slip: {
    gain: 1.01,
    wet: 0.12,
    min: 0.2,
    max: 2,
    build(v) {
      // couinement de semelle (collé-glissé)
      tone(v, { type: 'sawtooth', f: 780, f2: 1150, glide: 0.18, a: 0.01, hold: 0.12, d: 0.08, g: 0.14, bp: 1600, q: 2.5, lp: 3500, vib: 28, vibDepth: 40 });
      tone(v, { f: 780, f2: 1150, glide: 0.18, a: 0.01, hold: 0.12, d: 0.08, g: 0.1, vib: 28, vibDepth: 40 });
      // glissade
      noise(v, { kind: 'pink', type: 'bandpass', f: 900, f2: 500, q: 0.8, a: 0.03, hold: 0.15, d: 0.2, g: 0.3 });
    },
  },

  fall: {
    gain: 0.729,
    wet: 0.2,
    min: 0.3,
    max: 1,
    build(v) {
      // sifflet descendant
      tone(v, { f: 1500, f2: 260, glide: 0.62, a: 0.02, hold: 0.45, d: 0.15, g: 0.18, vib: 6, vibDepth: 30 });
      tone(v, { type: 'triangle', f: 1500, f2: 260, glide: 0.62, a: 0.02, hold: 0.45, d: 0.15, g: 0.04, lp: 3000 });
      // atterrissage
      tone(v, { f: 150, f2: 55, at: 0.6, d: 0.3, g: 0.4 });
      noise(v, { kind: 'pink', type: 'bandpass', f: 500, q: 0.7, at: 0.6, d: 0.2, g: 1.2 });
      noise(v, { kind: 'pink', type: 'bandpass', f: 1500, q: 1, at: 0.61, d: 0.08, g: 0.6 });
    },
  },

  teleport: {
    gain: 1.1,
    wet: 0.4,
    min: 0.3,
    max: 2,
    build(v) {
      // tourbillon de la porte à tambour : panoramique tournant qui accélère
      const { ac } = v;
      const pan = ac.createStereoPanner();
      pan.connect(v.out);
      lfo(v, pan.pan, 2.5, 0.75, v.t, v.t + 0.95, 9);
      tone(v, { f: 260, f2: 1300, glide: 0.75, a: 0.12, hold: 0.45, d: 0.25, g: 0.14, vib: 12, vibDepth: 50, dest: pan });
      tone(v, { type: 'triangle', f: 390, f2: 1950, glide: 0.75, a: 0.12, hold: 0.45, d: 0.25, g: 0.05, lp: 2500, dest: pan });
      noise(v, { kind: 'pink', type: 'bandpass', f: 400, f2: 2800, sweep: 0.7, q: 2.2, a: 0.25, hold: 0.3, d: 0.3, g: 0.6, dest: pan });
      // arrivée
      bell(v, 1975.5, 0.78, 0.07, SILVER);
    },
  },

  camera_flash: {
    gain: 0.902,
    wet: 0.12,
    min: 0.1,
    max: 2,
    build(v) {
      // déclic de l'obturateur (deux lamelles)
      for (const at of [0, 0.045]) {
        noise(v, { kind: 'white', type: 'bandpass', f: 3000, q: 2.5, at, a: 0.0005, d: 0.035, g: 1.2 });
        noise(v, { kind: 'pink', type: 'bandpass', f: 1400, q: 1.5, at, a: 0.0005, d: 0.03, g: 1.2 });
        tone(v, { f: 1200, f2: 600, at, d: 0.035, g: 0.2 });
      }
      // recharge du flash : sifflement montant, discret
      tone(v, { f: 1800, f2: 4200, glide: 0.7, at: 0.08, a: 0.15, hold: 0.4, d: 0.2, g: 0.025 });
    },
  },

  poodle_yap: {
    gain: 0.373,
    wet: 0.12,
    min: 0.12,
    max: 2,
    jitter: 0.06,
    build(v) {
      yap(v, 0, 0.9);
      if (Math.random() < 0.4) yap(v, rr(0.12, 0.15), 0.7);
    },
  },

  chair_scrape: {
    gain: 2.61,
    wet: 0.12,
    min: 0.2,
    max: 2,
    jitter: 0.08,
    build(v) {
      const dur = rr(0.28, 0.42);
      // collé-glissé du pied de chaise, résonance du bois
      const f1 = rr(55, 70);
      const f2 = rr(80, 100);
      tone(v, { type: 'sawtooth', f: f1, f2, glide: dur, a: 0.03, hold: dur * 0.6, d: dur * 0.4, g: 0.25, bp: 700, q: 3, lp: 2200, vib: 13, vibDepth: 120 });
      tone(v, { type: 'sawtooth', f: f1 * 1.01, f2: f2 * 1.01, glide: dur, a: 0.03, hold: dur * 0.6, d: dur * 0.4, g: 0.08, bp: 1500, q: 4, lp: 2500, vib: 17, vibDepth: 90 });
      noise(v, { kind: 'pink', type: 'bandpass', f: 1100, q: 1.5, a: 0.03, hold: dur * 0.6, d: dur * 0.4, g: 0.18 });
    },
  },

  cart_roll: {
    gain: 1.26,
    wet: 0.15,
    min: 0.35,
    max: 2,
    build(v) {
      const dur = 0.9;
      // grondement des roues (roulis)
      const roll = wobbleBus(v, rr(6, 8), 0.35, 0, dur + 0.3, 0.65);
      noise(v, { kind: 'brown', type: 'lowpass', f: 380, a: 0.12, hold: dur - 0.3, d: 0.25, g: 0.4, dest: roll });
      noise(v, { kind: 'pink', type: 'bandpass', f: 600, q: 0.9, a: 0.12, hold: dur - 0.3, d: 0.25, g: 0.5, dest: roll });
      // cliquetis de la vaisselle
      for (let i = 0; i < 9; i++) ting(v, rr(0.05, dur), rr(2400, 4500), rr(0.04, 0.09), rr(0.05, 0.1), 2.68);
      // roue qui grince à peine
      tone(v, { f: rr(1300, 1600), a: 0.2, hold: 0.2, d: 0.3, g: 0.012, vib: 4, vibDepth: 50 });
    },
  },

  order_new: {
    gain: 0.834,
    wet: 0.3,
    min: 0.12,
    max: 2,
    jitter: 0.008,
    build(v) {
      // sonnette de service douce (mi 6)
      bell(v, 1318.5, 0, 0.13, SERVICE_BELL);
      click(v, 0, 0.05, 5000, 0.006);
    },
  },

  order_expire: {
    gain: 0.935,
    wet: 0.15,
    min: 0.25,
    max: 1,
    jitter: 0.008,
    build(v) {
      // déception : trois notes qui descendent, la dernière fléchit
      const notes: [number, number, number][] = [
        [0, 466.16, 0.08],
        [0.16, 392.0, 0.08],
        [0.32, 349.23, 0.16],
      ];
      notes.forEach(([at, f, hold], i) => {
        const last = i === notes.length - 1;
        tone(v, { type: 'triangle', f, f2: last ? f * 0.94 : undefined, glide: 0.45, at, a: 0.015, hold, d: last ? 0.4 : 0.14, g: 0.24, lp: 1400 });
        tone(v, { type: 'sawtooth', f, f2: last ? f * 0.94 : undefined, glide: 0.45, at, a: 0.02, hold, d: last ? 0.35 : 0.12, g: 0.05, bp: last ? 900 : 1200, q: 2 });
      });
    },
  },

  quota_reached: {
    gain: 1.93,
    wet: 0.35,
    min: 0.5,
    max: 1,
    jitter: 0.003,
    build(v) {
      // appel « ta-ta » puis accord doré (do → fa majeur)
      brass(v, 72, 0, 0.06, 0.12, 0.06);
      brass(v, 72, 0.13, 0.06, 0.12, 0.06);
      for (const m of [65, 69, 72, 77]) brass(v, m, 0.26, 0.42, 0.55, 0.05);
      bell(v, mtof(89), 0.26, 0.05, SILVER);
      for (let i = 0; i < 5; i++) {
        tone(v, { f: mtof(pick([96, 98, 100, 101, 103, 105])), at: 0.3 + i * 0.07 + rr(0, 0.03), d: 0.25, g: 0.025 });
      }
    },
  },

  royal_bell: {
    gain: 2.82,
    wet: 0.55,
    min: 0.6,
    max: 2,
    jitter: 0.008,
    build(v) {
      // grande cloche à main dorée, balancée deux fois
      const swing = wobbleBus(v, 2.3, 0.12, 0, 4.3, 0.88);
      const strike = (at: number, amp: number): void => {
        bell(v, 392, at, 0.1 * amp, ROYAL, { dest: swing, a: 0.002 });
        click(v, at, 0.12 * amp, 3200, 0.02);
        tone(v, { f: 2350, at, d: 0.06, g: 0.03 * amp });
      };
      strike(0, 1);
      strike(0.48, 0.62);
    },
  },

  ring_power: {
    gain: 2.01,
    wet: 0.5,
    min: 0.3,
    max: 1,
    jitter: 0.005,
    build(v) {
      // houle magique : accord lydien dont le filtre s'ouvre
      const sw = biquad(v.ac, 'lowpass', 250, 3);
      sw.frequency.setValueAtTime(250, v.t);
      sw.frequency.exponentialRampToValueAtTime(4200, v.t + 0.75);
      sw.frequency.exponentialRampToValueAtTime(1500, v.t + 1.35);
      sw.connect(v.out);
      for (const m of [53, 65, 72, 76, 79, 83]) {
        for (const det of [-8, 8]) {
          tone(v, { type: 'sawtooth', f: mtof(m), detune: det, a: 0.6, hold: 0.1, d: 0.6, g: 0.022, dest: sw });
        }
      }
      noise(v, { kind: 'white', type: 'bandpass', f: 1500, f2: 7000, sweep: 0.7, q: 1.5, a: 0.65, d: 0.12, g: 0.12 });
      for (let i = 0; i < 4; i++) bell(v, mtof(pick([84, 88, 91, 96, 100])), 0.68 + i * 0.06, 0.05, CELESTA);
    },
  },

  tide_rumble: {
    gain: 1.23,
    wet: 0.25,
    min: 0.4,
    max: 2,
    build(v) {
      // marée de mousse de cappuccino : grondement bouillonnant
      const swell = wobbleBus(v, rr(2, 3), 0.3, 0, 1.8, 0.7);
      noise(v, { kind: 'brown', type: 'lowpass', f: 380, a: 0.35, hold: 0.6, d: 0.6, g: 0.5, dest: swell });
      noise(v, { kind: 'pink', type: 'bandpass', f: 700, q: 0.8, a: 0.3, hold: 0.5, d: 0.5, g: 0.45, dest: swell });
      for (let i = 0; i < 14; i++) bubble(v, rr(0.05, 1.3), rr(260, 700), rr(0.1, 0.2));
    },
  },

  ui_hover: {
    gain: 0.294,
    wet: 0.05,
    min: 0.035,
    max: 2,
    jitter: 0.02,
    build(v) {
      tone(v, { f: 2400, a: 0.001, d: 0.045, g: 0.3 });
    },
  },

  ui_click: {
    gain: 0.265,
    wet: 0.06,
    min: 0.03,
    max: 3,
    jitter: 0.02,
    build(v) {
      tone(v, { f: 1300, f2: 900, glide: 0.02, d: 0.06, g: 0.5 });
      noise(v, { kind: 'white', type: 'bandpass', f: 3000, q: 1, a: 0.0005, d: 0.015, g: 0.4 });
    },
  },

  ui_open: {
    gain: 1.22,
    wet: 0.12,
    min: 0.08,
    max: 2,
    build(v) {
      // carte de menu qui glisse (papier)
      noise(v, { kind: 'pink', type: 'bandpass', f: 1200, f2: 4200, f3: 2500, sweep: 0.12, q: 1.1, a: 0.05, hold: 0.03, d: 0.14, g: 0.55 });
      noise(v, { kind: 'white', type: 'highpass', f: 5000, a: 0.05, d: 0.1, g: 0.03 });
      tone(v, { f: 500, f2: 350, at: 0.15, d: 0.04, g: 0.08 });
    },
  },

  loot_reveal: {
    gain: 2.07,
    wet: 0.45,
    min: 0.3,
    max: 1,
    jitter: 0.004,
    build(v) {
      // la cloche se lève…
      bell(v, rr(1750, 1850), 0, 0.06, SILVER);
      noise(v, { kind: 'pink', type: 'bandpass', f: 700, f2: 3500, q: 1.1, a: 0.14, d: 0.35, g: 0.4 });
      // … et révèle un accord scintillant (fa majeur 9, piano électrique)
      [65, 69, 72, 76, 79].forEach((m, i) => {
        fm(v, { f: mtof(m), ratio: 1, index: 1.4, index2: 0.15, idecay: 0.4, at: 0.2 + i * 0.03, a: 0.003, d: 1.6, g: 0.06 });
      });
      for (let i = 0; i < 5; i++) bell(v, mtof(pick([84, 86, 88, 91, 93, 96])), 0.3 + rr(0, 0.7), 0.04, CELESTA);
    },
  },

  wheel_tick: {
    gain: 0.406,
    wet: 0.05,
    min: 0.025,
    max: 4,
    jitter: 0.04,
    build(v) {
      tone(v, { type: 'triangle', f: 1900, d: 0.03, g: 0.4 });
      noise(v, { kind: 'white', type: 'bandpass', f: 3200, q: 2, a: 0.0005, d: 0.012, g: 0.6 });
      tone(v, { f: 900, d: 0.02, g: 0.15 });
    },
  },

  wheel_win: {
    gain: 1.66,
    wet: 0.35,
    min: 0.4,
    max: 1,
    jitter: 0.003,
    build(v) {
      // gamme qui monte (marimba), accord final, paillettes
      const run = [72, 74, 76, 77, 79, 81, 84, 86, 88];
      run.forEach((m, i) => {
        const at = i * 0.04;
        tone(v, { f: mtof(m), at, d: 0.22, g: 0.09 });
        tone(v, { f: mtof(m) * 4, at, d: 0.04, g: 0.02 });
      });
      const at = run.length * 0.04 + 0.02;
      for (const m of [65, 69, 72, 76, 79]) tone(v, { type: 'triangle', f: mtof(m), at, a: 0.01, hold: 0.15, d: 0.9, g: 0.05, lp: 2500 });
      bell(v, mtof(89), at, 0.06, SERVICE_BELL);
      for (let i = 0; i < 7; i++) {
        tone(v, { f: mtof(pick([96, 98, 100, 103, 105, 108])), at: at + 0.05 + rr(0, 0.8), d: rr(0.08, 0.16), g: 0.02 });
      }
    },
  },

  countdown: {
    gain: 0.711,
    wet: 0.2,
    min: 0.08,
    max: 2,
    jitter: 0.004,
    build(v) {
      // bloc de bois + halo de clochette
      tone(v, { f: 1046.5, f2: 990, glide: 0.03, d: 0.11, g: 0.35 });
      tone(v, { f: 1046.5 * 2.71, d: 0.03, g: 0.06 });
      click(v, 0, 0.18, 1800, 0.008);
      tone(v, { f: 2093, at: 0.002, d: 0.45, g: 0.05 });
    },
  },

  level_fail: {
    gain: 0.759,
    wet: 0.3,
    min: 1,
    max: 1,
    jitter: 0.005,
    build(v) {
      // glissando triste : sol, fa#, fa, mi… qui s'affaisse en vibrant
      const { ac } = v;
      const t = v.t;
      const k = v.p;
      const steps = [392, 370, 349.23, 329.63];
      const stepDur = 0.32;
      const lastAt = t + stepDur * 3;
      const end = lastAt + 1.15;
      const art = ac.createGain();
      art.gain.value = 1;
      const lp = biquad(ac, 'lowpass', 1100, 0.8);
      const amp = ac.createGain();
      amp.gain.value = 0;
      envelope(amp.gain, t, 0.03, 0.3, end - t - 0.6, 0.6);
      art.connect(lp);
      lp.connect(amp);
      amp.connect(v.out);
      // articulation : petite respiration entre les notes
      for (let i = 1; i < steps.length; i++) {
        const ti = t + i * stepDur;
        art.gain.setValueAtTime(1, ti - 0.05);
        art.gain.linearRampToValueAtTime(0.35, ti - 0.01);
        art.gain.linearRampToValueAtTime(1, ti + 0.04);
      }
      const voices: [OscillatorType, number][] = [
        ['triangle', 1],
        ['sine', 0.6],
      ];
      for (const [type, g] of voices) {
        const o = ac.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(steps[0] * k, t);
        for (let i = 1; i < steps.length; i++) {
          const ti = t + i * stepDur;
          o.frequency.setValueAtTime(steps[i - 1] * k, ti - 0.04);
          o.frequency.exponentialRampToValueAtTime(steps[i] * k, ti);
        }
        o.frequency.setValueAtTime(steps[3] * k, lastAt + 0.35);
        o.frequency.exponentialRampToValueAtTime(165 * k, end);
        const og = ac.createGain();
        og.gain.value = g;
        o.connect(og);
        og.connect(art);
        lfo(v, o.detune, 5, 35, lastAt, end);
        o.start(t);
        o.stop(end + 0.02);
      }
      v.end = Math.max(v.end, end + 0.02);
      // bulles qui remontent
      for (let i = 0; i < 8; i++) bubble(v, rr(0.3, 1.9), rr(300, 700), 0.07);
    },
  },
};

/** Liste de tous les effets (ordre de déclaration). */
export const SFX_IDS = Object.keys(DEFS) as SfxId[];

// ─────────────────────────────────────────── Lecteur (polyphonie)

interface ActiveVoice {
  id: SfxId;
  end: number;
  out: GainNode;
}

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));

export class SfxPlayer {
  private active: ActiveVoice[] = [];
  private readonly last = new Map<SfxId, number>();

  constructor(private readonly e: Engine) {}

  /** Nombre de voix d'effets en cours. */
  get voices(): number {
    const now = this.e.ac.currentTime;
    this.active = this.active.filter((a) => a.end > now);
    return this.active.length;
  }

  play(id: SfxId, opts: SfxOptions = {}): void {
    const def = DEFS[id];
    if (!def) return;
    const ac = this.e.ac;
    const now = ac.currentTime;
    const prev = this.last.get(id);
    if (prev !== undefined && now - prev < def.min && now >= prev) return;
    const vol = clamp(Number.isFinite(opts.volume) ? (opts.volume as number) : 1, 0, 1.5);
    if (vol < 0.002) return;

    this.active = this.active.filter((a) => a.end > now);
    const same = this.active.filter((a) => a.id === id);
    if (same.length >= def.max) this.steal(same[0], now);
    if (this.active.length >= MAX_VOICES) this.steal(this.active[0], now);

    const pitch = clamp(Number.isFinite(opts.pitch) ? (opts.pitch as number) : 1, 0.25, 4);
    const pan = clamp(Number.isFinite(opts.pan) ? (opts.pan as number) : rr(-0.05, 0.05), -1, 1);
    const jit = def.jitter ?? 0.03;
    const p = pitch * (1 + (Math.random() * 2 - 1) * jit);

    const out = ac.createGain();
    out.gain.value = def.gain * vol;
    let tail: AudioNode = out;
    if (typeof ac.createStereoPanner === 'function') {
      const panner = ac.createStereoPanner();
      panner.pan.value = pan;
      out.connect(panner);
      tail = panner;
    }
    tail.connect(this.e.sfxDry);
    if (def.wet > 0) {
      const wet = ac.createGain();
      wet.gain.value = def.wet;
      tail.connect(wet);
      wet.connect(this.e.sfxWet);
    }

    const v: Voice = { e: this.e, ac, out, t: now + 0.004, p, end: now };
    def.build(v);
    this.active.push({ id, end: v.end, out });
    this.last.set(id, now);
  }

  /** Coupe une voix en fondu très court (vol de voix). */
  private steal(a: ActiveVoice, now: number): void {
    const g = a.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + 0.03);
    const i = this.active.indexOf(a);
    if (i >= 0) this.active.splice(i, 1);
  }
}
