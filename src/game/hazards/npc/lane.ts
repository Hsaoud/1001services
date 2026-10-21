/**
 * Coureur de couloir (base du serveur débordé et du chariot à pâtisseries) :
 * attend à une extrémité, télégraphe crème le long du couloir, puis traverse d'un trait.
 */
import type { NpcKind, SfxId } from '../../../types';
import type { TelegraphHandle } from '../api';
import type { HazardCtx } from '../context';
import { clamp01, dist, headingOf, line, turnToward } from '../util';
import { Agent } from './base';
import { PathFollower } from './path';

export interface LaneTuning {
  /** Vitesse de traversée (u/s, avant √hazardScale). */
  speed: [number, number];
  radius: number;
  /** Pause aux extrémités (s). */
  pause: [number, number];
  /** Avertissement avant départ (s, avant raccourcissement). */
  warn: number;
  damage: number;
  knockback: number;
  action: 'slide' | 'roll';
  departSfx: SfxId | null;
  /** Probabilité de changer de couloir à l'arrivée. */
  switchChance: number;
  /** Largeur du télégraphe. */
  teleWidth: number;
  /** Dégâts au contact en marchant d'un couloir à l'autre (0 = inoffensif). */
  walkDamage: number;
}

type LaneState = 'wait' | 'run' | 'walk';

export class LaneRunner extends Agent {
  private readonly tune: LaneTuning;
  private laneIdx = -1;
  private ax = 0;
  private az = 0;
  private bx = 0;
  private bz = 0;
  private state: LaneState = 'wait';
  private timer = 0;
  private waitDur = 1;
  private runS = 0;
  private runLen = 0;
  private speed = 0;
  private tele: TelegraphHandle | null = null;
  private readonly walker: PathFollower;
  private nextLane = -1;
  private walkT = 0;

  constructor(ctx: HazardCtx, kind: NpcKind, regular: boolean, tune: LaneTuning) {
    super(ctx, kind, regular);
    this.tune = tune;
    this.walker = new PathFollower(ctx, 1.0);
    const lanes = ctx.lanes();
    const li = ctx.pickLane(-1);
    let x: number;
    let z: number;
    if (li >= 0) {
      this.laneIdx = li;
      ctx.claimLane(li);
      const l = lanes[li];
      // part de l'extrémité la plus éloignée du joueur
      const farA = ctx.playerDistance(l.a.x, l.a.z) >= ctx.playerDistance(l.b.x, l.b.z);
      const from = farA ? l.a : l.b;
      const to = farA ? l.b : l.a;
      this.setRun(from.x, from.z, to.x, to.z);
      x = from.x;
      z = from.z;
    } else {
      const p = ctx.spawnPoint(tune.radius);
      x = p.x;
      z = p.z;
      this.setRun(x, z, x, z);
    }
    this.addBody(x, z, tune.radius, headingOf(this.bx - this.ax, this.bz - this.az));
    this.startWait(ctx.rng.range(0.4, 1.8));
  }

  private setRun(ax: number, az: number, bx: number, bz: number): void {
    this.ax = ax;
    this.az = az;
    this.bx = bx;
    this.bz = bz;
    this.runLen = dist(ax, az, bx, bz);
    this.runS = 0;
  }

  private startWait(extra = 0): void {
    const w = this.ctx.warn(this.tune.warn);
    this.state = 'wait';
    this.timer = 0;
    this.waitDur = Math.max(w + 0.15, this.ctx.rng.range(this.tune.pause[0], this.tune.pause[1])) + extra;
  }

  private startRun(): void {
    const t = this.tune;
    this.state = 'run';
    this.runS = 0;
    this.speed = this.ctx.rng.range(t.speed[0], t.speed[1]) * this.ctx.speedScale;
    if (t.departSfx) this.ctx.sfxAt(t.departSfx, this.ax, this.az, 0.8);
    if (this.tele) {
      this.tele.progress = 1;
      this.tele.active = true;
    }
  }

  protected think(dt: number): void {
    const b = this.bodies[0];
    const ctx = this.ctx;
    switch (this.state) {
      case 'wait': {
        this.timer += dt;
        b.action = 'idle';
        b.speed01 = 0;
        b.actionT = clamp01(this.timer / this.waitDur);
        if (this.runLen > 0.5) b.heading = turnToward(b.heading, headingOf(this.bx - this.ax, this.bz - this.az), 5 * dt);
        const warnT = ctx.warn(this.tune.warn);
        const left = this.waitDur - this.timer;
        if (this.laneIdx >= 0 && this.runLen > 0.5 && left <= warnT) {
          if (!this.tele) this.tele = this.tg.add(line(b.x, b.z, this.bx, this.bz, this.teleWidth()), 'cream');
          this.tele.progress = clamp01(1 - left / warnT);
        }
        if (left <= 0) {
          if (this.laneIdx >= 0 && this.runLen > 0.5) this.startRun();
          else this.startWait();
        }
        return;
      }
      case 'run': {
        this.runS = Math.min(this.runLen, this.runS + this.speed * dt);
        const k = this.runLen > 0 ? this.runS / this.runLen : 1;
        b.x = this.ax + (this.bx - this.ax) * k;
        b.z = this.az + (this.bz - this.az) * k;
        b.heading = turnToward(b.heading, headingOf(this.bx - this.ax, this.bz - this.az), 12 * dt);
        b.action = this.tune.action;
        b.actionT = k;
        b.speed01 = 1;
        if (this.tele) this.tele.shape = line(b.x, b.z, this.bx, this.bz, this.teleWidth());
        // recul : de biais, hors du couloir, dans le sens de la course
        const dx = (this.bx - this.ax) / (this.runLen || 1);
        const dz = (this.bz - this.az) / (this.runLen || 1);
        const p = ctx.player;
        const side = dx * (p.z - b.z) - dz * (p.x - b.x) >= 0 ? 1 : -1;
        this.touch(b, this.tune.damage, this.tune.knockback, -dz * side + dx * 0.6, dx * side + dz * 0.6);
        if (this.runS >= this.runLen - 1e-6) this.arrive();
        return;
      }
      case 'walk': {
        this.walkT += dt;
        const arrived = this.walker.step(b, 2.0 * ctx.speedScale, dt, 0.25);
        b.action = 'walk';
        b.speed01 = 0.35;
        b.actionT = (b.actionT + dt * 1.6) % 1;
        if (this.tune.walkDamage > 0) this.touch(b, this.tune.walkDamage, 3);
        if (arrived || this.walkT > 14 || this.walker.failed) this.endWalk(arrived);
        return;
      }
    }
  }

  private teleWidth(): number {
    const lanes = this.ctx.lanes();
    const l = this.laneIdx >= 0 ? lanes[this.laneIdx] : null;
    return l ? Math.min(Math.max(0.6, l.width), this.tune.teleWidth) : this.tune.teleWidth;
  }

  private arrive(): void {
    this.tele = this.tg.remove(this.tele);
    const ctx = this.ctx;
    const lanes = ctx.lanes();
    if (this.tune.switchChance > 0 && lanes.length > 1 && ctx.rng.chance(this.tune.switchChance)) {
      const j = ctx.pickLane(this.laneIdx);
      if (j >= 0 && j !== this.laneIdx) {
        const b = this.bodies[0];
        const l = lanes[j];
        const nearA = dist(b.x, b.z, l.a.x, l.a.z) <= dist(b.x, b.z, l.b.x, l.b.z);
        const end = nearA ? l.a : l.b;
        ctx.releaseLane(this.laneIdx);
        ctx.claimLane(j);
        this.laneIdx = -1;
        this.nextLane = j;
        this.walker.setTarget(end.x, end.z);
        this.walkT = 0;
        this.state = 'walk';
        return;
      }
    }
    this.setRun(this.bx, this.bz, this.ax, this.az);
    this.startWait();
  }

  private endWalk(arrived: boolean): void {
    const ctx = this.ctx;
    const b = this.bodies[0];
    const lanes = ctx.lanes();
    const j = this.nextLane;
    this.nextLane = -1;
    this.walker.clear();
    if (j < 0) {
      this.startWait();
      return;
    }
    const l = lanes[j];
    if (!arrived) {
      // chemin introuvable : on se replace directement à l'extrémité la plus proche
      const nearA = dist(b.x, b.z, l.a.x, l.a.z) <= dist(b.x, b.z, l.b.x, l.b.z);
      const e = nearA ? l.a : l.b;
      b.x = e.x;
      b.z = e.z;
    }
    const nearA = dist(b.x, b.z, l.a.x, l.a.z) <= dist(b.x, b.z, l.b.x, l.b.z);
    const from = nearA ? l.a : l.b;
    const to = nearA ? l.b : l.a;
    b.x = from.x;
    b.z = from.z;
    this.laneIdx = j;
    this.setRun(from.x, from.z, to.x, to.z);
    this.startWait();
  }

  protected override onCalm(): void {
    this.releaseLaneSlot();
  }

  protected override onDispose(): void {
    this.releaseLaneSlot();
  }

  private releaseLaneSlot(): void {
    if (this.laneIdx >= 0) this.ctx.releaseLane(this.laneIdx);
    else if (this.nextLane >= 0) this.ctx.releaseLane(this.nextLane);
    this.laneIdx = -1;
    this.nextLane = -1;
  }
}
