/**
 * Enveloppe du salon : découpage du rectangle englobant en zones rectangulaires adjacentes
 * (bandes, L, T, U…), murs pleins / balustrades / verrières, et larges ouvertures entre zones.
 * « Zéro labyrinthe » : chaque zone touche ses voisines par une ouverture de 3 à 6 cases ou une colonnade.
 */
import type { Rng } from '../core/rng';
import type { CellKind, ZoneKind } from '../types';
import { CELL } from '../types';

/** Rectangle de sol (cases) d'une zone. */
export interface Piece {
  kind: ZoneKind;
  main: boolean;
  x: number;
  z: number;
  w: number;
  d: number;
}

/** Ouverture dans un mur mitoyen. */
export interface Opening {
  a: number;
  b: number;
  /** 'x' : mur vertical (colonne x = line), passage selon X ; 'z' : mur horizontal (rangée z = line), passage selon Z. */
  axis: 'x' | 'z';
  line: number;
  /** Première case ouverte le long du mur, et nombre de cases ouvertes. */
  start: number;
  len: number;
  colonnade: boolean;
  /** Coordonnées (le long du mur) des cases qui portent une colonne. */
  columns: number[];
}

export interface Shell {
  W: number;
  D: number;
  cells: Uint8Array;
  zoneOf: Int16Array;
  pieces: Piece[];
  openings: Opening[];
}

interface Req {
  kind: ZoneKind;
  main: boolean;
  weight: number;
}

interface R {
  x: number;
  z: number;
  w: number;
  d: number;
}

export const isOutdoor = (k: ZoneKind): boolean => k === 'terrasse' || k === 'jardin';

function minShort(r: Req): number {
  return r.main ? 7 : r.kind === 'galerie' ? 6 : 5;
}
function minLong(r: Req): number {
  return r.main ? 9 : r.kind === 'galerie' ? 10 : 6;
}
function fits(r: Req, w: number, d: number): boolean {
  return Math.min(w, d) >= minShort(r) && Math.max(w, d) >= minLong(r);
}

function weightOf(kind: ZoneKind, main: boolean, island: boolean): number {
  if (main) return island ? 1.8 : 1.6;
  switch (kind) {
    case 'galerie':
      return 1.15;
    case 'boudoir':
      return 0.85;
    default:
      return 1;
  }
}

/** Découpe récursive (guillotine) avec retour arrière. */
function place(rng: Rng, r: R, items: Req[], top = false): Piece[] | null {
  if (items.length === 1) {
    const it = items[0];
    return fits(it, r.w, r.d) || (it.main && top) ? [{ kind: it.kind, main: it.main, x: r.x, z: r.z, w: r.w, d: r.d }] : null;
  }
  interface Cand {
    axis: 'x' | 'z';
    low: Req[];
    high: Req[];
    size?: number; // taille imposée du groupe bas
  }
  const cands: Cand[] = [];
  const gi = items.findIndex((i) => i.kind === 'galerie' && !i.main);
  if (gi >= 0) {
    // la galerie est une longue bande détachée en premier
    const gal = items[gi];
    const rest = items.filter((_, k) => k !== gi);
    const axis: 'x' | 'z' = r.w >= r.d ? 'z' : 'x';
    const across = axis === 'z' ? r.d : r.w;
    const thick = Math.max(7, Math.min(10, Math.round(across * 0.3)));
    const front = rng.chance(0.75);
    if (front) cands.push({ axis, low: rest, high: [gal], size: across - 1 - thick });
    cands.push({ axis, low: [gal], high: rest, size: thick });
    if (!front) cands.push({ axis, low: rest, high: [gal], size: across - 1 - thick });
  }
  const longX = r.w >= r.d;
  const axes: ('x' | 'z')[] = Math.abs(r.w - r.d) < Math.min(r.w, r.d) * 0.2 && rng.chance(0.5) ? (longX ? ['z', 'x'] : ['x', 'z']) : longX ? ['x', 'z'] : ['z', 'x'];
  const total = items.reduce((s, i) => s + i.weight, 0);
  // découpes les plus équilibrées d'abord (avec un soupçon de hasard)
  const ks: { k: number; key: number }[] = [];
  for (let k = 1; k < items.length; k++) {
    const wk = items.slice(0, k).reduce((s, i) => s + i.weight, 0);
    ks.push({ k, key: Math.abs(wk - total / 2) + rng.next() * 0.3 });
  }
  ks.sort((a, b) => a.key - b.key);
  for (const axis of axes)
    for (const { k } of ks) {
      const g1 = items.slice(0, k);
      const g2 = items.slice(k);
      if (rng.chance(0.8)) cands.push({ axis, low: g1, high: g2 });
      else cands.push({ axis, low: g2, high: g1 });
    }
  for (const c of cands) {
    const along = c.axis === 'x' ? r.w : r.d;
    const A = along - 1; // une case de mur mitoyen
    const wl = c.low.reduce((s, i) => s + i.weight, 0);
    const wh = c.high.reduce((s, i) => s + i.weight, 0);
    const minL = c.low.length === 1 ? minShort(c.low[0]) : 5;
    const minH = c.high.length === 1 ? minShort(c.high[0]) : 5;
    let n1 = c.size ?? Math.round((A * wl) / (wl + wh) + (rng.next() - 0.5) * 1.5);
    n1 = Math.max(minL, Math.min(A - minH, n1));
    if (n1 < minL || A - n1 < minH) continue;
    const r1: R = c.axis === 'x' ? { x: r.x, z: r.z, w: n1, d: r.d } : { x: r.x, z: r.z, w: r.w, d: n1 };
    const r2: R = c.axis === 'x' ? { x: r.x + n1 + 1, z: r.z, w: A - n1, d: r.d } : { x: r.x, z: r.z + n1 + 1, w: r.w, d: A - n1 };
    const p1 = place(rng, r1, c.low);
    if (!p1) continue;
    const p2 = place(rng, r2, c.high);
    if (!p2) continue;
    return [...p1, ...p2];
  }
  return null;
}

interface Adj {
  a: number;
  b: number;
  axis: 'x' | 'z';
  line: number;
  lo: number;
  hi: number;
}

/** Paires de zones séparées par un mur mitoyen d'une case. */
export function adjacency(pieces: Piece[]): Adj[] {
  const out: Adj[] = [];
  for (let i = 0; i < pieces.length; i++)
    for (let j = i + 1; j < pieces.length; j++) {
      const A = pieces[i];
      const B = pieces[j];
      for (const [P, Q] of [
        [A, B],
        [B, A],
      ] as const) {
        if (P.x + P.w + 1 === Q.x) {
          const lo = Math.max(P.z, Q.z);
          const hi = Math.min(P.z + P.d, Q.z + Q.d);
          if (hi > lo) out.push({ a: i, b: j, axis: 'x', line: P.x + P.w, lo, hi });
        }
        if (P.z + P.d + 1 === Q.z) {
          const lo = Math.max(P.x, Q.x);
          const hi = Math.min(P.x + P.w, Q.x + Q.w);
          if (hi > lo) out.push({ a: i, b: j, axis: 'z', line: P.z + P.d, lo, hi });
        }
      }
    }
  return out;
}

const MIN_SHARED = 6;

function connected(pieces: Piece[]): boolean {
  const adj = adjacency(pieces).filter((e) => e.hi - e.lo >= MIN_SHARED);
  const seen = new Set<number>([0]);
  const stack = [0];
  while (stack.length) {
    const i = stack.pop()!;
    for (const e of adj) {
      const o = e.a === i ? e.b : e.b === i ? e.a : -1;
      if (o >= 0 && !seen.has(o)) {
        seen.add(o);
        stack.push(o);
      }
    }
  }
  return seen.size === pieces.length;
}

export interface ShellOptions {
  W: number;
  D: number;
  kinds: ZoneKind[]; // zones en plus du salon principal (sans l'estrade VIP)
  island: boolean;
  simple: boolean; // repli : pas de découpes de silhouette ni de colonnades
  /** Poids supplémentaire du salon principal (il accueille l'estrade VIP). */
  mainBonus: number;
}

/** Construit l'enveloppe ; null si le découpage est impossible avec ces tirages. */
export function buildShell(rng: Rng, o: ShellOptions): Shell | null {
  const { W, D } = o;
  const others: Req[] = o.kinds.map((k) => ({ kind: k, main: false, weight: weightOf(k, false, false) }));
  rng.shuffle(others);
  // la terrasse aime être devant (côté caméra) : en fin de liste
  if (rng.chance(0.7)) others.sort((a, b) => Number(a.kind === 'terrasse') - Number(b.kind === 'terrasse'));
  const items: Req[] = [{ kind: 'salon', main: true, weight: weightOf('salon', true, o.island) + o.mainBonus }, ...others];
  const placed = place(rng, { x: 1, z: 1, w: W - 2, d: D - 2 }, items, true);
  if (!placed) return null;
  // le salon principal en premier (id 0)
  const pieces = [...placed.filter((p) => p.main), ...placed.filter((p) => !p.main)];
  if (!connected(pieces)) return null;

  // Silhouette : quelques zones secondaires se rétractent sur un côté extérieur (formes en L, T, U).
  if (!o.simple && pieces.length > 1) {
    const order = pieces.map((_, i) => i).filter((i) => i > 0);
    rng.shuffle(order);
    for (const i of order) {
      if (!rng.chance(pieces.length >= 3 ? 0.5 : 0.4)) continue;
      const P = pieces[i];
      const sides: string[] = [];
      if (P.x === 1) sides.push('left');
      if (P.z === 1) sides.push('back');
      if (P.x + P.w === W - 1) sides.push('right');
      if (P.z + P.d === D - 1) sides.push('front');
      if (!sides.length) continue;
      const side = rng.pick(sides);
      const k = rng.int(2, 4);
      const saved = { ...P };
      if (side === 'left') {
        P.x += k;
        P.w -= k;
      } else if (side === 'right') P.w -= k;
      else if (side === 'back') {
        P.z += k;
        P.d -= k;
      } else P.d -= k;
      const req: Req = { kind: P.kind, main: false, weight: 1 };
      if (!fits(req, P.w, P.d) || !connected(pieces)) Object.assign(P, saved);
    }
  }

  const cells = new Uint8Array(W * D);
  const zoneOf = new Int16Array(W * D).fill(-1);
  pieces.forEach((p, id) => {
    for (let z = p.z; z < p.z + p.d; z++)
      for (let x = p.x; x < p.x + p.w; x++) {
        cells[z * W + x] = CELL.FLOOR;
        zoneOf[z * W + x] = id;
      }
  });

  // Ouvertures
  const openings: Opening[] = [];
  for (const e of adjacency(pieces)) {
    const L = e.hi - e.lo;
    if (L < 5) continue;
    const ka = pieces[e.a].kind;
    const kb = pieces[e.b].kind;
    const airy = ka === 'galerie' || kb === 'galerie' || isOutdoor(ka) || isOutdoor(kb);
    const room = L - 2;
    let op: Opening;
    if (!o.simple && room >= 8 && rng.chance(airy ? 0.45 : 0.22)) {
      const k = Math.floor((room - 2) / 3);
      const span = 3 * k + 2;
      const start = e.lo + 1 + Math.floor((room - span) / 2);
      const columns: number[] = [];
      for (let j = 0; j < k; j++) columns.push(start + 2 + 3 * j);
      op = { a: e.a, b: e.b, axis: e.axis, line: e.line, start, len: span, colonnade: true, columns };
    } else {
      let ow = Math.max(room >= 4 ? 4 : 3, Math.min(6, Math.round(L * 0.45)));
      if (o.simple) ow = Math.min(6, room);
      ow = Math.min(ow, room);
      const slack = room - ow;
      const off = Math.round((rng.int(0, slack) + rng.int(0, slack)) / 2);
      op = { a: e.a, b: e.b, axis: e.axis, line: e.line, start: e.lo + 1 + off, len: ow, colonnade: false, columns: [] };
    }
    const owner = isOutdoor(pieces[e.a].kind) && !isOutdoor(pieces[e.b].kind) ? e.b : e.a;
    for (let t = op.start; t < op.start + op.len; t++) {
      const idx = op.axis === 'x' ? t * W + op.line : op.line * W + t;
      cells[idx] = CELL.FLOOR;
      zoneOf[idx] = owner;
    }
    openings.push(op);
  }

  // Murs : toute case non praticable voisine (8-voisinage) d'un sol.
  const counts = new Map<number, number>();
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const i = z * W + x;
      if (cells[i] === CELL.FLOOR) continue;
      counts.clear();
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
          const j = nz * W + nx;
          if (cells[j] !== CELL.FLOOR) continue;
          const zid = zoneOf[j];
          counts.set(zid, (counts.get(zid) ?? 0) + 1);
        }
      if (counts.size === 0) continue;
      let kind: CellKind;
      const ids = [...counts.keys()];
      // mitoyen : verrière dès qu'il borde le jardin d'hiver, mur plein sinon (façade de la terrasse comprise)
      if (ids.length >= 2) kind = ids.some((id) => pieces[id].kind === 'jardin') ? CELL.GLASS : CELL.WALL;
      else {
        const k = pieces[ids[0]].kind;
        kind = k === 'terrasse' ? CELL.RAIL : k === 'jardin' ? CELL.GLASS : CELL.WALL;
      }
      let best = ids[0];
      for (const id of ids) {
        const c = counts.get(id)!;
        const cb = counts.get(best)!;
        if (c > cb || (c === cb && id < best)) best = id;
      }
      cells[i] = kind;
      zoneOf[i] = best;
    }

  // une terrasse doit avoir au moins un côté à l'air libre (balustrade)
  for (let id = 0; id < pieces.length; id++) {
    if (pieces[id].kind !== 'terrasse') continue;
    let rail = false;
    for (let i = 0; i < cells.length && !rail; i++) if (cells[i] === CELL.RAIL && zoneOf[i] === id) rail = true;
    if (!rail) return null;
  }
  return { W, D, cells, zoneOf, pieces, openings };
}
