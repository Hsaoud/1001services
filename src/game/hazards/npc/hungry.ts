/**
 * Client affamé (piège « groupe affamé ») : apparaît en cercle autour du joueur après un petit
 * télégraphe, piétine et bouscule quelques secondes, puis s'en va rejoindre la salle.
 */
import type { TelegraphHandle } from '../api';
import type { HazardCtx } from '../context';
import { TAU, clamp01, dist, circle } from '../util';
import { Agent, moveBody } from './base';
import { PathFollower } from './path';

type HungryState = 'mill' | 'leave';

export const HUNGRY_RADIUS = 0.32;
/** Avertissement avant matérialisation (s). */
export const HUNGRY_WARN = 0.65;

export class Hungry extends Agent {
  private readonly cx: number;
  private readonly cz: number;
  private state: HungryState = 'mill';
  private timer = 0;
  private millDur: number;
  private retarget = 0;
  private tx: number;
  private tz: number;
  private readonly walker: PathFollower;
  private tele: TelegraphHandle | null;

  constructor(ctx: HazardCtx, x: number, z: number, cx: number, cz: number) {
    super(ctx, 'hungry', false);
    this.cx = cx;
    this.cz = cz;
    this.tx = x;
    this.tz = z;
    this.spawnDelay = HUNGRY_WARN;
    this.fadeIn = 0.25;
    this.millDur = ctx.rng.range(7.5, 8.5);
    this.walker = new PathFollower(ctx, 1.0);
    this.addBody(x, z, HUNGRY_RADIUS, Math.atan2(cx - x, cz - z));
    this.tele = this.tg.add(circle(x, z, 0.45), 'pink');
  }

  protected override onSpawnDelay(p: number): void {
    if (this.tele) this.tele.progress = clamp01(p);
  }

  protected override onFading(): void {
    if (this.tele) this.tele = this.tg.remove(this.tele);
  }

  protected think(dt: number): void {
    const ctx = this.ctx;
    const b = this.bodies[0];
    this.timer += dt;
    if (this.state === 'mill') {
      this.retarget -= dt;
      if (this.retarget <= 0) {
        this.retarget = ctx.rng.range(0.8, 1.6);
        const p = ctx.player;
        if (!p.busy && dist(p.x, p.z, b.x, b.z) < 3.5 && ctx.rng.chance(0.35)) {
          // bouscule le joueur
          this.tx = p.x;
          this.tz = p.z;
        } else {
          const a = ctx.rng.range(0, TAU);
          const r = ctx.rng.range(0.4, 2.2);
          this.tx = this.cx + Math.sin(a) * r;
          this.tz = this.cz + Math.cos(a) * r;
        }
      }
      const left = moveBody(ctx, b, this.tx, this.tz, 1.4 * ctx.speedScale, dt, 8);
      const moving = left > 0.15;
      b.action = moving ? 'walk' : 'idle';
      b.speed01 = moving ? 0.35 : 0;
      b.actionT = (b.actionT + dt * 1.8) % 1;
      this.touch(b, 12, 3);
      if (this.timer >= this.millDur) this.startLeave();
      return;
    }
    // départ : rejoint un point d'apparition et s'efface
    const arrived = this.walker.step(b, 1.8 * ctx.speedScale, dt, 0.4);
    b.action = 'leave';
    b.speed01 = 0.4;
    const lt = this.timer;
    b.actionT = clamp01(lt / 4);
    if (arrived || lt > 2.6 || this.walker.failed) b.fade = Math.max(0, b.fade - dt / 0.6);
    if (b.fade <= 0) this.phase = 'dead';
  }

  private startLeave(): void {
    const ctx = this.ctx;
    const b = this.bodies[0];
    this.state = 'leave';
    this.timer = 0;
    let best: { x: number; z: number } | null = null;
    let bestD = Infinity;
    for (const sp of ctx.layout.spawnPoints) {
      const d = dist(b.x, b.z, sp.x, sp.z);
      if (d > 2 && d < bestD) {
        best = sp;
        bestD = d;
      }
    }
    const t = best ?? ctx.world.randomFreePoint({ x: b.x, z: b.z }, 3, 8) ?? { x: b.x, z: b.z };
    this.walker.setTarget(t.x, t.z);
  }

  protected override onCalm(): void {
    this.tele = null;
  }
}
