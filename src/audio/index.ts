/**
 * Audio de « Les 1001 Services de La Duchesse » — 100 % synthèse WebAudio, aucun fichier.
 *
 * Avant `unlock()` (premier geste utilisateur), tous les appels sont des no-op silencieux ;
 * volumes, intensité, pause et morceau demandé sont mémorisés puis appliqués au déverrouillage.
 * Aucun appel ne lève d'exception.
 */
import type { MusicTrack, SfxId } from '../types';
import type { AudioApi, SfxOptions } from './api';
import { createEngine, glide, smooth, type Engine } from './engine';
import { MusicDirector } from './music';
import { SfxPlayer } from './sfx';

interface State {
  master: number;
  music: number;
  sfx: number;
  intensity: number;
  paused: boolean;
  track: MusicTrack;
}

const state: State = { master: 1, music: 0.8, sfx: 1, intensity: 0, paused: false, track: null };

let ac: AudioContext | null = null;
let engine: Engine | null = null;
let sfxPlayer: SfxPlayer | null = null;
let director: MusicDirector | null = null;
let suspendedByVisibility = false;

const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
/** Courbe perceptive des curseurs de volume. */
const taper = (v: number): number => v * v;

function applyVolumes(tc = 0.06): void {
  if (!engine) return;
  const now = engine.ac.currentTime;
  smooth(engine.master.gain, taper(state.master), now, tc);
  smooth(engine.musicVol.gain, taper(state.music), now, tc);
  smooth(engine.sfxDry.gain, taper(state.sfx), now, tc);
  smooth(engine.sfxWet.gain, taper(state.sfx), now, tc);
}

function applyPause(tc = 0.15): void {
  if (!engine) return;
  const now = engine.ac.currentTime;
  // pause : musique baissée (~−10 dB) et étouffée, sans coupure
  smooth(engine.musicPause.gain, state.paused ? 0.32 : 1, now, tc);
  glide(engine.musicLP.frequency, state.paused ? 750 : Math.min(20000, engine.ac.sampleRate * 0.45), now, tc * 4);
}

function onVisibility(): void {
  if (!ac) return;
  try {
    if (document.hidden) {
      if (ac.state === 'running') {
        suspendedByVisibility = true;
        void ac.suspend().catch(() => undefined);
      }
    } else if (suspendedByVisibility) {
      suspendedByVisibility = false;
      void ac.resume().catch(() => undefined);
    }
  } catch {
    /* rien */
  }
}

function getCtor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext;
}

export const audio: AudioApi = {
  unlock() {
    try {
      if (!ac) {
        const Ctor = getCtor();
        if (!Ctor) return;
        ac = new Ctor({ latencyHint: 'interactive' });
        engine = createEngine(ac);
        sfxPlayer = new SfxPlayer(engine);
        director = new MusicDirector(engine);
        applyVolumes(0.01);
        applyPause(0.01);
        director.setIntensity(state.intensity);
        director.forceIntensity(state.intensity);
        director.start();
        director.play(state.track);
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
      }
      if (ac.state !== 'running' && !(typeof document !== 'undefined' && document.hidden)) {
        void ac.resume().catch(() => undefined);
      }
    } catch {
      /* audio indisponible : le jeu reste muet */
    }
  },

  sfx(id: SfxId, opts?: SfxOptions) {
    if (!sfxPlayer || !ac || ac.state !== 'running') return;
    try {
      sfxPlayer.play(id, opts);
    } catch {
      /* un effet raté ne doit jamais casser le jeu */
    }
  },

  music(track: MusicTrack) {
    state.track = track ?? null;
    if (!director) return;
    try {
      director.play(state.track);
    } catch {
      /* rien */
    }
  },

  setVolumes(master: number, music: number, sfx: number) {
    state.master = clamp01(master);
    state.music = clamp01(music);
    state.sfx = clamp01(sfx);
    try {
      applyVolumes();
    } catch {
      /* rien */
    }
  },

  setIntensity(x: number) {
    state.intensity = clamp01(x);
    director?.setIntensity(state.intensity);
  },

  setPaused(paused: boolean) {
    state.paused = !!paused;
    try {
      applyPause();
    } catch {
      /* rien */
    }
  },
};

let meter: AnalyserNode | null = null;

/** Vumètre de la sortie maître (laboratoire) : null tant que l'audio est verrouillé. */
export function audioMeter(): AnalyserNode | null {
  if (!engine) return null;
  if (!meter) {
    meter = engine.ac.createAnalyser();
    meter.fftSize = 2048;
    engine.out.connect(meter);
  }
  return meter;
}

// Rechargement à chaud (dev) : on ferme l'ancien contexte pour ne pas empiler deux orchestres.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    try {
      director?.stop();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
      void ac?.close().catch(() => undefined);
    } catch {
      /* rien */
    }
  });
}

/** Infos de diagnostic (laboratoire audio). */
export function audioDebug(): {
  state: string;
  time: number;
  voices: number;
  track: MusicTrack;
  intensity: number;
  baseLatency: number;
  sampleRate: number;
} {
  return {
    state: ac ? ac.state : 'verrouillé',
    time: ac ? ac.currentTime : 0,
    voices: sfxPlayer ? sfxPlayer.voices : 0,
    track: state.track,
    intensity: director ? director.level : state.intensity,
    baseLatency: ac?.baseLatency ?? 0,
    sampleRate: ac?.sampleRate ?? 0,
  };
}
