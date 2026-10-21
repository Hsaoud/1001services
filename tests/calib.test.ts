import { it } from 'vitest';
import { simulate } from './sim';

// Mesure brute du bot équipé, niveau par niveau (calibrage des quotas). Lancer avec CALIB=1.
it.skipIf(!process.env.CALIB)('mesure du bot', () => {
  const rows: string[] = [];
  for (let l = 1; l <= 100; l += l < 10 ? 1 : 5) {
    const r = simulate(l, { ringBell: false });
    const spd = r.duration / Math.max(1, r.served);
    const vpd = r.scoreAtDuration / Math.max(1, r.served);
    rows.push(`${l}\t${r.duration}\t${r.served}\t${r.expired}\t${r.crashes}\t${spd.toFixed(2)}\t${vpd.toFixed(0)}\t${r.scoreAtDuration}\t${r.quota}`);
  }
  console.log('niv\tdurée\tservis\tperdus\trenv\ts/livr\tpts/livr\tscore\tquota\n' + rows.join('\n'));
}, 600_000);
