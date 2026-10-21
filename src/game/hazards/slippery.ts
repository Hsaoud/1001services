/**
 * Zones glissantes persistantes : flaques de sirop d'érable (piège) et traînée de cire du robot cireur.
 * Chaque zone est un télégraphe persistant qui rétrécit en séchant.
 */
import type { TelegraphHandle } from './api';
import type { HazardCtx } from './context';
import { TelegraphSet } from './context';
import { circle, dist, smoothstep } from './util';

interface Zone {
  kind: 'syrup' | 'wax';
  x: number;
  z: number;
  baseR: number;
  r: number;
  /** Temps restant (s). */
  life: number;
  /** Fenêtre de séchage finale (s) pendant laquelle la zone rétrécit. */
  dry: number;
  handle: TelegraphHandle;
  entered: boolean;
}

/** Durée de vie d'une tache de cire (s). */
export const WAX_LIFE = 6;
export const WAX_RADIUS = 0.55;
/** Durée de vie d'une flaque de sirop (s). */
export const SYRUP_LIFE = 10;

export class SlipperyField {
  private readonly ctx: HazardCtx;
  private readonly tg: TelegraphSet;
  private zones: Zone[] = [];

  constructor(ctx: HazardCtx) {
    this.ctx = ctx;
    this.tg = new TelegraphSet(ctx.world);
  }

  /** Flaque de sirop (télégraphe doré persistant). */
  addSyrup(x: number, z: number, r: number, life = SYRUP_LIFE): void {
    this.add('syrup', x, z, r, life, 'gold');
  }

  /** Tache de cire (télégraphe bleu persistant). */
  addWax(x: number, z: number): void {
    this.add('wax', x, z, WAX_RADIUS, WAX_LIFE, 'blue');
  }

  private add(kind: Zone['kind'], x: number, z: number, r: number, life: number, tone: 'gold' | 'blue'): void {
    const handle = this.tg.add(circle(x, z, r), tone, true);
    handle.active = true;
    handle.progress = 1;
    this.zones.push({ kind, x, z, baseR: r, r, life, dry: Math.min(1, life), handle, entered: false });
  }

  update(dt: number): void {
    if (!this.zones.length) return;
    const p = this.ctx.player;
    let removed = false;
    for (const zn of this.zones) {
      zn.life -= dt;
      if (zn.life <= 0) {
        this.tg.remove(zn.handle);
        removed = true;
        continue;
      }
      const r = zn.baseR * (zn.life < zn.dry ? smoothstep(0, zn.dry, zn.life) : 1);
      if (Math.abs(r - zn.r) > 0.004) {
        zn.r = r;
        zn.handle.shape = circle(zn.x, zn.z, r);
      }
      if (zn.kind === 'syrup' && !zn.entered && zn.r > 0.2 && dist(p.x, p.z, zn.x, zn.z) <= zn.r) {
        zn.entered = true;
        this.ctx.world.sfx('slip');
      }
    }
    if (removed) this.zones = this.zones.filter((zn) => zn.life > 0);
  }

  /** Vrai dans une flaque ou une tache de cire encore humide. */
  at(x: number, z: number): boolean {
    for (const zn of this.zones) {
      if (zn.r < 0.15) continue;
      const dx = x - zn.x;
      const dz = z - zn.z;
      if (dx * dx + dz * dz <= zn.r * zn.r) return true;
    }
    return false;
  }

  /** Séchage accéléré (Tournée Générale) : toutes les zones disparaissent en `seconds`. */
  dryAll(seconds = 0.8): void {
    for (const zn of this.zones)
      if (zn.life > seconds) {
        zn.life = seconds;
        zn.dry = seconds;
      }
  }

  get count(): number {
    return this.zones.length;
  }

  dispose(): void {
    this.tg.clear();
    this.zones = [];
  }
}
