/**
 * Instruments de l'orchestre de salon, synthèse légère (2 à 3 oscillateurs par note) :
 * piano électrique FM, contrebasse pincée, nappe de cordes filtrée, vibraphone,
 * flûte douce, balais et cymbale ride à base de bruit.
 * Chaque note programme ses nœuds à l'instant `t` et les arrête d'elle-même.
 */
import type { Engine, NoiseKind } from './engine';
import { mtof } from './theory';

/** Piano électrique FM (porteuse et modulante au même rapport, « aboiement » selon la vélocité). */
export function epNote(e: Engine, dest: AudioNode, t: number, midi: number, dur: number, vel: number, bright = 1): void {
  const ac = e.ac;
  const f = mtof(midi);
  const car = ac.createOscillator();
  car.frequency.value = f;
  const mod = ac.createOscillator();
  mod.frequency.value = f;
  const mg = ac.createGain();
  mg.gain.setValueAtTime(f * (0.5 + 1.5 * vel) * bright, t);
  mg.gain.setTargetAtTime(f * 0.12 * bright, t, 0.12);
  mod.connect(mg);
  mg.connect(car.frequency);
  const g = ac.createGain();
  // équilibre du clavier : les aigus un peu moins forts
  const ks = Math.pow(2, -(midi - 60) / 30);
  const peak = 0.085 * vel * ks;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.004);
  g.gain.setTargetAtTime(peak * 0.3, t + 0.004, 0.7);
  const rel = t + Math.max(dur, 0.06);
  g.gain.setTargetAtTime(0, rel, 0.07);
  car.connect(g);
  g.connect(dest);
  const stop = rel + 0.5;
  car.start(t);
  mod.start(t);
  car.stop(stop);
  mod.stop(stop);
}

/** Contrebasse : dent de scie filtrée (harmoniques audibles) + sinus, attaque pincée, filtre qui se referme. */
export function bassNote(e: Engine, dest: AudioNode, t: number, midi: number, dur: number, vel: number): void {
  const ac = e.ac;
  const f = mtof(midi);
  const o1 = ac.createOscillator();
  o1.type = 'sawtooth';
  const o2 = ac.createOscillator();
  for (const o of [o1, o2]) {
    o.frequency.setValueAtTime(f * 1.012, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
  }
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.8;
  // rampe finie (une automatisation sans fin forcerait le recalcul du filtre à chaque échantillon)
  lp.frequency.setValueAtTime(1800, t);
  lp.frequency.exponentialRampToValueAtTime(520, t + 0.22);
  const o2g = ac.createGain();
  o2g.gain.value = 0.45;
  const g = ac.createGain();
  const peak = 0.1 * vel;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.007);
  g.gain.setTargetAtTime(peak * 0.45, t + 0.007, 0.22);
  const rel = t + Math.max(dur, 0.08);
  g.gain.setTargetAtTime(0, rel, 0.035);
  o1.connect(lp);
  lp.connect(g);
  o2.connect(o2g);
  o2g.connect(g);
  g.connect(dest);
  const stop = rel + 0.25;
  o1.start(t);
  o2.start(t);
  o1.stop(stop);
  o2.stop(stop);
}

/** Nappe de cordes : deux scies désaccordées par note, un seul filtre et un seul gain par accord. */
export function padChord(
  e: Engine,
  dest: AudioNode,
  t: number,
  midis: readonly number[],
  dur: number,
  level: number,
  cutoff: number,
): void {
  if (midis.length === 0 || level <= 0) return;
  const ac = e.ac;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.5;
  const att = Math.min(0.9, dur * 0.4);
  lp.frequency.setValueAtTime(cutoff * 0.5, t);
  lp.frequency.linearRampToValueAtTime(cutoff, t + att + 0.3);
  const g = ac.createGain();
  const peak = (0.03 * level) / Math.sqrt(midis.length);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + att);
  const rel = t + Math.max(dur, att + 0.05);
  g.gain.setValueAtTime(peak, rel);
  g.gain.setTargetAtTime(0, rel, 0.35);
  const stop = rel + 2.2;
  for (const m of midis) {
    for (const det of [-7, 6]) {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(m);
      o.detune.value = det + (Math.random() * 2 - 1) * 2;
      o.connect(lp);
      o.start(t);
      o.stop(stop);
    }
  }
  lp.connect(g);
  g.connect(dest);
}

/** Vibraphone : fondamental + 4e partiel bref (frappe de la mailloche) ; le trémolo est sur le bus. */
export function vibesNote(e: Engine, dest: AudioNode, t: number, midi: number, dur: number, vel: number): void {
  const ac = e.ac;
  const f = mtof(midi);
  const o1 = ac.createOscillator();
  o1.frequency.value = f;
  const o2 = ac.createOscillator();
  o2.frequency.value = f * 4;
  const g1 = ac.createGain();
  const g2 = ac.createGain();
  const peak = 0.045 * vel * Math.pow(2, -(midi - 72) / 36);
  const tc = 0.75 * Math.pow(2, -(midi - 72) / 24); // les graves résonnent plus longtemps
  g1.gain.setValueAtTime(0, t);
  g1.gain.linearRampToValueAtTime(peak, t + 0.002);
  g1.gain.setTargetAtTime(0, t + 0.002, tc);
  const damp = t + Math.max(dur, 0.1) + 0.12;
  g1.gain.setTargetAtTime(0, damp, 0.08);
  g2.gain.setValueAtTime(0, t);
  g2.gain.linearRampToValueAtTime(peak * 0.14, t + 0.001);
  g2.gain.setTargetAtTime(0, t + 0.001, 0.05);
  o1.connect(g1);
  o2.connect(g2);
  g1.connect(dest);
  g2.connect(dest);
  const stop = Math.min(t + tc * 7, damp + 0.6);
  o1.start(t);
  o2.start(t);
  o1.stop(stop);
  o2.stop(Math.min(stop, t + 0.45));
}

/** Flûte douce : sinus + triangle, souffle filtré, vibrato qui arrive après l'attaque. */
export function fluteNote(e: Engine, dest: AudioNode, t: number, midi: number, dur: number, vel: number): void {
  const ac = e.ac;
  const f = mtof(midi);
  const o1 = ac.createOscillator();
  o1.frequency.value = f;
  const o2 = ac.createOscillator();
  o2.type = 'triangle';
  o2.frequency.value = f;
  const vib = ac.createOscillator();
  vib.frequency.value = 4.8 + Math.random() * 0.6;
  const vibG = ac.createGain();
  vibG.gain.setValueAtTime(0, t);
  vibG.gain.linearRampToValueAtTime(0, t + 0.2);
  vibG.gain.linearRampToValueAtTime(14, t + 0.6);
  vib.connect(vibG);
  vibG.connect(o1.detune);
  vibG.connect(o2.detune);
  const o2g = ac.createGain();
  o2g.gain.value = 0.22;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(f * 4, 5000);
  lp.Q.value = 0.5;
  const g = ac.createGain();
  const peak = 0.05 * vel;
  const len = Math.max(dur, 0.12);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.06);
  g.gain.linearRampToValueAtTime(peak * 0.85, t + Math.min(len, 0.3));
  g.gain.setValueAtTime(peak * 0.85, t + len);
  g.gain.setTargetAtTime(0, t + len, 0.07);
  o1.connect(g);
  o2.connect(o2g);
  o2g.connect(lp);
  lp.connect(g);
  g.connect(dest);
  // souffle
  const n = noiseSource(e, 'pink', t, len + 0.4);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = Math.min(f * 2, 6000);
  bp.Q.value = 1.5;
  const ng = ac.createGain();
  ng.gain.setValueAtTime(0, t);
  ng.gain.linearRampToValueAtTime(peak * 0.35, t + 0.04);
  ng.gain.setTargetAtTime(peak * 0.08, t + 0.04, 0.08);
  ng.gain.setTargetAtTime(0, t + len, 0.05);
  n.connect(bp);
  bp.connect(ng);
  ng.connect(dest);
  const stop = t + len + 0.4;
  for (const o of [o1, o2, vib]) {
    o.start(t);
    o.stop(stop);
  }
}

// ─────────────────────────────────────────── Bruit (souffle)

function noiseSource(e: Engine, kind: NoiseKind, t: number, dur: number): AudioBufferSourceNode {
  const src = e.ac.createBufferSource();
  const buf = e.buffers[kind];
  src.buffer = buf;
  src.loop = true;
  src.start(t, Math.random() * (buf.duration - 0.05));
  src.stop(t + dur + 0.02);
  return src;
}

// ─────────────────────────────────────────── Batterie aux balais (échantillons générés en code)

/**
 * Économie de processeur : chaque frappe de batterie est calculée une seule fois en JavaScript
 * (bruit des tampons du moteur + filtres biquad + enveloppe) dans un AudioBuffer ; une frappe
 * ne coûte ensuite que deux nœuds (source + gain). Plusieurs variantes par frappe et une
 * légère variation de vitesse de lecture évitent l'effet « mitraillette ».
 */
interface Kit {
  ride: AudioBuffer[];
  tap: AudioBuffer[];
  hat: AudioBuffer[];
  hatOpen: AudioBuffer;
  kick: AudioBuffer;
  sweep: AudioBuffer[];
}

/** Durée de référence d'un balayage de balai (s) ; adaptée au tempo par la vitesse de lecture. */
const SWEEP_LEN = 1.1;
const kits = new WeakMap<Engine, Kit>();

/** Prépare (une fois par moteur) les échantillons de batterie. */
export function drumKit(e: Engine): Kit {
  let k = kits.get(e);
  if (!k) {
    k = buildKit(e);
    kits.set(e, k);
  }
  return k;
}

type FType = 'lowpass' | 'highpass' | 'bandpass';

/** Biquad RBJ appliqué en place (mêmes formules que WebAudio : Q en dB pour passe-bas / passe-haut). */
function biquadJs(d: Float32Array, type: FType, f: number, q: number, sr: number): void {
  const w0 = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * (type === 'bandpass' ? q : Math.pow(10, q / 20)));
  let b0: number;
  let b1: number;
  let b2: number;
  if (type === 'lowpass') {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = b0;
  } else if (type === 'highpass') {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = b0;
  } else {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  }
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < d.length; i++) {
    const x = d[i];
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    d[i] = y;
  }
}

/** Valeur d'une enveloppe percussive (attaque linéaire, déclin exponentiel jusqu'à −80 dB). */
function envAt(t: number, peak: number, att: number, dec: number): number {
  if (t < att) return (peak * t) / att;
  if (t < att + dec) return peak * Math.pow(1e-4 / peak, (t - att) / dec);
  return 0;
}

function buildKit(e: Engine): Kit {
  const ac = e.ac;
  const sr = ac.sampleRate;
  const white = e.buffers.white.getChannelData(0);
  const pink = e.buffers.pink.getChannelData(0);
  const make = (seconds: number, src: Float32Array | null, fill: (d: Float32Array) => void): AudioBuffer => {
    const len = Math.ceil(seconds * sr);
    const buf = ac.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    if (src) {
      let p = Math.floor(Math.random() * src.length);
      for (let i = 0; i < len; i++) {
        d[i] = src[p];
        p = (p + 1) % src.length;
      }
    }
    fill(d);
    return buf;
  };
  const shape = (d: Float32Array, peak: number, att: number, dec: number): void => {
    for (let i = 0; i < d.length; i++) d[i] *= envAt(i / sr, peak, att, dec);
  };

  const ride = (): AudioBuffer =>
    make(0.5, white, (d) => {
      biquadJs(d, 'highpass', 5200, 0.7, sr);
      biquadJs(d, 'bandpass', 7500, 0.6, sr);
      shape(d, 0.03, 0.002, 0.448);
      // deux partiels métalliques inharmoniques (le « ting » de la ride)
      const f1 = 3150 * (1 + (Math.random() - 0.5) * 0.02);
      const f2 = 4730 * (1 + (Math.random() - 0.5) * 0.02);
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        d[i] += Math.sin(2 * Math.PI * f1 * t) * envAt(t, 0.007, 0.002, 0.318) + Math.sin(2 * Math.PI * f2 * t) * envAt(t, 0.004, 0.002, 0.318);
      }
    });
  const tap = (): AudioBuffer =>
    make(0.16, white, (d) => {
      biquadJs(d, 'bandpass', 2300, 0.9, sr);
      biquadJs(d, 'highpass', 700, 0.7, sr);
      shape(d, 0.11, 0.002, 0.148);
    });
  const hat = (len: number): AudioBuffer =>
    make(len + 0.01, white, (d) => {
      biquadJs(d, 'highpass', 7000, 0.7, sr);
      biquadJs(d, 'bandpass', 9500, 0.8, sr);
      shape(d, 0.045, 0.0015, len - 0.0015);
    });
  const kick = make(0.26, null, (d) => {
    let phase = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const f = 95 * Math.pow(48 / 95, Math.min(t, 0.09) / 0.09);
      phase += (2 * Math.PI * f) / sr;
      d[i] = Math.sin(phase) * envAt(t, 0.09, 0.004, 0.236);
    }
  });
  const sweep = (): AudioBuffer =>
    make(SWEEP_LEN + 0.06, pink, (d) => {
      biquadJs(d, 'bandpass', 2600, 0.7, sr);
      biquadJs(d, 'highpass', 900, 0.7, sr);
      const peak = 0.12;
      for (let i = 0; i < d.length; i++) {
        const x = i / sr / SWEEP_LEN;
        const g = x < 0.4 ? (peak * x) / 0.4 : x < 0.8 ? peak * (1 - (0.5 * (x - 0.4)) / 0.4) : Math.max(0, peak * 0.5 * (1 - (x - 0.8) / 0.25));
        d[i] *= g;
      }
    });

  return {
    ride: [ride(), ride(), ride()],
    tap: [tap(), tap(), tap()],
    hat: [hat(0.05), hat(0.05)],
    hatOpen: hat(0.28),
    kick,
    sweep: [sweep(), sweep()],
  };
}

const anyOf = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const vary = (): number => 1 + (Math.random() * 2 - 1) * 0.025;

function shot(e: Engine, dest: AudioNode, buf: AudioBuffer, t: number, gain: number, rate = 1): void {
  if (gain <= 0.0005) return;
  const src = e.ac.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = e.ac.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(dest);
  src.start(t);
}

/** Balai qui tourne sur la caisse claire (souffle continu, étiré à la durée voulue). */
export function brushSweep(e: Engine, dest: AudioNode, t: number, dur: number, vel: number): void {
  shot(e, dest, anyOf(drumKit(e).sweep), t, vel, SWEEP_LEN / Math.max(0.4, dur));
}

/** Frappe de balai (« tchak » feutré). */
export function brushTap(e: Engine, dest: AudioNode, t: number, vel: number): void {
  shot(e, dest, anyOf(drumKit(e).tap), t, vel, vary());
}

/** Cymbale ride feutrée ; `bright` > 1 la rend un peu plus claire. */
export function ride(e: Engine, dest: AudioNode, t: number, vel: number, bright = 1): void {
  shot(e, dest, anyOf(drumKit(e).ride), t, vel, vary() * (1 + (bright - 1) * 0.12));
}

/** Charleston au pied (« tchik »), ou ouvert. */
export function hat(e: Engine, dest: AudioNode, t: number, vel: number, open = false): void {
  const k = drumKit(e);
  shot(e, dest, open ? k.hatOpen : anyOf(k.hat), t, vel, vary());
}

/** Grosse caisse « plume » (à peine audible, donne l'assise). */
export function kick(e: Engine, dest: AudioNode, t: number, vel: number): void {
  shot(e, dest, drumKit(e).kick, t, vel);
}
