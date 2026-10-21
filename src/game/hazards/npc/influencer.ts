/**
 * Influenceur : flâne de point en point, s'arrête net, cadre (cône rose télégraphié) puis flashe :
 * le joueur pris dans le cône (et en vue) est ébloui.
 */
import type { TelegraphHandle } from '../api';
import type { HazardCtx } from '../context';
import { DEG, TAU, clamp01, dist, headingOf, cone, shapeContains, type ConeShape } from '../util';
import { Agent } from './base';
import { PathFollower } from './path';

type InfluencerState = 'idle' | 'walk' | 'aim' | 'flash';

const RADIUS = 0.35;
const AIM_RANGE = 7;
const CONE_LEN = 5;
const FLASH_HOLD = 0.4;
const STUN = 1.2;

export class Influencer extends Agent {
  private state: InfluencerState = 'idle';
  private timer = 0;
  private dur = 1;
  private cooldown: number;
  private readonly walker: PathFollower;
  private tele: TelegraphHandle | null = null;
  private shape: ConeShape | null = null;

  constructor(ctx: HazardCtx, regular = true) {
    super(ctx, 'influencer', regular);
    const p = ctx.spawnPoint(RADIUS);
    this.walker = new PathFollower(ctx, 1.0);
    this.addBody(p.x, p.z, RADIUS, ctx.rng.range(-Math.PI, Math.PI));
    this.cooldown = ctx.rng.range(2, 4);
    this.idle();
  }

  private idle(): void {
    this.state = 'idle';
    this.timer = 0;
    this.dur = this.ctx.rng.range(0.4, 1.0);
  }

  private wander(): void {
    const b = this.bodies[0];
    const t = this.ctx.world.randomFreePoint({ x: b.x, z: b.z }, 3, 8) ?? this.ctx.world.randomFreePoint();
    if (!t) {
      this.idle();
      return;
    }
    this.walker.setTarget(t.x, t.z);
    this.state = 'walk';
    this.timer = 0;
    this.dur = 10;
  }

  private playerInSight(range: number): boolean {
    const p = this.ctx.player;
    const b = this.bodies[0];
    if (p.busy) return false;
    const d = dist(b.x, b.z, p.x, p.z);
    return d < range && d > 0.3 && this.ctx.los(b.x, b.z, p.x, p.z);
  }

  private aim(): void {
    const ctx = this.ctx;
    const b = this.bodies[0];
    const p = ctx.player;
    let angle: number;
    if (this.playerInSight(AIM_RANGE)) angle = headingOf(p.x - b.x, p.z - b.z);
    else {
      // direction au hasard, de préférence dégagée
      angle = ctx.rng.range(-Math.PI, Math.PI);
      let best = -1;
      for (let i = 0; i < 6; i++) {
        const a = ctx.rng.range(0, TAU);
        const r = ctx.world.castRay(b.x, b.z, Math.sin(a), Math.cos(a), CONE_LEN);
        if (r > best) {
          best = r;
          angle = a;
        }
      }
    }
    const len = Math.max(2, Math.min(CONE_LEN, ctx.world.castRay(b.x, b.z, Math.sin(angle), Math.cos(angle), CONE_LEN + 0.5) - 0.1));
    const spread = ctx.rng.range(22, 28) * DEG;
    this.shape = cone(b.x, b.z, angle, spread, len);
    this.tele = this.tg.add(this.shape, 'pink');
    this.walker.clear();
    this.state = 'aim';
    this.timer = 0;
    this.dur = ctx.warn(1.1);
    b.heading = angle;
  }

  private flash(): void {
    const ctx = this.ctx;
    const b = this.bodies[0];
    const s = this.shape;
    this.state = 'flash';
    this.timer = 0;
    this.dur = FLASH_HOLD;
    if (this.tele) {
      this.tele.progress = 1;
      this.tele.active = true;
    }
    if (!s) return;
    // éclair compact au téléphone (le cône au sol montre la zone, l'écran blanc vient de l'étourdissement)
    ctx.world.fx('flash', b.x, b.z, { y: 1.1, dirX: Math.sin(s.angle), dirZ: Math.cos(s.angle), scale: 0.45 });
    ctx.sfxAt('camera_flash', b.x, b.z);
    const p = ctx.player;
    if (shapeContains(s, p.x, p.z, p.radius * 0.5) && ctx.los(b.x, b.z, p.x, p.z)) ctx.world.stunPlayer(STUN, 'flash', this.source);
  }

  protected think(dt: number): void {
    const ctx = this.ctx;
    const b = this.bodies[0];
    this.timer += dt;
    this.cooldown -= dt;
    const k = clamp01(this.timer / this.dur);
    switch (this.state) {
      case 'idle':
        b.action = 'idle';
        b.speed01 = 0;
        b.actionT = k;
        if (k >= 1) {
          if (this.cooldown <= 0) this.aim();
          else this.wander();
        }
        break;
      case 'walk': {
        const arrived = this.walker.step(b, 1.5 * ctx.speedScale, dt, 0.35);
        b.action = 'walk';
        b.speed01 = 0.4;
        b.actionT = (b.actionT + dt * 1.5) % 1;
        if (this.cooldown <= 0 && this.playerInSight(5)) this.aim();
        else if (arrived || k >= 1 || this.walker.failed) {
          this.walker.clear();
          this.idle();
        }
        break;
      }
      case 'aim':
        b.action = 'aim';
        b.speed01 = 0;
        b.actionT = k;
        if (this.tele) this.tele.progress = k;
        if (k >= 1) this.flash();
        break;
      case 'flash':
        b.action = 'flash';
        b.speed01 = 0;
        b.actionT = k;
        if (k >= 1) {
          this.tele = this.tg.remove(this.tele);
          this.shape = null;
          this.cooldown = ctx.rng.range(3, 5);
          this.wander();
        }
        break;
    }
  }

  protected override onCalm(): void {
    this.tele = null;
    this.shape = null;
  }
}
