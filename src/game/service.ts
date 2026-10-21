/**
 * Le service en salle : cycle de vie des tables (arrivée, commande, patience, dégustation, départ)
 * et la cuisine des comptoirs (chaque comptoir prépare ce qui manque pour honorer les commandes).
 */
import type { CounterSpec, CounterViewState, DishId, GameMode, LevelPlan, SalonLayout, TableMood, TableSpec, TableViewState } from '../types';
import { DISHES } from '../data/dishes';
import type { Rng } from '../core/rng';

export type TablePhase = 'empty' | 'arriving' | 'thinking' | 'waiting' | 'eating' | 'leaving';

export interface TableState {
  spec: TableSpec;
  phase: TablePhase;
  timer: number;
  clients: number;
  order: DishId | null;
  patience: number;
  patienceMax: number;
  served: DishId[];
  mood: TableMood;
  chairPush: number[];
  courses: number;
  coursesMax: number;
  /** Mise en avant (guidage / à portée), 0..1 lissé. */
  highlight: number;
}

export interface CounterState {
  spec: CounterSpec;
  ready: DishId[];
  queue: { dish: DishId; t: number; total: number }[];
  glow: number;
  highlight: number;
}

export const PASS_MAX = 4;

export interface ServiceEvents {
  orderPlaced(t: TableState): void;
  orderExpired(t: TableState): void;
  dishReady(c: CounterState, dish: DishId): void;
}

export class Service {
  readonly tables: TableState[];
  readonly counters: CounterState[];
  private readonly maxWaiting: number;
  private readonly weights: number[];
  /** Plats préparés en parallèle par comptoir. */
  private readonly cookSlots: number;
  /** Poids de commande par table (proximité des comptoirs), calculés à la demande. */
  private readonly localWeights = new Map<TableState, number[]>();

  constructor(
    private plan: LevelPlan,
    layout: SalonLayout,
    private rng: Rng,
    private mode: GameMode,
    private events: ServiceEvents,
  ) {
    this.tables = layout.tables.map((spec, i) => ({
      spec,
      phase: 'empty',
      // Arrivées échelonnées : les premières tables commandent vite.
      timer: 0.4 + i * (plan.level <= 3 ? 1.1 : 0.7) + rng.range(0, 1.2),
      clients: 0,
      order: null,
      patience: 0,
      patienceMax: 1,
      served: [],
      mood: 'empty',
      chairPush: spec.seats.map(() => 0),
      courses: 0,
      coursesMax: 2,
      highlight: 0,
    }));
    this.counters = layout.counters.map((spec) => ({ spec, ready: [], queue: [], glow: 0, highlight: 0 }));
    // Commandes simultanées : de quoi choisir et prioriser, sans submerger (≈ ce qu'on sert en une patience).
    this.maxWaiting = Math.min(plan.tables, Math.ceil(3 + plan.level * 0.05));
    this.cookSlots = 1 + Math.floor(plan.level / 30);
    // Les nouveautés de la carte sont un peu plus demandées.
    this.weights = plan.dishes.map((d) => 1 + Math.max(0, 6 - (plan.level - DISHES[d].unlockLevel)) * 0.12);
  }

  waitingCount(): number {
    let n = 0;
    for (const t of this.tables) if (t.phase === 'waiting') n++;
    return n;
  }

  update(dt: number, frozen: boolean, drainAt: (x: number, z: number) => number, tray: readonly DishId[]): void {
    for (const t of this.tables) this.updateTable(t, dt, frozen, drainAt, tray);
    this.updateKitchen(dt, tray);
  }

  private updateTable(t: TableState, dt: number, frozen: boolean, drainAt: (x: number, z: number) => number, tray: readonly DishId[]): void {
    t.timer -= dt;
    switch (t.phase) {
      case 'empty':
        t.mood = 'empty';
        if (t.timer <= 0) {
          const seats = t.spec.seats.length;
          t.clients = Math.max(t.spec.vip ? Math.min(2, seats) : 1, this.rng.int(1, seats));
          t.courses = 0;
          t.coursesMax = this.rng.int(1, 3);
          t.phase = 'arriving';
          t.timer = 0.9;
          t.mood = 'seated';
        }
        break;
      case 'arriving':
        if (t.timer <= 0) {
          t.phase = 'thinking';
          t.timer = this.rng.range(1.0, 2.6);
        }
        break;
      case 'thinking':
        t.mood = 'seated';
        if (t.timer <= 0 && this.waitingCount() < this.maxWaiting) {
          t.order = this.chooseDish(t, tray);
          const chill = this.mode === 'salon' ? 1.25 : 1;
          t.patienceMax = this.plan.patience * (t.spec.vip ? 0.75 : 1) * chill * this.rng.range(0.9, 1.1);
          t.patience = t.patienceMax;
          t.phase = 'waiting';
          t.mood = 'waiting';
          this.events.orderPlaced(t);
        }
        break;
      case 'waiting':
        if (!frozen) t.patience -= dt * drainAt(t.spec.x, t.spec.z);
        if (t.patience <= 0) {
          t.patience = 0;
          this.events.orderExpired(t);
          t.order = null;
          t.mood = 'angry';
          t.phase = 'leaving';
          t.timer = 1.8;
        }
        break;
      case 'eating':
        t.mood = t.timer > 0.8 ? 'eating' : 'happy';
        if (t.timer <= 0) {
          t.served = [];
          t.courses++;
          if (t.courses >= t.coursesMax) {
            t.phase = 'leaving';
            t.timer = 1.3;
            t.mood = 'happy';
          } else {
            t.phase = 'thinking';
            t.timer = this.rng.range(0.8, 2.0);
          }
        }
        break;
      case 'leaving':
        if (t.timer <= 0) {
          t.phase = 'empty';
          t.clients = 0;
          t.served = [];
          t.mood = 'empty';
          t.timer = this.plan.orderGap + this.rng.range(0.5, 2.5);
        }
        break;
    }
  }

  /**
   * Choix du plat commandé : privilégie les plats « orphelins » déjà prêts ou sur le plateau, et, dans les
   * grands salons, les plats préparés par un comptoir proche (chaque espace reste à peu près autonome).
   */
  private chooseDish(t: TableState, tray: readonly DishId[]): DishId {
    const dishes = this.plan.dishes;
    if (this.rng.chance(0.5)) {
      const orphans: DishId[] = [];
      for (const d of dishes) if (this.supply(d, tray) > this.demand(d)) orphans.push(d);
      if (orphans.length) return this.rng.pick(orphans);
    }
    let w = this.localWeights.get(t);
    if (!w) {
      const dist = dishes.map((d) => {
        let m = Infinity;
        for (const c of this.counters)
          if (c.spec.dishes.includes(d)) m = Math.min(m, Math.hypot(c.spec.front.x - t.spec.x, c.spec.front.z - t.spec.z));
        return m;
      });
      const best = Math.min(...dist);
      w = dishes.map((_, i) => this.weights[i] * (Number.isFinite(dist[i]) ? Math.exp(-(dist[i] - best) / 12) : 0));
      this.localWeights.set(t, w);
    }
    return this.rng.weighted(dishes, w);
  }

  demand(d: DishId): number {
    let n = 0;
    for (const t of this.tables) if (t.phase === 'waiting' && t.order === d) n++;
    return n;
  }

  supply(d: DishId, tray: readonly DishId[]): number {
    let n = 0;
    for (const x of tray) if (x === d) n++;
    for (const c of this.counters) {
      for (const x of c.ready) if (x === d) n++;
      for (const q of c.queue) if (q.dish === d) n++;
    }
    return n;
  }

  private updateKitchen(dt: number, tray: readonly DishId[]): void {
    // Équilibrage : chaque commande non couverte part en préparation au comptoir le plus pertinent
    // (proche de la table qui attend, et pas trop chargé).
    for (const d of this.plan.dishes) {
      let missing = this.demand(d) - this.supply(d, tray);
      if (missing <= 0) continue;
      // Les commandes les plus récentes sont celles qui ne sont pas encore couvertes.
      const uncovered = this.tables
        .filter((t) => t.phase === 'waiting' && t.order === d)
        .sort((a, b) => b.patience / b.patienceMax - a.patience / a.patienceMax);
      let k = 0;
      while (missing > 0) {
        const table = uncovered[k++] ?? null;
        let best: CounterState | null = null;
        let bestCost = Infinity;
        for (const c of this.counters) {
          if (!c.spec.dishes.includes(d)) continue;
          const load = c.queue.length / this.cookSlots + c.ready.length * 0.5;
          const dist = table ? Math.hypot(c.spec.front.x - table.spec.x, c.spec.front.z - table.spec.z) : 0;
          const cost = load * 5 + dist * 0.35;
          if (cost < bestCost) {
            bestCost = cost;
            best = c;
          }
        }
        if (!best) break;
        const prep = DISHES[d].prepTime * (1 - Math.min(0.25, this.plan.level * 0.0025));
        best.queue.push({ dish: d, t: 0, total: prep });
        missing--;
      }
    }
    for (const c of this.counters) {
      // Plusieurs plats en préparation simultanée dans les grands services.
      for (let i = 0; i < Math.min(this.cookSlots, c.queue.length); i++) {
        if (c.ready.length >= PASS_MAX) break;
        const q = c.queue[i];
        q.t += dt;
        if (q.t >= q.total) {
          c.queue.splice(i, 1);
          i--;
          c.ready.push(q.dish);
          this.events.dishReady(c, q.dish);
        }
      }
      const target = c.ready.length > 0 ? 1 : 0;
      c.glow += (target - c.glow) * Math.min(1, dt * 4);
    }
  }

  /**
   * Prise au comptoir : prend tous les plats prêts utiles (commandes non couvertes, les plus pressées d'abord),
   * ou un seul plat s'il n'y a pas de besoin identifié. Renvoie les plats pris.
   */
  pickup(c: CounterState, tray: DishId[], capacity: number): DishId[] {
    const taken: DishId[] = [];
    if (!c.ready.length || tray.length >= capacity) return taken;
    for (;;) {
      if (tray.length >= capacity || !c.ready.length) break;
      let bestIdx = -1;
      let bestUrg = Infinity;
      for (let i = 0; i < c.ready.length; i++) {
        const d = c.ready[i];
        if (this.demand(d) - count(tray, d) <= 0) continue;
        const urg = this.mostUrgent(d);
        if (urg < bestUrg) {
          bestUrg = urg;
          bestIdx = i;
        }
      }
      if (bestIdx < 0) {
        if (!taken.length) {
          const d = c.ready.shift()!;
          tray.push(d);
          taken.push(d);
        }
        break;
      }
      const [d] = c.ready.splice(bestIdx, 1);
      tray.push(d);
      taken.push(d);
    }
    return taken;
  }

  /** Patience relative (0..1) de la commande la plus pressée pour ce plat. */
  mostUrgent(d: DishId): number {
    let m = Infinity;
    for (const t of this.tables) if (t.phase === 'waiting' && t.order === d) m = Math.min(m, t.patience / t.patienceMax);
    return m;
  }

  /** Sert la table avec le plat du plateau (ou le plat doré). Renvoie le plat utilisé, ou null. */
  serve(t: TableState, tray: DishId[]): { dish: DishId; order: DishId; golden: boolean; patience01: number } | null {
    if (t.phase !== 'waiting' || !t.order) return null;
    const order = t.order;
    let idx = tray.indexOf(t.order);
    let golden = false;
    if (idx < 0) {
      idx = tray.indexOf('golden');
      golden = idx >= 0;
    }
    if (idx < 0) return null;
    const [dish] = tray.splice(idx, 1);
    const patience01 = t.patience / t.patienceMax;
    t.served = [golden ? 'golden' : t.order];
    t.order = null;
    t.phase = 'eating';
    t.timer = this.rng.range(5, 8);
    t.mood = 'eating';
    return { dish, order, golden, patience01 };
  }

  /** Anneau de la Brigade : les comptoirs dressent instantanément les plats attendus. */
  instantCook(): void {
    for (const c of this.counters) {
      while (c.queue.length && c.ready.length < PASS_MAX) c.ready.push(c.queue.shift()!.dish);
    }
  }

  /** Remplit la patience des tables en attente (fraction de la patience max, 1 = pleine). */
  refillPatience(fraction: number): void {
    for (const t of this.tables) if (t.phase === 'waiting') t.patience = Math.min(t.patienceMax, t.patience + t.patienceMax * fraction);
  }

  tableView(t: TableState, out: TableViewState): TableViewState {
    out.mood = t.mood;
    out.clients = t.clients;
    out.served = t.served;
    out.chairPush = t.chairPush;
    out.highlight = t.highlight;
    out.vip = t.spec.vip;
    return out;
  }

  counterView(c: CounterState, out: CounterViewState): CounterViewState {
    out.ready = c.ready;
    const head = c.queue[0];
    out.cooking = head ? Math.min(1, head.t / head.total) : 0;
    out.cookingDish = head ? head.dish : null;
    out.glow = c.glow;
    out.highlight = c.highlight;
    return out;
  }
}

function count(arr: readonly DishId[], d: DishId): number {
  let n = 0;
  for (const x of arr) if (x === d) n++;
  return n;
}
