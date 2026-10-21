/**
 * Construction complète d'un salon (diorama) à partir du SalonLayout : sols, socle, murs,
 * tables, comptoirs, guéridons, Cloche Royale, décor, lueurs ; puis fusion de la géométrie statique.
 */
import * as THREE from 'three';
import type { BellViewState, ClocheViewState, CounterViewState, SalonLayout, TableViewState } from '../../types';
import type { SalonView, View } from '../api';
import { StaticBatch } from '../batch';
import type { BiomeStyle } from '../biomes';
import { GlowPoints, type LightPool } from '../glow';
import type { FxSystem } from '../fx';
import { SHARED } from '../mats';
import type { Animated, SalonCtx } from './context';
import { SalonGrid } from './grid';
import { buildFloors, buildPlinth } from './floor';
import { buildWalls, computeOpenings } from './walls';
import { buildTable } from './tables';
import { buildCounter } from './counters';
import { buildCloche } from './cloches';
import { buildBell } from './bell';
import { buildDecor } from './decor';

/** Exécute une étape de construction sans jamais faire échouer tout le salon. */
function guard<T>(what: string, fn: () => T): T | undefined {
  try {
    return fn();
  } catch (e) {
    console.warn(`[rendu] construction « ${what} » ignorée :`, e);
    return undefined;
  }
}

/** Vue vide (repli si la construction d'un élément a échoué). */
function emptyView<S>(parent: THREE.Object3D): View<S> {
  const root = new THREE.Group();
  parent.add(root);
  return {
    root,
    update() {},
    dispose() {
      root.removeFromParent();
    },
  };
}

export interface SalonEnv {
  parent: THREE.Object3D;
  style: BiomeStyle;
  fx: FxSystem;
  lights: LightPool;
}

export class SalonViewImpl implements SalonView {
  readonly tables: View<TableViewState>[] = [];
  readonly counters: View<CounterViewState>[] = [];
  readonly cloches: View<ClocheViewState>[] = [];
  readonly bell: View<BellViewState>;
  readonly grid: SalonGrid;
  readonly root = new THREE.Group();
  private ctx: SalonCtx;
  private lastTime = -1;
  private staticMeshes: THREE.Mesh[] = [];
  private disposed = false;
  /** Statistiques de construction (lab). */
  readonly stats = { vertices: 0, meshes: 0, buildMs: 0 };

  constructor(
    readonly layout: SalonLayout,
    env: SalonEnv,
  ) {
    const t0 = performance.now();
    this.root.name = `salon:${layout.level}`;
    env.parent.add(this.root);
    this.grid = new SalonGrid(layout);
    const batch = new StaticBatch();
    const glows = new GlowPoints();
    this.ctx = {
      layout,
      grid: this.grid,
      style: env.style,
      batch,
      root: this.root,
      glows,
      fx: env.fx,
      lights: env.lights,
      anim: [],
      owned: { materials: [], geometries: [] },
      chandeliers: [],
    };
    const ctx = this.ctx;
    const openings = computeOpenings(this.grid);
    const floors = buildFloors(this.grid, env.style, batch, this.root, openings);
    const plinth = buildPlinth(this.grid, env.style, this.root);
    for (const f of [floors, plinth]) {
      ctx.owned.materials.push(...f.materials);
      ctx.owned.geometries.push(...f.geometries);
    }
    guard('murs', () => buildWalls(ctx, openings));
    // une vue par élément, même en cas d'erreur (les index doivent rester alignés sur le layout)
    for (const t of layout.tables) this.tables.push(guard(`table ${t.id}`, () => buildTable(ctx, t)) ?? emptyView(this.root));
    for (const c of layout.counters) this.counters.push(guard(`comptoir ${c.id}`, () => buildCounter(ctx, c)) ?? emptyView(this.root));
    for (const p of layout.pedestals) this.cloches.push(guard(`guéridon ${p.id}`, () => buildCloche(ctx, p)) ?? emptyView(this.root));
    this.bell = guard('cloche royale', () => buildBell(ctx)) ?? emptyView(this.root);
    guard('décor', () => buildDecor(ctx));
    this.stats.vertices = batch.vertexCount;
    this.staticMeshes = batch.build(this.root, 12);
    glows.build(this.root);
    this.stats.meshes = this.staticMeshes.length;
    this.stats.buildMs = performance.now() - t0;
  }

  /** Hauteur du sol (estrades) au point (x, z). */
  groundY(x: number, z: number): number {
    return this.grid.groundY(x, z);
  }

  private cullables: { root: THREE.Object3D; x: number; z: number; r: number; attached: boolean }[] | null = null;

  /**
   * Détache du graphe de scène les vues dynamiques hors champ (tables et leurs clients, comptoirs,
   * cloches) : elles ne coûtent plus rien (ni mise à jour des matrices, ni culling) sur les grands salons.
   * `right` / `up` : axes écran de la caméra ; `halfW` / `halfH` : demi-étendue visible (m).
   */
  cull(cx: number, cz: number, right: THREE.Vector3, up: THREE.Vector3, halfW: number, halfH: number): void {
    if (!this.cullables) {
      this.cullables = [];
      const add = (v: View<unknown>, x: number, z: number, r: number) => this.cullables!.push({ root: v.root, x, z, r, attached: true });
      this.layout.tables.forEach((t, i) => add(this.tables[i], t.x, t.z, Math.max(t.w, t.d) / 2 + 1.2));
      this.layout.counters.forEach((c, i) => add(this.counters[i], c.x, c.z, Math.max(c.w, c.d) / 2 + 0.6));
      this.layout.pedestals.forEach((p, i) => add(this.cloches[i], p.x, p.z, 0.8));
    }
    for (const v of this.cullables) {
      const dx = v.x - cx;
      const dz = v.z - cz;
      const sx = dx * right.x + dz * right.z;
      const sy = dx * up.x + dz * up.z;
      // marge : ombres portées et hauteur des personnages (vers le haut de l'écran)
      const m = v.r + 2.5;
      const vis = Math.abs(sx) < halfW + m && sy > -halfH - m && sy < halfH + m + 1.5;
      if (vis !== v.attached) {
        if (vis) this.root.add(v.root);
        else this.root.remove(v.root);
        v.attached = vis;
      }
    }
  }

  update(dt: number, time: number): void {
    this.externalTick = true;
    this.tick(dt, time);
  }

  /**
   * Appelé par le GameRenderer à chaque image : anime l'ambiance seulement si le jeu ne l'a pas
   * déjà fait (évite le double pas de temps quand le jeu appelle aussi `update`).
   */
  frame(dt: number, time: number): void {
    if (!this.externalTick) this.tick(dt, time);
    this.externalTick = false;
  }

  private externalTick = false;

  private tick(dt: number, time: number): void {
    if (time === this.lastTime) return;
    this.lastTime = time;
    SHARED.uTime.value = time;
    for (const a of this.ctx.anim) a.update(dt, time);
  }

  setChandelierShake(amount: number): void {
    for (const c of this.ctx.chandeliers) c.setShake(amount);
  }

  /** Éléments animés (exposés pour les tests du lab). */
  get animated(): readonly Animated[] {
    return this.ctx.anim;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const v of [...this.tables, ...this.counters, ...this.cloches, this.bell]) v.dispose();
    for (const a of this.ctx.anim) a.dispose?.();
    this.ctx.glows.dispose();
    for (const m of this.staticMeshes) {
      m.geometry.dispose();
      m.removeFromParent();
    }
    for (const m of this.ctx.owned.materials) m.dispose();
    for (const g of this.ctx.owned.geometries) g.dispose();
    this.root.removeFromParent();
  }
}
