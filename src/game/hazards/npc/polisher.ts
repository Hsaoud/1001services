/**
 * Robot cireur : file tout droit, rebondit sur murs et mobilier (réflexion sur la normale de contact)
 * et laisse derrière lui des taches de cire glissantes (télégraphes bleus persistants, 6 s).
 */
import type { HazardCtx } from '../context';
import { TAU, dist, headingOf, turnToward } from '../util';
import { Agent } from './base';

const RADIUS = 0.4;
const SPEED = 2.5;
/** Espacement des taches de cire (u). */
const WAX_STEP = 0.55;

export class Polisher extends Agent {
  private vx = 0;
  private vz = 0;
  private waxAcc = 0;
  private stuckT = 0;
  private lastX: number;
  private lastZ: number;

  constructor(ctx: HazardCtx, regular = true) {
    super(ctx, 'polisher', regular);
    const p = ctx.spawnPoint(RADIUS);
    const a = ctx.rng.range(0, TAU);
    this.setDir(a);
    this.addBody(p.x, p.z, RADIUS, a);
    this.lastX = p.x;
    this.lastZ = p.z;
  }

  private setDir(a: number): void {
    const s = SPEED * this.ctx.speedScale;
    this.vx = Math.sin(a) * s;
    this.vz = Math.cos(a) * s;
  }

  protected think(dt: number): void {
    const ctx = this.ctx;
    const b = this.bodies[0];
    const n = ctx.world.moveCircle(b, this.vx * dt, this.vz * dt, RADIUS);
    if (n) {
      const dot = this.vx * n.x + this.vz * n.z;
      if (dot < 0) {
        // réflexion + légère déviation pour ne pas tourner en rond
        const rx = this.vx - 2 * dot * n.x;
        const rz = this.vz - 2 * dot * n.z;
        this.setDir(headingOf(rx, rz) + ctx.rng.range(-0.25, 0.25));
        ctx.world.fx('dust', b.x, b.z, { scale: 0.4 });
      }
    }
    const moved = dist(b.px, b.pz, b.x, b.z);
    this.waxAcc += moved;
    if (this.waxAcc >= WAX_STEP) {
      this.waxAcc = 0;
      ctx.slippery.addWax(b.x, b.z);
    }
    // anti-blocage : repart au hasard s'il n'avance plus
    this.stuckT += dt;
    if (this.stuckT >= 1) {
      if (dist(this.lastX, this.lastZ, b.x, b.z) < 0.3) this.setDir(ctx.rng.range(0, TAU));
      this.stuckT = 0;
      this.lastX = b.x;
      this.lastZ = b.z;
    }
    b.heading = turnToward(b.heading, headingOf(this.vx, this.vz), 9 * dt);
    b.action = 'roll';
    b.speed01 = 0.6;
    b.actionT = (b.actionT + dt * 2) % 1;
    this.touch(b, 15, 4);
  }
}
