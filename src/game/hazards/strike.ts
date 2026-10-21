/**
 * Frappe télégraphiée générique : un ou plusieurs télégraphes se remplissent (progress 0 → 1),
 * puis l'effet se déclenche (`fire`) et la zone reste `active` pendant `activeDur` secondes.
 * Utilisée par les pièges de cloche et les événements de salle.
 */
import type { TelegraphShape, TelegraphTone } from '../../types';
import type { TelegraphHandle } from './api';
import type { TelegraphSet } from './context';
import { clamp01 } from './util';

export interface StrikeHooks {
  /** Déclenchement (fin du remplissage). */
  fire?(): void;
  /** Chaque pas pendant la phase active (`t` = temps depuis le déclenchement). */
  active?(t: number, dt: number): void;
  /** Fin normale (non appelée en cas d'annulation). */
  end?(): void;
}

export class Strike {
  done = false;
  readonly handles: TelegraphHandle[];
  private t = 0;
  private fired = false;
  private readonly tg: TelegraphSet;
  private readonly warnDur: number;
  private readonly activeDur: number;
  private readonly hooks: StrikeHooks;

  constructor(
    tg: TelegraphSet,
    shapes: { shape: TelegraphShape; tone: TelegraphTone }[],
    warnDur: number,
    activeDur: number,
    hooks: StrikeHooks,
  ) {
    this.tg = tg;
    this.warnDur = Math.max(0.01, warnDur);
    this.activeDur = Math.max(0, activeDur);
    this.hooks = hooks;
    this.handles = shapes.map((s) => tg.add(s.shape, s.tone));
  }

  get hasFired(): boolean {
    return this.fired;
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    if (!this.fired) {
      const p = clamp01(this.t / this.warnDur);
      for (const h of this.handles) h.progress = p;
      if (this.t < this.warnDur) return;
      this.fired = true;
      for (const h of this.handles) {
        h.progress = 1;
        h.active = true;
      }
      this.hooks.fire?.();
      if (this.done) return;
    }
    const at = this.t - this.warnDur;
    this.hooks.active?.(at, dt);
    if (at >= this.activeDur) this.finish();
  }

  /** Fin normale : retire les télégraphes. */
  finish(): void {
    if (this.done) return;
    this.done = true;
    for (const h of this.handles) this.tg.remove(h);
    this.hooks.end?.();
  }

  /** Annulation (Tournée Générale, fin de niveau) : retire les télégraphes sans effet. */
  cancel(): void {
    if (this.done) return;
    this.done = true;
    for (const h of this.handles) this.tg.remove(h);
  }
}
