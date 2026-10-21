/**
 * Murs du salon (pleine hauteur au fond, coupés bas devant), moulures en longs tronçons, fenêtres
 * à rideaux, balustrades à balustres, verrières du jardin d'hiver et porte d'entrée.
 */
import * as THREE from 'three';
import { CELL } from '../../types';
import { StaticBatch, M } from '../batch';
import { vc, vcGlass, shadowOnly } from '../mats';
import { GeoBuilder, molding, PROFILES, balusterGeo, archGeo, archPanelGeo, box } from '../geo';
import { exteriorTexture, skyTexture, wallTexture } from '../textures';
import { roundedBox, sphere, chamferCylinder, torus, cylinder } from '../kit';
import type { SalonCtx } from './context';
import { rand, seedOf } from './context';
import { SalonGrid, WALL_H, WALL_LOW, RAIL_H } from './grid';
import { addShelfLuxuryItem } from './decor';

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Angle (rotation Y) qui oriente le +Z local vers (dx, dz). */
export function yawOf(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

/** Case d'entrée et direction vers la salle. */
export function entranceInfo(grid: SalonGrid): { cell: number; x: number; z: number; dx: number; dz: number; low: boolean } | null {
  const e = grid.layout.entrance;
  const x = Math.floor(e.x);
  const z = Math.floor(e.z);
  const i = grid.idx(x, z);
  if (i < 0) return null;
  const pref: [number, number] = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ][e.rot] as [number, number];
  let dir: [number, number] | null = null;
  if (grid.isFloor(x + pref[0], z + pref[1])) dir = pref;
  else for (const d of DIRS) if (grid.isFloor(x + d[0], z + d[1])) dir = d;
  if (!dir) dir = pref;
  const c = grid.cell(x, z);
  const low = c !== CELL.WALL || grid.wallHeight(x, z) < WALL_H - 0.01;
  return { cell: i, x, z, dx: dir[0], dz: dir[1], low };
}

/** Cases de mur ouvertes (porte d'entrée sur un mur coupé) : pas de bloc, du sol à la place. */
export function computeOpenings(grid: SalonGrid): Set<number> {
  const s = new Set<number>();
  const e = entranceInfo(grid);
  if (e && e.low && grid.cell(e.x, e.z) === CELL.WALL) s.add(e.cell);
  return s;
}

interface FaceRun {
  dx: number;
  dz: number;
  /** Coordonnée du plan de la face (x pour ±X, z pour ±Z). */
  plane: number;
  a: number;
  b: number;
  y0: number;
  h: number;
  cells: number[];
}

export function buildWalls(ctx: SalonCtx, openings: Set<number>): void {
  const { grid, style, batch } = ctx;
  const facadeMat = new THREE.MeshStandardMaterial({ map: wallTexture(style.id, style.wall), roughness: 0.86 });
  const extMat = new THREE.MeshStandardMaterial({ map: exteriorTexture(style.id), roughness: 0.85 });
  ctx.owned.materials.push(facadeMat, extMat);
  const facade = new GeoBuilder();
  const ext = new GeoBuilder();
  const capMat = vc('matte');
  const trim = vc('satin');
  const runs: FaceRun[] = [];
  const runKey = new Map<string, FaceRun>();

  const isWall = (x: number, z: number) => {
    const i = grid.idx(x, z);
    return i >= 0 && grid.cells[i] === CELL.WALL && !openings.has(i);
  };
  const interior = (x: number, z: number) => {
    const i = grid.idx(x, z);
    if (i < 0) return false;
    const c = grid.cells[i];
    return c === CELL.FLOOR || c === CELL.RAIL || openings.has(i);
  };

  for (let z = 0; z < grid.d; z++)
    for (let x = 0; x < grid.w; x++) {
      if (!isWall(x, z)) continue;
      const h = grid.wallHeight(x, z);
      const i = grid.idx(x, z);
      // dessus
      if (h >= WALL_H - 0.01) {
        batch.add(box(1, 0.02, 1), capMat, M(x + 0.5, h - 0.01, z + 0.5), { color: style.cap, cast: false });
      } else {
        // couvertine des murets
        batch.add(roundedBox(1.06, 0.07, 1.06, 0.02, 1), trim, M(x + 0.5, h + 0.025, z + 0.5), { color: style.trim });
      }
      for (const [dx, dz] of DIRS) {
        const nx = x + dx;
        const nz = z + dz;
        const nc = grid.cell(nx, nz);
        const faceVisible = dx > 0 || dz > 0;
        let y0 = 0;
        let kind: 'int' | 'ext' | null = null;
        if (isWall(nx, nz) || nc === CELL.GLASS) {
          const hn = grid.wallHeight(nx, nz);
          if (hn >= h - 0.001) continue;
          y0 = hn;
          kind = 'ext';
        } else if (interior(nx, nz)) {
          y0 = grid.groundY(nx + 0.5, nz + 0.5);
          kind = 'int';
        } else {
          if (!faceVisible) continue;
          y0 = -0.02;
          kind = 'ext';
        }
        emitFace(kind === 'int' ? facade : ext, x, z, dx, dz, y0, h, kind === 'int' ? 1 / WALL_H : 1);
        if (kind === 'int') {
          const plane = dx !== 0 ? x + (dx > 0 ? 1 : 0) : z + (dz > 0 ? 1 : 0);
          const along = dx !== 0 ? z : x;
          const key = `${dx},${dz},${plane},${h},${y0}`;
          let run = runKey.get(key);
          if (run && run.b === along) {
            run.b = along + 1;
            run.cells.push(i);
          } else {
            run = { dx, dz, plane, a: along, b: along + 1, y0, h, cells: [i] };
            runs.push(run);
          }
          runKey.set(key, run);
        }
      }
    }

  for (const [g, mat] of [
    [facade, facadeMat],
    [ext, extMat],
  ] as const) {
    if (g.count === 0) continue;
    const geo = g.build();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    ctx.root.add(mesh);
    ctx.owned.geometries.push(geo);
  }

  // moulures par tronçons
  const gold = vc('gold');
  const fancy = style.id === 'galerie' || style.id === 'boudoir';
  for (const r of runs) {
    const len = r.b - r.a;
    const m = runMatrix(r);
    batch.push(m);
    batch.add(molding(PROFILES.baseboard, len), trim, M(0, r.y0, 0), { color: style.trim });
    if (r.h >= WALL_H - 0.01) {
      batch.add(molding(PROFILES.chairRail, len), trim, M(0, 0.93, 0), { color: style.trim, cast: false });
      batch.add(molding(PROFILES.cornice, len), trim, M(0, WALL_H - 0.2, 0), { color: style.trim });
      if (fancy) batch.add(box(len, 0.018, 0.018), gold, M(len / 2, WALL_H - 0.215, 0.012), { color: style.metal, cast: false });
    }
    batch.pop();
  }

  const windowCells = buildWindows(ctx, runs);
  buildLuxuryShelves(ctx, runs, windowCells);
  buildRails(ctx);
  buildGlass(ctx);
  buildRoofLattice(ctx);
  buildEntrance(ctx, openings);
}

/** Repère local d'un tronçon : +X le long du mur, +Z vers la salle, origine au début du tronçon. */
function runMatrix(r: FaceRun): THREE.Matrix4 {
  if (r.dz > 0) return M(r.a, 0, r.plane, 0);
  if (r.dz < 0) return M(r.b, 0, r.plane, Math.PI);
  if (r.dx > 0) return M(r.plane, 0, r.b, Math.PI / 2);
  return M(r.plane, 0, r.a, -Math.PI / 2);
}

/** Émet la face (dx, dz) d'une case de mur entre y0 et y1. */
function emitFace(g: GeoBuilder, x: number, z: number, dx: number, dz: number, y0: number, y1: number, vScale: number): void {
  const x0 = x;
  const x1 = x + 1;
  const z0 = z;
  const z1 = z + 1;
  const v0 = y0 * vScale;
  const v1 = y1 * vScale;
  if (dz > 0)
    g.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [
      [x0, v0],
      [x1, v0],
      [x1, v1],
      [x0, v1],
    ]);
  else if (dz < 0)
    g.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [
      [-x1, v0],
      [-x0, v0],
      [-x0, v1],
      [-x1, v1],
    ]);
  else if (dx > 0)
    g.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [
      [-z1, v0],
      [-z0, v0],
      [-z0, v1],
      [-z1, v1],
    ]);
  else
    g.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [
      [z0, v0],
      [z1, v0],
      [z1, v1],
      [z0, v1],
    ]);
}

// ─────────────────────────────────────────── Fenêtres

/** Cases de mur occupées par un décor mural ou adossé (pas de fenêtre derrière). */
function busyWallCells(ctx: SalonCtx): Set<number> {
  const s = new Set<number>();
  const { grid, layout } = ctx;
  const mark = (x: number, z: number, r: number) => {
    for (let zz = Math.floor(z - r); zz <= Math.floor(z + r); zz++)
      for (let xx = Math.floor(x - r); xx <= Math.floor(x + r); xx++) {
        const i = grid.idx(xx, zz);
        if (i >= 0) s.add(i);
      }
  };
  for (const d of layout.decor) {
    if (d.wall || d.kind === 'mirror' || d.kind === 'painting') mark(d.x, d.z, 0.6);
    else if (d.kind === 'bookshelf' || d.kind === 'banquette' || d.kind === 'lamp' || d.kind === 'cake_display' || d.kind === 'door')
      mark(d.x, d.z, Math.max(1.1, (d.w ?? 1) / 2 + 0.3));
  }
  const e = layout.entrance;
  mark(e.x, e.z, 1.6);
  for (const c of layout.counters) mark(c.x, c.z, Math.max(c.w, c.d) / 2 + 0.8);
  return s;
}

function buildWindows(ctx: SalonCtx, runs: FaceRun[]): Set<number> {
  const { style, batch } = ctx;
  const busy = busyWallCells(ctx);
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTexture(style.windowSky[0], style.windowSky[1]) });
  ctx.owned.materials.push(skyMat);
  const trim = vc('satin');
  const velvet = vc('velvet');
  const gold = vc('gold');
  const arched = style.id !== 'jardin';
  const r = rand(seedOf(ctx.layout.seed, 404));
  const windowCells = new Set<number>();
  for (const run of runs) {
    if (run.h < WALL_H - 0.01) continue;
    // fenêtres seulement sur les murs du fond (faces tournées vers la caméra)
    if (run.dx < 0 || run.dz < 0) continue;
    const len = run.b - run.a;
    if (len < 3) continue;
    const spacing = len >= 9 ? 4 : 3;
    const start = 1 + Math.floor(r() * 2);
    for (let k = start; k < len - 1; k += spacing) {
      const cell = run.cells[k];
      if (busy.has(cell) || busy.has(run.cells[k - 1]) || busy.has(run.cells[k + 1])) continue;
      windowCells.add(cell);
      if (run.cells[k - 1] !== undefined) windowCells.add(run.cells[k - 1]);
      if (run.cells[k + 1] !== undefined) windowCells.add(run.cells[k + 1]);
      const m = runMatrix(run).multiply(M(k + 0.5, run.y0, 0));
      batch.push(m);
      const ww = 0.8;
      const wh = 1.55;
      const sill = 0.62;
      // vitre (ciel émissif)
      if (arched) batch.add(archPanelGeo(ww, wh), skyMat, M(0, sill, 0.012), { cast: false });
      else batch.add(groundPlaneXY(ww, wh), skyMat, M(0, sill + wh / 2, 0.012), { cast: false });
      // encadrement
      const fh = arched ? wh - ww / 2 : wh;
      batch.add(box(0.07, fh, 0.07), trim, M(-ww / 2 - 0.035, sill + fh / 2, 0.035), { color: style.trim });
      batch.add(box(0.07, fh, 0.07), trim, M(ww / 2 + 0.035, sill + fh / 2, 0.035), { color: style.trim });
      if (arched) batch.add(archGeo(ww, 0.07, 0.07, 14), trim, M(0, sill + fh, 0.035), { color: style.trim });
      else batch.add(box(ww + 0.14, 0.09, 0.08), trim, M(0, sill + wh + 0.045, 0.04), { color: style.trim });
      batch.add(roundedBox(ww + 0.22, 0.06, 0.14, 0.015, 1), trim, M(0, sill - 0.03, 0.06), { color: style.trim });
      // petits bois
      const mc = style.id === 'jardin' ? style.mullion : style.trim;
      batch.add(box(0.03, fh + (arched ? ww / 2 : 0) - 0.04, 0.03), trim, M(0, sill + (fh + (arched ? ww / 2 : 0)) / 2, 0.02), { color: mc, cast: false });
      for (const yy of [0.5, 1.0]) batch.add(box(ww, 0.03, 0.03), trim, M(0, sill + yy, 0.02), { color: mc, cast: false });
      // rideaux à embrasses
      for (const s of [-1, 1]) {
        batch.add(curtainGeo(), velvet, M(s * (ww / 2 + 0.16), 0.04, 0.09, 0, s, 1, 1), { color: style.curtain });
        batch.add(sphere(0.035, 8, 6), gold, M(s * (ww / 2 + 0.2), 1.12, 0.17), { color: style.metal, cast: false });
      }
      batch.add(roundedBox(ww + 0.85, 0.2, 0.1, 0.03, 1), velvet, M(0, 2.16, 0.1), { color: shade(style.curtain, -0.08) });
      batch.add(chamferCylinder(0.018, 0.018, ww + 1.0, 0.004, 8), gold, M(-(ww + 1.0) / 2, 2.29, 0.11, 0, 1, 1, 1, 0, -Math.PI / 2), {
        color: style.metal,
        cast: false,
      });
      batch.pop();
    }
  }
  return windowCells;
}

/**
 * Étagères murales d'apparat et tablettes de murets garnies d'objets luxueux autour du restaurant.
 */
function buildLuxuryShelves(ctx: SalonCtx, runs: FaceRun[], windowCells: Set<number>): void {
  const { style, batch } = ctx;
  const busy = busyWallCells(ctx);
  const trim = vc('satin');
  const gold = vc('gold');
  const wood = style.id === 'galerie' ? '#f3ede4' : style.id === 'boudoir' ? '#f2dcd6' : '#efe8d8';
  const r = rand(seedOf(ctx.layout.seed, 777));
  let itemCounter = 0;

  for (const run of runs) {
    const len = run.b - run.a;
    if (len < 2) continue;

    // 1. Murs hauts : étagères murales d'apparat en bois noble avec consoles dorées sculptées
    if (run.h >= WALL_H - 0.01) {
      if (run.dx < 0 || run.dz < 0) continue;
      for (let k = 0; k < len; k++) {
        const cell = run.cells[k];
        if (busy.has(cell) || windowCells.has(cell)) continue;
        const m = runMatrix(run).multiply(M(k + 0.5, run.y0, 0));
        batch.push(m);
        // Étagère double niveau (y1 = 1.22, y2 = 1.68)
        const levels = [1.22, 1.68];
        const shelfW = 0.74;
        const shelfD = 0.22;
        for (const sy of levels) {
          batch.add(roundedBox(shelfW, 0.03, shelfD, 0.008, 1), trim, M(0, sy, shelfD / 2), { color: wood, tall: true });
          batch.add(box(shelfW, 0.012, 0.012), gold, M(0, sy, shelfD + 0.004), { color: style.metal, tall: true, cast: false });
          // Consoles sculptées en volute dorée sous l'étagère
          for (const sx of [-0.26, 0.26]) {
            batch.add(
              torus(0.065, 0.011, 6, 14, Math.PI * 0.9),
              gold,
              M(sx, sy - 0.065, 0.08, 0, 1, 1, 1, 0, Math.PI / 2),
              { color: style.metal, tall: true, cast: false },
            );
            batch.add(sphere(0.014, 6, 4), gold, M(sx, sy - 0.13, 0.03), { color: style.metal, tall: true, cast: false });
          }
          // Objets d'orfèvrerie, pâtisseries et porcelaines sur l'étagère
          let ox = -shelfW / 2 + 0.04;
          while (ox < shelfW / 2 - 0.11) {
            const wUsed = addShelfLuxuryItem(batch, style, ox, sy + 0.015, shelfD / 2, itemCounter++, r, true);
            ox += wUsed + 0.03;
          }
        }
        batch.pop();
        windowCells.add(cell);
      }
    } else {
      // 2. Murets bas du pourtour : étagère de desserte sur la couvertine du muret
      for (let k = 1; k < len - 1; k += 2) {
        const cell = run.cells[k];
        if (busy.has(cell) || windowCells.has(cell)) continue;
        const m = runMatrix(run).multiply(M(k + 0.5, run.y0, 0));
        batch.push(m);
        const ledgeY = run.h + 0.06;
        // Galerie basse en laiton doré le long du rebord
        batch.add(box(0.82, 0.014, 0.014), gold, M(0, ledgeY + 0.045, 0.08), { color: style.metal, cast: false });
        for (const bx of [-0.38, 0, 0.38]) {
          batch.add(cylinder(0.008, 0.008, 0.045, 6), gold, M(bx, ledgeY + 0.022, 0.08), { color: style.metal, cast: false });
        }
        // Objets d'orfèvrerie et douceurs royales sur le muret
        addShelfLuxuryItem(batch, style, -0.26, ledgeY, 0, itemCounter++, r, false);
        addShelfLuxuryItem(batch, style, 0.06, ledgeY, 0, itemCounter++, r, false);
        batch.pop();
        windowCells.add(cell);
      }
    }
  }
}

const curtainCache = new Map<string, THREE.BufferGeometry>();
/** Drapé de rideau : plissé sinusoïdal, resserré à l'embrasse (y ≈ 1.1). Origine au bas, côté fenêtre en x = 0. */
function curtainGeo(): THREE.BufferGeometry {
  let g = curtainCache.get('c');
  if (g) return g;
  const W = 0.34;
  const H = 2.2;
  const seg = 10;
  const rows = 14;
  const pos: number[] = [];
  const idx: number[] = [];
  const uv: number[] = [];
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    const y = t * H;
    const pinch = 1 - 0.55 * Math.exp(-Math.pow((y - 1.1) / 0.28, 2));
    const flare = y < 1.1 ? 1 + (1.1 - y) * 0.25 : 1;
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      const x = (u - 0.5) * W * pinch * flare;
      const zz = Math.sin(u * Math.PI * 4) * 0.035 * pinch + 0.02;
      pos.push(x, y, zz);
      uv.push(u, t);
    }
  }
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      const b = a + seg + 1;
      idx.push(a, a + 1, b + 1, a, b + 1, b);
    }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.shared = true;
  curtainCache.set('c', g);
  return g;
}

function groundPlaneXY(w: number, h: number): THREE.BufferGeometry {
  const key = `xy:${w}:${h}`;
  let g = curtainCache.get(key);
  if (!g) {
    g = new THREE.PlaneGeometry(w, h);
    g.userData.shared = true;
    curtainCache.set(key, g);
  }
  return g;
}

function shade(c: string, k: number): string {
  const col = new THREE.Color(c);
  col.lerp(new THREE.Color(k >= 0 ? '#ffffff' : '#000000'), Math.abs(k));
  return '#' + col.getHexString();
}

// ─────────────────────────────────────────── Balustrades

function connected(grid: SalonGrid, x: number, z: number, kinds: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const [dx, dz] of DIRS) if (kinds.includes(grid.cell(x + dx, z + dz))) out.push([dx, dz]);
  return out;
}

/** Directions des demi-segments d'une case linéaire (balustrade, verrière). */
function segmentsOf(grid: SalonGrid, x: number, z: number, kinds: number[]): { dirs: [number, number][]; straight: boolean } {
  let dirs = connected(grid, x, z, kinds);
  if (dirs.length === 0) {
    const alongX = grid.isFloor(x, z - 1) || grid.isFloor(x, z + 1);
    dirs = alongX
      ? [
          [1, 0],
          [-1, 0],
        ]
      : [
          [0, 1],
          [0, -1],
        ];
  } else if (dirs.length === 1) {
    dirs.push([-dirs[0][0], -dirs[0][1]]);
  }
  const straight = dirs.length === 2 && dirs[0][0] === -dirs[1][0] && dirs[0][1] === -dirs[1][1];
  return { dirs, straight };
}

function buildRails(ctx: SalonCtx): void {
  const { grid, style, batch } = ctx;
  const stone = vc('satin');
  const gold = vc('gold');
  const bal = balusterGeo();
  const topCol = style.id === 'galerie' ? style.metal : style.trim;
  const topMat = style.id === 'galerie' ? gold : stone;
  const kinds = [CELL.RAIL, CELL.WALL, CELL.GLASS];
  for (let z = 0; z < grid.d; z++)
    for (let x = 0; x < grid.w; x++) {
      if (grid.cell(x, z) !== CELL.RAIL) continue;
      const y0 = grid.groundY(x + 0.5, z + 0.5);
      const cx = x + 0.5;
      const cz = z + 0.5;
      const { dirs, straight } = segmentsOf(grid, x, z, kinds);
      const newel = !straight || (x + z) % 4 === 0;
      for (const [dx, dz] of dirs) {
        const rot = yawOf(dx, dz);
        batch.push(M(cx, y0, cz, rot));
        // repère : +Z le long du demi-segment
        batch.add(box(0.16, 0.1, 0.56), stone, M(0, 0.05, 0.27), { color: style.trim });
        batch.add(roundedBox(0.13, 0.06, 0.56, 0.02, 1), topMat, M(0, RAIL_H - 0.03, 0.27), { color: topCol });
        for (const off of [0.2, 0.4]) batch.add(bal, stone, M(0, 0.1, off, 0, 1, 0.92, 1), { color: style.trim });
        batch.pop();
      }
      if (newel) {
        batch.add(roundedBox(0.2, RAIL_H + 0.08, 0.2, 0.03, 1), stone, M(cx, y0 + (RAIL_H + 0.08) / 2, cz), { color: style.trim });
        const fin = style.id === 'terrasse' ? style.pot : style.metal;
        batch.add(sphere(0.07, 12, 8), style.id === 'terrasse' ? vc('ceramic') : gold, M(cx, y0 + RAIL_H + 0.15, cz), { color: fin });
      } else batch.add(bal, stone, M(cx, y0 + 0.1, cz, 0, 1, 0.92, 1), { color: style.trim });
    }
}

// ─────────────────────────────────────────── Verrières

function buildGlass(ctx: SalonCtx): void {
  const { grid, style, batch } = ctx;
  const frame = vc('satin');
  const gold = vc('gold');
  const glassM = vcGlass(0.26);
  const kinds = [CELL.GLASS, CELL.WALL, CELL.RAIL];
  for (let z = 0; z < grid.d; z++)
    for (let x = 0; x < grid.w; x++) {
      if (grid.cell(x, z) !== CELL.GLASS) continue;
      const h = grid.wallHeight(x, z);
      const tall = h >= WALL_H - 0.01;
      const cx = x + 0.5;
      const cz = z + 0.5;
      const { dirs, straight } = segmentsOf(grid, x, z, kinds);
      const kerb = 0.26;
      for (const [dx, dz] of dirs) {
        batch.push(M(cx, 0, cz, yawOf(dx, dz)));
        batch.add(roundedBox(0.22, kerb, 0.56, 0.02, 1), frame, M(0, kerb / 2, 0.25), { color: style.trim });
        batch.add(box(0.012, h - kerb - 0.02, 0.5), glassM, M(0, kerb + (h - kerb) / 2, 0.25), { color: '#e3f4ef', cast: false, receive: false });
        batch.add(box(0.05, 0.05, 0.5), frame, M(0, h - 0.02, 0.25), { color: style.mullion });
        if (tall) batch.add(box(0.04, 0.035, 0.5), frame, M(0, 1.35, 0.25), { color: style.mullion, cast: false });
        // montant au bord (une seule fois par arête partagée)
        if (dx > 0 || dz > 0) batch.add(box(0.05, h - kerb, 0.05), frame, M(0, kerb + (h - kerb) / 2, 0.5), { color: style.mullion });
        batch.pop();
      }
      // montant central
      batch.add(box(0.05, h - kerb, 0.05), frame, M(cx, kerb + (h - kerb) / 2, cz), { color: style.mullion });
      if (tall) {
        if (straight) {
          const ax = dirs[0][0] !== 0;
          // arcs victoriens dans chaque travée
          for (const s of [-0.25, 0.25]) {
            batch.add(archGeo(0.42, 0.025, 0.04, 10), frame, M(cx + (ax ? s : 0), 1.55, cz + (ax ? 0 : s), ax ? 0 : Math.PI / 2), { color: style.mullion, cast: false });
          }
        }
        batch.add(sphere(0.05, 10, 8), gold, M(cx, h + 0.06, cz), { color: style.metal });
      }
    }
}

/** Treillis de verrière invisible au-dessus des zones « jardin » : seules ses ombres tombent au sol. */
function buildRoofLattice(ctx: SalonCtx): void {
  const { layout, batch } = ctx;
  const mat = shadowOnly();
  for (const z of layout.zones) {
    if (z.kind !== 'jardin') continue;
    const { x, z: zz, w, d } = z.rect;
    const y = 3.3;
    for (let i = 0; i <= w; i += 1) batch.add(box(0.07, 0.07, d), mat, M(x + i, y, zz + d / 2), { cast: true, receive: false });
    for (let j = 0; j <= d; j += 1) batch.add(box(w, 0.07, 0.05), mat, M(x + w / 2, y, zz + j), { cast: true, receive: false });
  }
}

// ─────────────────────────────────────────── Entrée

function buildEntrance(ctx: SalonCtx, openings: Set<number>): void {
  const { grid, style, batch } = ctx;
  const e = entranceInfo(grid);
  if (!e) return;
  const trim = vc('satin');
  const gold = vc('gold');
  const lacq = vc('lacquer');
  const velvet = vc('velvet');
  const cx = e.x + 0.5;
  const cz = e.z + 0.5;
  const rot = yawOf(e.dx, e.dz);
  if (openings.has(e.cell) || e.low) {
    // ouverture dans le muret : seuil de marbre, piliers à pommeaux dorés, tapis d'honneur
    const y0 = 0;
    batch.push(M(cx, y0, cz, rot));
    batch.add(roundedBox(1.0, 0.05, 1.0, 0.015, 1), trim, M(0, 0.02, 0), { color: style.marbleTop });
    for (const s of [-1, 1]) {
      batch.add(roundedBox(0.24, 0.72, 0.24, 0.03, 1), trim, M(s * 0.56, 0.36, 0), { color: style.trim });
      batch.add(roundedBox(0.3, 0.06, 0.3, 0.02, 1), trim, M(s * 0.56, 0.75, 0), { color: style.trim });
      batch.add(sphere(0.1, 14, 10), gold, M(s * 0.56, 0.88, 0), { color: style.metal });
    }
    batch.add(roundedBox(0.86, 0.012, 2.1, 0.005, 1), velvet, M(0, 0.008, 1.0), { color: style.id === 'jardin' ? '#7d9474' : '#9b2f45', cast: false });
    batch.add(box(0.05, 0.014, 2.1), gold, M(-0.4, 0.01, 1.0), { color: style.metal, cast: false });
    batch.add(box(0.05, 0.014, 2.1), gold, M(0.4, 0.01, 1.0), { color: style.metal, cast: false });
    batch.pop();
    return;
  }
  // porte à double battant vitrée sur un mur du fond
  const y0 = grid.groundY(cx + e.dx, cz + e.dz);
  const fx = cx + e.dx * 0.5;
  const fz = cz + e.dz * 0.5;
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTexture(style.windowSky[0], style.windowSky[1]) });
  ctx.owned.materials.push(skyMat);
  batch.push(M(fx, y0, fz, rot));
  const doorCol = style.id === 'galerie' ? '#5b1f2a' : style.id === 'jardin' ? '#4f6b4a' : style.id === 'terrasse' ? '#8a76b0' : '#b86a7e';
  for (const s of [-1, 1]) {
    batch.add(roundedBox(0.58, 1.95, 0.06, 0.015, 1), lacq, M(s * 0.3, 0.975, 0.03), { color: doorCol });
    batch.add(groundPlaneXY(0.36, 1.1), skyMat, M(s * 0.3, 1.25, 0.065), { cast: false });
    batch.add(box(0.02, 1.1, 0.02), trim, M(s * 0.3, 1.25, 0.07), { color: style.trim, cast: false });
    batch.add(box(0.36, 0.02, 0.02), trim, M(s * 0.3, 1.25, 0.07), { color: style.trim, cast: false });
    batch.add(roundedBox(0.4, 0.4, 0.02, 0.01, 1), lacq, M(s * 0.3, 0.38, 0.065), { color: shade(doorCol, 0.15) });
    batch.add(sphere(0.035, 10, 8), gold, M(s * 0.07, 1.0, 0.09), { color: style.metal });
    batch.add(roundedBox(0.16, 2.3, 0.1, 0.02, 1), trim, M(s * 0.7, 1.15, 0.05), { color: style.trim });
  }
  batch.add(roundedBox(1.6, 0.18, 0.14, 0.03, 1), trim, M(0, 2.18, 0.07), { color: style.trim });
  batch.add(chamferCylinder(0.13, 0.13, 0.03, 0.01, 20), gold, M(0, 2.18, 0.14, 0, 1, 1, 1, Math.PI / 2), { color: style.metal });
  // paillasson
  batch.add(roundedBox(1.1, 0.015, 0.6, 0.006, 1), velvet, M(0, 0.008, 0.45), { color: '#9b2f45', cast: false });
  batch.pop();
  // appliques de part et d'autre
  const side = new THREE.Vector3(Math.cos(rot), 0, -Math.sin(rot));
  for (const s of [-1, 1]) {
    const px = fx + side.x * s * 0.95 + e.dx * 0.12;
    const pz = fz + side.z * s * 0.95 + e.dz * 0.12;
    batch.add(sphere(0.06, 10, 8), vc('ceramic'), M(px, y0 + 1.75, pz), { color: '#fff4dc', cast: false });
    ctx.glows.add(px, y0 + 1.75, pz, style.bulb, 0.55, 1, 0.9);
  }
}
