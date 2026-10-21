/**
 * Vérification indépendante d'un salon généré : dimensions, comptes, collisions, grille de marche,
 * accessibilité de tout ce qui compte depuis l'entrée, couloirs dégagés.
 * Renvoie la liste des problèmes (vide = salon valide).
 */
import type { LevelPlan, SalonLayout } from '../types';
import { CELL } from '../types';
import { box, boxOf, colliderBoxGap, colliderGap, EPS } from './geom';
import { AGENT_R, Space } from './space';

export function validateLayout(L: SalonLayout, plan?: LevelPlan): string[] {
  const errs: string[] = [];
  const W = L.width;
  const D = L.depth;
  const n = W * D;
  if (L.cells.length !== n || L.walk.length !== n || L.zoneOf.length !== n) return ['dimensions des grilles incohérentes'];

  if (plan) {
    if (Math.abs(W - plan.width) > 2 || Math.abs(D - plan.depth) > 2) errs.push(`taille ${W}×${D} hors de ±2 (${plan.width}×${plan.depth})`);
    if (L.tables.length !== plan.tables) errs.push(`tables : ${L.tables.length} ≠ ${plan.tables}`);
    const vip = L.tables.filter((t) => t.vip).length;
    if (vip !== plan.vipTables) errs.push(`tables VIP : ${vip} ≠ ${plan.vipTables}`);
    if (L.counters.length !== plan.counters) errs.push(`comptoirs : ${L.counters.length} ≠ ${plan.counters}`);
    if (L.pedestals.length !== plan.pedestals) errs.push(`guéridons : ${L.pedestals.length} ≠ ${plan.pedestals}`);
    const served = new Set(L.counters.flatMap((c) => c.dishes));
    for (const d of plan.dishes) if (!served.has(d)) errs.push(`plat ${d} servi par aucun comptoir`);
    if (plan.centralIsland && !L.counters.some((c) => c.island)) errs.push('îlot central manquant');
  }
  for (let i = 0; i < L.tables.length; i++) if (L.tables[i].id !== i) errs.push(`id de table ${i}`);
  for (let i = 0; i < L.counters.length; i++) if (L.counters[i].id !== i) errs.push(`id de comptoir ${i}`);
  for (let i = 0; i < L.pedestals.length; i++) if (L.pedestals[i].id !== i) errs.push(`id de guéridon ${i}`);

  const space = new Space(W, D, L.cells, L.zoneOf);
  for (const c of L.colliders) space.addCollider(c, false);
  space.computeWalk();

  // Collisions : sur le sol, sans chevauchement.
  const refs = new Set<string>();
  L.colliders.forEach((c, i) => {
    if (c.ref) refs.add(c.ref);
    if (!space.boxOnFloor(boxOf(c))) errs.push(`collision hors du sol : ${c.ref ?? i}`);
    space.forNear(boxOf(c), (o, j) => {
      if (j > i && colliderGap(c, o) < -1e-4) errs.push(`chevauchement : ${c.ref ?? i} / ${o.ref ?? j}`);
    });
  });
  for (const t of L.tables) if (!refs.has(`table:${t.id}`)) errs.push(`collision manquante : table ${t.id}`);
  for (const c of L.counters) if (!refs.has(`counter:${c.id}`)) errs.push(`collision manquante : comptoir ${c.id}`);
  for (const p of L.pedestals) if (!refs.has(`pedestal:${p.id}`)) errs.push(`collision manquante : guéridon ${p.id}`);
  L.colliders.forEach((c, i) => {
    if (c.ref?.startsWith('decor:')) {
      const k = Number(c.ref.slice(6));
      if (!L.decor[k]) errs.push(`collision de décor orpheline ${i}`);
    }
  });

  // Grille de marche identique au recalcul.
  for (let i = 0; i < n; i++)
    if (L.walk[i] !== space.walk[i]) {
      errs.push(`grille de marche incohérente en (${i % W}, ${Math.floor(i / W)})`);
      break;
    }

  // Accessibilité depuis l'entrée.
  const ps = L.playerStart;
  const si = Math.floor(ps.z) * W + Math.floor(ps.x);
  if (!space.walk[si]) errs.push('départ du joueur non praticable');
  const reached = space.bfs(ps.x, ps.z);
  const reach = (x: number, z: number) => space.pointReached(x, z, reached);
  for (const c of L.counters) if (!reach(c.front.x, c.front.z)) errs.push(`comptoir ${c.id} : façade inaccessible`);
  if (!reach(L.royalBell.front.x, L.royalBell.front.z)) errs.push('Cloche Royale inaccessible');
  for (const t of L.tables) {
    if (t.serviceSpots.length < 1 || t.serviceSpots.length > 4) errs.push(`table ${t.id} : ${t.serviceSpots.length} points de service`);
    if (!t.serviceSpots.some((p) => reach(p.x, p.z))) errs.push(`table ${t.id} inaccessible`);
    const col = L.colliders.find((c) => c.ref === `table:${t.id}`);
    if (col)
      for (const p of t.serviceSpots) {
        const g = col.shape === 'circle' ? Math.hypot(p.x - col.x, p.z - col.z) - col.r : colliderBoxGap(col, box(p.x, p.z, p.x, p.z));
        if (g < AGENT_R + 0.1 - 1e-6) errs.push(`table ${t.id} : point de service trop près`);
      }
    if (t.seats.length < 2 || t.seats.length > 6) errs.push(`table ${t.id} : ${t.seats.length} sièges`);
    for (const s of t.seats) {
      const a = Math.atan2(t.x - s.x, t.z - s.z);
      const d = Math.abs(Math.atan2(Math.sin(a - s.angle), Math.cos(a - s.angle)));
      if (d > 1e-3) errs.push(`table ${t.id} : siège mal orienté`);
    }
  }
  for (const p of L.pedestals) {
    const R = 0.32 + AGENT_R + 0.15;
    const ok = [
      [R, 0],
      [-R, 0],
      [0, R],
      [0, -R],
    ].some(([dx, dz]) => reach(p.x + dx, p.z + dz));
    if (!ok) errs.push(`guéridon ${p.id} inaccessible`);
  }
  for (const s of L.spawnPoints) if (!reach(s.x, s.z)) errs.push(`point d'apparition inaccessible (${s.x}, ${s.z})`);
  if (L.spawnPoints.length < 4) errs.push(`seulement ${L.spawnPoints.length} points d'apparition`);

  // Couloirs : droits, assez longs et larges, dégagés, atteints.
  if (L.lanes.length < 1) errs.push('aucun couloir');
  L.lanes.forEach((l, i) => {
    const horiz = Math.abs(l.a.z - l.b.z) < EPS;
    const vert = Math.abs(l.a.x - l.b.x) < EPS;
    const len = Math.hypot(l.b.x - l.a.x, l.b.z - l.a.z);
    if (!horiz && !vert) errs.push(`couloir ${i} non aligné`);
    if (len < 5 - EPS) errs.push(`couloir ${i} trop court (${len.toFixed(1)})`);
    if (l.width < 1.2 - EPS) errs.push(`couloir ${i} trop étroit`);
    const h = l.width / 2;
    const b = horiz
      ? box(Math.min(l.a.x, l.b.x), l.a.z - h, Math.max(l.a.x, l.b.x), l.a.z + h)
      : box(l.a.x - h, Math.min(l.a.z, l.b.z), l.a.x + h, Math.max(l.a.z, l.b.z));
    if (!space.boxOnFloor(b)) errs.push(`couloir ${i} sur un mur`);
    if (space.boxGapTo(b, 0.5) < -EPS) errs.push(`couloir ${i} encombré`);
    const steps = Math.round(len);
    for (let k = 0; k <= steps; k++) {
      const t = steps ? k / steps : 0;
      const x = l.a.x + (l.b.x - l.a.x) * t;
      const z = l.a.z + (l.b.z - l.a.z) * t;
      if (!reached[Math.floor(z) * W + Math.floor(x)]) {
        errs.push(`couloir ${i} non atteint`);
        break;
      }
    }
  });

  // Entrée sur un mur, départ et cloche dans la salle.
  const ei = Math.floor(L.entrance.z) * W + Math.floor(L.entrance.x);
  if (L.cells[ei] === CELL.FLOOR || L.cells[ei] === CELL.VOID) errs.push("l'entrée n'est pas sur un mur");
  if (L.zones.length < 1) errs.push('aucune zone');
  return errs;
}
