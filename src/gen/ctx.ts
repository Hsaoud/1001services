/**
 * Contexte partagé d'une tentative de génération (enveloppe, mobilier en cours, réservations, cibles d'accessibilité).
 */
import type { Rng } from '../core/rng';
import type {
  Collider,
  DecorSpec,
  Lane,
  LevelPlan,
  PedestalSpec,
  Quarter,
  Rect,
  TableSpec,
  Vec2,
  ZoneKind,
} from '../types';
import { CELL } from '../types';
import { type Box, boxesOverlap, boxOf, expand } from './geom';
import type { Shell } from './shell';
import type { Space } from './space';

/** Style d'ameublement d'une zone (le salon principal suit l'ambiance du niveau). */
export type Style = 'boudoir' | 'jardin' | 'terrasse' | 'galerie' | 'vip';

/** Réservations au sol (aucun mobilier) : paliers d'ouverture, entrée, allées de service, couloirs… */
export type KeepTag = 'landing' | 'entrance' | 'bell' | 'aisle' | 'island' | 'fountain' | 'estrade' | 'lane';

export interface Keepout {
  b: Box;
  tag: KeepTag;
}

export interface ZoneInfo {
  id: number;
  kind: ZoneKind;
  main: boolean;
  rect: Rect;
  style: Style;
  outdoor: boolean;
  /** Estrade VIP : zone hôte ; −1 sinon. */
  host: number;
}

/** Cible d'accessibilité : tous les points (`all`) ou au moins un doivent être atteints depuis l'entrée. */
export interface Target {
  pts: Vec2[];
  all: boolean;
  label: string;
}

/** Comptoir en cours de placement (la station est attribuée après coup). */
export interface CounterDraft {
  x: number;
  z: number;
  w: number;
  d: number;
  rot: Quarter;
  front: Vec2;
  island: boolean;
  zone: number;
  collider: number; // index dans space.colliders
}

export interface Ctx {
  plan: LevelPlan;
  seed: number;
  rng: Rng;
  W: number;
  D: number;
  shell: Shell;
  space: Space;
  zones: ZoneInfo[];
  keep: Keepout[];
  decor: DecorSpec[];
  tables: TableSpec[];
  /** Points candidats de service par table (filtrés à la fin). */
  tableSpots: Vec2[][];
  counters: CounterDraft[];
  pedestals: PedestalSpec[];
  lanes: Lane[];
  /** Points de réseau de tables non utilisés (guéridons, fleurs…). */
  spare: Vec2[];
  entrance: { x: number; z: number; rot: Quarter };
  /** Case de porte et direction vers l'intérieur. */
  door: { ix: number; iz: number; inX: number; inZ: number };
  playerStart: Vec2;
  bell: { x: number; z: number; front: Vec2 };
  targets: Target[];
  /** Zone de l'îlot central (−1 sinon). */
  islandZone: number;
  fountainZone: number;
  /** Index spatial des réservations (indices dans `keep` par case). */
  keepGrid: number[][];
  keepMark: Uint32Array;
  keepToken: number;
  /** Dernier état d'accessibilité validé (vérifications incrémentales). */
  reachCache: { reached: Uint8Array; nCol: number; nTargets: number } | null;
}

/** Ajoute une réservation au sol (et l'indexe par case). */
export function addKeep(ctx: Ctx, b: Box, tag: KeepTag): void {
  const i = ctx.keep.length;
  ctx.keep.push({ b, tag });
  if (ctx.keepMark.length <= i) {
    const m = new Uint32Array(ctx.keepMark.length * 2);
    m.set(ctx.keepMark);
    ctx.keepMark = m;
  }
  const x0 = Math.max(0, Math.floor(b.minX));
  const x1 = Math.min(ctx.W - 1, Math.floor(b.maxX));
  const z0 = Math.max(0, Math.floor(b.minZ));
  const z1 = Math.min(ctx.D - 1, Math.floor(b.maxZ));
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) ctx.keepGrid[z * ctx.W + x].push(i);
}

export function hitsKeep(ctx: Ctx, b: Box, ignore: readonly KeepTag[] = []): boolean {
  const x0 = Math.max(0, Math.floor(b.minX));
  const x1 = Math.min(ctx.W - 1, Math.floor(b.maxX));
  const z0 = Math.max(0, Math.floor(b.minZ));
  const z1 = Math.min(ctx.D - 1, Math.floor(b.maxZ));
  const t = ++ctx.keepToken;
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      const list = ctx.keepGrid[z * ctx.W + x];
      for (let k = 0; k < list.length; k++) {
        const i = list[k];
        if (ctx.keepMark[i] === t) continue;
        ctx.keepMark[i] = t;
        const kp = ctx.keep[i];
        if (!ignore.includes(kp.tag) && boxesOverlap(b, kp.b)) return true;
      }
    }
  return false;
}

/** La boîte ne couvre que des cases de sol de la zone `zid`. */
export function inZoneFloor(ctx: Ctx, b: Box, zid: number): boolean {
  return ctx.space.boxCellsAll(b, (x, z) => ctx.space.floorAt(x, z) && ctx.space.zoneAt(x, z) === zid);
}

/** Case pleine (mur, balustrade, verrière) — ni sol ni vide. */
export function solidCell(ctx: Ctx, ix: number, iz: number): boolean {
  if (ix < 0 || iz < 0 || ix >= ctx.W || iz >= ctx.D) return false;
  const c = ctx.shell.cells[iz * ctx.W + ix];
  return c !== CELL.FLOOR && c !== CELL.VOID;
}

export function cellKind(ctx: Ctx, ix: number, iz: number): number {
  if (ix < 0 || iz < 0 || ix >= ctx.W || iz >= ctx.D) return CELL.VOID;
  return ctx.shell.cells[iz * ctx.W + ix];
}

/**
 * Toutes les cibles sont-elles atteintes depuis l'entrée ?
 * `changed` : boîte de l'unique collision ajoutée depuis la dernière vérification réussie ; si l'accessibilité
 * n'a changé qu'autour d'elle, seules les cibles voisines sont revérifiées.
 */
export function reachOk(ctx: Ctx, changed?: Box): boolean {
  const { space } = ctx;
  const cache = ctx.reachCache;
  const incremental = !!changed && !!cache && cache.nCol === space.colliders.length - 1 && cache.nTargets <= ctx.targets.length;
  // la nouvelle collision ne bouche que des cases déjà inaccessibles : l'inondation est inchangée
  const same = incremental && space.lastBlocked.every((i) => !cache!.reached[i]);
  const reached = same ? cache!.reached : space.bfs(ctx.playerStart.x, ctx.playerStart.z);
  let near: Box | null = null;
  if (changed && cache && incremental) {
    const zone = expand(changed, 0.9);
    let local = true;
    for (let i = 0; i < reached.length; i++)
      if (cache.reached[i] && !reached[i]) {
        const x = (i % ctx.W) + 0.5;
        const z = Math.floor(i / ctx.W) + 0.5;
        if (x < zone.minX || x > zone.maxX || z < zone.minZ || z > zone.maxZ) {
          local = false;
          break;
        }
      }
    if (local) near = expand(changed, 2.6);
  }
  const nOld = near && cache ? cache.nTargets : 0;
  for (let ti = 0; ti < ctx.targets.length; ti++) {
    const t = ctx.targets[ti];
    if (near && ti < nOld && !t.pts.some((p) => p.x >= near.minX && p.x <= near.maxX && p.z >= near.minZ && p.z <= near.maxZ)) continue;
    if (t.all) {
      for (const p of t.pts) if (!space.pointReached(p.x, p.z, reached)) return false;
    } else {
      let ok = false;
      for (const p of t.pts)
        if (space.pointReached(p.x, p.z, reached)) {
          ok = true;
          break;
        }
      if (!ok) return false;
    }
  }
  ctx.reachCache = { reached, nCol: space.colliders.length, nTargets: ctx.targets.length };
  return true;
}

/**
 * Ajoute un décor bloquant si sa collision reste sur le sol, ne chevauche rien, évite les réservations
 * et ne coupe l'accès à aucune cible. Sinon rien n'est ajouté.
 */
export function tryBlocking(
  ctx: Ctx,
  d: DecorSpec,
  shape: { shape: 'box'; minX: number; minZ: number; maxX: number; maxZ: number } | { shape: 'circle'; x: number; z: number; r: number },
  opts: { ignore?: readonly KeepTag[]; gap?: number; check?: boolean } = {},
): boolean {
  const c = { ...shape, solid: 'furniture', ref: `decor:${ctx.decor.length}` } as Collider;
  const b = boxOf(c);
  if (!ctx.space.boxOnFloor(b)) return false;
  if (ctx.space.gapTo(c, 1) < (opts.gap ?? 0.08)) return false;
  if (hitsKeep(ctx, b, opts.ignore ?? [])) return false;
  ctx.decor.push(d);
  ctx.space.addCollider(c);
  if (opts.check !== false && !reachOk(ctx, b)) {
    ctx.space.popCollider();
    ctx.decor.pop();
    return false;
  }
  return true;
}
