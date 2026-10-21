/**
 * Couloirs rectilignes dégagés (serveurs débordés, chariots, cortèges) : à travers les ouvertures entre zones,
 * allées centrales des grandes zones, ou le long d'un mur dans les petites salles ; complétés après les tables.
 */
import type { Lane, Vec2 } from '../types';
import { type Ctx, type KeepTag, type ZoneInfo, addKeep, hitsKeep, solidCell } from './ctx';
import { type Box, box } from './geom';

// ─────────────────────────────────────────── Couloirs (serveurs, chariots, cortèges)

function laneBox(axis: 'x' | 'z', c: number, t0: number, t1: number, half: number): Box {
  return axis === 'x' ? box(t0, c - half, t1, c + half) : box(c - half, t0, c + half, t1);
}

/** Plages de cases consécutives [s, e) où la tranche du couloir (ligne c, demi-largeur half) est libre. */
function laneRuns(
  ctx: Ctx,
  axis: 'x' | 'z',
  c: number,
  from: number,
  to: number,
  half: number,
  ignore: KeepTag[],
  hug: -1 | 0 | 1 = 0,
): [number, number][] {
  const out: [number, number][] = [];
  // rangée de murs longée (hug = −1 : côté des petites coordonnées, +1 : côté des grandes)
  const wallRow = hug < 0 ? Math.round(c - half) - 1 : Math.round(c + half);
  let s = -1;
  for (let t = from; t <= to; t++) {
    let ok = false;
    if (t < to) {
      const b = laneBox(axis, c, t, t + 1, half);
      // condition nécessaire et bon marché : la case sous la ligne est praticable
      const ci = axis === 'x' ? Math.floor(c) * ctx.W + t : t * ctx.W + Math.floor(c);
      ok =
        ctx.space.walk[ci] === 1 &&
        (hug === 0 || (axis === 'x' ? solidCell(ctx, t, wallRow) : solidCell(ctx, wallRow, t))) &&
        ctx.space.boxOnFloor(b) &&
        !hitsKeep(ctx, b, ignore) &&
        ctx.space.boxGapTo(b, 0.3) > 1e-6;
    }
    if (ok && s < 0) s = t;
    if (!ok && s >= 0) {
      out.push([s, t]);
      s = -1;
    }
  }
  return out;
}

function laneConflicts(ctx: Ctx, axis: 'x' | 'z', c: number, s: number, e: number): boolean {
  for (const l of ctx.lanes) {
    const la: 'x' | 'z' = l.a.z === l.b.z ? 'x' : 'z';
    if (la !== axis) continue;
    const lc = axis === 'x' ? l.a.z : l.a.x;
    const l0 = axis === 'x' ? Math.min(l.a.x, l.b.x) : Math.min(l.a.z, l.b.z);
    const l1 = axis === 'x' ? Math.max(l.a.x, l.b.x) : Math.max(l.a.z, l.b.z);
    if (Math.abs(lc - c) < 2.5 && l0 < e && s < l1) return true;
  }
  return false;
}

function addLane(ctx: Ctx, axis: 'x' | 'z', c: number, s: number, e: number, half: number): void {
  const a = s + 0.5;
  const b = e - 0.5;
  const lane: Lane =
    axis === 'x' ? { a: { x: a, z: c }, b: { x: b, z: c }, width: half * 2 } : { a: { x: c, z: a }, b: { x: c, z: b }, width: half * 2 };
  ctx.lanes.push(lane);
  addKeep(ctx, laneBox(axis, c, s, e, half), 'lane');
  const pts: Vec2[] = [];
  for (let t = s; t < e; t++) pts.push(axis === 'x' ? { x: t + 0.5, z: c } : { x: c, z: t + 0.5 });
  ctx.targets.push({ pts, all: true, label: 'couloir' });
}

/** Le couloir passerait sur le point de départ du joueur. */
function nearStart(ctx: Ctx, axis: 'x' | 'z', c: number, s: number, e: number, half: number): boolean {
  const p = ctx.playerStart;
  const pc = axis === 'x' ? p.z : p.x;
  const pt = axis === 'x' ? p.x : p.z;
  return Math.abs(pc - c) < half + 0.3 && pt > s - 0.5 && pt < e + 0.5;
}

interface LaneCand {
  axis: 'x' | 'z';
  c: number;
  s: number;
  e: number;
  half: number;
  score: number;
}

/** Lignes candidates : centres de cases (±0,7 ou ±0,6) et lignes longeant un mur (±0,6, collées à la paroi). */
function laneLines(k: number): { c: number; half: number; hug: -1 | 0 | 1 }[] {
  return [
    { c: k + 0.5, half: 0.7, hug: 0 },
    { c: k + 0.5, half: 0.6, hug: 0 },
    { c: k + 0.6, half: 0.6, hug: -1 },
    { c: k + 0.4, half: 0.6, hug: 1 },
  ];
}

const LANE_PASSES: KeepTag[][] = [
  ['landing', 'lane'],
  ['landing', 'lane', 'aisle', 'entrance'],
];

export function primaryLanes(ctx: Ctx, target: number): void {
  // 1) à travers les ouvertures entre zones (dans les paliers, déjà libres), sur 5 cases de part et d'autre au plus
  for (const op of ctx.shell.openings) {
    if (ctx.lanes.length >= target) break;
    let t: number;
    let half: number;
    if (op.colonnade) {
      t = op.start + 3 * Math.floor(op.columns.length / 2) + 1;
      half = 0.6;
    } else {
      if (op.len < 3) continue;
      t = op.start + Math.floor((op.len - 1) / 2);
      half = 0.7;
    }
    const roomy = (z: ZoneInfo) => Math.min(z.rect.w, z.rect.d) >= 8;
    if (!roomy(ctx.zones[op.a]) || !roomy(ctx.zones[op.b])) continue;
    const c = t + 0.5;
    const along = op.axis;
    const max = along === 'x' ? ctx.W : ctx.D;
    for (const ignore of LANE_PASSES) {
      const run = laneRuns(ctx, along, c, Math.max(0, op.line - 4), Math.min(max, op.line + 5), half, ignore).find(
        ([s, e]) => s <= op.line && op.line < e,
      );
      if (!run || run[1] - run[0] < 6 || laneConflicts(ctx, along, c, run[0], run[1]) || nearStart(ctx, along, c, run[0], run[1], half)) continue;
      addLane(ctx, along, c, run[0], run[1], half);
      break;
    }
  }
  // 2) allée centrale des grandes zones (le salon principal d'abord)
  for (const z of ctx.zones) {
    if (ctx.lanes.length >= target) break;
    if (z.kind === 'vip' || Math.min(z.rect.w, z.rect.d) < 12) continue;
    const best = zoneLaneCands(ctx, z, false)[0];
    if (best) addLane(ctx, best.axis, best.c, best.s, best.e, best.half);
  }
  // 3) petite salle : un couloir qui longe un mur (coûte peu de place aux tables)
  if (ctx.lanes.length === 0) {
    const best = zoneLaneCands(ctx, ctx.zones[0], true)[0];
    if (best) addLane(ctx, best.axis, best.c, best.s, best.e, best.half);
  }
}

/** Couloirs candidats d'une zone, du meilleur au moins bon. `hugOnly` : seulement le long des murs. */
function zoneLaneCands(ctx: Ctx, z: ZoneInfo, hugOnly: boolean): LaneCand[] {
  const R = z.rect;
  const out: LaneCand[] = [];
  for (const ignore of LANE_PASSES) {
    for (const axis of ['x', 'z'] as const) {
      const t0 = axis === 'x' ? R.x : R.z;
      const t1 = axis === 'x' ? R.x + R.w : R.z + R.d;
      const c0 = axis === 'x' ? R.z : R.x;
      const span = axis === 'x' ? R.d : R.w;
      const len = t1 - t0;
      const mid = c0 + span / 2;
      const longAxis = (axis === 'x') === R.w >= R.d;
      for (let k = c0; k < c0 + span; k++)
        for (const ln of laneLines(k)) {
          if (hugOnly !== (ln.hug !== 0)) continue;
          for (const [s, e] of laneRuns(ctx, axis, ln.c, t0, t1, ln.half, ignore, ln.hug)) {
            if (e - s < Math.max(6, Math.round(len * 0.5))) continue;
            if (laneConflicts(ctx, axis, ln.c, s, e) || nearStart(ctx, axis, ln.c, s, e, ln.half)) continue;
            // le long d'un mur : de préférence les murs « de devant » (x max, z max), restés libres
            const front = ln.hug > 0 ? 1.5 : 0;
            const score = hugOnly
              ? e - s + (longAxis ? 2 : 0) + front + ctx.rng.next() * 0.5
              : e - s - Math.abs(ln.c - mid) * 0.8 + (longAxis ? 3 : 0) + ln.half + ctx.rng.next() * 0.5;
            out.push({ axis, c: ln.c, s, e, half: ln.half, score });
          }
        }
    }
    if (out.length) break;
  }
  return out.sort((a, b) => b.score - a.score);
}

export function secondaryLanes(ctx: Ctx, target: number): void {
  if (ctx.lanes.length >= target) return;
  for (const ignore of LANE_PASSES) {
    const cands: LaneCand[] = [];
    for (const axis of ['x', 'z'] as const) {
      const across = axis === 'x' ? ctx.D : ctx.W;
      const max = axis === 'x' ? ctx.W : ctx.D;
      for (let k = 0; k < across; k++)
        for (const ln of laneLines(k))
          for (const [s, e] of laneRuns(ctx, axis, ln.c, 0, max, ln.half, ignore, ln.hug))
            if (e - s >= 6) cands.push({ axis, c: ln.c, s, e, half: ln.half, score: e - s + ln.half * 2 + (ln.hug ? 0 : 0.5) });
    }
    cands.sort((a, b) => b.score - a.score || a.c - b.c);
    for (const c of cands) {
      if (ctx.lanes.length >= target) return;
      if (laneConflicts(ctx, c.axis, c.c, c.s, c.e) || nearStart(ctx, c.axis, c.c, c.s, c.e, c.half)) continue;
      if (hitsKeep(ctx, laneBox(c.axis, c.c, c.s, c.e, c.half), ignore.filter((t) => t !== 'lane'))) continue;
      addLane(ctx, c.axis, c.c, c.s, c.e, c.half);
    }
    if (ctx.lanes.length > 0) return;
  }
}
