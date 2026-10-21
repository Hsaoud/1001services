/**
 * Chef d'orchestre des obstacles d'un niveau : apparition progressive des PNJ du plan,
 * pièges de cloche, événements de salle, zones glissantes, Tournée Générale.
 */
import type { NpcKind, TrapKind, Vec2 } from '../../types';
import type { HazardDirector, HazardWorld } from './api';
import { HazardCtx, PATH_BUDGET } from './context';
import { EventScheduler } from './events';
import { createAgent, Critic, Hungry, HUNGRY_RADIUS } from './npc/index';
import type { Agent } from './npc/index';
import { SlipperyField } from './slippery';
import { TrapManager } from './traps';
import { TAU, clamp, dist } from './util';

/** Pas de simulation maximal (s) : les grands pas sont découpés. */
const MAX_STEP = 1 / 30;
/** Retard maximal rattrapé en une image (s). */
const MAX_FRAME = 0.25;

interface SpawnOrder {
  kind: NpcKind;
  at: number;
}

export class Director implements HazardDirector {
  private readonly ctx: HazardCtx;
  private agents: Agent[] = [];
  private queue: SpawnOrder[] = [];
  private readonly traps: TrapManager;
  private readonly events: EventScheduler;
  private disposed = false;

  constructor(world: HazardWorld) {
    const ctx = new HazardCtx(world);
    this.ctx = ctx;
    ctx.slippery = new SlipperyField(ctx);
    ctx.crowded = (x, z, r) => this.crowded(x, z, r);
    this.traps = new TrapManager(ctx, (x, z) => this.spawnHungry(x, z));
    this.events = new EventScheduler(ctx, world.plan.events ?? []);
    this.planSpawns();
  }

  /** Apparitions échelonnées sur les premières secondes (3 à 8 s selon l'effectif). */
  private planSpawns(): void {
    const ctx = this.ctx;
    const orders: NpcKind[] = [];
    for (const e of ctx.world.plan.npcs ?? []) {
      if (e.kind === 'hungry') continue;
      const n = Math.max(0, Math.floor(e.count));
      for (let i = 0; i < n; i++) orders.push(e.kind);
    }
    if (!orders.length) return;
    ctx.rng.shuffle(orders);
    const total = orders.length;
    const window = clamp(3 + total * 0.25, 3, 8);
    orders.forEach((kind, i) => {
      this.queue.push({ kind, at: 0.6 + (window * (i + ctx.rng.range(0.1, 0.9))) / total });
    });
  }

  private crowded(x: number, z: number, r: number): boolean {
    for (const a of this.agents) for (const b of a.bodies) if (dist(b.x, b.z, x, z) < r) return true;
    return false;
  }

  update(dt: number): void {
    if (this.disposed || !(dt > 0)) return;
    let left = Math.min(dt, MAX_FRAME);
    while (left > 1e-6) {
      const h = Math.min(left, MAX_STEP);
      this.step(h);
      left -= h;
    }
  }

  private step(dt: number): void {
    const ctx = this.ctx;
    ctx.time += dt;
    ctx.pathBudget = PATH_BUDGET;
    this.processQueue();
    for (const a of this.agents) a.update(dt);
    if (this.agents.some((a) => a.phase === 'dead')) {
      const keep: Agent[] = [];
      for (const a of this.agents) {
        if (a.phase === 'dead') a.dispose();
        else keep.push(a);
      }
      this.agents = keep;
    }
    this.traps.update(dt);
    this.events.update(dt);
    ctx.slippery.update(dt);
  }

  private processQueue(): void {
    if (!this.queue.length) return;
    const t = this.ctx.time;
    const due = this.queue.filter((o) => o.at <= t);
    if (!due.length) return;
    this.queue = this.queue.filter((o) => o.at > t);
    for (const o of due) {
      const a = createAgent(this.ctx, o.kind, true);
      if (a) this.agents.push(a);
    }
  }

  /** Groupe affamé : 4 à 6 clients en cercle autour de (cx, cz), chacun annoncé par un petit cercle. */
  private spawnHungry(cx: number, cz: number): void {
    const ctx = this.ctx;
    const w = ctx.world;
    const n = ctx.rng.int(4, 6);
    const base = ctx.rng.range(0, TAU);
    for (let i = 0; i < n; i++) {
      const a0 = base + (i * TAU) / n + ctx.rng.range(-0.25, 0.25);
      const r0 = ctx.rng.range(1.6, 2.0);
      const tries: [number, number][] = [
        [a0, r0],
        [a0, 2.4],
        [a0 + 0.3, r0],
        [a0 - 0.3, r0],
        [a0, 1.3],
      ];
      for (const [a, r] of tries) {
        const x = cx + Math.sin(a) * r;
        const z = cz + Math.cos(a) * r;
        if (ctx.isFloor(x, z) && w.isFree(x, z, HUNGRY_RADIUS)) {
          this.agents.push(new Hungry(ctx, x, z, cx, cz));
          break;
        }
      }
    }
  }

  triggerTrap(kind: TrapKind, x: number, z: number): void {
    if (this.disposed) return;
    this.traps.trigger(kind, x, z);
  }

  calmAll(): void {
    if (this.disposed) return;
    const ctx = this.ctx;
    // les apparitions encore en attente sont repoussées elles aussi
    for (const o of this.queue) o.at = Math.max(o.at, ctx.time + ctx.rng.range(10, 20));
    for (const a of this.agents)
      if (a.calm() && a.regular) this.queue.push({ kind: a.kind, at: ctx.time + ctx.rng.range(10, 20) });
    this.traps.cancelAll();
    this.events.cancelAll();
    ctx.slippery.dryAll(0.8);
  }

  positions(): Vec2[] {
    const out: Vec2[] = [];
    for (const a of this.agents) {
      if (!a.showOnMap || a.phase === 'dead') continue;
      for (const b of a.bodies) if (b.fade > 0.25) out.push({ x: b.x, z: b.z });
    }
    return out;
  }

  slipperyAt(x: number, z: number): boolean {
    return this.ctx.slippery.at(x, z);
  }

  patienceDrainAt(x: number, z: number): number {
    for (const a of this.agents) if (a instanceof Critic && a.influences(x, z)) return 2;
    return 1;
  }

  syncViews(dt: number): void {
    if (this.disposed) return;
    for (const a of this.agents) a.sync(dt);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const a of this.agents) a.dispose();
    this.agents = [];
    this.queue = [];
    this.traps.dispose();
    this.events.dispose();
    this.ctx.slippery.dispose();
  }

  // ── Introspection (tests, débogage)

  /** Nombre d'obstacles vivants par type. */
  census(): Partial<Record<NpcKind, number>> {
    const out: Partial<Record<NpcKind, number>> = {};
    for (const a of this.agents) if (a.phase !== 'dead') out[a.kind] = (out[a.kind] ?? 0) + 1;
    return out;
  }

  /** Apparitions encore programmées. */
  get pendingSpawns(): number {
    return this.queue.length;
  }

  /** Temps interne de la simulation (s). */
  get time(): number {
    return this.ctx.time;
  }
}
