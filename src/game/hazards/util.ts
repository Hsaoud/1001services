/**
 * Outils mathématiques et géométriques des obstacles.
 * Convention de cap identique à `NpcViewState.heading` : 0 = regarde +Z, direction = (sin h, cos h).
 */
import type { TelegraphShape, Vec2 } from '../../types';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

export function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

export function easeInOutQuad(t: number): number {
  const u = clamp01(t);
  return u < 0.5 ? 2 * u * u : 1 - ((-2 * u + 2) * (-2 * u + 2)) / 2;
}

/** Cap (rad, 0 = +Z) d'un vecteur. */
export function headingOf(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

/** Ramène un angle dans ]−π, π]. */
export function wrapAngle(a: number): number {
  let r = (a + Math.PI) % TAU;
  if (r < 0) r += TAU;
  return r - Math.PI;
}

/** Tourne `cur` vers `target` d'au plus `maxStep` radians. */
export function turnToward(cur: number, target: number, maxStep: number): number {
  const d = wrapAngle(target - cur);
  if (Math.abs(d) <= maxStep) return wrapAngle(target);
  return wrapAngle(cur + Math.sign(d) * maxStep);
}

export function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(bx - ax, bz - az);
}

export interface SegProj {
  /** Distance du point au segment. */
  d: number;
  /** Paramètre 0..1 du point le plus proche. */
  t: number;
  x: number;
  z: number;
}

/** Projection d'un point sur un segment. */
export function segProject(px: number, pz: number, ax: number, az: number, bx: number, bz: number): SegProj {
  const vx = bx - ax;
  const vz = bz - az;
  const l2 = vx * vx + vz * vz;
  const t = l2 > 1e-9 ? clamp01(((px - ax) * vx + (pz - az) * vz) / l2) : 0;
  const x = ax + vx * t;
  const z = az + vz * t;
  return { d: Math.hypot(px - x, pz - z), t, x, z };
}

// ── Formes de télégraphe (constructeurs typés)

export type CircleShape = Extract<TelegraphShape, { type: 'circle' }>;
export type RingShape = Extract<TelegraphShape, { type: 'ring' }>;
export type LineShape = Extract<TelegraphShape, { type: 'line' }>;
export type ConeShape = Extract<TelegraphShape, { type: 'cone' }>;
export type CrossShape = Extract<TelegraphShape, { type: 'cross' }>;

export function circle(x: number, z: number, r: number): CircleShape {
  return { type: 'circle', x, z, r };
}

export function ring(x: number, z: number, r0: number, r1: number): RingShape {
  return { type: 'ring', x, z, r0, r1 };
}

export function line(ax: number, az: number, bx: number, bz: number, width: number): LineShape {
  return { type: 'line', ax, az, bx, bz, width };
}

export function cone(x: number, z: number, angle: number, spread: number, length: number): ConeShape {
  return { type: 'cone', x, z, angle, spread, length };
}

/** Croix alignée sur les axes ; `length` = longueur de chaque bras depuis le centre. */
export function cross(x: number, z: number, length: number, width: number): CrossShape {
  return { type: 'cross', x, z, length, width };
}

/**
 * Le point (px, pz) est-il dans la forme ? `margin` élargit la zone (≈ une fraction du rayon du joueur).
 * Pour un anneau, seule la couronne r0..r1 compte.
 */
export function shapeContains(s: TelegraphShape, px: number, pz: number, margin = 0): boolean {
  switch (s.type) {
    case 'circle':
      return dist(px, pz, s.x, s.z) <= s.r + margin;
    case 'ring': {
      const d = dist(px, pz, s.x, s.z);
      return d >= s.r0 - margin && d <= s.r1 + margin;
    }
    case 'line':
      return segProject(px, pz, s.ax, s.az, s.bx, s.bz).d <= s.width / 2 + margin;
    case 'cone': {
      const dx = px - s.x;
      const dz = pz - s.z;
      const d = Math.hypot(dx, dz);
      if (d > s.length + margin) return false;
      if (d <= margin + 0.2) return true;
      return Math.abs(wrapAngle(headingOf(dx, dz) - s.angle)) <= s.spread + Math.atan2(margin, d);
    }
    case 'cross': {
      const dx = Math.abs(px - s.x);
      const dz = Math.abs(pz - s.z);
      const hw = s.width / 2 + margin;
      const len = s.length + margin;
      return (dx <= len && dz <= hw) || (dz <= len && dx <= hw);
    }
  }
}

/** Direction unitaire d'une façade (Quarter : 0 = +Z, 1 = +X, 2 = −Z, 3 = −X). */
export function quarterDir(rot: number): Vec2 {
  switch (rot & 3) {
    case 1:
      return { x: 1, z: 0 };
    case 2:
      return { x: 0, z: -1 };
    case 3:
      return { x: -1, z: 0 };
    default:
      return { x: 0, z: 1 };
  }
}

export interface PolyPoint {
  x: number;
  z: number;
  /** Tangente unitaire. */
  tx: number;
  tz: number;
  /** Index du segment courant. */
  seg: number;
}

/** Polyligne paramétrée par l'abscisse curviligne (boucle fermée ou non). */
export class Polyline {
  readonly pts: Vec2[];
  readonly cum: number[];
  readonly total: number;
  readonly closed: boolean;

  constructor(pts: Vec2[], closed: boolean) {
    this.pts = pts.map((p) => ({ x: p.x, z: p.z }));
    this.closed = closed;
    this.cum = [0];
    const n = this.segCount;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const a = this.pts[i];
      const b = this.pts[(i + 1) % this.pts.length];
      acc += Math.hypot(b.x - a.x, b.z - a.z);
      this.cum.push(acc);
    }
    this.total = acc;
  }

  get segCount(): number {
    return this.closed ? this.pts.length : Math.max(0, this.pts.length - 1);
  }

  /** Point à l'abscisse `s` (bouclée si la polyligne est fermée, bornée sinon). */
  at(s: number): PolyPoint {
    const n = this.segCount;
    if (n === 0 || this.total <= 1e-6) {
      const p = this.pts[0] ?? { x: 0, z: 0 };
      return { x: p.x, z: p.z, tx: 0, tz: 1, seg: 0 };
    }
    let u = this.closed ? ((s % this.total) + this.total) % this.total : clamp(s, 0, this.total);
    // recherche dichotomique du segment
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.cum[mid] <= u) lo = mid;
      else hi = mid - 1;
    }
    let seg = lo;
    // saute les segments de longueur nulle
    while (seg < n - 1 && this.cum[seg + 1] - this.cum[seg] < 1e-6) seg++;
    const a = this.pts[seg];
    const b = this.pts[(seg + 1) % this.pts.length];
    const len = this.cum[seg + 1] - this.cum[seg];
    if (u > this.cum[seg + 1]) u = this.cum[seg + 1];
    const t = len > 1e-6 ? (u - this.cum[seg]) / len : 0;
    const tx = len > 1e-6 ? (b.x - a.x) / len : 0;
    const tz = len > 1e-6 ? (b.z - a.z) / len : 1;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx, tz, seg };
  }
}
