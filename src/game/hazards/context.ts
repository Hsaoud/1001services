/**
 * Contexte partagé des obstacles : monde, aléa déterministe, échelle de difficulté,
 * budget de recherche de chemin, couloirs, sièges des clients bavards, aides de ciblage.
 */
import type { Rng } from '../../core/rng';
import type { SfxId, Lane, SalonLayout, TelegraphShape, TelegraphTone, Vec2 } from '../../types';
import { CELL } from '../../types';
import type { HazardPlayer, HazardWorld, TelegraphHandle } from './api';
import type { SlipperyField } from './slippery';
import { dist, segProject, shapeContains } from './util';

/** Ensemble de télégraphes possédés par un obstacle (retrait garanti, sans double suppression). */
export class TelegraphSet {
  private readonly world: HazardWorld;
  private readonly items = new Set<TelegraphHandle>();

  constructor(world: HazardWorld) {
    this.world = world;
  }

  add(shape: TelegraphShape, tone: TelegraphTone, persistent = false): TelegraphHandle {
    const h = this.world.addTelegraph(shape, tone, persistent);
    // un télégraphe persistant est affiché « plein » (pas de remplissage)
    if (persistent) h.progress = 1;
    this.items.add(h);
    return h;
  }

  /** Retire le télégraphe s'il appartient encore à l'ensemble ; renvoie toujours null (pratique : `t = set.remove(t)`). */
  remove(h: TelegraphHandle | null): null {
    if (h && this.items.delete(h)) this.world.removeTelegraph(h);
    return null;
  }

  has(h: TelegraphHandle | null): boolean {
    return !!h && this.items.has(h);
  }

  clear(): void {
    for (const h of this.items) this.world.removeTelegraph(h);
    this.items.clear();
  }

  get size(): number {
    return this.items.size;
  }
}

/** Siège d'un client bavard : position, direction « dos » (vers l'allée). */
export interface SeatSlot {
  tableId: number;
  seat: number;
  x: number;
  z: number;
  /** Direction unitaire derrière le siège (opposée au regard du client). */
  bx: number;
  bz: number;
  score: number;
}

/** Nombre maximal de calculs de chemin par pas de simulation (tous PNJ confondus). */
export const PATH_BUDGET = 3;

export class HazardCtx {
  readonly world: HazardWorld;
  readonly layout: SalonLayout;
  readonly rng: Rng;
  /** plan.hazardScale (≥ 1). */
  readonly scale: number;
  /** √hazardScale : multiplicateur de vitesse des obstacles. */
  readonly speedScale: number;
  /** Horloge interne (s), avancée par update(). */
  time = 0;
  /** Calculs de chemin restants pour ce pas. */
  pathBudget = PATH_BUDGET;
  /** Zones glissantes (assignée par le directeur). */
  slippery!: SlipperyField;
  /** Fourni par le directeur : un PNJ occupe-t-il déjà ce voisinage ? */
  crowded: (x: number, z: number, r: number) => boolean = () => false;

  private uidSeq = 0;
  private laneList: Lane[] | null = null;
  private laneLoad: number[] = [];
  private seatPool: SeatSlot[] | null = null;
  private readonly seatTaken = new Set<SeatSlot>();

  constructor(world: HazardWorld) {
    this.world = world;
    this.layout = world.layout;
    // sous-générateur isolé : les tirages des obstacles ne dépendent pas des autres systèmes
    this.rng = world.rng.fork(0x4841_5a44);
    const s = world.plan.hazardScale;
    this.scale = Number.isFinite(s) && s > 0 ? Math.max(1, s) : 1;
    this.speedScale = Math.sqrt(this.scale);
  }

  get player(): HazardPlayer {
    return this.world.player;
  }

  uid(): number {
    return ++this.uidSeq;
  }

  /** Durée d'avertissement : raccourcie par la difficulté, jamais sous 0,55 s. */
  warn(base: number): number {
    return Math.max(0.55, base / this.scale);
  }

  /** Case de sol praticable (hors murs) sous ce point ? */
  isFloor(x: number, z: number): boolean {
    const L = this.layout;
    if (!(x >= 0 && z >= 0 && x < L.width && z < L.depth)) return false;
    return L.cells[Math.floor(z) * L.width + Math.floor(x)] === CELL.FLOOR;
  }

  /** Ligne de vue sans mur (mobilier ignoré). */
  los(ax: number, az: number, bx: number, bz: number): boolean {
    const d = dist(ax, az, bx, bz);
    if (d < 1e-3) return true;
    return this.world.castRay(ax, az, bx - ax, bz - az, d) >= d - 0.05;
  }

  /** Recherche de chemin limitée par le budget : `undefined` = budget épuisé, réessayer au pas suivant. */
  path(ax: number, az: number, bx: number, bz: number): Vec2[] | null | undefined {
    if (this.pathBudget <= 0) return undefined;
    this.pathBudget--;
    return this.world.findPath(ax, az, bx, bz);
  }

  /**
   * Choc sur le joueur. (kdx, kdz) = direction du recul voulue ; l'origine du choc est placée à l'opposé.
   */
  hit(damage: number, knockback: number, source: string, kdx: number, kdz: number, stun?: number): boolean {
    const p = this.player;
    let l = Math.hypot(kdx, kdz);
    let dx = kdx;
    let dz = kdz;
    if (l < 1e-4) {
      dx = 0;
      dz = 1;
      l = 1;
    }
    return this.world.hitPlayer({
      damage,
      knockback,
      stun,
      source,
      fromX: p.x - dx / l,
      fromZ: p.z - dz / l,
    });
  }

  /** Le joueur est-il dans la forme (tolérance = moitié de son rayon par défaut) ? */
  playerInside(shape: TelegraphShape, marginFactor = 0.5): boolean {
    const p = this.player;
    return shapeContains(shape, p.x, p.z, p.radius * marginFactor);
  }

  /** Distance du joueur à un segment (recul perpendiculaire). */
  perpFromLine(ax: number, az: number, bx: number, bz: number): Vec2 {
    const p = this.player;
    const pr = segProject(p.x, p.z, ax, az, bx, bz);
    let kx = p.x - pr.x;
    let kz = p.z - pr.z;
    if (Math.hypot(kx, kz) < 0.05) {
      // pile sur l'axe : on pousse d'un côté fixe (perpendiculaire)
      kx = -(bz - az);
      kz = bx - ax;
    }
    return { x: kx, z: kz };
  }

  /** Assez loin du départ du joueur ET de sa position actuelle ? */
  awayFromPlayer(x: number, z: number, d: number): boolean {
    const s = this.layout.playerStart;
    const p = this.player;
    return dist(x, z, s.x, s.z) >= d && dist(x, z, p.x, p.z) >= d;
  }

  /** Distance minimale au joueur (départ et position actuelle). */
  playerDistance(x: number, z: number): number {
    const s = this.layout.playerStart;
    const p = this.player;
    return Math.min(dist(x, z, s.x, s.z), dist(x, z, p.x, p.z));
  }

  /** Son localisé : volume atténué avec la distance au joueur. */
  sfxAt(id: SfxId, x: number, z: number, volume = 1, pitch?: number): void {
    const p = this.player;
    const d = dist(x, z, p.x, p.z);
    const v = volume * Math.max(0.25, Math.min(1, 1.15 - d / 22));
    this.world.sfx(id, pitch === undefined ? { volume: v } : { volume: v, pitch });
  }

  /** Point d'apparition libre, loin du joueur (≥ minPlayerDist) et des autres PNJ. */
  spawnPoint(radius = 0.4, minPlayerDist = 3): Vec2 {
    const w = this.world;
    const sp = this.layout.spawnPoints;
    if (sp.length) {
      const start = this.rng.int(0, sp.length - 1);
      for (let i = 0; i < sp.length; i++) {
        const p = sp[(start + i) % sp.length];
        if (this.awayFromPlayer(p.x, p.z, minPlayerDist) && !this.crowded(p.x, p.z, 1.1) && w.isFree(p.x, p.z, radius))
          return { x: p.x, z: p.z };
      }
    }
    for (let i = 0; i < 30; i++) {
      const p = w.randomFreePoint();
      if (p && this.awayFromPlayer(p.x, p.z, minPlayerDist) && !this.crowded(p.x, p.z, 1.1) && w.isFree(p.x, p.z, radius))
        return { x: p.x, z: p.z };
    }
    for (let i = 0; i < 12; i++) {
      const p = w.randomFreePoint();
      if (p && this.awayFromPlayer(p.x, p.z, minPlayerDist)) return { x: p.x, z: p.z };
    }
    const f = sp[0] ?? w.randomFreePoint() ?? { x: this.layout.width / 2, z: this.layout.depth / 2 };
    return { x: f.x, z: f.z };
  }

  // ── Couloirs (serveurs, chariots, cortège)

  /** Couloirs utilisables (ceux du générateur, sinon des couloirs de secours tracés au sol libre). */
  lanes(): Lane[] {
    if (!this.laneList) {
      const ok = this.layout.lanes.filter(
        (l) =>
          Number.isFinite(l.a.x + l.a.z + l.b.x + l.b.z) &&
          dist(l.a.x, l.a.z, l.b.x, l.b.z) >= 3 &&
          this.isFloor(l.a.x, l.a.z) &&
          this.isFloor(l.b.x, l.b.z),
      );
      this.laneList = ok.length
        ? ok.map((l) => ({ a: { x: l.a.x, z: l.a.z }, b: { x: l.b.x, z: l.b.z }, width: l.width }))
        : this.fallbackLanes();
      this.laneLoad = this.laneList.map(() => 0);
    }
    return this.laneList;
  }

  /** Choisit le couloir le moins occupé (≠ exclude), de préférence avec une extrémité loin du joueur. −1 si aucun. */
  pickLane(exclude = -1): number {
    const lanes = this.lanes();
    let cands: number[] = [];
    for (let i = 0; i < lanes.length; i++) {
      if (i === exclude) continue;
      const l = lanes[i];
      if (this.playerDistance(l.a.x, l.a.z) >= 3 || this.playerDistance(l.b.x, l.b.z) >= 3) cands.push(i);
    }
    if (!cands.length) cands = lanes.map((_, i) => i).filter((i) => i !== exclude);
    if (!cands.length) return -1;
    let best = Infinity;
    for (const i of cands) best = Math.min(best, this.laneLoad[i]);
    const top = cands.filter((i) => this.laneLoad[i] === best);
    return this.rng.pick(top);
  }

  claimLane(i: number): void {
    if (i >= 0 && i < this.laneLoad.length) this.laneLoad[i]++;
  }

  releaseLane(i: number): void {
    if (i >= 0 && i < this.laneLoad.length) this.laneLoad[i] = Math.max(0, this.laneLoad[i] - 1);
  }

  /** Couloirs de secours : segments droits dégagés trouvés au hasard (axes X / Z). */
  private fallbackLanes(): Lane[] {
    const out: Lane[] = [];
    const w = this.world;
    for (let tries = 0; tries < 60 && out.length < 3; tries++) {
      const p = w.randomFreePoint();
      if (!p) continue;
      const alongX = this.rng.chance(0.5);
      const dx = alongX ? 1 : 0;
      const dz = alongX ? 0 : 1;
      const ext = (s: number): number => {
        let d = 0;
        while (d < 12 && w.isFree(p.x + dx * s * (d + 0.5), p.z + dz * s * (d + 0.5), 0.55)) d += 0.5;
        return d;
      };
      const e1 = ext(1);
      const e2 = ext(-1);
      if (e1 + e2 < 5) continue;
      const a = { x: p.x - dx * e2, z: p.z - dz * e2 };
      const b = { x: p.x + dx * e1, z: p.z + dz * e1 };
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      if (out.some((l) => segProject(mx, mz, l.a.x, l.a.z, l.b.x, l.b.z).d < 2)) continue;
      out.push({ a, b, width: 1.1 });
    }
    return out;
  }

  // ── Sièges des clients bavards

  /** Sièges candidats, triés : ceux dont le dos donne sur une allée dégagée d'abord, tables variées. */
  private seats(): SeatSlot[] {
    if (this.seatPool) return this.seatPool;
    const w = this.world;
    const all: SeatSlot[] = [];
    for (const t of this.layout.tables) {
      t.seats.forEach((s, i) => {
        const bx = -Math.sin(s.angle);
        const bz = -Math.cos(s.angle);
        let score = 0;
        if (w.isFree(s.x + bx * 0.95, s.z + bz * 0.95, 0.28)) score += 2;
        if (w.isFree(s.x + bx * 1.45, s.z + bz * 1.45, 0.3)) score += 1;
        if (score > 0) all.push({ tableId: t.id, seat: i, x: s.x, z: s.z, bx, bz, score });
      });
    }
    this.rng.shuffle(all);
    all.sort((a, b) => b.score - a.score);
    this.seatPool = all;
    return all;
  }

  /** Réserve un siège libre (de préférence sur une table sans autre bavard). */
  claimSeat(): SeatSlot | null {
    const pool = this.seats();
    const usedTables = new Set<number>();
    for (const s of this.seatTaken) usedTables.add(s.tableId);
    const free = pool.filter((s) => !this.seatTaken.has(s));
    const pick = free.find((s) => !usedTables.has(s.tableId)) ?? free[0] ?? null;
    if (pick) this.seatTaken.add(pick);
    return pick;
  }

  releaseSeat(s: SeatSlot): void {
    this.seatTaken.delete(s);
  }
}
