/**
 * Valse des serveurs : un couple (une vue) tournoie autour d'un centre qui dérive lentement
 * d'un point libre à l'autre ; un anneau crème persistant montre le cercle courant.
 */
import type { TelegraphHandle } from '../api';
import type { HazardCtx } from '../context';
import { TAU, dist, ring } from '../util';
import { Agent } from './base';

const RADIUS = 0.5;
const OMEGA = 1.2;
const DRIFT = 0.45;
/** Demi-largeur de l'anneau télégraphié autour du cercle. */
const BAND = 0.45;

export class Waltz extends Agent {
  private cx: number;
  private cz: number;
  private R: number;
  private theta: number;
  private readonly omega: number;
  private tx = NaN;
  private tz = NaN;
  private pause: number;
  private tele: TelegraphHandle | null = null;
  private teleX = NaN;
  private teleZ = NaN;

  constructor(ctx: HazardCtx, regular = true) {
    super(ctx, 'waltz', regular);
    const rng = ctx.rng;
    let found = false;
    let cx = 0;
    let cz = 0;
    let R = 2;
    for (let i = 0; i < 40 && !found; i++) {
      const c = ctx.world.randomFreePoint();
      if (!c) continue;
      R = i < 25 ? rng.range(2, 3) : rng.range(1.5, 2);
      if (this.circleFree(c.x, c.z, R) && ctx.awayFromPlayer(c.x, c.z, R + 2.5)) {
        cx = c.x;
        cz = c.z;
        found = true;
      }
    }
    if (!found) {
      const p = ctx.spawnPoint(RADIUS);
      cx = p.x;
      cz = p.z;
      R = 1.2;
    }
    this.cx = cx;
    this.cz = cz;
    this.R = R;
    this.theta = rng.range(0, TAU);
    this.omega = OMEGA * ctx.speedScale * (rng.chance(0.5) ? 1 : -1);
    this.pause = rng.range(1, 3);
    const x = cx + Math.sin(this.theta) * R;
    const z = cz + Math.cos(this.theta) * R;
    this.addBody(x, z, RADIUS, this.tangent(), Math.sign(this.omega));
  }

  /** Le cercle de rayon R autour de (x, z) est-il praticable pour le couple ? */
  private circleFree(x: number, z: number, R: number): boolean {
    const w = this.ctx.world;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      if (!w.isFree(x + Math.sin(a) * R, z + Math.cos(a) * R, RADIUS)) return false;
    }
    return true;
  }

  /** Cap tangent au cercle dans le sens de rotation. */
  private tangent(): number {
    const s = Math.sign(this.omega) || 1;
    return Math.atan2(Math.cos(this.theta) * s, -Math.sin(this.theta) * s);
  }

  /** Choisit un nouveau centre atteignable en ligne droite sans que le cercle ne heurte le décor. */
  private pickTarget(): boolean {
    const ctx = this.ctx;
    for (let i = 0; i < 6; i++) {
      const t = ctx.world.randomFreePoint({ x: this.cx, z: this.cz }, 2, 7);
      if (!t || !this.circleFree(t.x, t.z, this.R)) continue;
      const d = dist(this.cx, this.cz, t.x, t.z);
      const n = Math.max(1, Math.ceil(d / 0.8));
      let ok = true;
      for (let k = 1; k < n && ok; k++) {
        const u = k / n;
        ok = this.circleFree(this.cx + (t.x - this.cx) * u, this.cz + (t.z - this.cz) * u, this.R);
      }
      if (ok) {
        this.tx = t.x;
        this.tz = t.z;
        return true;
      }
    }
    return false;
  }

  protected override onActive(): void {
    this.syncRing();
  }

  protected think(dt: number): void {
    const b = this.bodies[0];
    this.theta = (this.theta + this.omega * dt) % TAU;
    if (Number.isNaN(this.tx)) {
      this.pause -= dt;
      if (this.pause <= 0 && !this.pickTarget()) this.pause = 2;
    } else {
      const d = dist(this.cx, this.cz, this.tx, this.tz);
      const step = DRIFT * this.ctx.speedScale * dt;
      if (d <= step) {
        this.cx = this.tx;
        this.cz = this.tz;
        this.tx = NaN;
        this.tz = NaN;
        this.pause = this.ctx.rng.range(2, 5);
      } else {
        this.cx += ((this.tx - this.cx) / d) * step;
        this.cz += ((this.tz - this.cz) / d) * step;
      }
    }
    b.x = this.cx + Math.sin(this.theta) * this.R;
    b.z = this.cz + Math.cos(this.theta) * this.R;
    b.heading = this.tangent();
    b.action = 'dance';
    b.actionT = (((this.theta / TAU) % 1) + 1) % 1;
    b.speed01 = 0.7;
    // recul hors de la trajectoire : vers l'extérieur (ou l'intérieur si le joueur est dans le cercle)
    const p = this.ctx.player;
    const side = dist(p.x, p.z, this.cx, this.cz) >= this.R ? 1 : -1;
    this.touch(b, 25, 6, (p.x - this.cx) * side, (p.z - this.cz) * side);
    this.syncRing();
  }

  private syncRing(): void {
    if (!this.tele) {
      this.tele = this.tg.add(ring(this.cx, this.cz, Math.max(0.1, this.R - BAND), this.R + BAND), 'cream', true);
      this.teleX = this.cx;
      this.teleZ = this.cz;
      return;
    }
    if (dist(this.teleX, this.teleZ, this.cx, this.cz) > 0.02) {
      this.tele.shape = ring(this.cx, this.cz, Math.max(0.1, this.R - BAND), this.R + BAND);
      this.teleX = this.cx;
      this.teleZ = this.cz;
    }
  }

  protected override onCalm(): void {
    this.tele = null;
  }
}
