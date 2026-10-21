/**
 * Événements de salle périodiques (sans cloche) : Lustre frémissant (pampilles de cristal)
 * et Flambée du Chef (langue de feu devant un comptoir).
 */
import type { RoomEventKind, Vec2 } from '../../types';
import type { HazardCtx } from './context';
import { TelegraphSet } from './context';
import { Strike } from './strike';
import { circle, clamp01, dist, line, quarterDir } from './util';

/** Aucun événement avant ce temps de jeu (s). */
export const EVENT_GRACE = 8;
/** Intervalles de base (s) avant raccourcissement par la difficulté. */
export const EVENT_INTERVALS: Record<RoomEventKind, [number, number]> = {
  chandelier: [12, 20],
  flambe: [15, 25],
};
const CRYSTAL_R = 0.9;
const SHAKE_TIME = 1.5;
const FLAME_COLOR = '#ff9a3c';

interface RunningEvent {
  done: boolean;
  update(dt: number): void;
  cancel(): void;
}

/** Lustre frémissant : tremblement (1,5 s) puis 2 à 5 ombres rondes où tombent les cristaux. */
class ChandelierEvent implements RunningEvent {
  done = false;
  private t = 0;
  private strike: Strike | null = null;
  private readonly ctx: HazardCtx;
  private readonly tg: TelegraphSet;

  constructor(ctx: HazardCtx, tg: TelegraphSet) {
    this.ctx = ctx;
    this.tg = tg;
    ctx.world.setChandelierShake(0.3);
    ctx.world.sfx('trap_warn', { volume: 0.6, pitch: 1.5 });
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const w = this.ctx.world;
    if (!this.strike) {
      w.setChandelierShake(0.3 + 0.7 * clamp01(this.t / 0.4));
      if (this.t >= SHAKE_TIME) this.drop();
      return;
    }
    this.strike.update(dt);
    if (!this.strike.hasFired) w.setChandelierShake(0.6);
    if (this.strike.done) {
      this.done = true;
      w.setChandelierShake(0);
    }
  }

  /** Points de chute : sous les lustres du décor (s'il y en a), dont au moins un près du joueur. */
  private points(): Vec2[] {
    const ctx = this.ctx;
    const rng = ctx.rng;
    const p = ctx.player;
    const maxN = Math.min(5, 3 + Math.floor((ctx.scale - 1) * 5));
    const n = rng.int(2, maxN);
    const pts: Vec2[] = [];
    const ok = (q: Vec2): boolean => ctx.isFloor(q.x, q.z) && pts.every((o) => dist(o.x, o.z, q.x, q.z) >= 1.5);
    if (!p.busy)
      for (let i = 0; i < 12; i++) {
        const a = rng.range(0, Math.PI * 2);
        const r = rng.range(0, 1.3);
        const q = { x: p.x + Math.sin(a) * r, z: p.z + Math.cos(a) * r };
        if (ok(q)) {
          pts.push(q);
          break;
        }
      }
    const chand = ctx.layout.decor.filter((d) => d.kind === 'chandelier');
    for (let tries = 0; pts.length < n && tries < 40; tries++) {
      let q: Vec2 | null;
      if (chand.length) {
        // un lustre au hasard, de préférence le plus proche du joueur parmi deux tirages
        const c1 = rng.pick(chand);
        const c2 = rng.pick(chand);
        const c = dist(c1.x, c1.z, p.x, p.z) <= dist(c2.x, c2.z, p.x, p.z) ? c1 : c2;
        const a = rng.range(0, Math.PI * 2);
        const r = rng.range(0, 1.4);
        q = { x: c.x + Math.sin(a) * r, z: c.z + Math.cos(a) * r };
      } else q = ctx.world.randomFreePoint({ x: p.x, z: p.z }, 1.5, 7) ?? ctx.world.randomFreePoint();
      if (q && ok(q)) pts.push(q);
    }
    if (!pts.length) pts.push({ x: p.x, z: p.z });
    return pts;
  }

  private drop(): void {
    const ctx = this.ctx;
    const w = ctx.world;
    const pts = this.points();
    const shapes = pts.map((q) => circle(q.x, q.z, CRYSTAL_R));
    const src = `chandelier:${ctx.uid()}`;
    this.strike = new Strike(
      this.tg,
      shapes.map((shape) => ({ shape, tone: 'pink' as const })),
      ctx.warn(1.2),
      0.3,
      {
        fire: () => {
          for (const q of pts) w.fx('cloche', q.x, q.z, { scale: 0.8 });
          w.sfx('hit', { volume: 0.7, pitch: 1.7 });
          const p = ctx.player;
          for (const s of shapes)
            if (ctx.playerInside(s)) {
              ctx.hit(25, 4, src, p.x - s.x, p.z - s.z);
              break;
            }
        },
      },
    );
  }

  cancel(): void {
    if (this.done) return;
    this.done = true;
    this.strike?.cancel();
    this.ctx.world.setChandelierShake(0);
  }
}

/** Flambée du Chef : ligne dorée devant un comptoir, puis langue de feu active 1 s. */
function startFlambe(ctx: HazardCtx, tg: TelegraphSet): RunningEvent | null {
  const counters = ctx.layout.counters;
  if (!counters.length) return null;
  const w = ctx.world;
  for (let tries = 0; tries < 6; tries++) {
    const c = ctx.rng.pick(counters);
    let dx = c.front.x - c.x;
    let dz = c.front.z - c.z;
    const l = Math.hypot(dx, dz);
    if (l < 0.05) {
      const q = quarterDir(c.rot);
      dx = q.x;
      dz = q.z;
    } else {
      dx /= l;
      dz /= l;
    }
    // départ sur la façade du comptoir
    const half = Math.abs(dx) >= Math.abs(dz) ? c.w / 2 : c.d / 2;
    const sx = c.x + dx * half;
    const sz = c.z + dz * half;
    const want = ctx.rng.range(4, 6);
    const len = Math.min(want, w.castRay(sx, sz, dx, dz, want + 0.5) - 0.15);
    if (!(len >= 1.5)) continue;
    const ex = sx + dx * len;
    const ez = sz + dz * len;
    const shape = line(sx, sz, ex, ez, 0.9);
    const src = `flambe:${ctx.uid()}`;
    const flames = (): void => {
      const n = Math.max(1, Math.round(len / 1.2));
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * len;
        w.fx('steam', sx + dx * t, sz + dz * t, { color: FLAME_COLOR, dirX: dx, dirZ: dz, scale: 0.9 });
      }
    };
    let hit = false;
    let puff = 0;
    ctx.sfxAt('trap_warn', sx, sz, 0.5, 0.7);
    return new Strike(tg, [{ shape, tone: 'gold' }], ctx.warn(1.2), 1.0, {
      fire: () => {
        flames();
        ctx.sfxAt('foam_burst', sx, sz, 1, 0.6);
      },
      active: (t) => {
        if (t - puff >= 0.25) {
          puff = t;
          flames();
        }
        if (!hit && ctx.playerInside(shape)) {
          const k = ctx.perpFromLine(sx, sz, ex, ez);
          hit = ctx.hit(30, 6, src, k.x + dx * 0.4, k.z + dz * 0.4);
        }
      },
    });
  }
  return null;
}

export class EventScheduler {
  private readonly ctx: HazardCtx;
  private readonly tg: TelegraphSet;
  private readonly next = new Map<RoomEventKind, number>();
  private running: RunningEvent[] = [];
  private lastStart = -Infinity;

  constructor(ctx: HazardCtx, kinds: readonly RoomEventKind[]) {
    this.ctx = ctx;
    this.tg = new TelegraphSet(ctx.world);
    for (const k of kinds) if (!this.next.has(k)) this.next.set(k, EVENT_GRACE + ctx.rng.range(2, this.interval(k)));
  }

  /** Intervalle (s) avant le prochain événement de ce type, raccourci par la difficulté. */
  private interval(k: RoomEventKind): number {
    const [a, b] = EVENT_INTERVALS[k];
    return this.ctx.rng.range(a, b) / this.ctx.scale;
  }

  update(dt: number): void {
    const t = this.ctx.time;
    if (t >= EVENT_GRACE)
      for (const [k, at] of this.next) {
        if (t < at) continue;
        if (t - this.lastStart < 3) {
          // espace les événements d'au moins 3 s
          this.next.set(k, this.lastStart + 3 + this.ctx.rng.range(0, 1.5));
          continue;
        }
        this.start(k);
        this.lastStart = t;
        this.next.set(k, t + this.interval(k));
      }
    if (!this.running.length) return;
    for (const e of this.running) e.update(dt);
    this.running = this.running.filter((e) => !e.done);
  }

  private start(k: RoomEventKind): void {
    const e = k === 'chandelier' ? new ChandelierEvent(this.ctx, this.tg) : startFlambe(this.ctx, this.tg);
    if (e) this.running.push(e);
  }

  get active(): number {
    return this.running.length;
  }

  /** Tournée Générale : annule les événements en cours et repousse les suivants. */
  cancelAll(): void {
    const hadShake = this.running.length > 0;
    for (const e of this.running) e.cancel();
    this.running = [];
    if (hadShake) this.ctx.world.setChandelierShake(0);
    for (const [k, at] of this.next) this.next.set(k, Math.max(at, this.ctx.time + 6));
  }

  dispose(): void {
    for (const e of this.running) e.cancel();
    this.running = [];
    this.tg.clear();
  }
}
