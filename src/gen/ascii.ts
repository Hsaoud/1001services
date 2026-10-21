/**
 * Rendu texte d'un salon (débogage) :
 *   ` ` vide · `#` mur · `=` balustrade · `%` verrière · `.` sol · `:` estrade
 *   `T`/`t` table (`V`/`v` VIP) · `C`/`c` comptoir (`I`/`i` îlot) · `P` guéridon · `B` Cloche Royale
 *   `F` fontaine · `O` colonne · `*` autre décor bloquant · `-` `|` couloirs · `D` porte · `@` départ · `s` apparition
 */
import type { SalonLayout } from '../types';
import { CELL } from '../types';
import { circleGap } from './geom';

export function layoutToAscii(L: SalonLayout): string {
  const W = L.width;
  const D = L.depth;
  const g: string[][] = [];
  for (let z = 0; z < D; z++) {
    const row: string[] = [];
    for (let x = 0; x < W; x++) {
      const i = z * W + x;
      const c = L.cells[i];
      const zone = L.zones[L.zoneOf[i]];
      row.push(
        c === CELL.VOID ? ' ' : c === CELL.WALL ? '#' : c === CELL.RAIL ? '=' : c === CELL.GLASS ? '%' : zone && zone.raised > 0 ? ':' : '.',
      );
    }
    g.push(row);
  }
  const set = (x: number, z: number, ch: string, force = true) => {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    if (ix < 0 || iz < 0 || ix >= W || iz >= D) return;
    if (force || g[iz][ix] === '.' || g[iz][ix] === ':') g[iz][ix] = ch;
  };
  for (const l of L.lanes) {
    const horiz = l.a.z === l.b.z;
    const n = Math.round(Math.hypot(l.b.x - l.a.x, l.b.z - l.a.z));
    for (let k = 0; k <= n; k++) {
      const t = n ? k / n : 0;
      set(l.a.x + (l.b.x - l.a.x) * t, l.a.z + (l.b.z - l.a.z) * t, horiz ? '-' : '|', false);
    }
  }
  // empreintes des collisions (cases dont le centre est couvert)
  for (const c of L.colliders) {
    const ref = c.ref ?? '';
    let ch = '*';
    if (ref.startsWith('table:')) ch = L.tables[Number(ref.slice(6))]?.vip ? 'v' : 't';
    else if (ref.startsWith('counter:')) ch = L.counters[Number(ref.slice(8))]?.island ? 'i' : 'c';
    else if (ref.startsWith('pedestal:')) ch = 'P';
    else if (ref === 'bell') ch = 'B';
    else if (ref.startsWith('decor:')) {
      const k = L.decor[Number(ref.slice(6))]?.kind;
      ch = k === 'fountain' ? 'F' : k === 'column' ? 'O' : '*';
    }
    for (let z = 0; z < D; z++)
      for (let x = 0; x < W; x++) {
        const cx = x + 0.5;
        const cz = z + 0.5;
        if (circleGap(c, cx, cz, 0.05) < 0) set(cx, cz, ch);
      }
  }
  for (const t of L.tables) set(t.x, t.z, t.vip ? 'V' : 'T');
  for (const c of L.counters) set(c.x, c.z, c.island ? 'I' : 'C');
  for (const p of L.pedestals) set(p.x, p.z, 'P');
  set(L.royalBell.x, L.royalBell.z, 'B');
  for (const s of L.spawnPoints) set(s.x, s.z, 's', false);
  set(L.entrance.x, L.entrance.z, 'D');
  set(L.playerStart.x, L.playerStart.z, '@');
  const head = `Niveau ${L.level} · ${L.biome} · ${W}×${D} · ${L.zones.map((z) => `${z.id}:${z.name} (${z.kind}, ${z.floor})`).join(' · ')}`;
  return [head, ...g.map((r) => r.join(''))].join('\n');
}
