/**
 * Décor du diorama : généreux et cohérent avec l'ambiance de chaque zone.
 * Les décors bloquants (plantes, banquettes, piano…) ne sont posés que s'ils ne coupent l'accès à rien ;
 * les décors muraux, lustres, tapis, parasols et arches ne bloquent jamais.
 */
import type { DecorKind, DecorSpec } from '../types';
import { CELL } from '../types';
import { type Ctx, type KeepTag, type ZoneInfo, cellKind, hitsKeep, solidCell, tryBlocking } from './ctx';
import { type Box, box, boxesOverlap, boxOf, dist } from './geom';

const PI = Math.PI;

/** Un côté de zone : cases de sol en bordure et case de mur derrière chacune. */
interface Side {
  name: 'back' | 'left' | 'front' | 'right';
  /** Orientation du décor posé contre ce mur (vers la salle). */
  rot: number;
  /** Normale vers la salle. */
  nx: number;
  nz: number;
  cells: { fx: number; fz: number; wx: number; wz: number }[];
}

function sides(z: ZoneInfo): Side[] {
  const R = z.rect;
  const out: Side[] = [
    { name: 'back', rot: 0, nx: 0, nz: 1, cells: [] },
    { name: 'left', rot: PI / 2, nx: 1, nz: 0, cells: [] },
    { name: 'front', rot: PI, nx: 0, nz: -1, cells: [] },
    { name: 'right', rot: -PI / 2, nx: -1, nz: 0, cells: [] },
  ];
  for (let x = R.x; x < R.x + R.w; x++) {
    out[0].cells.push({ fx: x, fz: R.z, wx: x, wz: R.z - 1 });
    out[2].cells.push({ fx: x, fz: R.z + R.d - 1, wx: x, wz: R.z + R.d });
  }
  for (let zz = R.z; zz < R.z + R.d; zz++) {
    out[1].cells.push({ fx: R.x, fz: zz, wx: R.x - 1, wz: zz });
    out[3].cells.push({ fx: R.x + R.w - 1, fz: zz, wx: R.x + R.w, wz: zz });
  }
  return out;
}

/** Plages de cases consécutives contre un mur plein. */
function wallRuns(ctx: Ctx, s: Side, zid: number): { fx: number; fz: number; wx: number; wz: number }[][] {
  const runs: { fx: number; fz: number; wx: number; wz: number }[][] = [];
  let cur: { fx: number; fz: number; wx: number; wz: number }[] = [];
  for (const c of s.cells) {
    const ok = solidCell(ctx, c.wx, c.wz) && ctx.space.floorAt(c.fx, c.fz) && ctx.space.zoneAt(c.fx, c.fz) === zid;
    if (ok) cur.push(c);
    else if (cur.length) {
      runs.push(cur);
      cur = [];
    }
  }
  if (cur.length) runs.push(cur);
  return runs;
}

/** Boîte d'un meuble adossé au mur de `s`, centré sur l'abscisse `t` (le long du mur), largeur w, profondeur d. */
function wallBox(s: Side, c: { wx: number; wz: number }, t: number, w: number, d: number): { b: Box; x: number; z: number } {
  switch (s.name) {
    case 'back': {
      const face = c.wz + 1;
      return { b: box(t - w / 2, face + 0.04, t + w / 2, face + 0.04 + d), x: t, z: face + 0.04 + d / 2 };
    }
    case 'front': {
      const face = c.wz;
      return { b: box(t - w / 2, face - 0.04 - d, t + w / 2, face - 0.04), x: t, z: face - 0.04 - d / 2 };
    }
    case 'left': {
      const face = c.wx + 1;
      return { b: box(face + 0.04, t - w / 2, face + 0.04 + d, t + w / 2), x: face + 0.04 + d / 2, z: t };
    }
    case 'right': {
      const face = c.wx;
      return { b: box(face - 0.04 - d, t - w / 2, face - 0.04, t + w / 2), x: face - 0.04 - d / 2, z: t };
    }
  }
}

const along = (s: Side, c: { fx: number; fz: number }) => (s.name === 'back' || s.name === 'front' ? c.fx : c.fz);

export function decorate(ctx: Ctx): void {
  door(ctx);
  arches(ctx);
  estradeSteps(ctx);
  const zones = ctx.zones;
  const tall = new Set<string>(); // cases de mur masquées par un meuble haut (pas de tableau au-dessus)
  for (const z of zones) wallFurniture(ctx, z, tall);
  for (const z of zones) corners(ctx, z);
  openingPlants(ctx);
  for (const z of zones) if (z.kind === 'galerie' || (z.main && z.style === 'galerie' && Math.min(z.rect.w, z.rect.d) >= 9)) galerieColumns(ctx, z);
  for (const z of zones) if (z.outdoor || z.style === 'jardin' || z.style === 'terrasse') outdoorEdges(ctx, z);
  wallHangings(ctx, tall);
  chandeliers(ctx);
  rugs(ctx);
  parasols(ctx);
  spareFill(ctx);
  openFill(ctx);
}

// ─────────────────────────────────────────── Non bloquants : porte, arches, marches

function door(ctx: Ctx): void {
  const e = ctx.entrance;
  ctx.decor.push({ kind: 'door', x: e.x, z: e.z, rot: e.rot === 2 ? PI : -PI / 2, wall: true, w: 1, variant: ctx.rng.int(0, 2) });
}

function arches(ctx: Ctx): void {
  for (const op of ctx.shell.openings) {
    if (op.colonnade) continue;
    const mid = op.start + op.len / 2;
    const x = op.axis === 'x' ? op.line + 0.5 : mid;
    const z = op.axis === 'x' ? mid : op.line + 0.5;
    ctx.decor.push({ kind: 'arch', x, z, rot: op.axis === 'x' ? PI / 2 : 0, w: op.len, d: 1, variant: ctx.rng.int(0, 2) });
  }
}

function estradeSteps(ctx: Ctx): void {
  for (const z of ctx.zones) {
    if (z.kind !== 'vip') continue;
    const E = z.rect;
    const edges = [
      { cells: range(E.x, E.x + E.w).map((x) => [x, E.z - 1]), rot: PI, horiz: true, line: E.z },
      { cells: range(E.x, E.x + E.w).map((x) => [x, E.z + E.d]), rot: 0, horiz: true, line: E.z + E.d },
      { cells: range(E.z, E.z + E.d).map((zz) => [E.x - 1, zz]), rot: -PI / 2, horiz: false, line: E.x },
      { cells: range(E.z, E.z + E.d).map((zz) => [E.x + E.w, zz]), rot: PI / 2, horiz: false, line: E.x + E.w },
    ];
    for (const e of edges) {
      let s = -1;
      const flush = (end: number) => {
        if (s < 0) return;
        const a = e.horiz ? e.cells[s][0] : e.cells[s][1];
        const b = e.horiz ? e.cells[end - 1][0] + 1 : e.cells[end - 1][1] + 1;
        const m = (a + b) / 2;
        ctx.decor.push({ kind: 'stage_steps', x: e.horiz ? m : e.line, z: e.horiz ? e.line : m, rot: e.rot, w: b - a, d: 0.4 });
        s = -1;
      };
      for (let i = 0; i < e.cells.length; i++) {
        const [x, zz] = e.cells[i];
        const open = ctx.space.floorAt(x, zz) && ctx.space.zoneAt(x, zz) !== z.id;
        if (open && s < 0) s = i;
        if (!open) flush(i);
      }
      flush(e.cells.length);
    }
  }
}

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i < b; i++) out.push(i);
  return out;
}

// ─────────────────────────────────────────── Bloquants contre les murs

function wallFurniture(ctx: Ctx, z: ZoneInfo, tall: Set<string>): void {
  const r = ctx.rng;
  const indoor = !z.outdoor;
  // sur l'estrade VIP, sa propre réservation n'interdit pas le décor
  const ignore: KeepTag[] = z.kind === 'vip' ? ['estrade'] : [];
  const ss = sides(z);
  const backs = ss.filter((s) => s.name === 'back' || s.name === 'left');
  let shelves = 0;
  let cakes = 0;
  let pianos = 0;
  // Piano à queue : boudoir & salons d'ambiance boudoir, un par zone assez grande.
  if ((z.style === 'boudoir' || (z.style === 'galerie' && z.main)) && z.kind !== 'vip' && z.rect.w >= 8 && z.rect.d >= 7) {
    for (const s of r.shuffle([...backs])) {
      if (pianos) break;
      for (const run of wallRuns(ctx, s, z.id)) {
        if (run.length < 3 || pianos) continue;
        for (const c of r.shuffle([run[0], run[run.length - 1], run[Math.floor(run.length / 2)]])) {
          const wb = wallBox(s, c, along(s, c) + 0.5, 1.6, 1.7);
          const d: DecorSpec = { kind: 'piano', x: wb.x, z: wb.z, rot: s.rot, w: 1.6, d: 1.7, variant: r.int(0, 1) };
          if (tryBlocking(ctx, d, { shape: 'box', ...wb.b }, { gap: 0.5 })) {
            pianos++;
            break;
          }
        }
      }
    }
  }
  for (const s of backs) {
    for (const run of wallRuns(ctx, s, z.id)) {
      if (run.length < 2) continue;
      let i = 0;
      while (i < run.length) {
        const left = run.length - i;
        const c = run[i];
        const t0 = along(s, c);
        // vitrine à gâteaux près des comptoirs du salon principal
        if (indoor && cakes < 2 && left >= 2 && nearCounter(ctx, c.fx + 0.5, c.fz + 0.5, 1.6) && r.chance(0.7)) {
          const wb = wallBox(s, c, t0 + 0.5, 0.9, 0.6);
          if (tryBlocking(ctx, { kind: 'cake_display', x: wb.x, z: wb.z, rot: s.rot, w: 0.9, d: 0.6, variant: r.int(0, 2) }, { shape: 'box', ...wb.b }, { ignore })) {
            cakes++;
            tall.add(`${c.wx},${c.wz}`);
            i += 2;
            continue;
          }
        }
        if (indoor && shelves < 1 && left >= 3 && (z.style === 'boudoir' || z.style === 'galerie') && r.chance(0.25)) {
          const wb = wallBox(s, c, t0 + 1, 1.6, 0.45);
          if (tryBlocking(ctx, { kind: 'bookshelf', x: wb.x, z: wb.z, rot: s.rot, w: 1.6, d: 0.45, variant: r.int(0, 2) }, { shape: 'box', ...wb.b }, { ignore })) {
            shelves++;
            tall.add(`${c.wx},${c.wz}`);
            tall.add(`${run[i + 1].wx},${run[i + 1].wz}`);
            i += 3;
            continue;
          }
        }
        // banquette de velours (intérieur)
        if (indoor && z.style !== 'jardin' && left >= 3 && r.chance(z.style === 'boudoir' || z.style === 'vip' ? 0.75 : 0.45)) {
          const len = Math.min(left, r.int(3, 4));
          const wb = wallBox(s, c, t0 + len / 2, len - 0.3, 0.6);
          if (tryBlocking(ctx, { kind: 'banquette', x: wb.x, z: wb.z, rot: s.rot, w: len - 0.3, d: 0.6, variant: r.int(0, 2) }, { shape: 'box', ...wb.b }, { ignore })) {
            i += len + 1;
            continue;
          }
        }
        i++;
      }
    }
  }
}

function nearCounter(ctx: Ctx, x: number, z: number, d: number): boolean {
  for (const c of ctx.counters) {
    if (c.island) continue;
    const b = box(c.x - c.w / 2, c.z - c.d / 2, c.x + c.w / 2, c.z + c.d / 2);
    const dx = Math.max(b.minX - x, 0, x - b.maxX);
    const dz = Math.max(b.minZ - z, 0, z - b.maxZ);
    if (Math.hypot(dx, dz) < d) return true;
  }
  return false;
}

/** Plantes (ou statues, oliviers…) dans les vrais coins de chaque zone. */
function corners(ctx: Ctx, z: ZoneInfo): void {
  const R = z.rect;
  const r = ctx.rng;
  const pts: [number, number, number, number][] = [
    [R.x, R.z, -1, -1],
    [R.x + R.w - 1, R.z, 1, -1],
    [R.x, R.z + R.d - 1, -1, 1],
    [R.x + R.w - 1, R.z + R.d - 1, 1, 1],
  ];
  for (const [cx, cz, dx, dz] of pts) {
    if (!solidCell(ctx, cx + dx, cz) || !solidCell(ctx, cx, cz + dz)) continue;
    if (ctx.space.zoneAt(cx, cz) !== z.id) continue;
    const kind: DecorKind =
      z.style === 'terrasse'
        ? r.pick(['olive', 'olive', 'bigplant'] as DecorKind[])
        : z.style === 'jardin'
          ? r.pick(['bigplant', 'bigplant', 'flowers'] as DecorKind[])
          : z.style === 'galerie'
            ? r.pick(['statue', 'bigplant', 'plant'] as DecorKind[])
            : z.style === 'vip'
              ? r.pick(['flowers', 'plant'] as DecorKind[])
              : r.pick(['plant', 'bigplant', 'flowers'] as DecorKind[]);
    const rad = kind === 'olive' || kind === 'bigplant' ? 0.42 : 0.34;
    const x = cx + 0.5 - dx * (0.5 - rad - 0.06);
    const zz = cz + 0.5 - dz * (0.5 - rad - 0.06);
    tryBlocking(
      ctx,
      { kind, x, z: zz, rot: r.range(0, PI * 2), scale: r.range(0.9, 1.15), variant: r.int(0, 3) },
      { shape: 'circle', x, z: zz, r: rad },
      { ignore: z.kind === 'vip' ? ['estrade'] : [] },
    );
  }
}

/** Deux plantes encadrent chaque ouverture simple, de chaque côté. */
function openingPlants(ctx: Ctx): void {
  const r = ctx.rng;
  const ignore: KeepTag[] = ['landing'];
  for (const op of ctx.shell.openings) {
    if (op.colonnade) continue;
    for (const t of [op.start - 1, op.start + op.len]) {
      for (const side of [-1, 1]) {
        // case de sol juste devant le pilier
        const fx = op.axis === 'x' ? op.line + side : t;
        const fz = op.axis === 'x' ? t : op.line + side;
        if (!ctx.space.floorAt(fx, fz)) continue;
        const kind: DecorKind = r.pick(['plant', 'flowers', 'bigplant'] as DecorKind[]);
        const rad = 0.32;
        // collée au mur mitoyen, côté pilier
        const x = op.axis === 'x' ? (side < 0 ? fx + 1 - rad - 0.06 : fx + rad + 0.06) : fx + 0.5;
        const z = op.axis === 'x' ? fz + 0.5 : side < 0 ? fz + 1 - rad - 0.06 : fz + rad + 0.06;
        tryBlocking(ctx, { kind, x, z, rot: r.range(0, PI * 2), scale: r.range(0.85, 1.05), variant: r.int(0, 3) }, { shape: 'circle', x, z, r: rad }, { ignore });
      }
    }
  }
}

/** Galerie : colonnes adossées le long des grands murs, tous les 3 à 4 pas. */
function galerieColumns(ctx: Ctx, z: ZoneInfo): void {
  const R = z.rect;
  const longX = R.w >= R.d;
  const step = ctx.rng.pick([3, 4]);
  const ss = sides(z).filter((s) => (longX ? s.name === 'back' || s.name === 'front' : s.name === 'left' || s.name === 'right'));
  let statues = 0;
  for (const s of ss) {
    const runs = wallRuns(ctx, s, z.id);
    for (const run of runs) {
      for (let i = 1; i < run.length - 1; i += step) {
        const c = run[i];
        const t = along(s, c) + 0.5;
        const wb = wallBox(s, c, t, 0.56, 0.56);
        const x = (wb.b.minX + wb.b.maxX) / 2;
        const zz = (wb.b.minZ + wb.b.maxZ) / 2;
        const ok = tryBlocking(ctx, { kind: 'column', x, z: zz, rot: s.rot, scale: 1, variant: 1 }, { shape: 'circle', x, z: zz, r: 0.28 });
        // une statue entre deux colonnes, de temps en temps
        if (ok && statues < 2 && i + 2 < run.length - 1 && ctx.rng.chance(0.35)) {
          const c2 = run[i + Math.floor(step / 2) + 0];
          const wb2 = wallBox(s, c2, along(s, c2) + 0.5, 0.7, 0.7);
          const x2 = (wb2.b.minX + wb2.b.maxX) / 2;
          const z2 = (wb2.b.minZ + wb2.b.maxZ) / 2;
          if (tryBlocking(ctx, { kind: 'statue', x: x2, z: z2, rot: s.rot, scale: 1, variant: ctx.rng.int(0, 2) }, { shape: 'circle', x: x2, z: z2, r: 0.35 })) statues++;
        }
      }
    }
  }
}

/** Terrasse : oliviers, jardinières et lanternes le long des balustrades ; jardin : plantes contre la verrière. */
function outdoorEdges(ctx: Ctx, z: ZoneInfo): void {
  const r = ctx.rng;
  const terr = z.style === 'terrasse' || z.kind === 'terrasse';
  for (const s of sides(z)) {
    const runs = wallRuns(ctx, s, z.id);
    for (const run of runs) {
      // dehors : le long des balustrades / verrières ; salon d'ambiance jardin ou terrasse : contre les murs du fond
      const glassy = run.filter((c) => cellKind(ctx, c.wx, c.wz) === (terr ? CELL.RAIL : CELL.GLASS)).length > run.length / 2;
      const backWall = !z.outdoor && (s.name === 'back' || s.name === 'left');
      if (!glassy && !backWall) continue;
      for (let i = 1; i < run.length - 1; i += r.int(3, 4)) {
        const c = run[i];
        const t = along(s, c) + 0.5;
        if (terr && r.chance(0.45)) {
          const wb = wallBox(s, c, t, 1.3, 0.5);
          tryBlocking(ctx, { kind: 'flowers', x: wb.x, z: wb.z, rot: s.rot, w: 1.3, d: 0.5, variant: r.int(0, 3) }, { shape: 'box', ...wb.b });
        } else {
          const kind: DecorKind = terr ? 'olive' : r.pick(['bigplant', 'plant', 'flowers'] as DecorKind[]);
          const rad = kind === 'olive' || kind === 'bigplant' ? 0.4 : 0.32;
          const wb = wallBox(s, c, t, rad * 2, rad * 2);
          const x = (wb.b.minX + wb.b.maxX) / 2;
          const zz = (wb.b.minZ + wb.b.maxZ) / 2;
          tryBlocking(ctx, { kind, x, z: zz, rot: r.range(0, PI * 2), scale: r.range(0.85, 1.15), variant: r.int(0, 3) }, { shape: 'circle', x, z: zz, r: rad });
        }
      }
    }
  }
}

// ─────────────────────────────────────────── Non bloquants : murs, plafonds, sols

function wallHangings(ctx: Ctx, tall: Set<string>): void {
  const r = ctx.rng;
  const done = new Set<string>();
  const doorKey = `${ctx.door.ix},${ctx.door.iz}`;
  const counterBoxes = ctx.counters.filter((c) => !c.island).map((c) => box(c.x - c.w / 2 - 0.2, c.z - c.d / 2 - 0.2, c.x + c.w / 2 + 0.2, c.z + c.d / 2 + 0.2));
  for (const z of ctx.zones) {
    const cycle: DecorKind[] =
      z.style === 'boudoir'
        ? ['mirror', 'lamp', 'painting', 'lamp']
        : z.style === 'galerie'
          ? ['mirror', 'painting', 'mirror', 'lamp']
          : z.style === 'vip'
            ? ['mirror', 'lamp']
            : z.style === 'jardin'
              ? ['trellis', 'lamp', 'painting']
              : ['lantern', 'trellis', 'lamp', 'painting'];
    let k = r.int(0, cycle.length - 1);
    for (const s of sides(z)) {
      const isBack = s.name === 'back' || s.name === 'left';
      for (let i = 0; i < s.cells.length; i++) {
        const c = s.cells[i];
        const key = `${c.wx},${c.wz}`;
        if (done.has(key) || key === doorKey || !ctx.space.floorAt(c.fx, c.fz) || ctx.space.zoneAt(c.fx, c.fz) !== z.id) continue;
        const kindCell = cellKind(ctx, c.wx, c.wz);
        if (kindCell === CELL.RAIL) {
          // lanternes sur les balustrades (tous les côtés)
          if (i % 3 === 1) {
            done.add(key);
            ctx.decor.push({ kind: 'lantern', x: c.wx + 0.5, z: c.wz + 0.5, rot: s.rot, wall: true, variant: r.int(0, 2) });
          }
          continue;
        }
        if (!isBack) continue;
        if (kindCell === CELL.GLASS) {
          if (i % 2 === 0) {
            done.add(key);
            ctx.decor.push({ kind: 'trellis', x: c.wx + 0.5, z: c.wz + 0.5, rot: s.rot, wall: true, variant: r.int(0, 2) });
          }
          continue;
        }
        if (kindCell !== CELL.WALL || tall.has(key) || i % 2 === 1) continue;
        const fb = box(c.fx, c.fz, c.fx + 1, c.fz + 1);
        if (counterBoxes.some((b) => boxesOverlap(b, fb))) continue;
        const kind = cycle[k++ % cycle.length];
        done.add(key);
        ctx.decor.push({ kind, x: c.wx + 0.5, z: c.wz + 0.5, rot: s.rot, wall: true, scale: r.range(0.9, 1.15), variant: r.int(0, 3) });
      }
    }
  }
}

function chandeliers(ctx: Ctx): void {
  const r = ctx.rng;
  const placed: { x: number; z: number }[] = [];
  const put = (x: number, z: number, scale: number) => {
    if (placed.some((p) => dist(p.x, p.z, x, z) < 2.4)) return;
    placed.push({ x, z });
    ctx.decor.push({ kind: 'chandelier', x, z, rot: r.range(0, PI), scale, variant: r.int(0, 2) });
  };
  for (const c of ctx.counters) if (c.island) put(c.x, c.z, 1.2);
  for (const z of ctx.zones) {
    if (z.style === 'terrasse' || z.kind === 'terrasse') continue;
    if (z.kind === 'jardin' && r.chance(0.5)) continue;
    const ts = ctx.tables.filter((t) => t.zone === z.id);
    const covered = new Set<number>();
    for (const t of ts) {
      if (covered.has(t.id)) continue;
      covered.add(t.id);
      let mate: (typeof ts)[number] | null = null;
      let md = 4.3;
      for (const o of ts)
        if (!covered.has(o.id) && dist(t.x, t.z, o.x, o.z) < md) {
          md = dist(t.x, t.z, o.x, o.z);
          mate = o;
        }
      if (mate && z.kind !== 'vip') {
        covered.add(mate.id);
        put((t.x + mate.x) / 2, (t.z + mate.z) / 2, 1.1);
      } else put(t.x, t.z, z.kind === 'vip' ? 1.25 : 0.9);
    }
    if (z.kind === 'galerie') {
      const R = z.rect;
      const longX = R.w >= R.d;
      const n = Math.floor((longX ? R.w : R.d) / 5);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        put(longX ? R.x + R.w * t : R.x + R.w / 2, longX ? R.z + R.d / 2 : R.z + R.d * t, 1.15);
      }
    }
  }
}

function rugs(ctx: Ctx): void {
  const r = ctx.rng;
  const rugsB: Box[] = [];
  const blockers = ctx.counters.map((c) => box(c.x - c.w / 2, c.z - c.d / 2, c.x + c.w / 2, c.z + c.d / 2));
  for (const d of ctx.decor) if (d.kind === 'fountain') blockers.push(box(d.x - 1.3, d.z - 1.3, d.x + 1.3, d.z + 1.3));
  const tryRug = (b: Box, zid: number, rot: number, variant: number) => {
    if (b.maxX - b.minX < 1.5 || b.maxZ - b.minZ < 1.5) return;
    if (!ctx.space.boxCellsAll(b, (x, z) => ctx.space.floorAt(x, z) && ctx.space.zoneAt(x, z) === zid)) return;
    if (blockers.some((o) => boxesOverlap(o, b)) || rugsB.some((o) => boxesOverlap(o, b))) return;
    rugsB.push(b);
    ctx.decor.push({ kind: 'rug', x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2, rot, w: b.maxX - b.minX, d: b.maxZ - b.minZ, variant });
  };
  // tapis de couloir (galeries) : longs chemins bordeaux sur les couloirs
  for (const l of ctx.lanes) {
    const zid = ctx.space.zoneAt(Math.floor((l.a.x + l.b.x) / 2), Math.floor((l.a.z + l.b.z) / 2));
    const z = ctx.zones[zid];
    if (!z || z.kind !== 'galerie') continue;
    const horiz = l.a.z === l.b.z;
    const b = horiz
      ? box(Math.min(l.a.x, l.b.x) + 0.2, l.a.z - 0.55, Math.max(l.a.x, l.b.x) - 0.2, l.a.z + 0.55)
      : box(l.a.x - 0.55, Math.min(l.a.z, l.b.z) + 0.2, l.a.x + 0.55, Math.max(l.a.z, l.b.z) - 0.2);
    tryRug(b, zid, 0, 0);
  }
  // tapis sous les groupes de tables (intérieur)
  for (const z of ctx.zones) {
    if (z.outdoor || z.kind === 'vip') continue;
    const ts = ctx.tables.filter((t) => t.zone === z.id);
    const used = new Set<number>();
    for (const t of ts) {
      if (used.has(t.id)) continue;
      const group = ts.filter((o) => !used.has(o.id) && Math.abs(o.x - t.x) < 4.6 && Math.abs(o.z - t.z) < 4.6);
      for (const o of group) used.add(o.id);
      let b = box(Infinity, Infinity, -Infinity, -Infinity);
      for (const o of group) {
        const ob = boxOf(ctx.space.colliders.find((c) => c.ref === `table:${o.id}`)!);
        b = box(Math.min(b.minX, ob.minX), Math.min(b.minZ, ob.minZ), Math.max(b.maxX, ob.maxX), Math.max(b.maxZ, ob.maxZ));
      }
      tryRug(box(b.minX - 0.15, b.minZ - 0.15, b.maxX + 0.15, b.maxZ + 0.15), z.id, 0, r.int(1, 3));
    }
  }
}

function parasols(ctx: Ctx): void {
  for (const t of ctx.tables) {
    const z = ctx.zones[t.zone];
    // tables de terrasse, et salon principal de l'ambiance « Terrasse Ensoleillée »
    if (!z || !(z.kind === 'terrasse' || (z.main && ctx.plan.biome === 'terrasse'))) continue;
    ctx.decor.push({ kind: 'parasol', x: t.x, z: t.z, rot: ctx.rng.range(0, PI * 2), scale: t.shape === 'rect' ? 1.3 : 1.1, variant: ctx.rng.int(0, 3) });
  }
}

/** Places de tables inutilisées : fleurs, plantes, vitrines (avec parcimonie). */
function spareFill(ctx: Ctx): void {
  const r = ctx.rng;
  let n = 0;
  const max = Math.max(2, Math.round(ctx.tables.length / 2));
  for (const p of r.shuffle([...ctx.spare])) {
    if (n >= max) break;
    if (ctx.pedestals.some((q) => dist(q.x, q.z, p.x, p.z) < 2)) continue;
    const zid = ctx.space.zoneAt(Math.floor(p.x), Math.floor(p.z));
    const z = ctx.zones[zid];
    if (!z) continue;
    const kind: DecorKind =
      z.style === 'terrasse' ? 'olive' : z.style === 'jardin' ? r.pick(['bigplant', 'flowers'] as DecorKind[]) : z.style === 'galerie' ? r.pick(['statue', 'flowers'] as DecorKind[]) : r.pick(['flowers', 'plant'] as DecorKind[]);
    const rad = kind === 'olive' || kind === 'bigplant' ? 0.42 : 0.36;
    if (tryBlocking(ctx, { kind, x: p.x, z: p.z, rot: r.range(0, PI * 2), scale: r.range(1, 1.2), variant: r.int(0, 3) }, { shape: 'circle', x: p.x, z: p.z, r: rad }, { gap: 1.0 })) n++;
  }
}

/** Grands espaces vides : quelques îlots de décor (statue, olivier, massif), loin de tout. */
function openFill(ctx: Ctx): void {
  const r = ctx.rng;
  const { space } = ctx;
  let floor = 0;
  const cands: { x: number; z: number }[] = [];
  for (let z = 0; z < ctx.D; z++)
    for (let x = 0; x < ctx.W; x++) {
      if (!space.floorAt(x, z)) continue;
      floor++;
      const zid = space.zoneAt(x, z);
      if (zid < 0 || ctx.zones[zid].kind === 'vip') continue;
      if ((x + z) % 2 === 1) continue;
      const p = { x: x + 0.5, z: z + 0.5 };
      if (hitsKeep(ctx, box(p.x - 1.3, p.z - 1.3, p.x + 1.3, p.z + 1.3))) continue;
      if (!space.circleClearOfWalls(p.x, p.z, 2.0)) continue;
      if (space.gapTo({ shape: 'circle', x: p.x, z: p.z, r: 0.45, solid: 'furniture' }, 3) < 2.0) continue;
      cands.push(p);
    }
  const max = Math.round(floor / 90);
  const placed: { x: number; z: number }[] = [];
  for (const p of r.shuffle(cands)) {
    if (placed.length >= max) break;
    if (placed.some((q) => dist(q.x, q.z, p.x, p.z) < 6)) continue;
    const z = ctx.zones[space.zoneAt(Math.floor(p.x), Math.floor(p.z))];
    const kind: DecorKind =
      z.style === 'galerie'
        ? 'statue'
        : z.style === 'terrasse'
          ? 'olive'
          : z.style === 'jardin'
            ? r.pick(['bigplant', 'flowers'] as DecorKind[])
            : r.pick(['flowers', 'bigplant'] as DecorKind[]);
    const rad = kind === 'statue' ? 0.4 : 0.45;
    if (tryBlocking(ctx, { kind, x: p.x, z: p.z, rot: r.range(0, PI * 2), scale: r.range(1.05, 1.3), variant: r.int(0, 3) }, { shape: 'circle', x: p.x, z: p.z, r: rad }, { gap: 1.9 }))
      placed.push(p);
  }
}
