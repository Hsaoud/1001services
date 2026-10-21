/**
 * Collisions du salon : murs (grille de cases) + mobilier (boîtes / cercles dans une grille de hachage).
 * Le joueur et les PNJ sont des cercles qui glissent le long des obstacles.
 */
import type { Collider, SalonLayout, Vec2 } from '../types';
import { CELL } from '../types';
import type { Rng } from '../core/rng';

export interface MoveOptions {
  /** Traverse le mobilier (Passe-Partout pendant un Dash) — les murs restent solides. */
  phaseFurniture?: boolean;
}

export class CollisionWorld {
  readonly width: number;
  readonly depth: number;
  private solidCell: Uint8Array;
  private buckets: Collider[][];

  constructor(private layout: SalonLayout) {
    this.width = layout.width;
    this.depth = layout.depth;
    this.solidCell = new Uint8Array(this.width * this.depth);
    for (let i = 0; i < this.solidCell.length; i++) this.solidCell[i] = layout.cells[i] === CELL.FLOOR ? 0 : 1;
    this.buckets = Array.from({ length: this.width * this.depth }, () => []);
    for (const c of layout.colliders) this.addCollider(c);
  }

  private addCollider(c: Collider): void {
    const [minX, minZ, maxX, maxZ] = bounds(c);
    for (let z = Math.max(0, Math.floor(minZ)); z <= Math.min(this.depth - 1, Math.floor(maxZ)); z++)
      for (let x = Math.max(0, Math.floor(minX)); x <= Math.min(this.width - 1, Math.floor(maxX)); x++)
        this.buckets[z * this.width + x].push(c);
  }

  /** Case solide (mur, balustrade, verrière, vide ou hors grille). */
  solidAt(cx: number, cz: number): boolean {
    if (cx < 0 || cz < 0 || cx >= this.width || cz >= this.depth) return true;
    return this.solidCell[cz * this.width + cx] === 1;
  }

  /** Cercle libre de tout mur et (optionnellement) de tout mobilier. */
  isFree(x: number, z: number, r: number, ignoreFurniture = false): boolean {
    const x0 = Math.floor(x - r);
    const x1 = Math.floor(x + r);
    const z0 = Math.floor(z - r);
    const z1 = Math.floor(z + r);
    for (let cz = z0; cz <= z1; cz++)
      for (let cx = x0; cx <= x1; cx++) {
        if (this.solidAt(cx, cz)) {
          if (circleBoxPen(x, z, r, cx, cz, cx + 1, cz + 1)) return false;
          continue;
        }
        if (ignoreFurniture) continue;
        for (const c of this.buckets[cz * this.width + cx]) if (penetration(x, z, r, c)) return false;
      }
    return true;
  }

  /** Touche-t-on un meuble (pour savoir si une traversée en Dash doit se prolonger) ? */
  overlapsFurniture(x: number, z: number, r: number): boolean {
    const x0 = Math.max(0, Math.floor(x - r));
    const x1 = Math.min(this.width - 1, Math.floor(x + r));
    const z0 = Math.max(0, Math.floor(z - r));
    const z1 = Math.min(this.depth - 1, Math.floor(z + r));
    for (let cz = z0; cz <= z1; cz++)
      for (let cx = x0; cx <= x1; cx++) for (const c of this.buckets[cz * this.width + cx]) if (penetration(x, z, r, c)) return true;
    return false;
  }

  /**
   * Déplace un cercle avec glissement. Modifie `pos`. Renvoie la normale moyenne des contacts, ou null.
   */
  moveCircle(pos: { x: number; z: number }, dx: number, dz: number, r: number, opts: MoveOptions = {}): Vec2 | null {
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / (r * 0.45)));
    let nx = 0;
    let nz = 0;
    let hit = false;
    for (let s = 0; s < steps; s++) {
      pos.x += dx / steps;
      pos.z += dz / steps;
      for (let iter = 0; iter < 3; iter++) {
        const n = this.resolve(pos, r, !!opts.phaseFurniture);
        if (!n) break;
        nx += n.x;
        nz += n.z;
        hit = true;
      }
    }
    if (!hit) return null;
    const l = Math.hypot(nx, nz) || 1;
    return { x: nx / l, z: nz / l };
  }

  /** Repousse le cercle hors des obstacles (une passe). Renvoie la normale cumulée ou null. */
  private resolve(pos: { x: number; z: number }, r: number, phase: boolean): Vec2 | null {
    let nx = 0;
    let nz = 0;
    let any = false;
    const x0 = Math.floor(pos.x - r);
    const x1 = Math.floor(pos.x + r);
    const z0 = Math.floor(pos.z - r);
    const z1 = Math.floor(pos.z + r);
    for (let cz = z0; cz <= z1; cz++)
      for (let cx = x0; cx <= x1; cx++) {
        if (this.solidAt(cx, cz)) {
          const p = circleBoxPen(pos.x, pos.z, r, cx, cz, cx + 1, cz + 1);
          if (p) {
            pos.x += p.x;
            pos.z += p.z;
            nx += p.x;
            nz += p.z;
            any = true;
          }
          continue;
        }
        if (phase) continue;
        for (const c of this.buckets[cz * this.width + cx]) {
          const p = penetration(pos.x, pos.z, r, c);
          if (p) {
            pos.x += p.x;
            pos.z += p.z;
            nx += p.x;
            nz += p.z;
            any = true;
          }
        }
      }
    return any ? { x: nx, z: nz } : null;
  }

  /** Distance jusqu'au premier mur le long d'un rayon (DDA sur la grille ; mobilier ignoré). */
  castRay(x: number, z: number, dirX: number, dirZ: number, maxDist: number): number {
    const len = Math.hypot(dirX, dirZ) || 1;
    const dx = dirX / len;
    const dz = dirZ / len;
    let cx = Math.floor(x);
    let cz = Math.floor(z);
    if (this.solidAt(cx, cz)) return 0;
    const stepX = dx > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tMaxX = dx !== 0 ? (dx > 0 ? cx + 1 - x : x - cx) * tDeltaX : Infinity;
    let tMaxZ = dz !== 0 ? (dz > 0 ? cz + 1 - z : z - cz) * tDeltaZ : Infinity;
    let t = 0;
    while (t < maxDist) {
      if (tMaxX < tMaxZ) {
        t = tMaxX;
        tMaxX += tDeltaX;
        cx += stepX;
      } else {
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        cz += stepZ;
      }
      if (this.solidAt(cx, cz)) return Math.min(t, maxDist);
    }
    return maxDist;
  }

  /** Ligne de vue sans mur. */
  lineClear(ax: number, az: number, bx: number, bz: number): boolean {
    const d = Math.hypot(bx - ax, bz - az);
    if (d < 1e-3) return true;
    return this.castRay(ax, az, bx - ax, bz - az, d) >= d - 1e-3;
  }

  /** A* sur la grille `walk` (8 directions, sans couper les coins). */
  findPath(ax: number, az: number, bx: number, bz: number): Vec2[] | null {
    const w = this.width;
    const h = this.depth;
    const walk = this.layout.walk;
    const start = this.nearestWalkable(Math.floor(ax), Math.floor(az));
    const goal = this.nearestWalkable(Math.floor(bx), Math.floor(bz));
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [{ x: bx, z: bz }];
    const n = w * h;
    const g = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heap = new MinHeap();
    const gx = goal % w;
    const gz = Math.floor(goal / w);
    const hfn = (i: number) => {
      const x = i % w;
      const z = Math.floor(i / w);
      const ddx = Math.abs(x - gx);
      const ddz = Math.abs(z - gz);
      return ddx + ddz - 0.586 * Math.min(ddx, ddz);
    };
    g[start] = 0;
    heap.push(start, hfn(start));
    let found = false;
    let guard = 0;
    while (heap.size > 0 && guard++ < n * 4) {
      const cur = heap.pop();
      if (cur === goal) {
        found = true;
        break;
      }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % w;
      const cz = Math.floor(cur / w);
      for (let oz = -1; oz <= 1; oz++)
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oz) continue;
          const nx = cx + ox;
          const nz = cz + oz;
          if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
          const ni = nz * w + nx;
          if (!walk[ni] || closed[ni]) continue;
          if (ox && oz && (!walk[cz * w + nx] || !walk[nz * w + cx])) continue;
          const cost = g[cur] + (ox && oz ? 1.414 : 1);
          if (cost < g[ni]) {
            g[ni] = cost;
            came[ni] = cur;
            heap.push(ni, cost + hfn(ni));
          }
        }
    }
    if (!found) return null;
    const path: Vec2[] = [];
    let c = goal;
    while (c !== start && c >= 0) {
      path.push({ x: (c % w) + 0.5, z: Math.floor(c / w) + 0.5 });
      c = came[c];
    }
    path.reverse();
    if (path.length) path[path.length - 1] = { x: bx, z: bz };
    return path;
  }

  private nearestWalkable(cx: number, cz: number): number {
    const w = this.width;
    const h = this.depth;
    for (let r = 0; r < 4; r++)
      for (let oz = -r; oz <= r; oz++)
        for (let ox = -r; ox <= r; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oz)) !== r) continue;
          const x = cx + ox;
          const z = cz + oz;
          if (x < 0 || z < 0 || x >= w || z >= h) continue;
          if (this.layout.walk[z * w + x]) return z * w + x;
        }
    return -1;
  }

  /** Point de sol libre au hasard (optionnellement dans un anneau autour de `near`). */
  randomFreePoint(rng: Rng, near?: Vec2, minDist = 0, maxDist = Infinity, radius = 0.35): Vec2 | null {
    const w = this.width;
    const h = this.depth;
    for (let tries = 0; tries < 80; tries++) {
      let x: number;
      let z: number;
      if (near && Number.isFinite(maxDist)) {
        const a = rng.range(0, Math.PI * 2);
        const d = rng.range(minDist, maxDist);
        x = near.x + Math.sin(a) * d;
        z = near.z + Math.cos(a) * d;
      } else {
        x = rng.range(1, w - 1);
        z = rng.range(1, h - 1);
      }
      const ci = Math.floor(z) * w + Math.floor(x);
      if (x < 0 || z < 0 || x >= w || z >= h || !this.layout.walk[ci]) continue;
      if (near && Math.hypot(x - near.x, z - near.z) < minDist) continue;
      if (this.isFree(x, z, radius)) return { x, z };
    }
    return null;
  }
}

function bounds(c: Collider): [number, number, number, number] {
  return c.shape === 'box' ? [c.minX, c.minZ, c.maxX, c.maxZ] : [c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r];
}

/** Vecteur de sortie d'un cercle hors d'une boîte, ou null s'il n'y a pas de recouvrement. */
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
  // centre dans la boîte : sortie par le bord le plus proche
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

function penetration(x: number, z: number, r: number, c: Collider): Vec2 | null {
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

/** Tas binaire minimal (indices + priorités). */
class MinHeap {
  private ids: number[] = [];
  private pr: number[] = [];
  get size(): number {
    return this.ids.length;
  }
  push(id: number, p: number): void {
    this.ids.push(id);
    this.pr.push(p);
    let i = this.ids.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.pr[parent] <= this.pr[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): number {
    const top = this.ids[0];
    const lastId = this.ids.pop()!;
    const lastP = this.pr.pop()!;
    if (this.ids.length) {
      this.ids[0] = lastId;
      this.pr[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.ids.length && this.pr[l] < this.pr[m]) m = l;
        if (r < this.ids.length && this.pr[r] < this.pr[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.ids[a], this.ids[b]] = [this.ids[b], this.ids[a]];
    [this.pr[a], this.pr[b]] = [this.pr[b], this.pr[a]];
  }
}
