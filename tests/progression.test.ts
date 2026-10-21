import { describe, expect, it } from 'vitest';
import { levelPlan, LEVEL_COUNT } from '../src/data/progression';
import { INTROS } from '../src/data/bestiary';

describe('progression', () => {
  it('calibre 100 niveaux cohérents', () => {
    let prevQuota = 0;
    const rows: string[] = [];
    for (let l = 1; l <= LEVEL_COUNT; l++) {
      const p = levelPlan(l);
      expect(p.width).toBeGreaterThanOrEqual(11);
      expect(p.tables).toBeGreaterThanOrEqual(3);
      expect(p.quota).toBeGreaterThan(0);
      expect(p.quota).toBeGreaterThanOrEqual(prevQuota * 0.9);
      prevQuota = p.quota;
      if (l <= 12 || l % 10 === 0)
        rows.push(
          `${String(l).padStart(3)} ${p.biome.padEnd(8)} ${p.width}x${p.depth} z${p.zoneCount} t${p.tables} vip${p.vipTables} c${p.counters} ` +
            `${p.duration}s quota=${p.quota} pat=${p.patience} npcs=${p.npcs.map((n) => n.kind + n.count).join(',')} traps=${p.traps.length} intro=${p.intro}`,
        );
    }
    console.log(rows.join('\n'));
  });

  it('introduit une nouveauté tous les 5-6 niveaux jusqu’au niveau 90', () => {
    const levels = [...new Set(INTROS.map((i) => i.level))].filter((l) => l >= 4).sort((a, b) => a - b);
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(6);
    expect(levels[levels.length - 1]).toBeLessThanOrEqual(90);
  });

  it('les niveaux 1 à 10 sont courts (30-45 s) et les derniers durent 10-15 min', () => {
    for (let l = 1; l <= 10; l++) {
      const d = levelPlan(l).duration;
      expect(d).toBeGreaterThanOrEqual(30);
      expect(d).toBeLessThanOrEqual(45);
    }
    const last = levelPlan(100).duration;
    expect(last).toBeGreaterThanOrEqual(600);
    expect(last).toBeLessThanOrEqual(900);
  });
});
