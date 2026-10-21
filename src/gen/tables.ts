/**
 * Tables : un réseau régulier par zone (allées ≥ 1,4 alignées sur la grille de marche), puis un bloc compact
 * de places choisi près du centre ; tables VIP sur l'estrade. Chaises, collisions et points de service candidats.
 */
import type { Collider, Quarter, TableShape, TableSpec, Vec2 } from '../types';
import { type Ctx, type ZoneInfo, hitsKeep, inZoneFloor } from './ctx';
import { boxOf, dist, expand } from './geom';
import { AGENT_R } from './space';

// ─────────────────────────────────────────── Tables

type TStyleId = 'round10' | 'round12' | 'square2' | 'square4' | 'rect4' | 'rect6';

interface TStyle {
  id: TStyleId;
  shape: TableShape;
  rot: Quarter;
  tw: number; // plateau, avant rotation (comme TableSpec.w / d) : le rect fait toujours 1,8 × 0,9
  td: number;
  fx: number; // emprise de la collision (chaises comprises)
  fz: number;
}

function tstyle(id: TStyleId, rot: Quarter): TStyle {
  switch (id) {
    case 'round10':
      return { id, shape: 'round', rot: 0, tw: 1, td: 1, fx: 1.9, fz: 1.9 };
    case 'round12':
      return { id, shape: 'round', rot: 0, tw: 1.2, td: 1.2, fx: 2.1, fz: 2.1 };
    case 'square2':
      return rot === 1 ? { id, shape: 'square', rot: 1, tw: 1, td: 1, fx: 1, fz: 1.9 } : { id, shape: 'square', rot: 0, tw: 1, td: 1, fx: 1.9, fz: 1 };
    case 'square4':
      return { id, shape: 'square', rot: 0, tw: 1, td: 1, fx: 1.9, fz: 1.9 };
    case 'rect4':
      return rot === 1 ? { id, shape: 'rect', rot: 1, tw: 1.8, td: 0.9, fx: 1.8, fz: 1.8 } : { id, shape: 'rect', rot: 0, tw: 1.8, td: 0.9, fx: 1.8, fz: 1.8 };
    case 'rect6':
      return rot === 1 ? { id, shape: 'rect', rot: 1, tw: 1.8, td: 0.9, fx: 1.8, fz: 2.7 } : { id, shape: 'rect', rot: 0, tw: 1.8, td: 0.9, fx: 2.7, fz: 1.8 };
  }
}

function styleFor(ctx: Ctx, z: ZoneInfo): TStyle {
  const r = ctx.rng;
  const longRot: Quarter = z.rect.w >= z.rect.d ? 0 : 1;
  switch (z.style) {
    case 'boudoir':
      return tstyle(r.weighted<TStyleId>(['round10', 'square2', 'square4'], [5, 2, 2]), longRot);
    case 'jardin':
      return tstyle(r.weighted<TStyleId>(['round10', 'square4'], [6, 2]), 0);
    case 'terrasse':
      return tstyle(r.weighted<TStyleId>(['round10', 'square4', 'square2'], [5, 3, 1]), longRot);
    case 'galerie':
      return z.kind === 'galerie' || r.chance(0.6)
        ? tstyle(r.weighted<TStyleId>(['rect6', 'rect4'], [3, 2]), longRot)
        : tstyle('round10', 0);
    case 'vip':
      return tstyle('round12', 0);
  }
}

/** Pas d'un réseau de tables : allée ≥ 1,4 contenant une ligne de centres de cases dégagée (grille de marche). */
function pitchFor(f: number): { p: number; par: number[] } {
  const gapOk = (c: number, p: number) => {
    const lo = c + f / 2 + AGENT_R;
    const hi = c + p - f / 2 - AGENT_R;
    for (let h = Math.ceil(lo - 0.5 - 1e-9) + 0.5; h <= hi + 1e-9; h += 1) if (h >= lo - 1e-9) return true;
    return false;
  };
  for (let p = Math.ceil((f + 1.4) * 2 - 1e-9) / 2; p <= f + 3; p += 0.5) {
    const par = [0, 0.5].filter((o) => gapOk(o, p) && gapOk(o + p, p));
    if (par.length) return { p, par };
  }
  return { p: Math.ceil((f + 2) * 2) / 2, par: [0, 0.5] };
}

function tableCollider(st: TStyle, x: number, z: number): Collider {
  if (st.shape === 'round') return { shape: 'circle', x, z, r: st.fx / 2, solid: 'furniture' };
  return { shape: 'box', minX: x - st.fx / 2, minZ: z - st.fz / 2, maxX: x + st.fx / 2, maxZ: z + st.fz / 2, solid: 'furniture' };
}

const frac = (v: number) => {
  const f = v - Math.floor(v);
  return Math.abs(f - 0.5) < 1e-6 ? 0.5 : f < 1e-6 || f > 1 - 1e-6 ? 0 : f;
};

/** Réseau régulier de positions valides le plus fourni pour ce style dans la zone. */
function bestLattice(ctx: Ctx, z: ZoneInfo, st: TStyle, valid: (x: number, zz: number) => boolean): Vec2[] {
  const px = pitchFor(st.fx);
  const pz = pitchFor(st.fz);
  const R = z.rect;
  let best: Vec2[] = [];
  let bestScore = -1;
  const cx = R.x + R.w / 2;
  const cz = R.z + R.d / 2;
  for (let ox = R.x; ox < R.x + px.p; ox += 0.5) {
    if (!px.par.includes(frac(ox))) continue;
    for (let oz = R.z; oz < R.z + pz.p; oz += 0.5) {
      if (!pz.par.includes(frac(oz))) continue;
      const pts: Vec2[] = [];
      let sx = 0;
      let sz = 0;
      for (let x = ox; x <= R.x + R.w; x += px.p)
        for (let zz = oz; zz <= R.z + R.d; zz += pz.p)
          if (valid(x, zz)) {
            pts.push({ x, z: zz });
            sx += x;
            sz += zz;
          }
      if (!pts.length) continue;
      // le plus de places, puis le mieux centré dans la zone
      const off = Math.hypot(sx / pts.length - cx, sz / pts.length - cz);
      const score = pts.length * 10 - off + ctx.rng.next() * 0.8;
      if (score > bestScore) {
        bestScore = score;
        best = pts;
      }
    }
  }
  return best;
}

function tableValidFn(ctx: Ctx, z: ZoneInfo, st: TStyle, vip: boolean): (x: number, zz: number) => boolean {
  const E = z.rect;
  return (x, zz) => {
    const col = tableCollider(st, x, zz);
    const b = boxOf(col);
    // tests du moins cher au plus cher
    if (b.minX < E.x - 1e-6 || b.maxX > E.x + E.w + 1e-6 || b.minZ < E.z - 1e-6 || b.maxZ > E.z + E.d + 1e-6) return false;
    if (hitsKeep(ctx, b, vip ? ['estrade'] : [])) return false;
    if (!inZoneFloor(ctx, b, z.id)) return false;
    if (!ctx.space.boxOnFloor(expand(b, 0.9))) return false;
    if (ctx.space.gapTo(col, 1.5) < 1.4) return false;
    return true;
  };
}

/**
 * Choix d'un bloc rectangulaire compact du réseau (rangées propres) contenant `n` places,
 * proche du centre de la zone et de ses proportions ; repli : choix étalé.
 */
function pickBlock(ctx: Ctx, pts: Vec2[], n: number, z: ZoneInfo): Vec2[] {
  if (n <= 0) return [];
  if (n >= pts.length) return [...pts];
  const xs = [...new Set(pts.map((p) => p.x))].sort((a, b) => a - b);
  const zs = [...new Set(pts.map((p) => p.z))].sort((a, b) => a - b);
  const NX = xs.length;
  const NZ = zs.length;
  const grid = new Uint8Array(NX * NZ);
  for (const p of pts) grid[zs.indexOf(p.z) * NX + xs.indexOf(p.x)] = 1;
  // sommes cumulées pour compter les places d'un bloc en O(1)
  const S = new Int32Array((NX + 1) * (NZ + 1));
  for (let j = 0; j < NZ; j++)
    for (let i = 0; i < NX; i++) S[(j + 1) * (NX + 1) + i + 1] = grid[j * NX + i] + S[j * (NX + 1) + i + 1] + S[(j + 1) * (NX + 1) + i] - S[j * (NX + 1) + i];
  const count = (i0: number, j0: number, ni: number, nj: number) =>
    S[(j0 + nj) * (NX + 1) + i0 + ni] - S[j0 * (NX + 1) + i0 + ni] - S[(j0 + nj) * (NX + 1) + i0] + S[j0 * (NX + 1) + i0];
  const cx = z.rect.x + z.rect.w / 2 + (ctx.rng.next() - 0.5) * z.rect.w * 0.2;
  const cz = z.rect.z + z.rect.d / 2 + (ctx.rng.next() - 0.5) * z.rect.d * 0.2;
  const aspect = z.rect.w / z.rect.d;
  let best: { i0: number; j0: number; ni: number; nj: number; score: number } | null = null;
  for (let ni = 1; ni <= NX; ni++)
    for (let nj = 1; nj <= NZ; nj++) {
      if (ni * nj < n || ni * nj > n * 2 + 2) continue;
      for (let i0 = 0; i0 + ni <= NX; i0++)
        for (let j0 = 0; j0 + nj <= NZ; j0++) {
          const c = count(i0, j0, ni, nj);
          if (c < n) continue;
          const bx = (xs[i0] + xs[i0 + ni - 1]) / 2;
          const bz = (zs[j0] + zs[j0 + nj - 1]) / 2;
          const holes = ni * nj - c;
          const score =
            -holes * 2.5 - (c - n) * 1.5 - Math.hypot(bx - cx, bz - cz) * 0.35 - Math.abs(Math.log(((xs[i0 + ni - 1] - xs[i0] + 2) / (zs[j0 + nj - 1] - zs[j0] + 2)) / aspect)) * 1.2;
          if (!best || score > best.score) best = { i0, j0, ni, nj, score };
        }
    }
  if (!best) return pickSpread(pts, n, { x: z.rect.x + z.rect.w / 2, z: z.rect.z + z.rect.d / 2 });
  const { i0, j0, ni, nj } = best;
  const bx = (xs[i0] + xs[i0 + ni - 1]) / 2;
  const bz = (zs[j0] + zs[j0 + nj - 1]) / 2;
  const inBlock = pts.filter((p) => {
    const i = xs.indexOf(p.x);
    const j = zs.indexOf(p.z);
    return i >= i0 && i < i0 + ni && j >= j0 && j < j0 + nj;
  });
  // places en trop : on retire les plus excentrées (le bloc reste symétrique autant que possible)
  inBlock.sort((a, b) => dist(a.x, a.z, bx, bz) - dist(b.x, b.z, bx, bz) || a.z - b.z || a.x - b.x);
  return inBlock.slice(0, n);
}

/** Choix étalé (le plus éloigné des déjà choisis), en partant du point le plus proche de `from`. */
export function pickSpread(pts: Vec2[], n: number, from: Vec2): Vec2[] {
  if (n <= 0) return [];
  if (n >= pts.length) return [...pts];
  let first = 0;
  let fd = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = dist(pts[i].x, pts[i].z, from.x, from.z);
    if (d < fd - 1e-9) {
      fd = d;
      first = i;
    }
  }
  const out = [pts[first]];
  const md = new Float64Array(pts.length).fill(Infinity);
  const used = new Uint8Array(pts.length);
  used[first] = 1;
  let last = pts[first];
  while (out.length < n) {
    let bi = -1;
    let bd = -1;
    for (let i = 0; i < pts.length; i++) {
      if (used[i]) continue;
      const d = Math.min(md[i], dist(pts[i].x, pts[i].z, last.x, last.z));
      md[i] = d;
      if (d > bd + 1e-9) {
        bd = d;
        bi = i;
      }
    }
    if (bi < 0) break;
    used[bi] = 1;
    last = pts[bi];
    out.push(last);
  }
  return out;
}

function addTable(ctx: Ctx, st: TStyle, x: number, z: number, vip: boolean, zone: number): void {
  const r = ctx.rng;
  const id = ctx.tables.length;
  const seats: TableSpec['seats'] = [];
  const seat = (sx: number, sz: number) => seats.push({ x: x + sx, z: z + sz, angle: Math.atan2(-sx, -sz) });
  if (st.shape === 'round') {
    const n = st.id === 'round12' ? r.int(5, 6) : r.weighted([2, 3, 4], [2, 2, 3]);
    const rad = st.tw / 2 + 0.25;
    const a0 = n === 2 ? r.pick([0, Math.PI / 2]) : n === 4 ? r.pick([0, Math.PI / 4]) : r.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    for (let k = 0; k < n; k++) {
      const a = a0 + (k * Math.PI * 2) / n;
      seat(Math.sin(a) * rad, Math.cos(a) * rad);
    }
  } else if (st.id === 'square2') {
    if (st.rot === 1) {
      seat(0, -0.75);
      seat(0, 0.75);
    } else {
      seat(-0.75, 0);
      seat(0.75, 0);
    }
  } else if (st.id === 'square4') {
    seat(-0.75, 0);
    seat(0.75, 0);
    seat(0, -0.75);
    seat(0, 0.75);
  } else {
    const long = st.rot === 1;
    for (const s of [-0.45, 0.45])
      for (const side of [-0.7, 0.7]) {
        if (long) seat(side, s);
        else seat(s, side);
      }
    if (st.id === 'rect6') {
      if (long) {
        seat(0, -1.15);
        seat(0, 1.15);
      } else {
        seat(-1.15, 0);
        seat(1.15, 0);
      }
    }
  }
  const col = tableCollider(st, x, z);
  col.ref = `table:${id}`;
  ctx.space.addCollider(col);
  // points de service candidats (filtrés à la fin selon l'accessibilité)
  const spots: Vec2[] = [];
  const m = 0.5;
  if (st.shape === 'round') {
    const R = st.fx / 2 + m;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      spots.push({ x: x + Math.sin(a) * R, z: z + Math.cos(a) * R });
    }
  } else {
    spots.push({ x, z: z + st.fz / 2 + m }, { x: x + st.fx / 2 + m, z }, { x, z: z - st.fz / 2 - m }, { x: x - st.fx / 2 - m, z });
  }
  ctx.tables.push({
    id,
    x,
    z,
    shape: st.shape,
    w: st.tw,
    d: st.td,
    rot: st.rot,
    seats,
    vip,
    zone,
    serviceSpots: [],
  });
  ctx.tableSpots.push(spots);
  ctx.targets.push({ pts: spots, all: false, label: `table ${id}` });
}

export function placeTables(ctx: Ctx): boolean {
  const { plan } = ctx;
  // 1) tables VIP sur l'estrade
  if (plan.vipTables > 0) {
    const vz = ctx.zones.find((z) => z.kind === 'vip');
    if (!vz) return false;
    const st = tstyle('round12', 0);
    const pts = bestLattice(ctx, vz, st, tableValidFn(ctx, vz, st, true));
    if (pts.length < plan.vipTables) return false;
    const chosen = pickSpread(pts, plan.vipTables, { x: vz.rect.x + vz.rect.w / 2, z: vz.rect.z + vz.rect.d / 2 });
    for (const p of chosen) addTable(ctx, st, p.x, p.z, true, vz.id);
  }
  // 2) tables ordinaires : un réseau par zone
  const need = plan.tables - plan.vipTables;
  const zs = ctx.zones.filter((z) => z.kind !== 'vip');
  const styles = zs.map((z) => styleFor(ctx, z));
  const lats = zs.map((z, i) => bestLattice(ctx, z, styles[i], tableValidFn(ctx, z, styles[i], false)));
  let cap = lats.reduce((s, l) => s + l.length, 0);
  if (cap < need) {
    // densifier : petites tables carrées à deux couverts
    for (let i = 0; i < zs.length && cap < need; i++) {
      const z = zs[i];
      const dense = tstyle('square2', z.rect.w >= z.rect.d ? 1 : 0);
      const l = bestLattice(ctx, z, dense, tableValidFn(ctx, z, dense, false));
      if (l.length > lats[i].length) {
        cap += l.length - lats[i].length;
        lats[i] = l;
        styles[i] = dense;
      }
    }
  }
  if (cap < need) return false;
  const factor = (z: ZoneInfo) => (z.main ? 1.15 : z.kind === 'galerie' ? 0.8 : z.kind === 'boudoir' ? 0.9 : 1);
  const caps = lats.map((l) => l.length);
  const wts = zs.map((z, i) => caps[i] * factor(z));
  const wsum = wts.reduce((s, w) => s + w, 0) || 1;
  const quota = zs.map((_, i) => Math.min(caps[i], Math.floor((need * wts[i]) / wsum)));
  let assigned = quota.reduce((s, q) => s + q, 0);
  // au moins une table par zone (si possible), puis le reste au plus grand reliquat
  for (let i = 0; i < zs.length && assigned < need; i++)
    if (quota[i] === 0 && caps[i] > 0) {
      quota[i] = 1;
      assigned++;
    }
  while (assigned < need) {
    let bi = -1;
    let bv = -Infinity;
    for (let i = 0; i < zs.length; i++) {
      if (quota[i] >= caps[i]) continue;
      const v = (need * wts[i]) / wsum - quota[i];
      if (v > bv) {
        bv = v;
        bi = i;
      }
    }
    if (bi < 0) return false;
    quota[bi]++;
    assigned++;
  }
  lats.forEach((l, i) => {
    const z = zs[i];
    const chosen = pickBlock(ctx, l, quota[i], z);
    for (const p of chosen) addTable(ctx, styles[i], p.x, p.z, false, z.id);
    for (const p of l) if (!chosen.includes(p)) ctx.spare.push(p);
  });
  return ctx.tables.length === plan.tables;
}
