/**
 * Géométrie 2D (plan XZ) du générateur : boîtes alignées, distances entre collisions.
 */
import type { Collider } from '../types';

export interface Box {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export const EPS = 1e-6;

export function box(minX: number, minZ: number, maxX: number, maxZ: number): Box {
  return { minX, minZ, maxX, maxZ };
}

/** Boîte centrée (demi-largeurs hx, hz). */
export function boxAround(x: number, z: number, hx: number, hz: number): Box {
  return { minX: x - hx, minZ: z - hz, maxX: x + hx, maxZ: z + hz };
}

export function expand(b: Box, m: number): Box {
  return { minX: b.minX - m, minZ: b.minZ - m, maxX: b.maxX + m, maxZ: b.maxZ + m };
}

/** Recouvrement strict (contact autorisé). */
export function boxesOverlap(a: Box, b: Box): boolean {
  return a.minX < b.maxX - EPS && b.minX < a.maxX - EPS && a.minZ < b.maxZ - EPS && b.minZ < a.maxZ - EPS;
}

/** Distance euclidienne entre deux boîtes (négative si elles se recouvrent). */
export function boxGap(a: Box, b: Box): number {
  const dx = Math.max(a.minX - b.maxX, b.minX - a.maxX);
  const dz = Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ);
  if (dx < 0 && dz < 0) return Math.max(dx, dz);
  return Math.hypot(Math.max(0, dx), Math.max(0, dz));
}

/** Distance d'un point à une boîte (négative à l'intérieur). */
export function pointBoxDist(x: number, z: number, b: Box): number {
  const dx = Math.max(b.minX - x, x - b.maxX);
  const dz = Math.max(b.minZ - z, z - b.maxZ);
  if (dx < 0 && dz < 0) return Math.max(dx, dz);
  return Math.hypot(Math.max(0, dx), Math.max(0, dz));
}

/** Boîte englobante d'une collision. */
export function boxOf(c: Collider): Box {
  if (c.shape === 'box') return { minX: c.minX, minZ: c.minZ, maxX: c.maxX, maxZ: c.maxZ };
  return { minX: c.x - c.r, minZ: c.z - c.r, maxX: c.x + c.r, maxZ: c.z + c.r };
}

/** Jeu libre entre deux collisions (négatif = interpénétration). */
export function colliderGap(a: Collider, b: Collider): number {
  if (a.shape === 'circle' && b.shape === 'circle') return Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r;
  if (a.shape === 'circle' && b.shape === 'box') return pointBoxDist(a.x, a.z, b) - a.r;
  if (a.shape === 'box' && b.shape === 'circle') return pointBoxDist(b.x, b.z, a) - b.r;
  return boxGap(a as Box, b as Box);
}

/** Jeu libre entre une collision et un cercle. */
export function circleGap(c: Collider, x: number, z: number, r: number): number {
  if (c.shape === 'circle') return Math.hypot(c.x - x, c.z - z) - c.r - r;
  return pointBoxDist(x, z, c) - r;
}

/** Jeu libre entre une collision et une boîte. */
export function colliderBoxGap(c: Collider, b: Box): number {
  if (c.shape === 'circle') return pointBoxDist(c.x, c.z, b) - c.r;
  return boxGap(c, b);
}

export function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

/** Arrondi au demi-pas le plus proche (positions propres, alignées sur la grille). */
export function snapHalf(v: number): number {
  return Math.round(v * 2) / 2;
}
