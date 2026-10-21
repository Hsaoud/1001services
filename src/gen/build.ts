/**
 * Une tentative de génération complète : enveloppe → entrée → estrade VIP → îlot / fontaine → comptoirs
 * → couloirs → tables (réseaux réguliers) → guéridons → décor → validation.
 * Renvoie `layout: null` (et la raison) si la tentative échoue : l'appelant réessaie avec une autre graine.
 */
import type { Rng } from '../core/rng';
import { dishesOfStation } from '../data/dishes';
import type { Collider, CounterSpec, DishId, LevelPlan, Quarter, Rect, SalonLayout, StationKind, Vec2, ZoneSpec } from '../types';
import { CELL } from '../types';
import { type Ctx, type Style, type ZoneInfo, addKeep, cellKind, hitsKeep, inZoneFloor, reachOk, solidCell } from './ctx';
import { decorate } from './decor';
import { type Box, box, boxAround, boxOf, dist, expand, snapHalf } from './geom';
import { primaryLanes, secondaryLanes } from './lanes';
import { zoneFloor, zoneName } from './names';
import { buildShell, isOutdoor } from './shell';
import { AGENT_R, Space } from './space';
import { pickSpread, placeTables } from './tables';
import { validateLayout } from './validate';

export interface BuildOptions {
  /** Agrandissement (cases) appliqué à la largeur et à la profondeur du plan. */
  growth: number;
  /** Repli : silhouette rectangulaire, pas de colonnades. */
  simple: boolean;
  /** Repli ultime : un seul grand salon. */
  single: boolean;
}

export interface BuildResult {
  layout: SalonLayout | null;
  errors: string[];
  /** Contexte de la tentative (débogage). */
  ctx?: Ctx;
}

const fail = (why: string, ctx?: Ctx): BuildResult => ({ layout: null, errors: [why], ctx });

export function buildAttempt(plan: LevelPlan, seed: number, rng: Rng, opt: BuildOptions): BuildResult {
  const W = plan.width + opt.growth;
  const D = plan.depth + opt.growth;
  const kinds = opt.single ? [] : plan.zoneKinds.filter((k) => k !== 'vip');
  const hostsVip = plan.vipTables > 0 && (opt.single || !plan.zoneKinds.includes('vip'));
  const shell = buildShell(rng.fork(11), { W, D, kinds, island: plan.centralIsland, simple: opt.simple, mainBonus: hostsVip ? 0.25 + 0.12 * plan.vipTables : 0 });
  if (!shell) return fail('enveloppe');
  const space = new Space(W, D, shell.cells, shell.zoneOf);
  space.computeWalk();

  const zones: ZoneInfo[] = shell.pieces.map((p, id) => ({
    id,
    kind: p.main ? 'salon' : p.kind,
    main: p.main,
    rect: { x: p.x, z: p.z, w: p.w, d: p.d },
    style: p.kind === 'salon' ? (plan.biome as Style) : (p.kind as Style),
    outdoor: isOutdoor(p.kind),
    host: -1,
  }));

  const ctx: Ctx = {
    plan,
    seed,
    rng,
    W,
    D,
    shell,
    space,
    zones,
    keep: [],
    decor: [],
    tables: [],
    tableSpots: [],
    counters: [],
    pedestals: [],
    lanes: [],
    spare: [],
    entrance: { x: 0, z: 0, rot: 2 },
    door: { ix: 0, iz: 0, inX: 0, inZ: -1 },
    playerStart: { x: 0, z: 0 },
    bell: { x: 0, z: 0, front: { x: 0, z: 0 } },
    targets: [],
    islandZone: -1,
    fountainZone: -1,
    keepGrid: Array.from({ length: W * D }, () => []),
    keepMark: new Uint32Array(64),
    keepToken: 0,
    reachCache: null,
  };

  // Paliers devant les ouvertures (jamais de mobilier).
  for (const op of shell.openings) {
    const depth = op.colonnade ? 1.0 : 1.5;
    const b =
      op.axis === 'x'
        ? box(op.line - depth, op.start - 0.5, op.line + 1 + depth, op.start + op.len + 0.5)
        : box(op.start - 0.5, op.line - depth, op.start + op.len + 0.5, op.line + 1 + depth);
    addKeep(ctx, b, 'landing');
  }

  if (!chooseEntrance(ctx)) return fail('entrée', ctx);
  if (!carveEstrade(ctx)) return fail('estrade', ctx);
  if (!placeIsland(ctx)) return fail('îlot', ctx);
  placeFountain(ctx);
  placeColonnades(ctx);
  if (!placeWallCounters(ctx)) return fail('comptoirs', ctx);
  if (!reachOk(ctx)) return fail('accès comptoirs', ctx);

  const floorCount = countFloor(ctx);
  const laneTarget = Math.max(1, Math.min(10, Math.round(floorCount / 60)));
  primaryLanes(ctx, laneTarget);
  if (!placeTables(ctx)) return fail('tables', ctx);
  if (!reachOk(ctx)) return fail('accès tables', ctx);
  secondaryLanes(ctx, laneTarget);
  if (ctx.lanes.length === 0) return fail('couloirs', ctx);
  if (!placePedestals(ctx)) return fail('guéridons', ctx);

  decorate(ctx);

  return finish(ctx);
}

// ─────────────────────────────────────────── Entrée & Cloche Royale

function chooseEntrance(ctx: Ctx): boolean {
  const { space, rng } = ctx;
  interface Cand {
    zone: ZoneInfo;
    rot: Quarter;
    ix: number;
    iz: number;
    score: number;
  }
  const cands: Cand[] = [];
  const freeIn = (z: ZoneInfo, x: number, zz: number) => space.floorAt(x, zz) && space.zoneAt(x, zz) === z.id;
  for (const z of ctx.zones) {
    const R = z.rect;
    const base = (z.main ? 4 : 0) + (z.outdoor ? -1.5 : 1);
    const wz = R.z + R.d;
    for (let x = R.x + 2; x <= R.x + R.w - 3; x++) {
      if (!solidCell(ctx, x, wz) || cellKind(ctx, x, wz + 1) !== CELL.VOID) continue;
      if (!solidCell(ctx, x - 1, wz) || !solidCell(ctx, x + 1, wz)) continue;
      let ok = true;
      for (let dz = 1; dz <= 3 && ok; dz++) for (let dx = -1; dx <= 1; dx++) if (!freeIn(z, x + dx, wz - dz)) ok = false;
      if (!ok || hitsKeep(ctx, box(x - 1, wz - 3, x + 2, wz))) continue;
      const off = Math.abs(x + 0.5 - (R.x + R.w / 2)) / R.w;
      cands.push({ zone: z, rot: 2, ix: x, iz: wz, score: base + 2 - off * 3 + rng.next() * 1.5 });
    }
    const wx = R.x + R.w;
    for (let zz = R.z + 2; zz <= R.z + R.d - 3; zz++) {
      if (!solidCell(ctx, wx, zz) || cellKind(ctx, wx + 1, zz) !== CELL.VOID) continue;
      if (!solidCell(ctx, wx, zz - 1) || !solidCell(ctx, wx, zz + 1)) continue;
      let ok = true;
      for (let dx = 1; dx <= 3 && ok; dx++) for (let dz = -1; dz <= 1; dz++) if (!freeIn(z, wx - dx, zz + dz)) ok = false;
      if (!ok || hitsKeep(ctx, box(wx - 3, zz - 1, wx, zz + 2))) continue;
      const off = Math.abs(zz + 0.5 - (R.z + R.d / 2)) / R.d;
      cands.push({ zone: z, rot: 3, ix: wx, iz: zz, score: base - off * 3 + rng.next() * 1.5 });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  for (const c of cands.slice(0, 6)) {
    const inX = c.rot === 3 ? -1 : 0;
    const inZ = c.rot === 2 ? -1 : 0;
    const ex = c.ix + 0.5;
    const ez = c.iz + 0.5;
    // Cloche Royale : contre le même mur, 2 à 3 cases à côté de la porte.
    const offs = rng.chance(0.5) ? [2, -2, 3, -3] : [-2, 2, -3, 3];
    for (const s of offs) {
      let bx: number;
      let bz: number;
      let front: Vec2;
      let keepB: Box;
      if (c.rot === 2) {
        const cx = c.ix + s;
        if (!freeIn(c.zone, cx, c.iz - 1) || !freeIn(c.zone, cx, c.iz - 2) || !solidCell(ctx, cx, c.iz)) continue;
        bx = cx + 0.5;
        bz = c.iz - 0.6;
        front = { x: bx, z: c.iz - 1.55 };
        keepB = box(bx - 0.9, c.iz - 2.2, bx + 0.9, c.iz);
      } else {
        const cz = c.iz + s;
        if (!freeIn(c.zone, c.ix - 1, cz) || !freeIn(c.zone, c.ix - 2, cz) || !solidCell(ctx, c.ix, cz)) continue;
        bx = c.ix - 0.6;
        bz = cz + 0.5;
        front = { x: c.ix - 1.55, z: bz };
        keepB = box(c.ix - 2.2, bz - 0.9, c.ix, bz + 0.9);
      }
      if (hitsKeep(ctx, keepB)) continue;
      const col: Collider = { shape: 'circle', x: bx, z: bz, r: 0.3, solid: 'furniture', ref: 'bell' };
      if (!space.boxOnFloor(boxOf(col)) || space.gapTo(col, 1) < 0.5) continue;
      ctx.entrance = { x: ex, z: ez, rot: c.rot };
      ctx.door = { ix: c.ix, iz: c.iz, inX, inZ };
      ctx.playerStart = { x: ex + inX * 2, z: ez + inZ * 2 };
      addKeep(ctx, c.rot === 2 ? box(c.ix - 1, c.iz - 3, c.ix + 2, c.iz) : box(c.ix - 3, c.iz - 1, c.ix, c.iz + 2), 'entrance');
      addKeep(ctx, keepB, 'bell');
      space.addCollider(col);
      ctx.bell = { x: bx, z: bz, front };
      ctx.targets.push({ pts: [ctx.playerStart], all: true, label: 'départ' });
      ctx.targets.push({ pts: [front], all: true, label: 'cloche' });
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────── Estrade VIP

const VIP_F = 2.1; // emprise d'une table VIP (Ø1,2 + chaises)

function estradeSize(k: number): number {
  return Math.ceil(0.9 + VIP_F + (k - 1) * 3.5 + 0.6 - 1e-9);
}

function carveEstrade(ctx: Ctx): boolean {
  const n = ctx.plan.vipTables;
  if (n <= 0) return true;
  const { space, rng, zones } = ctx;
  const layouts: [number, number][] =
    n === 1
      ? [[1, 1]]
      : n === 2
        ? [[2, 1], [1, 2]]
        : n === 3
          ? [[3, 1], [1, 3], [2, 2]]
          : n === 4
            ? [[2, 2], [4, 1], [1, 4]]
            : [[3, 2], [2, 3], [5, 1], [1, 5]];
  const area = (z: ZoneInfo) => z.rect.w * z.rect.d;
  const ownZone = ctx.plan.zoneKinds.includes('vip');
  const hosts = zones
    .filter((z) => z.kind !== 'vip' && (z.main || (ownZone && !z.outdoor)))
    .map((z) => ({ z, key: area(z) + (rng.next() - 0.5) * 20 }))
    .sort((a, b) => b.key - a.key)
    .map((h) => h.z);
  for (const z of zones) if (!hosts.includes(z) && z.kind !== 'vip') hosts.push(z);
  for (const h of hosts) {
    const R = h.rect;
    interface C {
      E: Rect;
      score: number;
    }
    const cands: C[] = [];
    for (const [cx, cz] of layouts) {
      const ew = estradeSize(cx);
      const ed = estradeSize(cz);
      if (R.w - ew < 3 || R.d - ed < 3 || R.w - ew + R.d - ed < 8 || ew * ed > R.w * R.d * 0.4) continue;
      // dans un coin de préférence, sinon adossée à un seul mur
      const spots: [number, number, number][] = [];
      const x1 = R.x + R.w - ew;
      const z1 = R.z + R.d - ed;
      for (let x = R.x; x <= x1; x++)
        for (let z = R.z; z <= z1; z++) {
          const onX = x === R.x || x === x1;
          const onZ = z === R.z || z === z1;
          if (!onX && !onZ) continue;
          const corner = onX && onZ;
          // coin du fond (x min, z min) : laissé aux comptoirs
          const wgt = corner ? (x === R.x && z === R.z ? 1 : x === x1 && z === z1 ? 2 : 3) : 0.8;
          spots.push([x, z, wgt]);
        }
      for (const [x, z, wgt] of spots) {
        const E = { x, z, w: ew, d: ed };
        const eb = box(x, z, x + ew, z + ed);
        if (hitsKeep(ctx, expand(eb, 0.3))) continue;
        if (!space.boxCellsAll(eb, (ix, iz) => space.floorAt(ix, iz) && space.zoneAt(ix, iz) === h.id)) continue;
        if (space.boxGapTo(eb, 1.5) < 1.2) continue;
        cands.push({ E, score: wgt + rng.next() * 2.5 });
      }
    }
    if (!cands.length) continue;
    cands.sort((a, b) => b.score - a.score);
    const E = cands[0].E;
    const id = zones.length;
    for (let z = E.z; z < E.z + E.d; z++) for (let x = E.x; x < E.x + E.w; x++) ctx.shell.zoneOf[z * ctx.W + x] = id;
    zones.push({ id, kind: 'vip', main: false, rect: E, style: 'vip', outdoor: false, host: h.id });
    addKeep(ctx, expand(box(E.x, E.z, E.x + E.w, E.z + E.d), 0.6), 'estrade');
    return true;
  }
  return false;
}

// ─────────────────────────────────────────── Îlot central & fontaine

function zoneArea(ctx: Ctx, id: number): number {
  let n = 0;
  for (let i = 0; i < ctx.shell.zoneOf.length; i++) if (ctx.shell.zoneOf[i] === id && ctx.shell.cells[i] === CELL.FLOOR) n++;
  return n;
}

/** Positions (demi-pas) autour de (x, z), des plus proches aux plus lointaines. */
function spiral(x: number, z: number, radius: number): [number, number][] {
  const out: [number, number, number][] = [];
  const x0 = snapHalf(x);
  const z0 = snapHalf(z);
  const n = Math.ceil(radius * 2);
  for (let i = -n; i <= n; i++)
    for (let j = -n; j <= n; j++) {
      const px = x0 + i / 2;
      const pz = z0 + j / 2;
      out.push([px, pz, Math.hypot(px - x, pz - z) + Math.abs(i) * 1e-4 + (j < 0 ? 1e-5 : 0)]);
    }
  out.sort((a, b) => a[2] - b[2]);
  return out.map(([a, b]) => [a, b]);
}

function placeIsland(ctx: Ctx): boolean {
  if (!ctx.plan.centralIsland) return true;
  const cands = ctx.zones
    .filter((z) => z.kind !== 'vip')
    .map((z) => ({ z, a: zoneArea(ctx, z.id) }))
    .sort((a, b) => b.a - a.a);
  for (const { z } of cands.slice(0, 3)) {
    const R = z.rect;
    const pref: Quarter = R.w >= R.d ? 0 : 1;
    for (const [rot, [cx, cz]] of spiral(R.x + R.w / 2, R.z + R.d / 2 + 0.5, Math.max(R.w, R.d) / 3.5).flatMap(
      (p) => [[pref, p], [(1 - pref) as Quarter, p]] as [Quarter, [number, number]][],
    )) {
      const w = rot === 0 ? 2.6 : 1.2;
      const d = rot === 0 ? 1.2 : 2.6;
      const b = boxAround(cx, cz, w / 2, d / 2);
      const clear = expand(b, 1.7);
      if (hitsKeep(ctx, clear) || !inZoneFloor(ctx, clear, z.id) || ctx.space.boxGapTo(b, 2) < 1.7) continue;
      const front = rot === 0 ? { x: cx, z: cz + d / 2 + 0.75 } : { x: cx + w / 2 + 0.75, z: cz };
      const ci = ctx.space.addCollider({ shape: 'box', ...b, solid: 'furniture' });
      addKeep(ctx, expand(b, 1.5), 'island');
      ctx.counters.push({ x: cx, z: cz, w, d, rot, front, island: true, zone: z.id, collider: ci });
      ctx.targets.push({ pts: [front], all: true, label: 'îlot' });
      ctx.islandZone = z.id;
      return true;
    }
  }
  return false;
}

function placeFountain(ctx: Ctx): void {
  if (!ctx.plan.fountain) return;
  const pri = (z: ZoneInfo) =>
    z.id === ctx.islandZone ? 9 : z.kind === 'jardin' ? 0 : z.kind === 'galerie' ? 1 : z.kind === 'terrasse' ? 2 : z.main ? 4 : 3;
  const zs = ctx.zones
    .filter((z) => z.kind !== 'vip' && Math.min(z.rect.w, z.rect.d) >= 9)
    .sort((a, b) => pri(a) - pri(b) || b.rect.w * b.rect.d - a.rect.w * a.rect.d);
  for (const z of zs) {
    const R = z.rect;
    const bases: Vec2[] = [];
    if (z.id === ctx.islandZone) {
      const q = (R.w >= R.d ? R.w : R.d) / 4 + 0.5;
      if (R.w >= R.d) bases.push({ x: R.x + R.w / 2 - q, z: R.z + R.d / 2 }, { x: R.x + R.w / 2 + q, z: R.z + R.d / 2 });
      else bases.push({ x: R.x + R.w / 2, z: R.z + R.d / 2 - q }, { x: R.x + R.w / 2, z: R.z + R.d / 2 + q });
    } else bases.push({ x: R.x + R.w / 2, z: R.z + R.d / 2 });
    for (const base of bases)
      for (const [cx, cz] of spiral(base.x, base.z, 2.5)) {
        const clear = boxAround(cx, cz, 2.7, 2.7);
        if (hitsKeep(ctx, clear) || !inZoneFloor(ctx, clear, z.id)) continue;
        const col: Collider = { shape: 'circle', x: cx, z: cz, r: 1.2, solid: 'furniture', ref: `decor:${ctx.decor.length}` };
        if (ctx.space.gapTo(col, 2) < 1.5) continue;
        ctx.decor.push({ kind: 'fountain', x: cx, z: cz, rot: 0, scale: 1, variant: ctx.rng.int(0, 2) });
        ctx.space.addCollider(col);
        addKeep(ctx, clear, 'fountain');
        ctx.fountainZone = z.id;
        return;
      }
  }
}

/** Colonnes posées dans les colonnades entre zones (cases ouvertes du mur mitoyen). */
function placeColonnades(ctx: Ctx): void {
  for (const op of ctx.shell.openings) {
    if (!op.colonnade) continue;
    for (const t of op.columns) {
      const x = op.axis === 'x' ? op.line + 0.5 : t + 0.5;
      const z = op.axis === 'x' ? t + 0.5 : op.line + 0.5;
      ctx.decor.push({ kind: 'column', x, z, rot: op.axis === 'x' ? Math.PI / 2 : 0, scale: 1, variant: 0 });
      ctx.space.addCollider({ shape: 'circle', x, z, r: 0.28, solid: 'furniture', ref: `decor:${ctx.decor.length - 1}` });
    }
  }
}

// ─────────────────────────────────────────── Comptoirs muraux

interface Slot {
  zone: number;
  rot: Quarter;
  b: Box;
  aisle: Box;
  front: Vec2;
  pri: number;
  along: number; // position relative le long du mur (0..1)
}

function wallSlots(ctx: Ctx, z: ZoneInfo): Slot[] {
  const R = z.rect;
  const out: Slot[] = [];
  const back = z.outdoor ? 1 : 0;
  for (let x0 = R.x; x0 + 2 <= R.x + R.w; x0++) {
    const along = (x0 + 1 - R.x) / R.w;
    if (solidCell(ctx, x0, R.z - 1) && solidCell(ctx, x0 + 1, R.z - 1))
      out.push({
        zone: z.id,
        rot: 0,
        b: box(x0, R.z, x0 + 2, R.z + 0.9),
        aisle: box(x0 - 0.3, R.z + 0.9, x0 + 2.3, R.z + 2.4),
        front: { x: x0 + 1, z: R.z + 1.65 },
        pri: back,
        along,
      });
    const zf = R.z + R.d;
    if (solidCell(ctx, x0, zf) && solidCell(ctx, x0 + 1, zf))
      out.push({
        zone: z.id,
        rot: 2,
        b: box(x0, zf - 0.9, x0 + 2, zf),
        aisle: box(x0 - 0.3, zf - 2.4, x0 + 2.3, zf - 0.9),
        front: { x: x0 + 1, z: zf - 1.65 },
        pri: 2 + back,
        along,
      });
  }
  for (let z0 = R.z; z0 + 2 <= R.z + R.d; z0++) {
    const along = (z0 + 1 - R.z) / R.d;
    if (solidCell(ctx, R.x - 1, z0) && solidCell(ctx, R.x - 1, z0 + 1))
      out.push({
        zone: z.id,
        rot: 1,
        b: box(R.x, z0, R.x + 0.9, z0 + 2),
        aisle: box(R.x + 0.9, z0 - 0.3, R.x + 2.4, z0 + 2.3),
        front: { x: R.x + 1.65, z: z0 + 1 },
        pri: 1 + back,
        along,
      });
    const xf = R.x + R.w;
    if (solidCell(ctx, xf, z0) && solidCell(ctx, xf, z0 + 1))
      out.push({
        zone: z.id,
        rot: 3,
        b: box(xf - 0.9, z0, xf, z0 + 2),
        aisle: box(xf - 2.4, z0 - 0.3, xf - 0.9, z0 + 2.3),
        front: { x: xf - 1.65, z: z0 + 1 },
        pri: 3 + back,
        along,
      });
  }
  return out;
}

function slotValid(ctx: Ctx, s: Slot): boolean {
  const { space } = ctx;
  if (!inZoneFloor(ctx, s.b, s.zone)) return false;
  if (!space.boxOnFloor(s.aisle)) return false;
  if (hitsKeep(ctx, s.b)) return false;
  if (hitsKeep(ctx, s.aisle, ['aisle', 'landing', 'lane'])) return false;
  if (space.boxGapTo(s.b, 1.2) < 1.0) return false;
  if (space.boxGapTo(s.aisle, 0.2) < 0.05) return false;
  return true;
}

function placeWallCounters(ctx: Ctx): boolean {
  const need = ctx.plan.counters - ctx.counters.length;
  if (need <= 0) return true;
  const area = (z: ZoneInfo) => z.rect.w * z.rect.d;
  const order = ctx.zones
    .filter((z) => z.kind !== 'vip')
    .sort((a, b) => Number(b.main) - Number(a.main) || Number(a.outdoor) - Number(b.outdoor) || area(b) - area(a));
  let placed = 0;
  for (let round = 0; round < 12 && placed < need; round++) {
    let progress = false;
    for (const z of order) {
      if (placed >= need) break;
      // les petites zones secondaires n'accueillent qu'un comptoir par tour, et pas avant le 2e tour si dehors
      if (z.outdoor && round === 0 && order.length > 1 && need < order.length) continue;
      const slots = wallSlots(ctx, z).filter((s) => slotValid(ctx, s));
      if (!slots.length) continue;
      let best: Slot | null = null;
      let bestScore = -Infinity;
      for (const s of slots) {
        let dmin = 12;
        for (const c of ctx.counters) dmin = Math.min(dmin, dist(c.x, c.z, (s.b.minX + s.b.maxX) / 2, (s.b.minZ + s.b.maxZ) / 2));
        const score = -s.pri * 2.5 + dmin * 0.6 - Math.abs(s.along - 0.5) * 1.5 + ctx.rng.next() * 0.8;
        if (score > bestScore) {
          bestScore = score;
          best = s;
        }
      }
      if (!best) continue;
      const b = best.b;
      const ci = ctx.space.addCollider({ shape: 'box', ...b, solid: 'furniture' });
      addKeep(ctx, best.aisle, 'aisle');
      ctx.counters.push({
        x: (b.minX + b.maxX) / 2,
        z: (b.minZ + b.maxZ) / 2,
        w: b.maxX - b.minX,
        d: b.maxZ - b.minZ,
        rot: best.rot,
        front: best.front,
        island: false,
        zone: z.id,
        collider: ci,
      });
      ctx.targets.push({ pts: [best.front], all: true, label: 'comptoir' });
      placed++;
      progress = true;
    }
    if (!progress) break;
  }
  return placed >= need;
}

// ─────────────────────────────────────────── Guéridons (cloches mystère)

function placePedestals(ctx: Ctx): boolean {
  const n = ctx.plan.pedestals;
  if (n <= 0) return true;
  const { space } = ctx;
  const cands: Vec2[] = [...ctx.spare];
  const fine: Vec2[] = [];
  for (let z = 0; z < ctx.D; z++)
    for (let x = 0; x < ctx.W; x++) {
      const zid = space.zoneAt(x, z);
      if (!space.floorAt(x, z) || zid < 0 || ctx.zones[zid]?.kind === 'vip') continue;
      cands.push({ x: x + 0.5, z: z + 0.5 });
      fine.push({ x: x + 1, z: z + 0.5 }, { x: x + 0.5, z: z + 1 }, { x: x + 1, z: z + 1 });
    }
  const ok = (p: Vec2) => {
    const col: Collider = { shape: 'circle', x: p.x, z: p.z, r: 0.32, solid: 'furniture' };
    if (!space.circleClearOfWalls(p.x, p.z, 0.9)) return false;
    if (space.gapTo(col, 1.5) < 0.8) return false;
    if (hitsKeep(ctx, expand(boxOf(col), 0.1))) return false;
    return true;
  };
  const avoid: Vec2[] = [ctx.playerStart, ...ctx.counters.map((c) => c.front)];
  interface PC {
    p: Vec2;
    d: number; // distance au guéridon le plus proche
    base: number; // bonus d'éloignement de l'entrée et des comptoirs
  }
  const mk = (p: Vec2): PC => {
    let da = 30;
    for (const q of avoid) da = Math.min(da, dist(p.x, p.z, q.x, q.z));
    return { p, d: 30, base: Math.min(da, 4) * 0.5 + ctx.rng.next() * 0.3 };
  };
  const pool: PC[] = cands.filter(ok).map(mk);
  let tries = 0;
  let refined = false;
  while (ctx.pedestals.length < n && tries++ < 200) {
    if (!pool.length) {
      // second passage : positions à la demi-case
      if (refined) break;
      refined = true;
      for (const p of fine.filter(ok)) {
        const c = mk(p);
        for (const q of ctx.pedestals) c.d = Math.min(c.d, dist(p.x, p.z, q.x, q.z));
        pool.push(c);
      }
      continue;
    }
    let bi = 0;
    let bs = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const s = pool[i].d + pool[i].base;
      if (s > bs) {
        bs = s;
        bi = i;
      }
    }
    const p = pool.splice(bi, 1)[0].p;
    if (!ok(p)) continue;
    const id = ctx.pedestals.length;
    space.addCollider({ shape: 'circle', x: p.x, z: p.z, r: 0.32, solid: 'furniture', ref: `pedestal:${id}` });
    const R = 0.32 + AGENT_R + 0.15;
    const t = {
      pts: [
        { x: p.x + R, z: p.z },
        { x: p.x - R, z: p.z },
        { x: p.x, z: p.z + R },
        { x: p.x, z: p.z - R },
      ],
      all: false,
      label: `guéridon ${id}`,
    };
    ctx.targets.push(t);
    if (!reachOk(ctx, boxOf({ shape: 'circle', x: p.x, z: p.z, r: 0.32, solid: 'furniture' })))  {
      ctx.targets.pop();
      space.popCollider();
      continue;
    }
    ctx.pedestals.push({ id, x: p.x, z: p.z });
    for (const c of pool) c.d = Math.min(c.d, dist(c.p.x, c.p.z, p.x, p.z));
  }
  return ctx.pedestals.length === n;
}

// ─────────────────────────────────────────── Finalisation

function countFloor(ctx: Ctx): number {
  let n = 0;
  for (let i = 0; i < ctx.shell.cells.length; i++) if (ctx.shell.cells[i] === CELL.FLOOR) n++;
  return n;
}

const DUP_PREF: StationKind[] = ['bar', 'croffle', 'brioche', 'tiramisu', 'sale'];

function assignStations(ctx: Ctx): CounterSpec[] {
  const { plan } = ctx;
  const drafts = ctx.counters;
  const S = plan.stations;
  const C = drafts.length;
  const station: (StationKind | null)[] = drafts.map(() => null);
  const extra: StationKind[][] = drafts.map(() => []);
  for (let i = 0; i < Math.min(C, S.length); i++) station[i] = S[i];
  if (C < S.length) {
    for (let j = 0; j < S.length - C; j++) extra[j % C].push(S[C + j]);
  } else if (C > S.length) {
    const pref = DUP_PREF.filter((s) => S.includes(s));
    for (let j = 0; j < C - S.length; j++) {
      const st = pref[j % pref.length];
      // le poste dupliqué va au comptoir libre le plus éloigné de ses jumeaux
      let bi = -1;
      let bd = -1;
      for (let i = 0; i < C; i++) {
        if (station[i]) continue;
        let d = 99;
        for (let k = 0; k < C; k++) if (station[k] === st) d = Math.min(d, dist(drafts[i].x, drafts[i].z, drafts[k].x, drafts[k].z));
        if (d > bd) {
          bd = d;
          bi = i;
        }
      }
      if (bi >= 0) station[bi] = st;
    }
  }
  // ordre final : postes principaux dans l'ordre du plan, puis doublons (par poste)
  const prim = drafts.map((_, i) => i).filter((i) => i < S.length);
  const dups = drafts
    .map((_, i) => i)
    .filter((i) => i >= S.length)
    .sort((a, b) => S.indexOf(station[a]!) - S.indexOf(station[b]!) || a - b);
  const order = [...prim, ...dups];
  return order.map((i, id) => {
    const d = drafts[i];
    const st = station[i] ?? S[0];
    const dishes: DishId[] = [];
    for (const s of [st, ...extra[i]]) for (const dish of dishesOfStation(s, plan.dishes)) if (!dishes.includes(dish)) dishes.push(dish);
    const col = ctx.space.colliders[d.collider];
    col.ref = `counter:${id}`;
    return { id, x: d.x, z: d.z, w: d.w, d: d.d, rot: d.rot, station: st, dishes, front: d.front, island: d.island };
  });
}

function spawnPoints(ctx: Ctx, reached: Uint8Array): Vec2[] {
  const { space } = ctx;
  const cands: Vec2[] = [];
  let walkCount = 0;
  for (let z = 0; z < ctx.D; z++)
    for (let x = 0; x < ctx.W; x++) {
      if (!reached[z * ctx.W + x]) continue;
      walkCount++;
      const p = { x: x + 0.5, z: z + 0.5 };
      if (!space.circleFree(p.x, p.z, 0.55)) continue;
      if (hitsKeep(ctx, boxAround(p.x, p.z, 0.3, 0.3), ['landing', 'lane', 'island', 'fountain', 'estrade'])) continue;
      if (dist(p.x, p.z, ctx.playerStart.x, ctx.playerStart.z) < 3) continue;
      cands.push(p);
    }
  const k = Math.max(8, Math.min(16, Math.round(walkCount / 25)));
  return pickSpread(cands, Math.min(k, cands.length), ctx.playerStart).slice(0, k);
}

function finish(ctx: Ctx): BuildResult {
  const { plan, space, zones } = ctx;
  const reached = space.bfs(ctx.playerStart.x, ctx.playerStart.z);
  for (let i = 0; i < ctx.tables.length; i++) {
    const t = ctx.tables[i];
    // les côtés droits d'abord (+Z, face caméra, en tête), puis les diagonales des tables rondes ; 4 au plus
    const cands = ctx.tableSpots[i].map((p, k) => ({ p, k: t.shape === 'round' ? (k % 2) * 8 + k : k }));
    const spots = cands.filter((c) => space.pointReached(c.p.x, c.p.z, reached)).sort((a, b) => a.k - b.k);
    if (!spots.length) return fail(`table ${i} inaccessible`, ctx);
    t.serviceSpots = spots.slice(0, 4).map(({ p }) => ({ x: round3(p.x), z: round3(p.z) }));
  }
  const counters = assignStations(ctx);
  const used = new Set<string>();
  const nrng = ctx.rng.fork(77);
  const specs: ZoneSpec[] = zones.map((z) => ({
    id: z.id,
    kind: z.kind,
    rect: { ...z.rect },
    floor: zoneFloor(z.kind, z.main, plan.biome, nrng),
    raised: z.kind === 'vip' ? 0.18 : 0,
    name: zoneName(z.kind, z.main, plan.biome, nrng, used),
  }));
  const island = counters.find((c) => c.island);
  const main = island ?? counters[0];
  const layout: SalonLayout = {
    level: plan.level,
    seed: ctx.seed,
    biome: plan.biome,
    width: ctx.W,
    depth: ctx.D,
    cells: ctx.shell.cells,
    zoneOf: ctx.shell.zoneOf,
    zones: specs,
    tables: ctx.tables,
    counters,
    pedestals: ctx.pedestals,
    decor: ctx.decor,
    colliders: space.colliders.map((c) => ({ ...c })),
    royalBell: ctx.bell,
    entrance: ctx.entrance,
    playerStart: ctx.playerStart,
    tideOrigin: main ? { x: main.x, z: main.z } : { ...ctx.playerStart },
    lanes: ctx.lanes,
    spawnPoints: spawnPoints(ctx, reached),
    walk: space.walk,
  };
  const errors = validateLayout(layout, plan);
  return { layout: errors.length ? null : layout, errors, ctx };
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
