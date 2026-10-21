/**
 * Petit marquis : sprinte en zigzag vers des points au hasard ; chaque changement de cap est
 * précédé d'un petit sautillement d'anticipation (0,2 s, action `crouch`) et d'un trait crème.
 */
import type { TelegraphHandle } from '../api';
import type { HazardCtx } from '../context';
import type { Vec2 } from '../../../types';
import { DEG, TAU, clamp01, dist, headingOf, line, turnToward } from '../util';
import { Agent } from './base';

type ChildState = 'hop' | 'sprint';

const RADIUS = 0.3;
const HOP_TIME = 0.2;
const SPEED = 6;

export class Child extends Agent {
  private state: ChildState = 'hop';
  private timer = 0;
  private legDur = 0.8;
  private dx = 0;
  private dz = 1;
  /** Ancienne direction (glisse pendant le sautillement). */
  private ox = 0;
  private oz = 0;
  private zig = 1;
  private goal: Vec2;
  private tele: TelegraphHandle | null = null;
  private bumps = 0;

  constructor(ctx: HazardCtx, regular = true) {
    super(ctx, 'child', regular);
    const p = ctx.spawnPoint(RADIUS);
    this.addBody(p.x, p.z, RADIUS, ctx.rng.range(-Math.PI, Math.PI));
    this.goal = this.newGoal();
    this.zig = ctx.rng.chance(0.5) ? 1 : -1;
  }

  private newGoal(): Vec2 {
    const b = this.bodies[0];
    return this.ctx.world.randomFreePoint({ x: b.x, z: b.z }, 4, 10) ?? this.ctx.world.randomFreePoint() ?? { x: b.x, z: b.z };
  }

  protected override onActive(): void {
    this.startHop();
  }

  /** Cap libre devant soi sur au moins ~1 u ? */
  private clear(a: number): boolean {
    const b = this.bodies[0];
    const w = this.ctx.world;
    const sx = Math.sin(a);
    const sz = Math.cos(a);
    return w.isFree(b.x + sx * 0.6, b.z + sz * 0.6, RADIUS) && w.isFree(b.x + sx * 1.2, b.z + sz * 1.2, RADIUS);
  }

  private startHop(): void {
    const ctx = this.ctx;
    const b = this.bodies[0];
    if (dist(b.x, b.z, this.goal.x, this.goal.z) < 1.5 || this.bumps >= 3) {
      this.goal = this.newGoal();
      this.bumps = 0;
    }
    const toGoal = headingOf(this.goal.x - b.x, this.goal.z - b.z);
    const off = ctx.rng.range(30, 55) * DEG;
    const cands = [toGoal + this.zig * off, toGoal - this.zig * off, toGoal];
    let a = cands[0];
    let found = false;
    for (const c of cands)
      if (this.clear(c)) {
        a = c;
        found = true;
        break;
      }
    if (!found)
      for (let i = 0; i < 8; i++) {
        const c = ctx.rng.range(0, TAU);
        if (this.clear(c)) {
          a = c;
          break;
        }
      }
    this.zig = -this.zig;
    this.ox = this.dx;
    this.oz = this.dz;
    this.dx = Math.sin(a);
    this.dz = Math.cos(a);
    this.legDur = ctx.rng.range(0.6, 1.2);
    this.state = 'hop';
    this.timer = 0;
    const speed = SPEED * ctx.speedScale;
    const len = Math.max(0.8, Math.min(speed * this.legDur, ctx.world.castRay(b.x, b.z, this.dx, this.dz, 8) - 0.3, 4));
    this.tele = this.tg.remove(this.tele);
    this.tele = this.tg.add(line(b.x, b.z, b.x + this.dx * len, b.z + this.dz * len, 0.6), 'cream');
  }

  protected think(dt: number): void {
    const ctx = this.ctx;
    const b = this.bodies[0];
    this.timer += dt;
    if (this.state === 'hop') {
      const k = clamp01(this.timer / HOP_TIME);
      ctx.world.moveCircle(b, this.ox * 0.8 * dt, this.oz * 0.8 * dt, RADIUS);
      b.heading = turnToward(b.heading, headingOf(this.dx, this.dz), 22 * dt);
      b.action = 'crouch';
      b.actionT = k;
      b.speed01 = 0.15;
      if (this.tele) this.tele.progress = k;
      this.touch(b, 15, 4);
      if (k >= 1) {
        this.state = 'sprint';
        this.timer = 0;
        if (this.tele) {
          this.tele.progress = 1;
          this.tele.active = true;
        }
      }
      return;
    }
    const speed = SPEED * ctx.speedScale;
    const n = ctx.world.moveCircle(b, this.dx * speed * dt, this.dz * speed * dt, RADIUS);
    b.heading = turnToward(b.heading, headingOf(this.dx, this.dz), 20 * dt);
    b.action = 'walk';
    b.speed01 = 1;
    b.actionT = (b.actionT + dt * 3) % 1;
    if (this.tele && this.timer > 0.3) this.tele = this.tg.remove(this.tele);
    this.touch(b, 15, 4);
    if (n && n.x * this.dx + n.z * this.dz < -0.3) {
      // percute un meuble : change de cap plus tôt
      this.bumps++;
      this.startHop();
      return;
    }
    if (this.timer >= this.legDur || dist(b.x, b.z, this.goal.x, this.goal.z) < 0.8) {
      if (this.timer > 0.3) this.bumps = 0;
      this.startHop();
    }
  }

  protected override onCalm(): void {
    this.tele = null;
  }
}
