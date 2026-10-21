/**
 * Générateur procédural des salons de La Duchesse.
 * « Zéro labyrinthe » : de vraies salles ouvertes et structurées (rectangles adjacents reliés par de larges
 * ouvertures), tables en rangées régulières, comptoirs adossés aux murs du fond, décor généreux.
 * Déterministe : même plan + même graine → même salon. Ne lève jamais d'exception.
 */
import { Rng } from '../core/rng';
import { dishesOfStation } from '../data/dishes';
import type { Collider, CounterSpec, LevelPlan, SalonLayout } from '../types';
import { CELL } from '../types';
import { buildAttempt } from './build';
import { Space } from './space';

export { layoutToAscii } from './ascii';
export { validateLayout } from './validate';

/** Nombre de tentatives « normales » avant les replis. */
const ATTEMPTS = 20;

export function generateSalon(plan: LevelPlan, seed: number): SalonLayout {
  const root = new Rng(seed);
  const g0 = baseGrowth(plan);
  for (let a = 0; a < ATTEMPTS; a++) {
    const growth = Math.min(2, g0 + (a < 4 ? 0 : a < 9 ? 1 : 2));
    const res = safeAttempt(plan, seed, root.fork(a + 1), { growth, simple: a >= 15, single: false });
    if (res) return res;
  }
  // Repli : un seul grand salon rectangulaire (l'estrade VIP éventuelle y est posée).
  for (let a = 0; a < 10; a++) {
    const res = safeAttempt(plan, seed, root.fork(1000 + a), { growth: 2, simple: true, single: true });
    if (res) return res;
  }
  return emergencyLayout(plan, seed);
}

/** Agrandissement de départ (0..2) : les petits salons très meublés gagnent une ou deux cases. */
export function baseGrowth(plan: LevelPlan): number {
  for (let g = 0; g < 2; g++) {
    const inner = (plan.width + g - 2) * (plan.depth + g - 2) - (plan.zoneCount - 1) * (plan.depth + g);
    const lanes = Math.max(1, Math.min(10, Math.round(inner / 60)));
    const need =
      (plan.tables - plan.vipTables) * 12.25 +
      plan.vipTables * 16 +
      (plan.vipTables > 0 ? 10 : 0) +
      plan.counters * 6 +
      plan.pedestals * 4 +
      12 +
      lanes * 10 +
      (plan.centralIsland ? 25 : 0) +
      (plan.fountain ? 30 : 0);
    if (need <= inner * 0.85) return g;
  }
  return 2;
}

function safeAttempt(plan: LevelPlan, seed: number, rng: Rng, opt: { growth: number; simple: boolean; single: boolean }): SalonLayout | null {
  try {
    return buildAttempt(plan, seed, rng, opt).layout;
  } catch {
    return null;
  }
}

/** Dernier recours (ne devrait jamais servir) : salle vide minimale mais jouable. */
function emergencyLayout(plan: LevelPlan, seed: number): SalonLayout {
  const W = plan.width + 2;
  const D = plan.depth + 2;
  const cells = new Uint8Array(W * D);
  const zoneOf = new Int16Array(W * D).fill(0);
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) cells[z * W + x] = x === 0 || z === 0 || x === W - 1 || z === D - 1 ? CELL.WALL : CELL.FLOOR;
  const counters: CounterSpec[] = [];
  const nC = Math.max(1, plan.counters);
  for (let i = 0; i < nC; i++) {
    const station = plan.stations[i % plan.stations.length];
    const x = 2 + (i % Math.max(1, Math.floor((W - 3) / 3))) * 3;
    const dishes = i === 0 ? [...plan.dishes] : dishesOfStation(station, plan.dishes);
    counters.push({ id: i, x, z: 1.45, w: 2, d: 0.9, rot: 0, station, dishes, front: { x, z: 2.65 }, island: false });
  }
  const colliders: Collider[] = counters.map((c) => ({ shape: 'box', minX: c.x - 1, minZ: 1, maxX: c.x + 1, maxZ: 1.9, solid: 'furniture', ref: `counter:${c.id}` }));
  const space = new Space(W, D, cells, zoneOf);
  for (const c of colliders) space.addCollider(c, false);
  space.computeWalk();
  const doorX = Math.floor(W / 2);
  return {
    level: plan.level,
    seed,
    biome: plan.biome,
    width: W,
    depth: D,
    cells,
    zoneOf,
    zones: [{ id: 0, kind: 'salon', rect: { x: 1, z: 1, w: W - 2, d: D - 2 }, floor: 'parquet', raised: 0, name: 'Le Petit Salon' }],
    tables: [],
    counters,
    pedestals: [],
    decor: [],
    colliders,
    royalBell: { x: doorX + 2.5, z: D - 1.6, front: { x: doorX + 2.5, z: D - 2.6 } },
    entrance: { x: doorX + 0.5, z: D - 0.5, rot: 2 },
    playerStart: { x: doorX + 0.5, z: D - 2.5 },
    tideOrigin: { x: counters[0].x, z: counters[0].z },
    lanes: [{ a: { x: 1.5, z: D - 4.5 }, b: { x: W - 1.5, z: D - 4.5 }, width: 1.2 }],
    spawnPoints: [
      { x: 2.5, z: D - 2.5 },
      { x: W - 2.5, z: D - 2.5 },
      { x: 2.5, z: 4.5 },
      { x: W - 2.5, z: 4.5 },
    ],
    walk: space.walk,
  };
}
