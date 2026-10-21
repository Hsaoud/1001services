import { describe, expect, it } from 'vitest';
import { levelSeed } from '../src/core/rng';
import { LEVEL_COUNT, levelPlan } from '../src/data/progression';
import { generateSalon, layoutToAscii, validateLayout } from '../src/gen/index';
import type { SalonLayout } from '../src/types';
import { CELL } from '../src/types';

const layouts = new Map<number, SalonLayout>();
function canonical(level: number): SalonLayout {
  let L = layouts.get(level);
  if (!L) {
    L = generateSalon(levelPlan(level), levelSeed(level));
    layouts.set(level, L);
  }
  return L;
}

/** Sérialisation stable (les tableaux typés deviennent des tableaux). */
function serialize(L: SalonLayout): string {
  return JSON.stringify(L, (_k, v) => (ArrayBuffer.isView(v) ? Array.from(v as Uint8Array) : v));
}

describe('générateur de salons', () => {
  it('produit 100 salons valides avec les graines canoniques', () => {
    const problems: string[] = [];
    for (let l = 1; l <= LEVEL_COUNT; l++) {
      const errs = validateLayout(canonical(l), levelPlan(l));
      if (errs.length) problems.push(`niveau ${l} : ${errs.slice(0, 3).join(' ; ')}`);
    }
    expect(problems).toEqual([]);
  });

  it('respecte les comptes du plan (tables, VIP, comptoirs, guéridons, plats, îlot)', () => {
    for (let l = 1; l <= LEVEL_COUNT; l++) {
      const plan = levelPlan(l);
      const L = canonical(l);
      expect(L.tables.length, `tables niveau ${l}`).toBe(plan.tables);
      expect(L.tables.filter((t) => t.vip).length, `VIP niveau ${l}`).toBe(plan.vipTables);
      expect(L.counters.length, `comptoirs niveau ${l}`).toBe(plan.counters);
      expect(L.pedestals.length, `guéridons niveau ${l}`).toBe(plan.pedestals);
      const served = new Set(L.counters.flatMap((c) => c.dishes));
      for (const d of plan.dishes) expect(served.has(d), `plat ${d} niveau ${l}`).toBe(true);
      // les premiers comptoirs suivent l'ordre des postes du plan
      for (let i = 0; i < Math.min(plan.counters, plan.stations.length); i++) expect(L.counters[i].station).toBe(plan.stations[i]);
      const islands = L.counters.filter((c) => c.island);
      expect(islands.length, `îlot niveau ${l}`).toBe(plan.centralIsland ? 1 : 0);
      const tide = islands[0] ?? L.counters[0];
      expect(L.tideOrigin).toEqual({ x: tide.x, z: tide.z });
      expect(Math.abs(L.width - plan.width)).toBeLessThanOrEqual(2);
      expect(Math.abs(L.depth - plan.depth)).toBeLessThanOrEqual(2);
    }
  });

  it('compose les zones demandées (noms élégants, sols, estrade VIP surélevée)', () => {
    for (let l = 1; l <= LEVEL_COUNT; l++) {
      const plan = levelPlan(l);
      const L = canonical(l);
      const kinds = L.zones.map((z) => z.kind);
      for (const k of plan.zoneKinds) expect(kinds, `zone ${k} niveau ${l}`).toContain(k);
      if (plan.vipTables > 0) expect(kinds).toContain('vip');
      expect(new Set(L.zones.map((z) => z.name)).size).toBe(L.zones.length);
      for (const z of L.zones) {
        expect(z.name.length).toBeGreaterThan(3);
        if (z.kind === 'vip') {
          expect(z.raised).toBeCloseTo(0.18);
          expect(['stage', 'carpet']).toContain(z.floor);
        } else expect(z.raised).toBe(0);
        if (z.kind === 'galerie') expect(z.floor).toBe('marble');
      }
      // tables VIP sur l'estrade
      for (const t of L.tables) expect(L.zones[t.zone].kind === 'vip', `table ${t.id} niveau ${l}`).toBe(t.vip);
      // terrasse : balustrades ; jardin d'hiver : verrière
      for (const z of L.zones) {
        if (z.kind !== 'terrasse' && z.kind !== 'jardin') continue;
        const want = z.kind === 'terrasse' ? CELL.RAIL : CELL.GLASS;
        let found = false;
        for (let i = 0; i < L.cells.length; i++) if (L.zoneOf[i] === z.id && L.cells[i] === want) found = true;
        expect(found, `${z.kind} niveau ${l}`).toBe(true);
      }
      // chaque zone est atteignable depuis l'entrée
      for (const z of L.zones) {
        let any = false;
        for (let i = 0; i < L.cells.length; i++) if (L.zoneOf[i] === z.id && L.cells[i] === CELL.FLOOR && L.walk[i]) any = true;
        expect(any, `zone ${z.name} niveau ${l}`).toBe(true);
      }
    }
  });

  it('place chaises, couloirs, points d’apparition et décor de façon cohérente', () => {
    for (let l = 1; l <= LEVEL_COUNT; l++) {
      const L = canonical(l);
      for (const t of L.tables) {
        // plateau avant rotation : rond Ø1,0–1,2, carré 1,0, rectangle 1,8 × 0,9 (rot 0 ou 1)
        if (t.shape === 'rect') expect([t.w, t.d, t.rot <= 1]).toEqual([1.8, 0.9, true]);
        else if (t.shape === 'square') expect([t.w, t.d]).toEqual([1, 1]);
        else expect(t.w === t.d && t.w >= 1 && t.w <= 1.2).toBe(true);
        const col = L.colliders.find((c) => c.ref === `table:${t.id}`)!;
        // la collision de la table englobe ses chaises
        for (const s of t.seats) {
          if (col.shape === 'circle') expect(Math.hypot(s.x - col.x, s.z - col.z)).toBeLessThan(col.r);
          else {
            expect(s.x).toBeGreaterThan(col.minX);
            expect(s.x).toBeLessThan(col.maxX);
            expect(s.z).toBeGreaterThan(col.minZ);
            expect(s.z).toBeLessThan(col.maxZ);
          }
        }
      }
      expect(L.lanes.length).toBeGreaterThanOrEqual(1);
      expect(L.spawnPoints.length).toBeGreaterThanOrEqual(l >= 4 ? 8 : 4);
      expect(L.decor.some((d) => d.kind === 'door')).toBe(true);
      for (const d of L.decor) {
        const i = Math.floor(d.z) * L.width + Math.floor(d.x);
        if (d.wall) expect(L.cells[i] === CELL.FLOOR || L.cells[i] === CELL.VOID, `${d.kind} mural niveau ${l}`).toBe(false);
      }
      const blocking = L.colliders.filter((c) => c.ref?.startsWith('decor:'));
      for (const c of blocking) expect(L.decor[Number(c.ref!.slice(6))].wall ?? false).toBe(false);
      // l'entrée est sur un mur « de devant »
      expect([2, 3]).toContain(L.entrance.rot);
    }
    // les grands salons ont plusieurs couloirs
    expect(canonical(100).lanes.length).toBeGreaterThanOrEqual(6);
  });

  it('reste valide avec d’autres graines', () => {
    const problems: string[] = [];
    for (let l = 1; l <= LEVEL_COUNT; l += 3)
      for (const v of [1, 2, 7]) {
        const plan = levelPlan(l);
        const errs = validateLayout(generateSalon(plan, levelSeed(l, v)), plan);
        if (errs.length) problems.push(`niveau ${l} variante ${v} : ${errs.slice(0, 2).join(' ; ')}`);
      }
    for (const seed of [0, 1, 42, 0xffffffff, 123456789]) {
      const plan = levelPlan(57);
      const errs = validateLayout(generateSalon(plan, seed), plan);
      if (errs.length) problems.push(`graine ${seed} : ${errs[0]}`);
    }
    expect(problems).toEqual([]);
  });

  it('est déterministe (même graine → même salon)', () => {
    for (const l of [1, 7, 15, 33, 64, 100]) {
      const a = serialize(generateSalon(levelPlan(l), levelSeed(l)));
      const b = serialize(generateSalon(levelPlan(l), levelSeed(l)));
      expect(a).toBe(b);
      const c = serialize(generateSalon(levelPlan(l), levelSeed(l, 3)));
      expect(c).not.toBe(a);
    }
  });

  it('génère vite (< 40 ms par niveau, même au niveau 100)', () => {
    for (let l = 95; l <= 100; l++) generateSalon(levelPlan(l), levelSeed(l)); // échauffement
    // meilleur de 5 essais au plus par niveau : on mesure le coût de l'algorithme, pas le bruit
    // (ramasse-miettes, autres fichiers de tests lancés en parallèle)
    let worst = 0;
    let total = 0;
    for (let l = 1; l <= LEVEL_COUNT; l++) {
      let best = Infinity;
      for (let k = 0; k < 5 && best >= 20; k++) {
        const t0 = performance.now();
        generateSalon(levelPlan(l), levelSeed(l));
        best = Math.min(best, performance.now() - t0);
      }
      total += best;
      worst = Math.max(worst, best);
    }
    expect(total / LEVEL_COUNT).toBeLessThan(25);
    expect(worst).toBeLessThan(40);
  });

  it('ne lève jamais d’exception, même pour un plan impossible', () => {
    const plan = { ...levelPlan(3), tables: 60, pedestals: 30 };
    expect(() => generateSalon(plan, 5)).not.toThrow();
    const L = generateSalon(plan, 5);
    expect(L.width).toBeGreaterThan(0);
    expect(L.counters.length).toBeGreaterThan(0);
    expect(L.walk.length).toBe(L.width * L.depth);
  });

  it('dessine un aperçu ASCII lisible', () => {
    const txt = layoutToAscii(canonical(12));
    const lines = txt.split('\n');
    expect(lines.length).toBe(canonical(12).depth + 1);
    expect(txt).toContain('D');
    expect(txt).toContain('@');
    expect(txt).toContain('B');
  });
});
