/**
 * Analyse de la grille du salon : hauteurs de sol (estrades), murs « du fond » (pleine hauteur)
 * ou « de devant » (coupés bas, façon diorama), zone de chaque case.
 */
import type { SalonLayout, ZoneSpec } from '../../types';
import { CELL } from '../../types';

/** Hauteur des murs du fond. */
export const WALL_H = 2.4;
/** Hauteur des murs coupés (devant). */
export const WALL_LOW = 0.35;
/** Hauteur des balustrades. */
export const RAIL_H = 0.72;
/** Hauteur de la verrière basse (devant). */
export const GLASS_LOW = 0.55;

export class SalonGrid {
  readonly w: number;
  readonly d: number;
  readonly cells: Uint8Array;
  /** Zone de chaque case (y compris murs / balustrades, rattachés à une zone voisine), −1 = vide. */
  readonly zone: Int16Array;
  /** Hauteur de sol de chaque case. */
  readonly ground: Float32Array;
  /** Hauteur de chaque case de mur / verrière (0 sinon). */
  readonly wallH: Float32Array;
  readonly zones: ZoneSpec[];
  private zoneById = new Map<number, ZoneSpec>();

  constructor(readonly layout: SalonLayout) {
    this.w = layout.width;
    this.d = layout.depth;
    this.cells = layout.cells;
    this.zones = layout.zones;
    for (const z of layout.zones) this.zoneById.set(z.id, z);
    const n = this.w * this.d;
    this.zone = new Int16Array(n).fill(-1);
    this.ground = new Float32Array(n);
    this.wallH = new Float32Array(n);
    // zones : celles du générateur, puis propagation aux murs / balustrades
    for (let i = 0; i < n; i++) {
      if (this.cells[i] === CELL.VOID) continue;
      const z = layout.zoneOf[i];
      if (z >= 0 && this.zoneById.has(z)) this.zone[i] = z;
    }
    for (let pass = 0; pass < 3; pass++) {
      for (let zz = 0; zz < this.d; zz++)
        for (let x = 0; x < this.w; x++) {
          const i = zz * this.w + x;
          if (this.cells[i] === CELL.VOID || this.zone[i] >= 0) continue;
          let best = -1;
          let bestRaised = Infinity;
          for (const [dx, dz] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const j = this.idx(x + dx, zz + dz);
            if (j < 0) continue;
            const zn = this.zone[j];
            if (zn < 0) continue;
            const r = this.zoneById.get(zn)?.raised ?? 0;
            // préfère la zone la plus basse (les murs bordent plutôt le sol principal)
            if (r < bestRaised) {
              best = zn;
              bestRaised = r;
            }
          }
          if (best >= 0) this.zone[i] = best;
        }
    }
    for (let i = 0; i < n; i++) {
      const z = this.zone[i];
      const c = this.cells[i];
      if (z >= 0 && (c === CELL.FLOOR || c === CELL.RAIL)) this.ground[i] = this.zoneById.get(z)?.raised ?? 0;
    }
    for (let zz = 0; zz < this.d; zz++)
      for (let x = 0; x < this.w; x++) {
        const i = zz * this.w + x;
        const c = this.cells[i];
        if (c !== CELL.WALL && c !== CELL.GLASS) continue;
        const cut = this.isFront(x, zz);
        if (c === CELL.WALL) this.wallH[i] = cut ? WALL_LOW : WALL_H;
        else this.wallH[i] = cut ? GLASS_LOW : WALL_H;
      }
  }

  idx(x: number, z: number): number {
    if (x < 0 || z < 0 || x >= this.w || z >= this.d) return -1;
    return z * this.w + x;
  }

  cell(x: number, z: number): number {
    const i = this.idx(x, z);
    return i < 0 ? CELL.VOID : this.cells[i];
  }

  /** Case où l'on marche (sol). */
  isFloor(x: number, z: number): boolean {
    return this.cell(x, z) === CELL.FLOOR;
  }

  /** Case « solide » (mur ou verrière). */
  isSolid(x: number, z: number): boolean {
    const c = this.cell(x, z);
    return c === CELL.WALL || c === CELL.GLASS;
  }

  isVoid(x: number, z: number): boolean {
    return this.cell(x, z) === CELL.VOID;
  }

  /**
   * Un mur est « de devant » (coupé bas) s'il masquerait du sol situé derrière lui depuis la caméra,
   * c'est-à-dire s'il y a du sol du côté −X / −Z à proximité.
   */
  private isFront(x: number, z: number): boolean {
    const probes: [number, number][] = [
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
    ];
    for (const [a, b] of probes) {
      const c = this.cell(x - a, z - b);
      if (c === CELL.FLOOR) return true;
    }
    return false;
  }

  zoneSpec(id: number): ZoneSpec | undefined {
    return this.zoneById.get(id);
  }

  zoneAt(x: number, z: number): ZoneSpec | undefined {
    const i = this.idx(Math.floor(x), Math.floor(z));
    if (i < 0) return undefined;
    const zn = this.zone[i];
    return zn >= 0 ? this.zoneById.get(zn) : undefined;
  }

  /** Hauteur du sol au point (x, z). */
  groundY(x: number, z: number): number {
    const i = this.idx(Math.floor(x), Math.floor(z));
    return i < 0 ? 0 : this.ground[i];
  }

  /** Hauteur de sol maximale sur un rectangle (télégraphes qui débordent sur une estrade). */
  maxGround(x0: number, z0: number, x1: number, z1: number): number {
    let m = 0;
    const ax = Math.max(0, Math.floor(x0));
    const az = Math.max(0, Math.floor(z0));
    const bx = Math.min(this.w - 1, Math.floor(x1));
    const bz = Math.min(this.d - 1, Math.floor(z1));
    for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) m = Math.max(m, this.ground[z * this.w + x]);
    return m;
  }

  wallHeight(x: number, z: number): number {
    const i = this.idx(x, z);
    return i < 0 ? 0 : this.wallH[i];
  }
}
