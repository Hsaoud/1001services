/**
 * Suivi de chemin avec cache : le A* du monde n'est recalculé que périodiquement (et dans la limite
 * du budget partagé), jamais à chaque image.
 */
import type { Vec2 } from '../../../types';
import type { HazardCtx } from '../context';
import { dist } from '../util';
import type { Body } from './base';
import { moveBody } from './base';

export class PathFollower {
  /** Le dernier calcul n'a trouvé aucun chemin. */
  failed = false;
  private readonly ctx: HazardCtx;
  private readonly refresh: number;
  private path: Vec2[] | null = null;
  private idx = 0;
  private nextRefresh = -Infinity;
  private tx = 0;
  private tz = 0;
  private hasTarget = false;

  constructor(ctx: HazardCtx, refresh = 0.8) {
    this.ctx = ctx;
    this.refresh = refresh;
  }

  get target(): Vec2 | null {
    return this.hasTarget ? { x: this.tx, z: this.tz } : null;
  }

  /** Change de cible ; recalcul immédiat seulement si elle a beaucoup bougé. */
  setTarget(x: number, z: number): void {
    if (!this.hasTarget || dist(x, z, this.tx, this.tz) > 2.5) this.nextRefresh = -Infinity;
    this.tx = x;
    this.tz = z;
    this.hasTarget = true;
  }

  clear(): void {
    this.hasTarget = false;
    this.path = null;
    this.failed = false;
    this.nextRefresh = -Infinity;
  }

  /** Avance le corps vers la cible ; renvoie true une fois arrivé (à `arrive` près). */
  step(b: Body, speed: number, dt: number, arrive = 0.3): boolean {
    if (!this.hasTarget) return true;
    const ctx = this.ctx;
    const dT = dist(b.x, b.z, this.tx, this.tz);
    if (dT <= arrive) return true;
    if (ctx.time >= this.nextRefresh) {
      if (dT < 1.6) {
        // tout près : ligne droite (le glissement contre le décor suffit)
        this.path = [{ x: this.tx, z: this.tz }];
        this.idx = 0;
        this.failed = false;
        this.nextRefresh = ctx.time + this.refresh;
      } else {
        const p = ctx.path(b.x, b.z, this.tx, this.tz);
        if (p !== undefined) {
          this.path = p;
          this.idx = 0;
          this.failed = p === null;
          this.nextRefresh = ctx.time + this.refresh * ctx.rng.range(0.85, 1.15);
          // évite de revenir sur le centre de la case de départ
          if (p && p.length >= 2) {
            const a = p[0];
            const c = p[1];
            if (dist(b.x, b.z, c.x, c.z) < dist(a.x, a.z, c.x, c.z)) this.idx = 1;
          }
        }
      }
    }
    let wx = this.tx;
    let wz = this.tz;
    const path = this.path;
    if (path && path.length) {
      while (this.idx < path.length - 1 && dist(b.x, b.z, path[this.idx].x, path[this.idx].z) < 0.45) this.idx++;
      const w = path[Math.min(this.idx, path.length - 1)];
      wx = w.x;
      wz = w.z;
    }
    moveBody(ctx, b, wx, wz, speed, dt);
    return dist(b.x, b.z, this.tx, this.tz) <= arrive;
  }
}
