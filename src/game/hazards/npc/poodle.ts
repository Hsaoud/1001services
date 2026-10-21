/**
 * Caniche royal : trottine autour de son coin ; s'il flaire du sucré (joueur à portée, en vue),
 * il se ramasse (télégraphe rose figé) puis bondit le long de la ligne.
 */
import type { TelegraphHandle } from '../api';
import type { HazardCtx } from '../context';
import type { Vec2 } from '../../../types';
import { clamp01, dist, easeInOutQuad, headingOf, line, turnToward } from '../util';
import { Agent } from './base';
import { PathFollower } from './path';

type PoodleState = 'idle' | 'trot' | 'crouch' | 'leap' | 'cool';

const RADIUS = 0.3;
const SNIFF_RANGE = 6;
const LEAP_LEN = 4.5;
const LEAP_TIME = 0.45;
const COOLDOWN = 2.5;

export class Poodle extends Agent {
  private readonly home: Vec2;
  private state: PoodleState = 'idle';
  private timer = 0;
  private dur = 1;
  private readonly walker: PathFollower;
  private tele: TelegraphHandle | null = null;
  private sx = 0;
  private sz = 0;
  private ex = 0;
  private ez = 0;
  /** Délai avant de flairer à nouveau (bond impossible faute de place). */
  private sniffCd = 0;

  constructor(ctx: HazardCtx, regular = true) {
    super(ctx, 'poodle', regular);
    const p = ctx.spawnPoint(RADIUS);
    this.home = p;
    this.walker = new PathFollower(ctx, 1.0);
    this.addBody(p.x, p.z, RADIUS, ctx.rng.range(-Math.PI, Math.PI));
    this.idle();
  }

  private idle(d?: number): void {
    this.state = 'idle';
    this.timer = 0;
    this.dur = d ?? this.ctx.rng.range(1, 3);
  }

  /** Flaire le sucré : le joueur porte un plat sucré, à portée et en vue. */
  private sniff(): boolean {
    const p = this.ctx.player;
    if (!p.carryingSweet || p.busy) return false;
    const b = this.bodies[0];
    const d = dist(b.x, b.z, p.x, p.z);
    return d < SNIFF_RANGE && d > 0.4 && this.ctx.los(b.x, b.z, p.x, p.z);
  }

  /** Prépare le bond vers la position actuelle du joueur ; false si la place manque. */
  private crouch(): boolean {
    const ctx = this.ctx;
    const b = this.bodies[0];
    const p = ctx.player;
    const d = dist(b.x, b.z, p.x, p.z) || 1;
    const dx = (p.x - b.x) / d;
    const dz = (p.z - b.z) / d;
    let len = Math.min(LEAP_LEN, ctx.world.castRay(b.x, b.z, dx, dz, LEAP_LEN + 0.5) - 0.45);
    // point de chute dégagé (il peut sauter par-dessus le mobilier, pas atterrir dessus)
    while (len > 1.2 && !ctx.world.isFree(b.x + dx * len, b.z + dz * len, RADIUS)) len -= 0.25;
    if (len <= 1.2) return false;
    this.sx = b.x;
    this.sz = b.z;
    this.ex = b.x + dx * len;
    this.ez = b.z + dz * len;
    this.state = 'crouch';
    this.timer = 0;
    this.dur = ctx.warn(0.7);
    this.walker.clear();
    this.tele = this.tg.add(line(this.sx, this.sz, this.ex, this.ez, 0.8), 'pink');
    b.heading = headingOf(dx, dz);
    ctx.sfxAt('poodle_yap', b.x, b.z);
    return true;
  }

  protected think(dt: number): void {
    const ctx = this.ctx;
    const b = this.bodies[0];
    this.timer += dt;
    const k = clamp01(this.timer / this.dur);
    this.sniffCd -= dt;
    if ((this.state === 'idle' || this.state === 'trot') && this.sniffCd <= 0 && this.sniff()) {
      if (this.crouch()) return;
      this.sniffCd = 0.5;
    }
    switch (this.state) {
      case 'idle':
        b.action = 'idle';
        b.speed01 = 0;
        b.actionT = k;
        if (k >= 1) {
          const t = ctx.world.randomFreePoint(this.home, 1, 4.5) ?? this.home;
          this.walker.setTarget(t.x, t.z);
          this.state = 'trot';
          this.timer = 0;
          this.dur = 8;
        }
        break;
      case 'trot': {
        const arrived = this.walker.step(b, 2.1 * ctx.speedScale, dt, 0.3);
        b.action = 'walk';
        b.speed01 = 0.45;
        b.actionT = (b.actionT + dt * 2.4) % 1;
        if (arrived || k >= 1 || this.walker.failed) {
          this.walker.clear();
          this.idle();
        }
        break;
      }
      case 'crouch':
        b.action = 'crouch';
        b.actionT = k;
        b.speed01 = 0;
        if (this.tele) this.tele.progress = k;
        if (k >= 1) {
          this.state = 'leap';
          this.timer = 0;
          this.dur = LEAP_TIME;
          if (this.tele) {
            this.tele.progress = 1;
            this.tele.active = true;
          }
        }
        break;
      case 'leap': {
        const e = easeInOutQuad(k);
        b.x = this.sx + (this.ex - this.sx) * e;
        b.z = this.sz + (this.ez - this.sz) * e;
        b.action = 'leap';
        b.actionT = k;
        b.speed01 = 1;
        this.touch(b, 20, 4);
        if (k >= 1) {
          this.tele = this.tg.remove(this.tele);
          this.state = 'cool';
          this.timer = 0;
          this.dur = COOLDOWN;
        }
        break;
      }
      case 'cool':
        b.action = 'idle';
        b.actionT = k;
        b.speed01 = 0;
        if (k >= 1) {
          // retour au bercail en trottinant
          this.walker.setTarget(this.home.x, this.home.z);
          this.state = 'trot';
          this.timer = 0;
          this.dur = 10;
        }
        break;
    }
    if (this.state === 'idle') {
      const p = ctx.player;
      if (p.carryingSweet && dist(b.x, b.z, p.x, p.z) < SNIFF_RANGE + 2)
        b.heading = turnToward(b.heading, headingOf(p.x - b.x, p.z - b.z), 4 * dt);
    }
  }

  protected override onCalm(): void {
    this.tele = null;
  }
}
