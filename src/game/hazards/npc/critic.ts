/**
 * Critique gastronomique : suit le joueur pas à pas (chemin recalculé toutes les 0,6 s),
 * s'arrête régulièrement pour noter ; près de lui (~4 u) les tables s'impatientent deux fois plus vite.
 */
import type { TelegraphHandle } from '../api';
import type { HazardCtx } from '../context';
import { clamp01, dist, headingOf, ring, turnToward } from '../util';
import { Agent, moveBody } from './base';
import { PathFollower } from './path';

const RADIUS = 0.35;
const SPEED = 2.4;
const NOTE_TIME = 1.5;
/** Rayon de l'aura d'impatience (u). */
export const CRITIC_AURA = 4;

export class Critic extends Agent {
  private readonly walker: PathFollower;
  private noteT = 0;
  private nextNote: number;
  private aura: TelegraphHandle | null = null;
  private auraX = NaN;
  private auraZ = NaN;

  constructor(ctx: HazardCtx, regular = true) {
    super(ctx, 'critic', regular);
    const p = ctx.spawnPoint(RADIUS, 5);
    this.walker = new PathFollower(ctx, 0.6);
    this.addBody(p.x, p.z, RADIUS, 0);
    this.nextNote = ctx.rng.range(7, 9);
  }

  /** Le point (x, z) est-il sous l'influence du critique ? */
  influences(x: number, z: number): boolean {
    if (!this.hostile) return false;
    const b = this.bodies[0];
    return dist(b.x, b.z, x, z) <= CRITIC_AURA;
  }

  protected override onActive(): void {
    const b = this.bodies[0];
    this.aura = this.tg.add(ring(b.x, b.z, CRITIC_AURA - 0.15, CRITIC_AURA), 'cream', true);
    this.auraX = b.x;
    this.auraZ = b.z;
  }

  protected think(dt: number): void {
    const ctx = this.ctx;
    const b = this.bodies[0];
    const p = ctx.player;
    if (this.noteT > 0) {
      // écrit dans son carnet
      this.noteT -= dt;
      b.action = 'idle';
      b.speed01 = 0;
      b.actionT = clamp01(1 - this.noteT / NOTE_TIME);
      b.heading = turnToward(b.heading, headingOf(p.x - b.x, p.z - b.z), 3 * dt);
    } else if (p.busy) {
      b.action = 'idle';
      b.speed01 = 0;
      b.actionT = (b.actionT + dt) % 1;
    } else {
      this.nextNote -= dt;
      if (this.nextNote <= 0) {
        this.noteT = NOTE_TIME;
        this.nextNote = ctx.rng.range(7, 9);
      }
      const speed = SPEED * ctx.speedScale;
      const d = dist(b.x, b.z, p.x, p.z);
      if (d < 1.4) moveBody(ctx, b, p.x, p.z, speed, dt);
      else {
        this.walker.setTarget(p.x, p.z);
        this.walker.step(b, speed, dt, 0.5);
      }
      b.action = 'walk';
      b.speed01 = 0.45;
      b.actionT = (b.actionT + dt * 1.4) % 1;
      // contact : petit choc et étourdissement, puis il prend des notes
      if (this.touch(b, 15, 3, undefined, undefined, 0.6)) this.noteT = NOTE_TIME;
    }
    if (this.aura && dist(this.auraX, this.auraZ, b.x, b.z) > 0.02) {
      this.aura.shape = ring(b.x, b.z, CRITIC_AURA - 0.15, CRITIC_AURA);
      this.auraX = b.x;
      this.auraZ = b.z;
    }
  }

  protected override onCalm(): void {
    this.aura = null;
  }
}
