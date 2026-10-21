import { describe, expect, it } from 'vitest';
import { simulate } from './sim';

describe('service complet (bot)', () => {
  it('le niveau 1 se termine en sonnant la Cloche Royale', () => {
    const r = simulate(1, { maxTime: 120 });
    expect(r.served).toBeGreaterThan(0);
    expect(r.status).toBe('won');
  });

  it('calibrage : score du bot sur la durée de référence', () => {
    const rows: string[] = [];
    for (const l of [1, 2, 3, 5, 8, 10, 12, 15, 20, 30, 40, 50, 60, 75, 90, 100]) {
      const r = simulate(l, { ringBell: false });
      rows.push(
        `niv ${String(l).padStart(3)}  durée ${String(r.duration).padStart(4)}s  quota ${String(r.quota).padStart(6)}  bot ${String(r.scoreAtDuration).padStart(6)}  ` +
          `ratio ${(r.scoreAtDuration / r.quota).toFixed(2)}  quota à ${r.quotaTime?.toFixed(0) ?? '—'}s  servis ${r.served}  perdus ${r.expired}  renversés ${r.crashes}`,
      );
    }
    console.log(rows.join('\n'));
  }, 120_000);
});
