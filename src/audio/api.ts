import type { MusicTrack, SfxId } from '../types';

export interface SfxOptions {
  volume?: number; // 0..1 (multiplié par le volume SFX)
  pitch?: number; // 1 = normal
  pan?: number; // −1..1
}

/** Contrat de l'audio (implémenté par src/audio/index.ts) — 100 % synthétisé en WebAudio, aucun fichier. */
export interface AudioApi {
  /** À appeler sur le premier geste utilisateur (clic / touche) : crée / reprend l'AudioContext. */
  unlock(): void;
  sfx(id: SfxId, opts?: SfxOptions): void;
  /** Change de morceau avec un fondu enchaîné (null = silence). */
  music(track: MusicTrack): void;
  /** Volumes 0..1. */
  setVolumes(master: number, music: number, sfx: number): void;
  /** Tension 0..1 (minuteur qui s'épuise, marée de mousse) : accélère / densifie la musique de service. */
  setIntensity(x: number): void;
  /** Met en sourdine douce (pause) sans couper. */
  setPaused(paused: boolean): void;
}
