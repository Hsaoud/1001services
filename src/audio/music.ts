/**
 * Musique procédurale de La Duchesse : petit orchestre de salon (piano électrique, contrebasse,
 * balais, vibraphone, flûte, cordes) joué par un ordonnanceur à anticipation
 * (setInterval ~25 ms + programmation sur `currentTime`).
 *
 * Chaque morceau est un « style » : grilles d'accords tirées au sort à chaque chorus (graine),
 * motifs mélodiques réutilisés en question / réponse, voicings conduits au plus près.
 * `setIntensity` accélère et densifie le service (tempo, charleston, brillance).
 */
import { Rng } from '../core/rng';
import type { MusicTrack } from '../types';
import type { Engine } from './engine';
import { bassNote, brushSweep, brushTap, drumKit, epNote, fluteNote, hat, kick, padChord, ride, vibesNote } from './instruments';
import {
  QUALITIES,
  makeMotif,
  nearestChordTone,
  nearestPc,
  parseChart,
  scalePitches,
  voiceChord,
  type Chord,
  type Motif,
} from './theory';

export type TrackName = Exclude<MusicTrack, null>;

/** Durée des fondus enchaînés (s). */
const FADE = 1.5;
/** Anticipation de l'ordonnanceur (s) : tolère un fil principal bloqué ~200 ms. */
const LOOKAHEAD = 0.25;
const TICK_MS = 25;

// ─────────────────────────────────────────── Grilles

const SERVICE_A = [
  'Fmaj9 | Dm9 | Gm9 | C13 | Am9 D7b9 | Gm9 C13 | Fmaj9 | Gm9 C13',
  'Fmaj9 | Bb13 | Am9 | D7b9 | Gm9 | C13 | Fmaj9 Dm9 | Gm9 C13',
  'Fmaj9 | G13 | Gm9 | C13 | Am9 | Ab13 | Gm9 | C13',
];
const SERVICE_B = [
  'Bbmaj9 | Bbm9 Eb13 | Am9 | D7b9 | Gm9 | C13 | Am9 D7b9 | Gm9 C13',
  'Cm9 F13 | Bbmaj9 | Bbm9 Eb13 | Am9 D7b9 | Gm9 | Dm9 | Gm9 | C13sus C13',
];
const SERVICE_END = 'Fmaj9 | Dm9 | Gm9 | C13 | Fmaj9 | Bbmaj9 | Am9 D7b9 | Gm9 C13';

const RUSH_A = [
  'Dm9 | Dm6 | Em7b5 | A7b9 | Dm9 | Gm9 | Em7b5 A7b9 | Dm9 A7b9',
  'Dm9 | Bb13 | Em7b5 | A7b9 | Dm6 | Bbmaj9 | Em7b5 | A7b9',
];
const RUSH_B = [
  'Gm9 | C13 | Fmaj9 | Bbmaj9 | Em7b5 | A7b9 | Dm9 | Em7b5 A7b9',
  'Bbmaj9 | A7b9 | Dm9 | G13 | Gm9 | C13 | Em7b5 | A7b9',
];

const TITLE_A = [
  'Ebmaj9 | Cm9 | Fm9 | Bb13 | Gm9 | C7b9 | Fm9 | Bb13',
  'Ebmaj9 | Cm9 | Abmaj9 | Bb13 | Gm9 | Cm9 | Fm9 | Bb13sus',
];
const TITLE_A2 = 'Ebmaj9 | Abmaj9 | Gm9 | C7b9 | Fm9 | Bb13 | Ebmaj9 | Ebmaj9';
const TITLE_B = [
  'Abmaj9 | Abm6 | Gm9 | C9 | Fm9 | Bb13 | Gm9 C7b9 | Fm9 Bb13',
  'Abmaj9 | Db13 | Gm9 | C7b9 | Fm9 | Bb13 | Ebmaj9 | Bb13sus',
];
const TITLE_END = 'Ebmaj9 | Abmaj9 | Gm9 | C7b9 | Fm9 | Bb13 | Ebmaj9 | Fm9 Bb13';

const RESULTS = [
  'Ebmaj9 | Abmaj9 | Fm9 Bb13 | Ebmaj9',
  'Ebmaj9 | Cm9 | Abmaj9 Bb13sus | Eb6/9',
  'Abmaj9 | Gm9 | Fm9 Bb13 | Ebmaj9',
];

// ─────────────────────────────────────────── Styles

interface MelodyCfg {
  inst: 'vibes' | 'flute';
  prob: number;
  lo: number;
  hi: number;
  density: number;
  bars: number;
}

interface Style {
  bpb: number;
  bpm: number;
  /** Accélération max avec l'intensité (fraction). */
  tempoRange: number;
  /** Proportion de la croche longue (0,5 = droit). */
  swing: number;
  swingHi: number;
  reactive: boolean;
  form(rng: Rng): string[];
  comp: 'swing' | 'stab' | 'waltz' | 'arp';
  bass: 'walk' | 'walkOnly' | 'waltz' | 'ballad';
  drums: 'brush' | 'rush' | 'soft' | 'none';
  mel: MelodyCfg;
  pad: number;
  levels: { ep: number; bass: number; drums: number; mel: number };
  /** Coupure du filtre de brillance (intensité 0 → 1). */
  bright: readonly [number, number];
  level: number;
  /** Tessiture des voicings. */
  voicing: readonly [number, number];
}

const STYLES: Readonly<Record<TrackName, Style>> = {
  title: {
    bpb: 3,
    bpm: 92,
    tempoRange: 0,
    swing: 0.5,
    swingHi: 0.5,
    reactive: false,
    form: (r) => [r.pick(TITLE_A), TITLE_A2, r.pick(TITLE_B), TITLE_END],
    comp: 'waltz',
    bass: 'waltz',
    drums: 'none',
    mel: { inst: 'flute', prob: 0.75, lo: 67, hi: 86, density: 0.8, bars: 2 },
    pad: 0.7,
    levels: { ep: 1.1, bass: 0.85, drums: 0, mel: 1 },
    bright: [5200, 5200],
    level: 0.75,
    voicing: [52, 74],
  },
  service: {
    bpb: 4,
    bpm: 104,
    tempoRange: 0.2,
    swing: 0.64,
    swingHi: 0.6,
    reactive: true,
    form: (r) => [r.pick(SERVICE_A), r.pick(SERVICE_A), r.pick(SERVICE_B), SERVICE_END],
    comp: 'swing',
    bass: 'walk',
    drums: 'brush',
    mel: { inst: 'vibes', prob: 0.6, lo: 67, hi: 86, density: 0.72, bars: 2 },
    pad: 0.45,
    levels: { ep: 1, bass: 1, drums: 1, mel: 1 },
    bright: [3800, 9500],
    level: 0.95,
    voicing: [50, 74],
  },
  rush: {
    bpb: 4,
    bpm: 138,
    tempoRange: 0.12,
    swing: 0.6,
    swingHi: 0.57,
    reactive: true,
    form: (r) => [r.pick(RUSH_A), r.pick(RUSH_A), r.pick(RUSH_B), r.pick(RUSH_A)],
    comp: 'stab',
    bass: 'walkOnly',
    drums: 'rush',
    mel: { inst: 'vibes', prob: 0.62, lo: 67, hi: 86, density: 0.85, bars: 2 },
    pad: 0,
    levels: { ep: 0.95, bass: 1.05, drums: 1.1, mel: 0.95 },
    bright: [5000, 10000],
    level: 0.95,
    voicing: [52, 74],
  },
  results: {
    bpb: 4,
    bpm: 76,
    tempoRange: 0,
    swing: 0.58,
    swingHi: 0.58,
    reactive: false,
    form: (r) => [r.pick(RESULTS), r.pick(RESULTS)],
    comp: 'arp',
    bass: 'ballad',
    drums: 'soft',
    mel: { inst: 'vibes', prob: 0.65, lo: 72, hi: 91, density: 0.6, bars: 2 },
    pad: 0.6,
    levels: { ep: 1, bass: 0.85, drums: 0.9, mel: 0.9 },
    bright: [6000, 6000],
    level: 1,
    voicing: [51, 72],
  },
};

/** Motifs d'accompagnement : [croche dans la mesure (0..7), durée en temps, vélocité]. */
type CompEv = readonly [e: number, len: number, vel: number];
interface CompPattern {
  ev: readonly CompEv[];
  busy: number;
}

const SWING_COMP: readonly CompPattern[] = [
  { ev: [[0, 1.4, 1], [3, 0.9, 0.8]], busy: 0.5 }, // Charleston
  { ev: [[1, 1.2, 0.9], [5, 1.0, 0.8]], busy: 0.5 },
  { ev: [[2, 1.6, 0.9], [7, 1.0, 0.85]], busy: 0.4 }, // temps 2 + anticipation
  { ev: [[0, 3.4, 0.8]], busy: 0 }, // tenue (respiration)
  { ev: [[3, 1.0, 0.85], [6, 1.5, 0.8]], busy: 0.4 },
  { ev: [[0, 0.7, 0.9], [4, 0.7, 0.8], [7, 0.9, 0.85]], busy: 0.8 },
  { ev: [[1, 0.5, 0.85], [3, 0.5, 0.8], [6, 0.9, 0.85]], busy: 0.9 },
];

const STAB_COMP: readonly CompPattern[] = [
  { ev: [[0, 0.3, 1], [3, 0.3, 0.9], [6, 0.3, 0.8]], busy: 0.6 },
  { ev: [[1, 0.3, 0.9], [3, 0.3, 0.9], [5, 0.3, 0.9], [7, 0.3, 1]], busy: 1 },
  { ev: [[0, 0.3, 1], [2, 0.25, 0.7], [5, 0.4, 0.9]], busy: 0.6 },
  { ev: [[3, 0.3, 1], [7, 0.3, 1]], busy: 0.3 },
  { ev: [[0, 0.6, 0.95], [5, 0.3, 0.85]], busy: 0.3 },
];

// ─────────────────────────────────────────── Chorus (grille déroulée)

interface Seg {
  chord: Chord;
  /** Temps absolu de début. */
  start: number;
  len: number;
  voicing: number[] | null;
}

interface Chorus {
  start: number;
  len: number;
  segs: Seg[];
  /** Index du segment pour chaque temps du chorus. */
  segAt: number[];
}

function buildChorus(style: Style, rng: Rng, start: number): Chorus {
  const bars = style.form(rng).flatMap(parseChart);
  const segs: Seg[] = [];
  const segAt: number[] = [];
  let beat = 0;
  for (const bar of bars) {
    const n = Math.min(bar.length, style.bpb);
    const first = Math.ceil(style.bpb / n);
    for (let i = 0; i < n; i++) {
      const len = i === 0 ? first : Math.floor((style.bpb - first) / (n - 1));
      const real = i === n - 1 ? style.bpb - (beat % style.bpb) : len;
      segs.push({ chord: bar[i], start: start + beat, len: real, voicing: null });
      for (let k = 0; k < real; k++) segAt.push(segs.length - 1);
      beat += real;
    }
  }
  return { start, len: beat, segs, segAt };
}

interface MelNote {
  beat: number;
  dur: number;
  midi: number;
  vel: number;
}

/** Diagnostic du laboratoire : n'entendre qu'une famille d'instruments. */
export const musicDebug: {
  solo: null | 'ep' | 'bass' | 'drums' | 'mel' | 'pad';
  /** Trace des notes jouées (partie, temps absolu, notes MIDI). */
  trace: null | ((part: string, beat: number, notes: readonly number[], chord: string) => void);
} = { solo: null, trace: null };
const NOTE = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const chordName = (c: Chord): string => NOTE[c.root] + c.q;
const on = (part: 'ep' | 'bass' | 'drums' | 'mel' | 'pad'): boolean => musicDebug.solo === null || musicDebug.solo === part;

const swingPos = (frac: number, sw: number): number =>
  frac < 0.5 ? (frac / 0.5) * sw : sw + ((frac - 0.5) / 0.5) * (1 - sw);

const hum = (ms: number): number => (Math.random() * 2 - 1) * ms * 0.001;

// ─────────────────────────────────────────── Lecteur de piste

const BASS_LO = 31;
const BASS_HI = 50;

class TrackPlayer {
  readonly out: GainNode;
  private readonly inBus: GainNode;
  private readonly tone: BiquadFilterNode;
  private readonly epBus: AudioNode;
  private readonly vibesBus: GainNode;
  private readonly lfos: OscillatorNode[] = [];
  private readonly style: Style;
  private readonly rng: Rng;
  private chorus: Chorus;
  private nextChorus: Chorus;
  private abs = 0;
  nextTime: number;
  scheduling = true;
  fading = false;
  fadeEnd = 0;
  disposeAt = Infinity;
  intensity = 0;
  private lastVoicing: number[] | null = null;
  private lastBass = -1;
  private comp: CompEv[] = [];
  private waltzMode: 'oompah' | 'hold' | 'arp' = 'oompah';
  private pending: MelNote[] = [];
  private motifs: Motif[] = [];
  private lastMotif: Motif | null = null;
  private lastMel: number;
  private mood = { mel: 1, busy: 1 };
  private toneCut: number;

  constructor(
    private readonly e: Engine,
    readonly name: TrackName,
    start: number,
    seed: number,
  ) {
    const ac = e.ac;
    this.style = STYLES[name];
    this.rng = new Rng(seed);
    this.nextTime = start;
    this.lastMel = Math.round((this.style.mel.lo + this.style.mel.hi) / 2);

    this.out = ac.createGain();
    this.out.gain.value = 0;
    this.tone = ac.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.Q.value = 0.5;
    this.tone.frequency.value = this.style.bright[0];
    this.toneCut = this.style.bright[0];
    this.inBus = ac.createGain();
    this.inBus.gain.value = this.style.level;
    this.inBus.connect(this.tone);
    this.tone.connect(this.out);
    this.out.connect(e.musicIn);

    // Piano électrique : léger panoramique automatique très lent
    if (typeof ac.createStereoPanner === 'function') {
      const pan = ac.createStereoPanner();
      pan.connect(this.inBus);
      this.addLfo(pan.pan, 0.11, 0.28);
      this.epBus = pan;
    } else this.epBus = this.inBus;

    // Vibraphone : trémolo du moteur
    this.vibesBus = ac.createGain();
    this.vibesBus.gain.value = this.style.mel.inst === 'vibes' && name !== 'results' ? 0.8 : 1;
    if (this.style.mel.inst === 'vibes' && name !== 'results') this.addLfo(this.vibesBus.gain, 5.3, 0.2);
    this.vibesBus.connect(this.inBus);

    if (this.style.drums !== 'none') drumKit(e); // échantillons de batterie prêts avant le premier temps
    this.chorus = buildChorus(this.style, this.rng, 0);
    this.nextChorus = buildChorus(this.style, this.rng, this.chorus.len);
    for (let i = 0; i < 4; i++) this.motifs.push(this.newMotif());
    this.newMood(true);
  }

  private addLfo(param: AudioParam, rate: number, depth: number): void {
    const ac = this.e.ac;
    const o = ac.createOscillator();
    o.frequency.value = rate;
    const g = ac.createGain();
    g.gain.value = depth;
    o.connect(g);
    g.connect(param);
    o.start();
    this.lfos.push(o);
  }

  private newMotif(): Motif {
    const m = this.style.mel;
    // flûte de la valse : legato, surtout sur les temps ; vibraphone : plus syncopé
    const flute = m.inst === 'flute';
    return makeMotif(this.rng, m.bars * this.style.bpb, m.density, this.style.bpb, flute ? 0.05 : 0.25, flute ? 0.22 : 0.45);
  }

  private newMood(first: boolean): void {
    const r = this.rng;
    const silent = !first && r.chance(this.style.reactive ? 0.18 : 0.1);
    this.mood = { mel: silent ? 0 : r.range(first ? 0.85 : 0.6, 1.25), busy: r.range(0.85, 1.15) };
  }

  // ── Fondus

  fadeIn(now: number, dur: number): void {
    this.fading = false;
    this.scheduling = true;
    this.disposeAt = Infinity;
    const g = this.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(1, now + dur);
  }

  fadeOut(now: number, dur: number): void {
    this.fading = true;
    this.fadeEnd = now + dur;
    this.disposeAt = now + dur + 4;
    const g = this.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + dur);
  }

  dispose(): void {
    this.scheduling = false;
    for (const o of this.lfos) {
      try {
        o.stop();
      } catch {
        /* déjà arrêté */
      }
    }
    this.out.disconnect();
  }

  // ── Ordonnancement

  private bpm(): number {
    const s = this.style;
    return s.bpm * (1 + (s.reactive ? s.tempoRange * this.intensity : 0));
  }

  pump(now: number, until: number): void {
    if (!this.scheduling) return;
    // rattrapage après un gel (onglet masqué, fil principal bloqué) : on saute, sans rafale
    if (this.nextTime < now - 0.3) this.nextTime = now + 0.03;
    let guard = 0;
    while (this.nextTime < until && guard++ < 4096) {
      const bd = 60 / this.bpm();
      this.beat(this.nextTime, bd);
      this.nextTime += bd;
    }
  }

  private segAt(abs: number): Seg {
    const c = this.chorus;
    if (abs < c.start + c.len) return c.segs[c.segAt[Math.max(0, abs - c.start)]];
    const n = this.nextChorus;
    return n.segs[n.segAt[Math.min(n.len - 1, abs - n.start)]];
  }

  private voicingOf(seg: Seg): number[] {
    if (!seg.voicing) {
      const [lo, hi] = this.style.voicing;
      seg.voicing = voiceChord(seg.chord, this.lastVoicing, this.rng, lo, hi);
      this.lastVoicing = seg.voicing;
    }
    return seg.voicing;
  }

  private beat(t: number, bd: number): void {
    const st = this.style;
    const I = st.reactive ? this.intensity : 0;
    const rel = this.abs - this.chorus.start;
    const bib = rel % st.bpb;
    const bar = Math.floor(rel / st.bpb);
    const sw = st.swing + (st.swingHi - st.swing) * I;
    const seg = this.segAt(this.abs);

    if (st.reactive) {
      // brillance : rampe courte seulement si l'écart est sensible (filtre statique le reste du temps)
      const cut = st.bright[0] + (st.bright[1] - st.bright[0]) * I;
      if (Math.abs(cut - this.toneCut) > this.toneCut * 0.03) {
        this.tone.frequency.setValueAtTime(this.toneCut, t);
        this.tone.frequency.linearRampToValueAtTime(cut, t + Math.min(0.5, bd));
        this.toneCut = cut;
      }
    }
    if (bib === 0) this.onBar(bar, I);
    if (seg.start === this.abs) this.onChord(seg, t, bd, I);

    if (on('ep')) this.playComp(t, bd, bib, sw, I, seg);
    if (on('bass')) this.playBass(t, bd, bib, sw, I, seg);
    if (on('drums')) this.playDrums(t, bd, bib, sw, I, bar);
    if (on('mel')) this.playMelody(t, bd, sw, I);
    else this.pending = [];

    this.abs++;
    if (this.abs >= this.chorus.start + this.chorus.len) {
      this.chorus = this.nextChorus;
      this.nextChorus = buildChorus(st, this.rng, this.chorus.start + this.chorus.len);
      this.newMood(false);
    }
  }

  private onBar(bar: number, I: number): void {
    const st = this.style;
    const r = this.rng;
    if (st.comp === 'swing' || st.comp === 'stab') {
      const bank = st.comp === 'swing' ? SWING_COMP : STAB_COMP;
      const weights = bank.map((p) => Math.max(0.1, 1 + (p.busy - 0.5) * (I * 2 - 1) * 1.6 * this.mood.busy));
      const pat = r.weighted(bank, weights);
      this.comp = pat.ev.slice();
      // changement d'accord à mi-mesure sans frappe prévue : on en ajoute une
      if (st.bpb === 4) {
        const mid = this.segAt(this.abs + 2);
        if (mid.start === this.abs + 2 && !this.comp.some(([e]) => e >= 4 && e <= 6)) {
          this.comp.push([4, st.comp === 'stab' ? 0.35 : 1.2, 0.8]);
        }
      }
    } else if (st.comp === 'waltz') {
      this.waltzMode = r.weighted(['oompah', 'hold', 'arp'] as const, [0.55, 0.2, 0.25]);
    }
    // mélodie : une phrase commence (ou pas) au début de chaque bloc de mesures
    if (bar % st.mel.bars === 0 && this.pending.length === 0) this.maybePhrase(I);
  }

  private onChord(seg: Seg, t: number, bd: number, I: number): void {
    const st = this.style;
    const v = this.voicingOf(seg);
    if (st.pad > 0 && on('pad')) {
      const upper = v.slice(1).map((m) => m + 12);
      const level = st.pad * (st.reactive ? 1 - 0.6 * I : 1);
      padChord(this.e, this.inBus, t, upper, seg.len * bd + 0.05, level, 1500);
    }
  }

  // ── Accompagnement

  private chordHit(seg: Seg, time: number, lenBeats: number, bd: number, vel: number, bright: number, octave = 0): void {
    const v = this.voicingOf(seg);
    const lv = this.style.levels.ep;
    musicDebug.trace?.('comp', this.abs, v, chordName(seg.chord));
    v.forEach((m, i) => {
      epNote(this.e, this.epBus, time + i * 0.006 + hum(3), m + octave, lenBeats * bd, vel * lv * this.rng.range(0.9, 1.05), bright);
    });
  }

  private playComp(t: number, bd: number, bib: number, sw: number, I: number, seg: Seg): void {
    const st = this.style;
    if (st.comp === 'swing' || st.comp === 'stab') {
      const bright = st.comp === 'stab' ? 1.25 : 0.9 + 0.3 * I;
      const intensityVel = 0.8 + 0.3 * I;
      for (const [e, len, vel] of this.comp) {
        if (Math.floor(e / 2) !== bib) continue;
        const off = e % 2 === 1;
        const time = t + (off ? sw * bd : 0);
        // anticipation : la dernière croche de la mesure joue l'accord suivant
        const target = e === 2 * st.bpb - 1 ? this.segAt(this.abs + 1) : seg;
        let l = len;
        if (target === seg) {
          const remain = seg.start + seg.len - (this.abs + (off ? 0.5 : 0));
          l = Math.min(len, remain - 0.08);
        }
        if (l > 0.05) this.chordHit(target, time, l, bd, 0.62 * vel * intensityVel, bright);
      }
      return;
    }
    if (st.comp === 'waltz') {
      const v = this.voicingOf(seg);
      if (this.waltzMode === 'oompah') {
        if (bib >= 1) this.chordHit(seg, t, 0.75, bd, bib === 1 ? 0.5 : 0.42, 0.8);
      } else if (this.waltzMode === 'hold') {
        if (bib === 1) this.chordHit(seg, t, Math.min(1.8, seg.start + seg.len - this.abs - 0.1), bd, 0.48, 0.8);
        else if (bib === 2 && seg.start === this.abs) this.chordHit(seg, t, 0.85, bd, 0.45, 0.8);
      } else {
        // arpège en croches
        for (let k = 0; k < 2; k++) {
          const idx = (bib * 2 + k) % v.length;
          const m = v[idx];
          epNote(this.e, this.epBus, t + k * 0.5 * bd + hum(3), m, 1.2 * bd, 0.4 * st.levels.ep * this.rng.range(0.9, 1.05), 0.75);
        }
      }
      return;
    }
    // 'arp' : accord tenu au changement + arpège scintillant à l'octave
    const v = this.voicingOf(seg);
    if (seg.start === this.abs) this.chordHit(seg, t, Math.min(seg.len, 3.6), bd, 0.3, 0.7);
    const order = [0, 1, 2, 3, 2, 1];
    for (let k = 0; k < 2; k++) {
      const i = order[(bib * 2 + k) % order.length] % v.length;
      const time = t + (k === 1 ? sw * bd : 0) + hum(3);
      const vel = (bib === 0 && k === 0 ? 0.42 : 0.33) * st.levels.ep;
      epNote(this.e, this.epBus, time, v[i] + 12, 1.4 * bd, vel, 0.7);
    }
  }

  // ── Basse

  private bassPlay(t: number, midi: number, durBeats: number, bd: number, vel: number): void {
    musicDebug.trace?.('bass', this.abs, [midi], chordName(this.segAt(this.abs).chord));
    bassNote(this.e, this.inBus, t + hum(4), midi, durBeats * bd, vel * this.style.levels.bass);
    this.lastBass = midi;
  }

  private fifthOf(ch: Chord, ref: number): number {
    return nearestPc((ch.root + QUALITIES[ch.q].fifth) % 12, ref, BASS_LO, BASS_HI);
  }

  private approach(target: Chord, ref: number): number {
    const r = this.rng;
    const tgt = nearestPc(target.root, ref, BASS_LO + 1, BASS_HI - 1);
    const x = r.next();
    let n: number;
    if (x < 0.55) n = tgt + (r.chance(0.5) ? 1 : -1); // approche chromatique
    else if (x < 0.75) n = tgt + (tgt > ref ? -2 : 2); // par le ton
    else n = this.fifthOf(target, ref); // par la dominante
    // jamais deux fois la même note d'affilée : on bascule sur l'autre voisin chromatique
    if (n === ref) n = tgt + (n > tgt ? -1 : 1);
    return n;
  }

  private walkNote(seg: Seg, ref: number): number {
    const ch = seg.chord;
    const r = this.rng;
    const next = this.segAt(this.abs + 1);
    if (seg.start === this.abs) return nearestPc(ch.root, ref, BASS_LO, BASS_HI);
    if (next.start === this.abs + 1) return this.approach(next.chord, ref);
    const q = QUALITIES[ch.q];
    const seventh = q.tones.find((i) => i === 9 || i === 10 || i === 11) ?? 12;
    const pcs = [q.tones[1], q.fifth, seventh, 0, 2].map((i) => (ch.root + i) % 12);
    const cands = pcs.map((pc) => nearestPc(pc, ref, BASS_LO, BASS_HI)).filter((m) => m !== ref);
    if (cands.length === 0) return ref;
    const w = cands.map((m) => 1 / (1 + Math.abs(m - ref) * 0.6));
    return r.weighted(cands, w);
  }

  private playBass(t: number, bd: number, bib: number, sw: number, I: number, seg: Seg): void {
    const st = this.style;
    const r = this.rng;
    const ref = this.lastBass < 0 ? 40 : this.lastBass;
    const ch = seg.chord;
    const isChange = seg.start === this.abs;
    switch (st.bass) {
      case 'walk':
      case 'walkOnly': {
        const twoFeel = st.bass === 'walk' && I < 0.3;
        if (!twoFeel) {
          const vel = bib % 2 === 0 ? 0.85 : 0.78;
          this.bassPlay(t, this.walkNote(seg, ref), 0.9, bd, vel);
          // croche fantôme en triolet (swing) de temps en temps
          if (bib === 3 && r.chance(0.08 + 0.15 * I)) {
            this.bassPlay(t + sw * bd, this.approach(this.segAt(this.abs + 1).chord, this.lastBass), 0.3, bd, 0.45);
          }
          return;
        }
        if (bib === 0 || bib === 2) {
          let n: number;
          if (isChange) n = nearestPc(ch.root, ref, BASS_LO, BASS_HI);
          else {
            const in2 = this.segAt(this.abs + 2);
            n = in2.start === this.abs + 2 && r.chance(0.4) ? this.approach(in2.chord, ref) : this.fifthOf(ch, ref);
          }
          this.bassPlay(t, n, 1.85, bd, 0.85);
          if (bib === 2 && r.chance(0.15)) {
            this.bassPlay(t + (1 + sw) * bd, this.approach(this.segAt(this.abs + 2).chord, n), 0.35, bd, 0.5);
          }
        }
        return;
      }
      case 'waltz': {
        if (bib === 0) {
          const n = isChange ? nearestPc(ch.root, ref, BASS_LO, BASS_HI) : this.fifthOf(ch, ref);
          this.bassPlay(t, n, 2.4, bd, 0.8);
        } else if (bib === st.bpb - 1) {
          if (isChange) this.bassPlay(t, nearestPc(ch.root, ref, BASS_LO, BASS_HI), 0.9, bd, 0.7);
          else if (r.chance(0.25)) {
            const next = this.segAt(this.abs + 1);
            if (next.start === this.abs + 1) this.bassPlay(t, this.approach(next.chord, ref), 0.85, bd, 0.55);
          }
        }
        return;
      }
      case 'ballad': {
        if (bib === 0) this.bassPlay(t, nearestPc(ch.root, ref, BASS_LO, BASS_HI), 1.9, bd, 0.8);
        else if (bib === 2) {
          const n = isChange ? nearestPc(ch.root, ref, BASS_LO, BASS_HI) : r.chance(0.6) ? this.fifthOf(ch, ref) : nearestPc(ch.root, ref + 7, BASS_LO, BASS_HI);
          this.bassPlay(t, n, 1.9, bd, 0.72);
        } else if (bib === 3 && r.chance(0.25)) {
          const next = this.segAt(this.abs + 1);
          if (next.start === this.abs + 1) this.bassPlay(t + sw * bd, this.approach(next.chord, ref), 0.45, bd, 0.5);
        }
        return;
      }
    }
  }

  // ── Batterie

  private playDrums(t: number, bd: number, bib: number, sw: number, I: number, bar: number): void {
    const st = this.style;
    const e = this.e;
    const D = this.inBus;
    const lv = st.levels.drums;
    const r = this.rng;
    const off = t + sw * bd;
    switch (st.drums) {
      case 'brush': {
        if (bib % 2 === 0) brushSweep(e, D, t, bd * 1.9, lv * (0.55 + 0.25 * I));
        else brushTap(e, D, t + hum(3), lv * (0.65 + 0.2 * I));
        if (bib % 2 === 1 && I > 0.15) hat(e, D, t, lv * (0.3 + 0.45 * I));
        if (I > 0.2) {
          ride(e, D, t + hum(2), lv * (0.2 + 0.55 * I) * (bib % 2 ? 1 : 0.85), 1 + 0.5 * I);
          if (bib % 2 === 1) ride(e, D, off + hum(2), lv * (0.15 + 0.4 * I), 1);
        }
        if (I > 0.6 && bib % 2 === 0) hat(e, D, off, lv * ((I - 0.6) / 0.4) * 0.45);
        if (r.chance(0.08 + 0.3 * I)) brushTap(e, D, off + hum(4), lv * 0.3);
        if (bib === 0) kick(e, D, t, lv * 0.45);
        else if (bib === 2 && I > 0.4) kick(e, D, t, lv * 0.3);
        return;
      }
      case 'rush': {
        ride(e, D, t + hum(2), lv * (bib % 2 ? 0.75 : 0.6), 1.2);
        if (bib % 2 === 1) {
          ride(e, D, off + hum(2), lv * 0.5, 1.1);
          hat(e, D, t, lv * 0.6);
        }
        if (bib % 2 === 0) kick(e, D, t, lv * 0.5);
        if (r.chance(0.28)) brushTap(e, D, off + hum(3), lv * 0.5);
        if (bib === 3 && r.chance(0.35)) brushTap(e, D, off, lv * 0.8);
        if (bar % 4 === 3 && bib === 3 && r.chance(0.6)) hat(e, D, off, lv * 0.45, true);
        return;
      }
      case 'soft': {
        if (bib % 2 === 0) brushSweep(e, D, t, bd * 1.9, lv * 0.42);
        else {
          brushTap(e, D, t + hum(3), lv * 0.35);
          hat(e, D, t, lv * 0.22);
        }
        if (bib === 0) ride(e, D, t, lv * 0.28, 0.8);
        return;
      }
      case 'none':
        return;
    }
  }

  // ── Mélodie

  private maybePhrase(I: number): void {
    const st = this.style;
    const m = st.mel;
    const r = this.rng;
    const p = m.prob * this.mood.mel * (st.reactive ? 1 - 0.25 * I : 1);
    if (!r.chance(Math.min(0.95, p))) {
      this.lastMotif = null;
      return;
    }
    // question / réponse : on reprend souvent le dernier motif sur la nouvelle harmonie
    let motif: Motif;
    if (this.lastMotif && r.chance(0.55)) motif = this.lastMotif;
    else motif = r.pick(this.motifs);
    // évolution lente du répertoire de motifs
    if (r.chance(0.12)) this.motifs[r.int(0, this.motifs.length - 1)] = this.newMotif();
    this.lastMotif = motif;

    const start = this.abs;
    const center = (m.lo + m.hi) / 2;
    let cur = this.lastMel + Math.round((center - this.lastMel) * 0.35) + r.int(-2, 2);
    const invert = r.chance(0.3) ? -1 : 1;
    const strong = st.bpb === 3 ? 3 : 2;
    motif.forEach((n, i) => {
      const beat = start + n.on;
      const ch = this.segAt(Math.floor(beat)).chord;
      if (i === 0) cur = nearestChordTone(ch, cur, m.lo, m.hi, r.chance(0.6));
      else {
        const pool = scalePitches(ch, m.lo, m.hi);
        let idx = 0;
        let bestD = Infinity;
        pool.forEach((pm, k) => {
          const d = Math.abs(pm - cur);
          if (d < bestD) {
            bestD = d;
            idx = k;
          }
        });
        idx += n.step * invert;
        if (idx < 0) idx = -idx;
        if (idx >= pool.length) idx = Math.max(0, 2 * (pool.length - 1) - idx);
        cur = pool[Math.min(pool.length - 1, Math.max(0, idx))];
        if (n.on % strong === 0 || i === motif.length - 1) cur = nearestChordTone(ch, cur, m.lo, m.hi);
      }
      this.pending.push({ beat, dur: n.dur, midi: cur, vel: n.vel });
    });
    this.lastMel = cur;
  }

  private playMelody(t: number, bd: number, sw: number, I: number): void {
    if (this.pending.length === 0) return;
    const st = this.style;
    const keep: MelNote[] = [];
    for (const n of this.pending) {
      const b = Math.floor(n.beat);
      if (b > this.abs) {
        keep.push(n);
        continue;
      }
      if (b < this.abs) continue; // note manquée (rattrapage) : on l'oublie
      const time = t + swingPos(n.beat - b, sw) * bd + hum(5);
      musicDebug.trace?.('mel', n.beat, [n.midi], chordName(this.segAt(b).chord));
      const vel = n.vel * st.levels.mel * (st.reactive ? 0.85 + 0.3 * I : 1);
      if (st.mel.inst === 'flute') fluteNote(this.e, this.inBus, time, n.midi, n.dur * bd * 0.95, vel);
      else vibesNote(this.e, this.vibesBus, time, n.midi, n.dur * bd, vel);
    }
    this.pending = keep;
  }
}

// ─────────────────────────────────────────── Chef d'orchestre

export class MusicDirector {
  private players: TrackPlayer[] = [];
  private current: MusicTrack = null;
  private target = 0;
  private intensity = 0;
  private lastTick = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly e: Engine) {}

  get track(): MusicTrack {
    return this.current;
  }

  get level(): number {
    return this.intensity;
  }

  /** Démarre l'ordonnanceur temps réel. */
  start(): void {
    if (this.timer !== null) return;
    this.lastTick = this.e.ac.currentTime;
    this.timer = setInterval(() => {
      try {
        this.pump(this.e.ac.currentTime + LOOKAHEAD);
      } catch {
        /* l'audio ne doit jamais casser le jeu */
      }
    }, TICK_MS);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  setIntensity(x: number): void {
    this.target = Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));
  }

  /** Fixe immédiatement l'intensité (rendu hors-ligne du laboratoire). */
  forceIntensity(x: number): void {
    this.setIntensity(x);
    this.intensity = this.target;
    for (const p of this.players) p.intensity = this.intensity;
  }

  play(name: MusicTrack): void {
    if (name === this.current) return;
    this.current = name;
    const now = this.e.ac.currentTime;
    let incoming: TrackPlayer | undefined;
    if (name) incoming = this.players.find((p) => p.name === name && p.scheduling);
    let audible = false;
    for (const p of this.players) {
      if (p === incoming) continue;
      if (!p.fading) {
        p.fadeOut(now, FADE);
        audible = true;
      }
    }
    if (name) {
      if (!incoming) {
        incoming = new TrackPlayer(this.e, name, now + 0.08, (Math.random() * 0xffffffff) >>> 0);
        this.players.push(incoming);
      } else audible = true;
      incoming.intensity = this.intensity;
      incoming.fadeIn(now, audible ? FADE : 0.3);
    }
    // borne : jamais plus de 3 pistes en vie (zapping frénétique)
    while (this.players.length > 3) {
      const old = this.players.find((p) => p !== incoming);
      if (!old) break;
      old.dispose();
      this.players.splice(this.players.indexOf(old), 1);
    }
  }

  /** Programme tout ce qui tombe avant `until` (appelé par le minuteur, ou d'un bloc hors-ligne). */
  pump(until: number): void {
    const now = this.e.ac.currentTime;
    const dt = Math.max(0, now - this.lastTick);
    this.lastTick = now;
    this.intensity += (this.target - this.intensity) * (1 - Math.exp(-dt / 1.2));
    for (const p of this.players) {
      p.intensity = this.intensity;
      if (p.fading && now >= p.fadeEnd) p.scheduling = false;
      p.pump(now, until);
    }
    if (this.players.some((p) => !p.scheduling && now >= p.disposeAt)) {
      this.players = this.players.filter((p) => {
        if (!p.scheduling && now >= p.disposeAt) {
          p.dispose();
          return false;
        }
        return true;
      });
    }
  }
}
