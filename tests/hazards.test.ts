import { describe, expect, it } from 'vitest';
import type { Object3D } from 'three';
import { Rng } from '../src/core/rng';
import { levelPlan } from '../src/data/progression';
import type { HazardDirector, HazardPlayer, HazardWorld, HitSpec, TelegraphHandle } from '../src/game/hazards/api';
import { createHazards } from '../src/game/hazards';
import type { Director } from '../src/game/hazards/director';
import type { View } from '../src/render/api';
import { CELL } from '../src/types';
import type {
  Collider,
  CounterSpec,
  DecorSpec,
  DishId,
  LevelPlan,
  NpcKind,
  NpcViewState,
  PedestalSpec,
  SalonLayout,
  TableSpec,
  TelegraphShape,
  TelegraphTone,
  TrapKind,
  Vec2,
} from '../src/types';

// ─────────────────────────────────────────── Salon de test

function circleBoxPen(x: number, z: number, r: number, minX: number, minZ: number, maxX: number, maxZ: number): Vec2 | null {
  const px = Math.max(minX, Math.min(x, maxX));
  const pz = Math.max(minZ, Math.min(z, maxZ));
  const dx = x - px;
  const dz = z - pz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    const k = (r - d) / d;
    return { x: dx * k, z: dz * k };
  }
  const left = x - minX;
  const right = maxX - x;
  const top = z - minZ;
  const bottom = maxZ - z;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { x: -(left + r), z: 0 };
  if (m === right) return { x: right + r, z: 0 };
  if (m === top) return { x: 0, z: -(top + r) };
  return { x: 0, z: bottom + r };
}

function colliderPen(x: number, z: number, r: number, c: Collider): Vec2 | null {
  if (c.shape === 'box') return circleBoxPen(x, z, r, c.minX, c.minZ, c.maxX, c.maxZ);
  const dx = x - c.x;
  const dz = z - c.z;
  const rr = r + c.r;
  const d2 = dx * dx + dz * dz;
  if (d2 >= rr * rr) return null;
  const d = Math.sqrt(d2);
  if (d < 1e-6) return { x: rr, z: 0 };
  const k = (rr - d) / d;
  return { x: dx * k, z: dz * k };
}

/** Salon rectangulaire : comptoirs au fond, grille de tables rondes, couloirs dégagés, un pilier. */
function makeLayout(plan: LevelPlan, opts: { lanes?: boolean } = {}): SalonLayout {
  const width = plan.width;
  const depth = plan.depth;
  const cells = new Uint8Array(width * depth).fill(CELL.FLOOR);
  for (let z = 0; z < depth; z++)
    for (let x = 0; x < width; x++) if (x === 0 || z === 0 || x === width - 1 || z === depth - 1) cells[z * width + x] = CELL.WALL;
  // pilier (mur) dans les grands salons
  const pillar = width >= 24 ? { x: Math.floor(width * 0.5), z: Math.floor(depth * 0.4) } : null;
  if (pillar) for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) cells[(pillar.z + dz) * width + pillar.x + dx] = CELL.WALL;

  const counters: CounterSpec[] = [];
  const nC = Math.min(plan.counters, Math.floor((width - 4) / 3.5));
  for (let i = 0; i < nC; i++) {
    const x = 3 + i * 3.5;
    counters.push({ id: i, x, z: 1.5, w: 2, d: 0.9, rot: 0, station: 'croffle', dishes: ['croffle'], front: { x, z: 2.7 }, island: false });
  }

  const laneZ = depth - 3.5;
  const laneX = width >= 20 ? width - 3.5 : -100;
  const lanes = [{ a: { x: 1.6, z: laneZ }, b: { x: width - 1.6, z: laneZ }, width: 1.4 }];
  if (laneX > 0) lanes.push({ a: { x: laneX, z: 3.6 }, b: { x: laneX, z: laneZ - 1.6 }, width: 1.4 });

  const tables: TableSpec[] = [];
  const decor: DecorSpec[] = [];
  const pedestals: PedestalSpec[] = [];
  for (let z = 5.5; z <= depth - 6 && tables.length < plan.tables; z += 4)
    for (let x = 4.5; x <= width - 5 && tables.length < plan.tables; x += 4) {
      if (Math.abs(z - laneZ) < 2.2 || Math.abs(x - laneX) < 2.2) continue;
      if (pillar && Math.abs(x - pillar.x - 1) < 2.5 && Math.abs(z - pillar.z - 1) < 2.5) continue;
      const id = tables.length;
      tables.push({
        id,
        x,
        z,
        shape: 'round',
        w: 1.1,
        d: 1.1,
        rot: 0,
        seats: [
          { x, z: z - 0.85, angle: 0 },
          { x: x + 0.85, z, angle: -Math.PI / 2 },
          { x, z: z + 0.85, angle: Math.PI },
          { x: x - 0.85, z, angle: Math.PI / 2 },
        ],
        vip: false,
        zone: 0,
        serviceSpots: [{ x, z: z + 1.3 }],
      });
      if (id % 3 === 0) decor.push({ kind: 'chandelier', x, z, rot: 0 });
      if (pedestals.length < Math.max(3, plan.pedestals) && x + 2 < width - 2 && z + 2 < laneZ - 1.5)
        pedestals.push({ id: pedestals.length, x: x + 2, z: z + 2 });
    }
  if (pedestals.length === 0) pedestals.push({ id: 0, x: width / 2, z: depth / 2 });

  const colliders: Collider[] = [
    ...tables.map((t) => ({ shape: 'circle' as const, x: t.x, z: t.z, r: 0.55, solid: 'furniture' as const })),
    ...counters.map((c) => ({
      shape: 'box' as const,
      minX: c.x - c.w / 2,
      minZ: c.z - c.d / 2,
      maxX: c.x + c.w / 2,
      maxZ: c.z + c.d / 2,
      solid: 'furniture' as const,
    })),
    ...pedestals.map((p) => ({ shape: 'circle' as const, x: p.x, z: p.z, r: 0.3, solid: 'furniture' as const })),
  ];

  const layout: SalonLayout = {
    level: plan.level,
    seed: 1,
    biome: plan.biome,
    width,
    depth,
    cells,
    zoneOf: new Int16Array(width * depth).fill(0),
    zones: [{ id: 0, kind: 'salon', rect: { x: 0, z: 0, w: width, d: depth }, floor: 'parquet', raised: 0, name: 'Test' }],
    tables,
    counters,
    pedestals,
    decor,
    colliders,
    royalBell: { x: 2, z: depth - 2, front: { x: 2, z: depth - 2.8 } },
    entrance: { x: width / 2, z: depth - 0.5, rot: 2 },
    playerStart: { x: width / 2, z: depth - 2.5 },
    tideOrigin: { x: 3, z: 1.5 },
    lanes: opts.lanes === false ? [] : lanes,
    spawnPoints: [],
    walk: new Uint8Array(width * depth),
  };
  const free = (x: number, z: number, r: number) => isFreeIn(layout, x, z, r);
  for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) layout.walk[z * width + x] = free(x + 0.5, z + 0.5, 0.35) ? 1 : 0;
  const sp = [
    { x: 2, z: depth / 2 },
    { x: width - 2, z: depth / 2 },
    { x: width / 2, z: 3.6 },
    { x: 2, z: 3.6 },
    { x: width - 2, z: 3.6 },
    { x: width * 0.25, z: depth - 2 },
    { x: width * 0.75, z: depth - 2 },
  ];
  layout.spawnPoints = sp.filter((p) => free(p.x, p.z, 0.45));
  return layout;
}

function isFreeIn(L: SalonLayout, x: number, z: number, r: number): boolean {
  for (let cz = Math.floor(z - r); cz <= Math.floor(z + r); cz++)
    for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++) {
      const solid = cx < 0 || cz < 0 || cx >= L.width || cz >= L.depth || L.cells[cz * L.width + cx] !== CELL.FLOOR;
      if (solid && circleBoxPen(x, z, r, cx, cz, cx + 1, cz + 1)) return false;
    }
  for (const c of L.colliders) if (colliderPen(x, z, r, c)) return false;
  return true;
}

// ─────────────────────────────────────────── Monde factice

class FakeView implements View<NpcViewState> {
  readonly root = {} as Object3D;
  readonly kind: NpcKind;
  first: NpcViewState | null = null;
  last: NpcViewState | null = null;
  updates = 0;
  removed = false;
  bad = false;
  actions = new Set<string>();

  constructor(kind: NpcKind) {
    this.kind = kind;
  }

  update(s: NpcViewState): void {
    if (this.removed) throw new Error('update après retrait');
    for (const v of [s.x, s.z, s.heading, s.speed01, s.actionT, s.fade]) if (!Number.isFinite(v)) this.bad = true;
    if (s.fade < 0 || s.fade > 1 || s.actionT < 0 || s.actionT > 1) this.bad = true;
    if (!this.first) this.first = { ...s };
    this.last = { ...s };
    this.actions.add(s.action);
    this.updates++;
  }

  dispose(): void {}
}

interface MockPlayer extends HazardPlayer {
  x: number;
  z: number;
  vx: number;
  vz: number;
  radius: number;
  invulnerable: boolean;
  dashing: boolean;
  tray: DishId[];
  carryingSweet: boolean;
  busy: boolean;
}

class MockWorld implements HazardWorld {
  readonly layout: SalonLayout;
  readonly plan: LevelPlan;
  readonly rng: Rng;
  time = 0;
  readonly player: MockPlayer;
  hits: (HitSpec & { t: number })[] = [];
  stuns: { seconds: number; source: string; t: number }[] = [];
  drops: string[] = [];
  teleports: Vec2[] = [];
  telegraphs = new Set<TelegraphHandle>();
  telegraphsAdded = 0;
  views: FakeView[] = [];
  fxLog: string[] = [];
  sfxLog: string[] = [];
  chairs = new Map<string, number>();
  chairMax = 0;
  shakeLog: number[] = [];
  pathCalls = 0;
  private lastHit = new Map<string, number>();
  private tid = 0;

  constructor(plan: LevelPlan, seed = 1234, opts: { lanes?: boolean } = {}) {
    this.plan = plan;
    this.layout = makeLayout(plan, opts);
    this.rng = new Rng(seed);
    const s = this.layout.playerStart;
    this.player = { x: s.x, z: s.z, vx: 0, vz: 0, radius: 0.32, invulnerable: false, dashing: false, tray: [], carryingSweet: false, busy: false };
  }

  hitPlayer(h: HitSpec): boolean {
    if (this.player.invulnerable) return false;
    const last = this.lastHit.get(h.source);
    if (last !== undefined && this.time - last < 0.8) return false;
    this.lastHit.set(h.source, this.time);
    this.hits.push({ ...h, t: this.time });
    return true;
  }

  stunPlayer(seconds: number, _kind: 'flash' | 'dizzy', source: string): boolean {
    if (this.player.invulnerable) return false;
    this.stuns.push({ seconds, source, t: this.time });
    return true;
  }

  dropPlayer(source: string): boolean {
    if (this.player.invulnerable) return false;
    this.drops.push(source);
    return true;
  }

  teleportPlayer(x: number, z: number): boolean {
    if (this.player.invulnerable) return false;
    this.teleports.push({ x, z });
    this.player.x = x;
    this.player.z = z;
    return true;
  }

  isFree(x: number, z: number, radius: number): boolean {
    return isFreeIn(this.layout, x, z, radius);
  }

  private solid(cx: number, cz: number): boolean {
    const L = this.layout;
    return cx < 0 || cz < 0 || cx >= L.width || cz >= L.depth || L.cells[cz * L.width + cx] !== CELL.FLOOR;
  }

  castRay(x: number, z: number, dirX: number, dirZ: number, maxDist: number): number {
    const l = Math.hypot(dirX, dirZ) || 1;
    const dx = dirX / l;
    const dz = dirZ / l;
    if (this.solid(Math.floor(x), Math.floor(z))) return 0;
    for (let t = 0; t < maxDist; t += 0.05) if (this.solid(Math.floor(x + dx * t), Math.floor(z + dz * t))) return t;
    return maxDist;
  }

  findPath(ax: number, az: number, bx: number, bz: number): Vec2[] | null {
    this.pathCalls++;
    const L = this.layout;
    const w = L.width;
    const near = (cx: number, cz: number): number => {
      for (let r = 0; r < 4; r++)
        for (let oz = -r; oz <= r; oz++)
          for (let ox = -r; ox <= r; ox++) {
            const x = cx + ox;
            const z = cz + oz;
            if (x >= 0 && z >= 0 && x < w && z < L.depth && L.walk[z * w + x]) return z * w + x;
          }
      return -1;
    };
    const start = near(Math.floor(ax), Math.floor(az));
    const goal = near(Math.floor(bx), Math.floor(bz));
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [{ x: bx, z: bz }];
    const came = new Int32Array(w * L.depth).fill(-2);
    came[start] = -1;
    const q = [start];
    for (let qi = 0; qi < q.length; qi++) {
      const cur = q[qi];
      if (cur === goal) break;
      const cx = cur % w;
      const cz = Math.floor(cur / w);
      for (let oz = -1; oz <= 1; oz++)
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oz) continue;
          const nx = cx + ox;
          const nz = cz + oz;
          if (nx < 0 || nz < 0 || nx >= w || nz >= L.depth) continue;
          const ni = nz * w + nx;
          if (!L.walk[ni] || came[ni] !== -2) continue;
          if (ox && oz && (!L.walk[cz * w + nx] || !L.walk[nz * w + cx])) continue;
          came[ni] = cur;
          q.push(ni);
        }
    }
    if (came[goal] === -2) return null;
    const path: Vec2[] = [];
    for (let c = goal; c !== start; c = came[c]) path.push({ x: (c % w) + 0.5, z: Math.floor(c / w) + 0.5 });
    path.reverse();
    path[path.length - 1] = { x: bx, z: bz };
    return path;
  }

  randomFreePoint(near?: Vec2, minDist = 0, maxDist = Infinity): Vec2 | null {
    const L = this.layout;
    for (let i = 0; i < 80; i++) {
      let x: number;
      let z: number;
      if (near && Number.isFinite(maxDist)) {
        const a = this.rng.range(0, Math.PI * 2);
        const d = this.rng.range(minDist, maxDist);
        x = near.x + Math.sin(a) * d;
        z = near.z + Math.cos(a) * d;
      } else {
        x = this.rng.range(1, L.width - 1);
        z = this.rng.range(1, L.depth - 1);
      }
      if (x < 0 || z < 0 || x >= L.width || z >= L.depth || !L.walk[Math.floor(z) * L.width + Math.floor(x)]) continue;
      if (this.isFree(x, z, 0.35)) return { x, z };
    }
    return null;
  }

  moveCircle(pos: { x: number; z: number }, dx: number, dz: number, r: number): Vec2 | null {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (r * 0.45)));
    let nx = 0;
    let nz = 0;
    let hit = false;
    for (let s = 0; s < steps; s++) {
      pos.x += dx / steps;
      pos.z += dz / steps;
      for (let it = 0; it < 3; it++) {
        let any = false;
        const L = this.layout;
        for (let cz = Math.floor(pos.z - r); cz <= Math.floor(pos.z + r); cz++)
          for (let cx = Math.floor(pos.x - r); cx <= Math.floor(pos.x + r); cx++) {
            if (!this.solid(cx, cz)) continue;
            const p = circleBoxPen(pos.x, pos.z, r, cx, cz, cx + 1, cz + 1);
            if (p) {
              pos.x += p.x;
              pos.z += p.z;
              nx += p.x;
              nz += p.z;
              any = true;
            }
          }
        for (const c of L.colliders) {
          const p = colliderPen(pos.x, pos.z, r, c);
          if (p) {
            pos.x += p.x;
            pos.z += p.z;
            nx += p.x;
            nz += p.z;
            any = true;
          }
        }
        if (!any) break;
        hit = true;
      }
    }
    if (!hit) return null;
    const l = Math.hypot(nx, nz) || 1;
    return { x: nx / l, z: nz / l };
  }

  addTelegraph(shape: TelegraphShape, tone: TelegraphTone, persistent?: boolean): TelegraphHandle {
    const h: TelegraphHandle = { id: ++this.tid, shape, tone, progress: 0, active: false, persistent };
    this.telegraphs.add(h);
    this.telegraphsAdded++;
    return h;
  }

  removeTelegraph(t: TelegraphHandle): void {
    if (!this.telegraphs.delete(t)) throw new Error('télégraphe retiré deux fois');
  }

  fx(kind: string): void {
    this.fxLog.push(kind);
  }

  sfx(id: string): void {
    this.sfxLog.push(id);
  }

  shake(): void {}

  createNpcView(kind: NpcKind): View<NpcViewState> {
    const v = new FakeView(kind);
    this.views.push(v);
    return v;
  }

  removeView(view: View<NpcViewState>): void {
    const v = view as FakeView;
    if (v.removed) throw new Error('vue retirée deux fois');
    v.removed = true;
  }

  setChairPush(tableId: number, seat: number, amount: number): void {
    this.chairs.set(`${tableId}:${seat}`, amount);
    this.chairMax = Math.max(this.chairMax, amount);
  }

  setChandelierShake(amount: number): void {
    this.shakeLog.push(amount);
  }

  // ── aides de test
  live(kind?: NpcKind): FakeView[] {
    return this.views.filter((v) => !v.removed && (!kind || v.kind === kind));
  }

  tele(pred: (h: TelegraphHandle) => boolean): TelegraphHandle[] {
    return [...this.telegraphs].filter(pred);
  }
}

/** Plan dérivé avec une liste d'obstacles imposée (pas d'événements par défaut). */
function planWith(level: number, npcs: { kind: NpcKind; count: number }[], extra: Partial<LevelPlan> = {}): LevelPlan {
  return { ...levelPlan(level), npcs, events: [], ...extra };
}

function setup(plan: LevelPlan, seed = 1234, opts: { lanes?: boolean } = {}): { w: MockWorld; d: HazardDirector } {
  const w = new MockWorld(plan, seed, opts);
  const d = createHazards(w);
  return { w, d };
}

function run(w: MockWorld, d: HazardDirector, seconds: number, each?: (t: number) => void, dt = 1 / 60): void {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    each?.(w.time);
    w.time += dt;
    d.update(dt);
    d.syncViews(dt);
  }
}

/** Place le joueur à côté d'un guéridon (pied au sol libre). */
function nearPedestal(w: MockWorld, ox: number, oz: number): Vec2 {
  const p = w.layout.pedestals[0];
  w.player.x = p.x + ox;
  w.player.z = p.z + oz;
  return p;
}

// ─────────────────────────────────────────── Tests

describe('hazards — apparition des obstacles', () => {
  it('fait apparaître le bon nombre de PNJ, progressivement et loin du joueur', () => {
    const plan = levelPlan(100);
    const { w, d } = setup(plan);
    const expected = new Map(plan.npcs.map((n) => [n.kind, n.count]));
    run(w, d, 0.3);
    expect(w.views.length).toBe(0);
    run(w, d, 9);
    for (const kind of ['waiter', 'cart', 'poodle', 'influencer', 'child', 'polisher', 'critic', 'waltz'] as NpcKind[])
      expect(w.live(kind).length, kind).toBe(expected.get(kind) ?? 0);
    const brides = w.live('bride');
    expect(brides.length).toBeGreaterThanOrEqual(5 * (expected.get('bride') ?? 0));
    expect(brides.length).toBeLessThanOrEqual(7 * (expected.get('bride') ?? 0));
    expect(new Set(brides.map((v) => v.last!.aux))).toEqual(new Set(brides.map((_, i) => i)));
    expect((d as Director).census().chatty).toBe(expected.get('chatty'));
    const ps = w.layout.playerStart;
    for (const v of w.views) {
      const dmin = v.kind === 'bride' ? 2 : 3;
      expect(Math.hypot(v.first!.x - ps.x, v.first!.z - ps.z), v.kind).toBeGreaterThanOrEqual(dmin);
      expect(v.first!.fade).toBeLessThan(0.05);
      expect(v.last!.fade).toBe(1);
      expect(v.bad).toBe(false);
    }
    // les bavards finissent par reculer leur chaise
    run(w, d, 15);
    expect(w.chairMax).toBe(1);
    expect(w.sfxLog).toContain('chair_scrape');
    expect(d.positions().length).toBe(w.live().length);
  });

  it('ne crée aucun PNJ ni événement sur un plan vide', () => {
    const { w, d } = setup(planWith(1, []));
    run(w, d, 30);
    expect(w.views.length).toBe(0);
    expect(w.telegraphsAdded).toBe(0);
    expect(d.positions()).toEqual([]);
  });

  it('le serveur télégraphie son couloir avant de glisser, et fonctionne sans couloir fourni', () => {
    for (const lanes of [true, false]) {
      const { w, d } = setup(planWith(10, [{ kind: 'waiter', count: 2 }]), 7, { lanes });
      let sawLine = false;
      run(w, d, 20, () => {
        if (w.tele((h) => h.tone === 'cream' && h.shape.type === 'line').length) sawLine = true;
      });
      expect(sawLine).toBe(true);
      expect(w.live('waiter').every((v) => v.actions.has('slide'))).toBe(true);
    }
  });
});

describe('hazards — pièges de cloche', () => {
  const plan = planWith(100, []);

  it('chantilly : touche le joueur resté dans le cercle', () => {
    const { w, d } = setup(plan);
    const p = nearPedestal(w, 1, 0);
    d.triggerTrap('chantilly', p.x, p.z);
    expect(w.sfxLog).toContain('trap_warn');
    expect(w.tele((h) => h.shape.type === 'circle' && h.tone === 'pink').length).toBe(1);
    run(w, d, 0.4);
    expect(w.hits.length).toBe(0);
    run(w, d, 1.5);
    expect(w.hits.length).toBe(1);
    expect(w.hits[0].damage).toBe(30);
    expect(w.fxLog).toContain('foam');
    expect(w.telegraphs.size).toBe(0);
  });

  it('chantilly : rien si le joueur est invulnérable (Dash) ou hors de la zone', () => {
    {
      const { w, d } = setup(plan);
      const p = nearPedestal(w, 1, 0);
      w.player.invulnerable = true;
      d.triggerTrap('chantilly', p.x, p.z);
      run(w, d, 2);
      expect(w.hits.length).toBe(0);
    }
    {
      const { w, d } = setup(plan);
      const p = nearPedestal(w, 1, 0);
      d.triggerTrap('chantilly', p.x, p.z);
      w.player.x = p.x + 3;
      run(w, d, 2);
      expect(w.hits.length).toBe(0);
    }
  });

  it('champagne : ligne du guéridon vers le joueur jusqu’au mur', () => {
    const { w, d } = setup(plan);
    const p = nearPedestal(w, 2, 1);
    d.triggerTrap('champagne', p.x, p.z);
    const [h] = w.tele((t) => t.shape.type === 'line');
    expect(h).toBeDefined();
    expect(h.tone).toBe('gold');
    const s = h.shape as Extract<TelegraphShape, { type: 'line' }>;
    expect(s.width).toBeCloseTo(0.6);
    // direction vers le joueur
    const dl = Math.hypot(s.bx - s.ax, s.bz - s.az);
    const dirX = (s.bx - s.ax) / dl;
    const dirZ = (s.bz - s.az) / dl;
    const pd = Math.hypot(2, 1);
    expect(dirX).toBeCloseTo(2 / pd, 3);
    expect(dirZ).toBeCloseTo(1 / pd, 3);
    // l'extrémité touche un mur
    expect(w.castRay(s.bx - dirX * 0.2, s.bz - dirZ * 0.2, dirX, dirZ, 1)).toBeLessThan(0.5);
    run(w, d, 1.5);
    expect(w.hits.length).toBe(1);
    expect(w.hits[0].damage).toBe(35);
    // recul perpendiculaire à la ligne
    const kx = w.player.x - w.hits[0].fromX;
    const kz = w.player.z - w.hits[0].fromZ;
    expect(Math.abs(kx * dirX + kz * dirZ)).toBeLessThan(0.05);
  });

  it('champagne : un pas de côté suffit', () => {
    const { w, d } = setup(plan);
    const p = nearPedestal(w, 2, 0);
    d.triggerTrap('champagne', p.x, p.z);
    w.player.z += 0.9;
    run(w, d, 1.5);
    expect(w.hits.length).toBe(0);
  });

  it('percolateur : jets en croix, la diagonale est sûre', () => {
    {
      const { w, d } = setup(plan);
      const p = nearPedestal(w, 2.5, 0);
      d.triggerTrap('percolator', p.x, p.z);
      run(w, d, 2.5);
      expect(w.hits.length).toBe(1);
      expect(w.hits[0].damage).toBe(25);
    }
    {
      const { w, d } = setup(plan);
      const p = nearPedestal(w, 1.5, 1.5);
      d.triggerTrap('percolator', p.x, p.z);
      run(w, d, 2.5);
      expect(w.hits.length).toBe(0);
    }
    {
      // entrée dans un jet pendant la phase active
      const { w, d } = setup(plan);
      const p = nearPedestal(w, 1.5, 1.5);
      d.triggerTrap('percolator', p.x, p.z);
      run(w, d, 1.3);
      w.player.z = p.z;
      run(w, d, 0.3);
      expect(w.hits.length).toBe(1);
    }
  });

  it('trappe : chute si le joueur reste au-dessus, pas s’il s’écarte', () => {
    {
      const { w, d } = setup(plan);
      const p = nearPedestal(w, 1, 0);
      d.triggerTrap('trapdoor', p.x, p.z);
      run(w, d, 3);
      expect(w.drops.length).toBe(1);
    }
    {
      const { w, d } = setup(plan);
      const p = nearPedestal(w, 1, 0);
      d.triggerTrap('trapdoor', p.x, p.z);
      w.player.x += 2.5;
      run(w, d, 3);
      expect(w.drops.length).toBe(0);
    }
  });

  it('passe-plat tournant : téléporte devant un comptoir', () => {
    const { w, d } = setup(plan);
    const p = nearPedestal(w, 1, 0);
    d.triggerTrap('revolving', p.x, p.z);
    expect(w.tele((h) => h.shape.type === 'ring').length).toBe(1);
    run(w, d, 1.5);
    expect(w.teleports.length).toBe(1);
    const fronts = w.layout.counters.map((c) => `${c.front.x},${c.front.z}`);
    expect(fronts).toContain(`${w.teleports[0].x},${w.teleports[0].z}`);
    expect(w.sfxLog).toContain('teleport');
  });

  it('sirop : zone glissante ~10 s puis sèche', () => {
    const { w, d } = setup(plan);
    const p = nearPedestal(w, 1, 0);
    d.triggerTrap('syrup', p.x, p.z);
    const cx = p.x + 0.5;
    const cz = p.z;
    expect(d.slipperyAt(cx, cz)).toBe(false);
    run(w, d, 1.2);
    expect(d.slipperyAt(cx, cz)).toBe(true);
    expect(d.slipperyAt(cx + 5, cz)).toBe(false);
    expect(w.tele((h) => h.persistent === true).length).toBe(1);
    expect(w.sfxLog).toContain('slip');
    run(w, d, 7);
    expect(d.slipperyAt(cx, cz)).toBe(true);
    run(w, d, 3.5);
    expect(d.slipperyAt(cx, cz)).toBe(false);
    expect(w.telegraphs.size).toBe(0);
  });

  it('groupe affamé : cercles d’avertissement puis clients autour du joueur, qui repartent', () => {
    const { w, d } = setup(plan);
    const p = nearPedestal(w, 1.2, 0);
    w.player.x = w.layout.width / 2;
    w.player.z = w.layout.depth - 3.5;
    d.triggerTrap('hungry_group', p.x, p.z);
    const warns = w.tele((h) => h.shape.type === 'circle' && h.tone === 'pink');
    expect(warns.length).toBeGreaterThanOrEqual(3);
    expect(warns.length).toBeLessThanOrEqual(6);
    for (const h of warns) {
      const s = h.shape as Extract<TelegraphShape, { type: 'circle' }>;
      const r = Math.hypot(s.x - w.player.x, s.z - w.player.z);
      expect(r).toBeGreaterThan(1.2);
      expect(r).toBeLessThan(2.6);
    }
    run(w, d, 0.4);
    expect(w.live('hungry').every((v) => v.last!.fade === 0)).toBe(true);
    run(w, d, 1);
    expect(w.live('hungry').length).toBe(warns.length);
    expect(w.live('hungry').every((v) => v.last!.fade === 1)).toBe(true);
    run(w, d, 16);
    expect(w.live('hungry').length).toBe(0);
    expect(w.views.filter((v) => v.kind === 'hungry').every((v) => v.actions.has('leave'))).toBe(true);
  });

  it('tous les pièges acceptent un guéridon quelconque sans erreur', () => {
    const { w, d } = setup(planWith(100, levelPlan(100).npcs));
    const kinds: TrapKind[] = ['chantilly', 'champagne', 'syrup', 'trapdoor', 'hungry_group', 'revolving', 'percolator'];
    run(w, d, 5);
    for (const k of kinds) for (const p of w.layout.pedestals) d.triggerTrap(k, p.x, p.z);
    run(w, d, 15);
    expect(w.views.every((v) => !v.bad)).toBe(true);
  });
});

describe('hazards — obstacles vivants', () => {
  it('le caniche ne bondit que si le joueur porte du sucré', () => {
    const follow = (w: MockWorld) => {
      const v = w.live('poodle')[0];
      if (!v?.last) return;
      // le joueur se tient à ~3 u du caniche (en sol libre)
      for (const [ox, oz] of [
        [3, 0],
        [-3, 0],
        [0, 3],
        [0, -3],
      ]) {
        if (w.isFree(v.last.x + ox, v.last.z + oz, 0.32) && w.castRay(v.last.x, v.last.z, ox, oz, 3) >= 3) {
          w.player.x = v.last.x + ox;
          w.player.z = v.last.z + oz;
          return;
        }
      }
    };
    const plan = planWith(19, [{ kind: 'poodle', count: 1 }]);
    {
      const { w, d } = setup(plan, 99);
      run(w, d, 25, () => follow(w));
      const v = w.live('poodle')[0];
      expect(v.actions.has('crouch')).toBe(false);
      expect(v.actions.has('leap')).toBe(false);
      expect(w.sfxLog).not.toContain('poodle_yap');
    }
    {
      const { w, d } = setup(plan, 99);
      w.player.carryingSweet = true;
      w.player.tray = ['croffle'];
      w.player.busy = true;
      run(w, d, 10, () => follow(w));
      expect(w.live('poodle')[0].actions.has('crouch')).toBe(false);
      w.player.busy = false;
      let sawLine = false;
      run(w, d, 15, () => {
        follow(w);
        if (w.tele((h) => h.tone === 'pink' && h.shape.type === 'line').length) sawLine = true;
      });
      const v = w.live('poodle')[0];
      expect(v.actions.has('crouch')).toBe(true);
      expect(v.actions.has('leap')).toBe(true);
      expect(sawLine).toBe(true);
      expect(w.sfxLog).toContain('poodle_yap');
    }
  });

  it("l'influenceur éblouit le joueur pris dans son cône", () => {
    const plan = planWith(29, [{ kind: 'influencer', count: 1 }]);
    const stay = (w: MockWorld) => {
      const v = w.live('influencer')[0];
      if (!v?.last) return;
      for (const [ox, oz] of [
        [2.5, 0],
        [-2.5, 0],
        [0, 2.5],
        [0, -2.5],
      ])
        if (w.isFree(v.last.x + ox, v.last.z + oz, 0.32) && w.castRay(v.last.x, v.last.z, ox, oz, 2.5) >= 2.5) {
          // ne bouge plus pendant la visée : le cône reste sur le joueur
          if (v.last.action === 'aim' || v.last.action === 'flash') return;
          w.player.x = v.last.x + ox;
          w.player.z = v.last.z + oz;
          return;
        }
    };
    const { w, d } = setup(plan, 5);
    run(w, d, 25, () => stay(w));
    expect(w.stuns.length).toBeGreaterThan(0);
    expect(w.stuns[0].seconds).toBeCloseTo(1.2);
    expect(w.sfxLog).toContain('camera_flash');
    expect(w.fxLog).toContain('flash');
    const inv = setup(plan, 5);
    inv.w.player.invulnerable = true;
    run(inv.w, inv.d, 25, () => stay(inv.w));
    expect(inv.w.stuns.length).toBe(0);
  });

  it('le robot cireur laisse une traînée glissante qui sèche en ~6 s', () => {
    const { w, d } = setup(planWith(64, [{ kind: 'polisher', count: 1 }]));
    run(w, d, 6);
    const wax = w.tele((h) => h.tone === 'blue' && h.persistent === true);
    expect(wax.length).toBeGreaterThan(5);
    const s = wax[wax.length - 1].shape as Extract<TelegraphShape, { type: 'circle' }>;
    expect(d.slipperyAt(s.x, s.z)).toBe(true);
    expect(s.r).toBeCloseTo(0.55);
    // les taches les plus anciennes disparaissent
    const oldest = wax[0];
    run(w, d, 6.5);
    expect(w.telegraphs.has(oldest)).toBe(false);
  });

  it('le critique suit le joueur et double l’impatience autour de lui', () => {
    const { w, d } = setup(planWith(79, [{ kind: 'critic', count: 1 }]));
    w.player.x = 3;
    w.player.z = w.layout.depth - 3.5;
    run(w, d, 2);
    const v0 = w.live('critic')[0].last!;
    const d0 = Math.hypot(v0.x - w.player.x, v0.z - w.player.z);
    run(w, d, 6);
    const v1 = w.live('critic')[0].last!;
    const d1 = Math.hypot(v1.x - w.player.x, v1.z - w.player.z);
    expect(d1).toBeLessThan(d0);
    expect(d.patienceDrainAt(v1.x + 1, v1.z)).toBe(2);
    expect(d.patienceDrainAt(v1.x + 6, v1.z + 6)).toBe(1);
    expect(w.tele((h) => h.shape.type === 'ring' && h.tone === 'cream').length).toBe(1);
  });

  it('la valse et le cortège restent dans le salon', () => {
    const { w, d } = setup(planWith(100, [
      { kind: 'waltz', count: 2 },
      { kind: 'bride', count: 1 },
      { kind: 'child', count: 2 },
      { kind: 'cart', count: 2 },
    ]));
    run(w, d, 40, () => {
      for (const v of w.live())
        if (v.last) {
          expect(v.last.x).toBeGreaterThan(0.5);
          expect(v.last.z).toBeGreaterThan(0.5);
          expect(v.last.x).toBeLessThan(w.layout.width - 0.5);
          expect(v.last.z).toBeLessThan(w.layout.depth - 0.5);
        }
    });
    expect(w.live('waltz').every((v) => v.actions.has('dance'))).toBe(true);
    expect(w.live('bride').every((v) => v.actions.has('dance'))).toBe(true);
    expect(w.live('child').every((v) => v.actions.has('crouch'))).toBe(true);
    expect(w.live('cart').every((v) => v.actions.has('roll'))).toBe(true);
  });
});

describe('hazards — Tournée Générale', () => {
  it('calme tous les PNJ, annule les télégraphes, sèche les flaques, puis les PNJ reviennent', () => {
    const plan = levelPlan(100);
    const { w, d } = setup(plan);
    run(w, d, 12);
    const p = w.layout.pedestals[0];
    d.triggerTrap('chantilly', p.x, p.z);
    d.triggerTrap('syrup', p.x, p.z);
    d.triggerTrap('hungry_group', p.x, p.z);
    run(w, d, 1);
    const before = w.live().length;
    expect(before).toBeGreaterThan(10);
    d.calmAll();
    run(w, d, 0.1);
    expect(w.live().every((v) => v.last!.action === 'calmed')).toBe(true);
    // seuls restent les zones glissantes qui sèchent
    expect(w.tele((h) => !h.persistent).length).toBe(0);
    run(w, d, 1.3);
    expect(w.live().length).toBe(0);
    expect(w.telegraphs.size).toBe(0);
    expect(d.positions().length).toBe(0);
    expect(d.slipperyAt(p.x + 0.5, p.z)).toBe(false);
    expect([...w.chairs.values()].every((a) => a === 0)).toBe(true);
    run(w, d, 7);
    expect(w.live().length).toBe(0);
    run(w, d, 15);
    const back = w.live();
    expect(back.length).toBeGreaterThan(10);
    expect(back.some((v) => v.kind === 'hungry')).toBe(false);
    expect((d as Director).census().chatty).toBe(plan.npcs.find((n) => n.kind === 'chatty')?.count);
  });

  it('dispose retire toutes les vues et tous les télégraphes', () => {
    const { w, d } = setup(levelPlan(100));
    run(w, d, 20);
    const p = w.layout.pedestals[0];
    d.triggerTrap('percolator', p.x, p.z);
    d.triggerTrap('syrup', p.x, p.z);
    run(w, d, 1.5);
    d.dispose();
    expect(w.live().length).toBe(0);
    expect(w.telegraphs.size).toBe(0);
    d.update(1 / 60);
    d.syncViews(1 / 60);
  });
});

describe('hazards — événements de salle', () => {
  it('lustre et flambée : jamais avant 8 s, puis réguliers, télégraphiés', () => {
    const { w, d } = setup(planWith(100, [], { events: ['chandelier', 'flambe'] }));
    run(w, d, 7.9);
    expect(w.telegraphsAdded).toBe(0);
    expect(w.shakeLog.length).toBe(0);
    let gold = 0;
    let pink = 0;
    run(w, d, 60, () => {
      for (const h of w.telegraphs) {
        if (h.tone === 'gold' && h.shape.type === 'line') gold++;
        if (h.tone === 'pink' && h.shape.type === 'circle') pink++;
      }
    });
    expect(gold).toBeGreaterThan(0);
    expect(pink).toBeGreaterThan(0);
    expect(w.shakeLog).toContain(1);
    expect(w.shakeLog[w.shakeLog.length - 1]).toBe(0);
    expect(w.fxLog).toContain('cloche');
    expect(w.fxLog).toContain('steam');
  });

  it('un cristal tombe toujours près du joueur immobile', () => {
    const { w, d } = setup(planWith(74, [], { events: ['chandelier'] }));
    w.player.x = w.layout.width / 2;
    w.player.z = w.layout.depth / 2 + 3;
    let near = 0;
    let seen = new Set<TelegraphHandle>();
    run(w, d, 60, () => {
      for (const h of w.telegraphs)
        if (!seen.has(h) && h.shape.type === 'circle') {
          seen.add(h);
          if (Math.hypot(h.shape.x - w.player.x, h.shape.z - w.player.z) <= 3) near++;
        }
    });
    expect(near).toBeGreaterThan(0);
    expect(w.hits.some((h) => h.source.startsWith('chandelier'))).toBe(true);
    seen = new Set();
  });
});

describe('hazards — robustesse', () => {
  /** Joueur-robot : marche au hasard, Dashe de temps en temps, porte parfois du sucré. */
  function bot(w: MockWorld, d: HazardDirector, seconds: number, dt = 1 / 60) {
    const p = w.player;
    let goal: Vec2 | null = null;
    let dashT = 0;
    let nextDash = 2;
    let nextTrap = 6;
    let calmed = false;
    let maxTele = 0;
    const traps = w.plan.traps;
    run(
      w,
      d,
      seconds,
      (t) => {
        if (!goal || Math.hypot(goal.x - p.x, goal.z - p.z) < 0.5) goal = w.randomFreePoint();
        if (goal) {
          const dx = goal.x - p.x;
          const dz = goal.z - p.z;
          const l = Math.hypot(dx, dz) || 1;
          const sp = dashT > 0 ? 12 : 4.5;
          w.moveCircle(p, (dx / l) * sp * dt, (dz / l) * sp * dt, p.radius);
        }
        dashT -= dt;
        p.dashing = dashT > 0;
        p.invulnerable = p.dashing;
        if (t >= nextDash) {
          dashT = 0.25;
          nextDash = t + 1.5 + ((t * 7.3) % 2);
        }
        p.carryingSweet = Math.floor(t / 7) % 2 === 0;
        if (traps.length && t >= nextTrap && w.layout.pedestals.length) {
          const ped = w.layout.pedestals[Math.floor(t) % w.layout.pedestals.length];
          d.triggerTrap(traps[Math.floor(t / 6) % traps.length], ped.x, ped.z);
          nextTrap = t + 6;
        }
        if (!calmed && t >= seconds * 0.55) {
          d.calmAll();
          calmed = true;
        }
        maxTele = Math.max(maxTele, w.telegraphs.size);
        for (const s of d.positions()) if (!Number.isFinite(s.x + s.z)) throw new Error('position NaN');
        if (!Number.isFinite(d.patienceDrainAt(p.x, p.z))) throw new Error('impatience NaN');
        d.slipperyAt(p.x, p.z);
      },
      dt,
    );
    return { maxTele };
  }

  for (const level of [4, 30, 60, 100]) {
    it(`120 s de service sans erreur au niveau ${level}`, () => {
      const plan = levelPlan(level);
      const { w, d } = setup(plan, 4242 + level);
      const { maxTele } = bot(w, d, 120);
      expect(w.views.every((v) => !v.bad)).toBe(true);
      expect(maxTele).toBeLessThan(400);
      // A* mis en cache : bien moins d'un calcul par image
      expect(w.pathCalls / (120 * 60)).toBeLessThan(1);
      const expectedViews = plan.npcs.filter((n) => n.kind !== 'chatty').length;
      if (expectedViews) expect(w.live().length).toBeGreaterThan(0);
      // les PNJ restent dans le salon
      for (const v of w.live()) {
        expect(v.last!.x).toBeGreaterThan(0);
        expect(v.last!.z).toBeGreaterThan(0);
        expect(v.last!.x).toBeLessThan(w.layout.width);
        expect(v.last!.z).toBeLessThan(w.layout.depth);
      }
      d.dispose();
      expect(w.telegraphs.size).toBe(0);
      expect(w.live().length).toBe(0);
    });
  }

  it('déterministe : mêmes graines → même partie', () => {
    const trace = () => {
      const { w, d } = setup(levelPlan(90), 777);
      const p = w.player;
      const log: string[] = [];
      run(w, d, 45, (t) => {
        p.x = w.layout.width / 2 + Math.sin(t * 0.7) * 6;
        p.z = w.layout.depth / 2 + Math.cos(t * 0.5) * 4;
        p.carryingSweet = t > 10;
        if (Math.abs(t - 15) < 1e-6 || (t > 15 && t < 15.01)) d.triggerTrap('champagne', w.layout.pedestals[0].x, w.layout.pedestals[0].z);
        if (t > 30 && t < 30.01) d.calmAll();
      });
      for (const v of w.views) log.push(`${v.kind}:${v.last?.x.toFixed(4)},${v.last?.z.toFixed(4)},${v.last?.action},${v.removed}`);
      log.push(`hits:${w.hits.map((h) => `${h.source}@${h.t.toFixed(3)}`).join('|')}`);
      log.push(`tele:${w.telegraphsAdded}/${w.telegraphs.size}`);
      d.dispose();
      return log.join('\n');
    };
    expect(trace()).toBe(trace());
  });

  it('un grand pas de temps est découpé et ne fait pas traverser le joueur', () => {
    const { w, d } = setup(planWith(100, [{ kind: 'waiter', count: 1 }]));
    for (let i = 0; i < 40; i++) {
      w.time += 0.25;
      d.update(0.25);
      d.syncViews(0.25);
    }
    expect(w.views.every((v) => !v.bad)).toBe(true);
  });
});
