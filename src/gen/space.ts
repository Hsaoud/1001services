/**
 * Espace de travail du générateur : grille de cases, collisions du mobilier (index spatial par case),
 * grille de marche (agent de rayon 0,35) et accessibilité (parcours en largeur depuis l'entrée).
 */
import type { Collider } from '../types';
import { CELL } from '../types';
import { type Box, boxOf, circleGap, colliderBoxGap, colliderGap, EPS, pointBoxDist } from './geom';

/** Rayon de l'agent de référence (joueur ≈ 0,32). */
export const AGENT_R = 0.35;

export class Space {
  readonly colliders: Collider[] = [];
  readonly walk: Uint8Array;
  private readonly buckets: number[][];
  private mark: Uint32Array;
  private token = 1;
  private queue: Int32Array;
  /** Cases dont la marche est passée de 1 à 0 lors du dernier ajout de collision. */
  lastBlocked: number[] = [];

  constructor(
    readonly W: number,
    readonly D: number,
    readonly cells: Uint8Array,
    readonly zoneOf: Int16Array,
  ) {
    this.walk = new Uint8Array(W * D);
    this.buckets = Array.from({ length: W * D }, () => []);
    this.mark = new Uint32Array(64);
    this.queue = new Int32Array(W * D);
  }

  inBounds(ix: number, iz: number): boolean {
    return ix >= 0 && iz >= 0 && ix < this.W && iz < this.D;
  }

  floorAt(ix: number, iz: number): boolean {
    return this.inBounds(ix, iz) && this.cells[iz * this.W + ix] === CELL.FLOOR;
  }

  zoneAt(ix: number, iz: number): number {
    return this.inBounds(ix, iz) ? this.zoneOf[iz * this.W + ix] : -1;
  }

  /** Toutes les cases touchées par la boîte vérifient `pred`. */
  boxCellsAll(b: Box, pred: (ix: number, iz: number) => boolean): boolean {
    const x0 = Math.floor(b.minX + EPS);
    const x1 = Math.ceil(b.maxX - EPS) - 1;
    const z0 = Math.floor(b.minZ + EPS);
    const z1 = Math.ceil(b.maxZ - EPS) - 1;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (!pred(x, z)) return false;
    return true;
  }

  /** La boîte ne repose que sur des cases de sol. */
  boxOnFloor(b: Box): boolean {
    return this.boxCellsAll(b, (x, z) => this.floorAt(x, z));
  }

  /** Le cercle ne touche aucune case non praticable (mur, balustrade, verrière, vide). */
  circleClearOfWalls(x: number, z: number, r: number): boolean {
    const x0 = Math.floor(x - r);
    const x1 = Math.floor(x + r);
    const z0 = Math.floor(z - r);
    const z1 = Math.floor(z + r);
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        if (this.floorAt(ix, iz)) continue;
        if (pointBoxDist(x, z, { minX: ix, minZ: iz, maxX: ix + 1, maxZ: iz + 1 }) < r - EPS) return false;
      }
    return true;
  }

  /** Parcourt (sans doublon) les collisions dont la boîte touche les cases couvertes par `b`. */
  forNear(b: Box, fn: (c: Collider, i: number) => boolean | void): void {
    const x0 = Math.max(0, Math.floor(b.minX));
    const x1 = Math.min(this.W - 1, Math.floor(b.maxX));
    const z0 = Math.max(0, Math.floor(b.minZ));
    const z1 = Math.min(this.D - 1, Math.floor(b.maxZ));
    const t = ++this.token;
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const list = this.buckets[z * this.W + x];
        for (let k = 0; k < list.length; k++) {
          const i = list[k];
          if (this.mark[i] === t) continue;
          this.mark[i] = t;
          if (fn(this.colliders[i], i) === true) return;
        }
      }
  }

  /** Cercle libre de murs et de mobilier. */
  circleFree(x: number, z: number, r: number): boolean {
    if (!this.circleClearOfWalls(x, z, r)) return false;
    let free = true;
    this.forNear({ minX: x - r, minZ: z - r, maxX: x + r, maxZ: z + r }, (c) => {
      if (circleGap(c, x, z, r) < -EPS) {
        free = false;
        return true;
      }
    });
    return free;
  }

  /** Plus petit jeu entre `c` et le mobilier existant dans un rayon `range` (Infinity si rien). */
  gapTo(c: Collider, range: number): number {
    const b = boxOf(c);
    let best = Infinity;
    this.forNear({ minX: b.minX - range, minZ: b.minZ - range, maxX: b.maxX + range, maxZ: b.maxZ + range }, (o) => {
      const g = colliderGap(c, o);
      if (g < best) best = g;
    });
    return best;
  }

  /** Plus petit jeu entre une boîte et le mobilier existant. */
  boxGapTo(b: Box, range: number): number {
    let best = Infinity;
    this.forNear({ minX: b.minX - range, minZ: b.minZ - range, maxX: b.maxX + range, maxZ: b.maxZ + range }, (o) => {
      const g = colliderBoxGap(o, b);
      if (g < best) best = g;
    });
    return best;
  }

  /** Ajoute une collision ; `refresh = false` laisse la grille de marche à recalculer (ajouts groupés). */
  addCollider(c: Collider, refresh = true): number {
    const i = this.colliders.length;
    this.colliders.push(c);
    if (this.mark.length <= i) {
      const m = new Uint32Array(this.mark.length * 2);
      m.set(this.mark);
      this.mark = m;
    }
    const b = boxOf(c);
    this.eachCell(b, (idx) => this.buckets[idx].push(i));
    this.lastBlocked = [];
    if (refresh) this.refreshWalk(b, this.lastBlocked);
    return i;
  }

  /** Retire la dernière collision ajoutée (annulation d'un essai). */
  popCollider(): void {
    const i = this.colliders.length - 1;
    if (i < 0) return;
    const c = this.colliders[i];
    const b = boxOf(c);
    this.eachCell(b, (idx) => {
      const list = this.buckets[idx];
      const k = list.lastIndexOf(i);
      if (k >= 0) list.splice(k, 1);
    });
    this.colliders.pop();
    this.refreshWalk(b);
  }

  private eachCell(b: Box, fn: (idx: number) => void): void {
    const x0 = Math.max(0, Math.floor(b.minX));
    const x1 = Math.min(this.W - 1, Math.floor(b.maxX));
    const z0 = Math.max(0, Math.floor(b.minZ));
    const z1 = Math.min(this.D - 1, Math.floor(b.maxZ));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) fn(z * this.W + x);
  }

  private walkCell(ix: number, iz: number): number {
    if (!this.floorAt(ix, iz)) return 0;
    const cx = ix + 0.5;
    const cz = iz + 0.5;
    let ok = 1;
    this.forNear({ minX: cx - AGENT_R, minZ: cz - AGENT_R, maxX: cx + AGENT_R, maxZ: cz + AGENT_R }, (c) => {
      if (circleGap(c, cx, cz, AGENT_R) < -EPS) {
        ok = 0;
        return true;
      }
    });
    return ok;
  }

  /** Recalcule la marche des cases proches d'une boîte modifiée (`blocked` reçoit les cases passées à 0). */
  refreshWalk(b: Box, blocked?: number[]): void {
    const m = AGENT_R + 0.6;
    const x0 = Math.max(0, Math.floor(b.minX - m));
    const x1 = Math.min(this.W - 1, Math.floor(b.maxX + m));
    const z0 = Math.max(0, Math.floor(b.minZ - m));
    const z1 = Math.min(this.D - 1, Math.floor(b.maxZ + m));
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const i = z * this.W + x;
        const w = this.walkCell(x, z);
        if (blocked && this.walk[i] && !w) blocked.push(i);
        this.walk[i] = w;
      }
  }

  computeWalk(): void {
    for (let z = 0; z < this.D; z++) for (let x = 0; x < this.W; x++) this.walk[z * this.W + x] = this.walkCell(x, z);
  }

  /** Parcours en largeur (4-voisinage) sur la grille de marche depuis le point (x, z). */
  bfs(x: number, z: number): Uint8Array {
    return floodWalk(this.walk, this.W, this.D, Math.floor(x), Math.floor(z), this.queue);
  }

  /** Segment parcourable par un cercle de rayon r (échantillonné). */
  segmentFree(ax: number, az: number, bx: number, bz: number, r: number): boolean {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / 0.12));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (!this.circleFree(ax + (bx - ax) * t, az + (bz - az) * t, r)) return false;
    }
    return true;
  }

  /** Un point est atteint s'il est libre et relié en ligne droite à une case atteinte voisine. */
  pointReached(x: number, z: number, reached: Uint8Array): boolean {
    if (!this.circleFree(x, z, AGENT_R)) return false;
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    // d'abord la case du point, puis ses voisines (les plus proches d'abord)
    const order: [number, number][] = [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ];
    for (const [dx, dz] of order) {
      const cx = ix + dx;
      const cz = iz + dz;
      if (!this.inBounds(cx, cz)) continue;
      const idx = cz * this.W + cx;
      if (!reached[idx]) continue;
      if (this.segmentFree(x, z, cx + 0.5, cz + 0.5, AGENT_R)) return true;
    }
    return false;
  }
}

/** Inondation 4-voisine d'une grille de marche. */
export function floodWalk(walk: Uint8Array, W: number, D: number, sx: number, sz: number, buf?: Int32Array): Uint8Array {
  const reached = new Uint8Array(W * D);
  if (sx < 0 || sz < 0 || sx >= W || sz >= D) return reached;
  const s = sz * W + sx;
  if (!walk[s]) return reached;
  const queue = buf ?? new Int32Array(W * D);
  let head = 0;
  let tail = 0;
  queue[tail++] = s;
  reached[s] = 1;
  while (head < tail) {
    const i = queue[head++];
    const x = i % W;
    const z = (i - x) / W;
    if (x > 0 && walk[i - 1] && !reached[i - 1]) {
      reached[i - 1] = 1;
      queue[tail++] = i - 1;
    }
    if (x < W - 1 && walk[i + 1] && !reached[i + 1]) {
      reached[i + 1] = 1;
      queue[tail++] = i + 1;
    }
    if (z > 0 && walk[i - W] && !reached[i - W]) {
      reached[i - W] = 1;
      queue[tail++] = i - W;
    }
    if (z < D - 1 && walk[i + W] && !reached[i + W]) {
      reached[i + W] = 1;
      queue[tail++] = i + W;
    }
  }
  return reached;
}
