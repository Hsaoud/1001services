/**
 * Contexte partagé pendant la construction d'un salon (grille, style, batch, lueurs, ressources possédées).
 */
import type * as THREE from 'three';
import type { SalonLayout } from '../../types';
import type { BiomeStyle } from '../biomes';
import type { StaticBatch } from '../batch';
import type { GlowPoints, LightPool } from '../glow';
import type { FxSystem } from '../fx';
import type { SalonGrid } from './grid';

/** Élément animé d'ambiance (fontaine, lustre, feuillage…). */
export interface Animated {
  update(dt: number, time: number): void;
  dispose?(): void;
}

export interface SalonCtx {
  layout: SalonLayout;
  grid: SalonGrid;
  style: BiomeStyle;
  batch: StaticBatch;
  /** Racine du salon (statique fusionné + objets dynamiques). */
  root: THREE.Group;
  glows: GlowPoints;
  fx: FxSystem;
  lights: LightPool;
  anim: Animated[];
  /** Ressources créées pour ce salon (libérées au clearSalon). */
  owned: { materials: THREE.Material[]; geometries: THREE.BufferGeometry[] };
  /** Objets dont le tramage doit suivre le joueur (lustres…) : déjà gérés par les matériaux patchés. */
  chandeliers: { setShake(a: number): void }[];
}

/** Petit générateur déterministe local (mulberry32). */
export function rand(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    let t = (s = (s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hachage de deux entiers en graine. */
export function seedOf(a: number, b: number): number {
  let h = Math.imul(a ^ 0x85ebca6b, 0xc2b2ae35) ^ Math.imul(b + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  return (h ^ (h >>> 12)) >>> 0;
}
