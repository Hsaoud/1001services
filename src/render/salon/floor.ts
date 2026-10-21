/**
 * Sols par zone (textures procédurales, occlusion ambiante douce au pied des murs), estrades
 * surélevées avec chants dorés, bordure dorée des moquettes et socle biseauté du diorama.
 */
import * as THREE from 'three';
import type { FloorStyle } from '../../types';
import { CELL } from '../../types';
import { floorTexture, exteriorTexture } from '../textures';
import type { BiomeStyle } from '../biomes';
import { StaticBatch, M } from '../batch';
import { vc } from '../mats';
import { box } from '../geo';
import { SalonGrid, WALL_H } from './grid';

export interface FloorBuild {
  meshes: THREE.Mesh[];
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
}

/** Construit les sols (meshes texturés) ; les chants d'estrade et bordures vont dans le batch. */
export function buildFloors(grid: SalonGrid, style: BiomeStyle, batch: StaticBatch, parent: THREE.Object3D, openings: Set<number>): FloorBuild {
  const out: FloorBuild = { meshes: [], materials: [], geometries: [] };
  // regroupe les cases par (style de sol, hauteur)
  const groups = new Map<string, { floor: FloorStyle; raised: number; cells: number[] }>();
  const n = grid.w * grid.d;
  for (let i = 0; i < n; i++) {
    const c = grid.cells[i];
    const open = openings.has(i);
    if (c === CELL.VOID || (c === CELL.WALL && !open)) continue;
    const zid = grid.zone[i];
    const zs = zid >= 0 ? grid.zoneSpec(zid) : undefined;
    const floor: FloorStyle = zs?.floor ?? 'parquet';
    const raised = c === CELL.FLOOR || c === CELL.RAIL ? (zs?.raised ?? 0) : 0;
    const key = `${floor}:${raised}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { floor, raised, cells: [] }));
    g.cells.push(i);
  }
  for (const g of groups.values()) {
    const tex = floorTexture(g.floor, style.id);
    const geo = floorGeometry(grid, g.cells, g.raised, tex.sizeX, tex.sizeZ);
    const mat = new THREE.MeshStandardMaterial({
      map: tex.map,
      vertexColors: true,
      roughness: tex.roughness,
      metalness: 0,
      envMapIntensity: g.floor === 'marble' || g.floor === 'checker' ? 1.2 : 0.6,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = -2;
    parent.add(mesh);
    out.meshes.push(mesh);
    out.materials.push(mat);
    out.geometries.push(geo);
  }
  buildRaisedEdges(grid, style, batch);
  buildCarpetBorders(grid, style, batch);
  return out;
}

/** Occlusion d'un point du sol par les murs / balustrades voisins. */
function aoAt(grid: SalonGrid, vx: number, vz: number, y: number): number {
  let occ = 0;
  const cx = Math.floor(vx);
  const cz = Math.floor(vz);
  for (let z = cz - 2; z <= cz + 1; z++)
    for (let x = cx - 2; x <= cx + 1; x++) {
      const c = grid.cell(x, z);
      let s = 0;
      if (c === CELL.WALL) s = grid.wallHeight(x, z) >= WALL_H - 0.01 ? 0.42 : 0.24;
      else if (c === CELL.GLASS) s = 0.14;
      else if (c === CELL.RAIL) s = 0.1;
      else if (c === CELL.FLOOR) {
        const gy = grid.groundY(x + 0.5, z + 0.5);
        if (gy > y + 0.05) s = 0.16;
      }
      if (s === 0) continue;
      const dx = Math.max(x - vx, 0, vx - (x + 1));
      const dz = Math.max(z - vz, 0, vz - (z + 1));
      const d = Math.hypot(dx, dz);
      const k = 1 - Math.min(1, d / 0.75);
      occ = Math.max(occ, s * k * k * (3 - 2 * k));
    }
  return 1 - occ;
}

function floorGeometry(grid: SalonGrid, cells: number[], y: number, sx: number, sz: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const nrm: number[] = [];
  const S = 2; // subdivisions par case
  for (const i of cells) {
    const x0 = i % grid.w;
    const z0 = Math.floor(i / grid.w);
    const o = pos.length / 3;
    for (let b = 0; b <= S; b++)
      for (let a = 0; a <= S; a++) {
        const vx = x0 + a / S;
        const vz = z0 + b / S;
        pos.push(vx, y, vz);
        nrm.push(0, 1, 0);
        uv.push(vx / sx, -vz / sz);
        const ao = aoAt(grid, vx, vz, y);
        col.push(ao, ao * 0.985, ao * 0.99);
      }
    for (let b = 0; b < S; b++)
      for (let a = 0; a < S; a++) {
        const p = o + b * (S + 1) + a;
        const q = p + S + 1;
        idx.push(p, q, p + 1, p + 1, q, q + 1);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Chants des estrades (bois + liseré doré). */
function buildRaisedEdges(grid: SalonGrid, style: BiomeStyle, batch: StaticBatch): void {
  const wood = vc('wood');
  const gold = vc('gold');
  for (let z = 0; z < grid.d; z++)
    for (let x = 0; x < grid.w; x++) {
      const c = grid.cell(x, z);
      if (c !== CELL.FLOOR && c !== CELL.RAIL) continue;
      const y = grid.groundY(x + 0.5, z + 0.5);
      if (y <= 0.001) continue;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nc = grid.cell(x + dx, z + dz);
        if (nc === CELL.WALL || nc === CELL.GLASS) continue;
        const ny = nc === CELL.VOID ? 0 : grid.groundY(x + dx + 0.5, z + dz + 0.5);
        if (ny >= y - 0.001) continue;
        const h = y - ny;
        const horiz = dz !== 0;
        const cx = x + 0.5 + dx * 0.5;
        const cz = z + 0.5 + dz * 0.5;
        const len = 1.0;
        // contremarche
        batch.add(box(horiz ? len : 0.04, h, horiz ? 0.04 : len), wood, M(cx - dx * 0.02, ny + h / 2, cz - dz * 0.02), { color: shadeHex(style.wood, -0.1) });
        // liseré doré
        batch.add(box(horiz ? len : 0.05, 0.035, horiz ? 0.05 : len), gold, M(cx - dx * 0.015, y - 0.0175, cz - dz * 0.015), { color: style.metal });
      }
    }
}

/** Bordure dorée des moquettes (bande à 0.18 m du bord de zone). */
function buildCarpetBorders(grid: SalonGrid, style: BiomeStyle, batch: StaticBatch): void {
  const mat = vc('satin');
  const inset = 0.16;
  const bw = 0.09;
  for (let z = 0; z < grid.d; z++)
    for (let x = 0; x < grid.w; x++) {
      if (grid.cell(x, z) !== CELL.FLOOR) continue;
      const zs = grid.zoneAt(x + 0.5, z + 0.5);
      if (!zs || zs.floor !== 'carpet') continue;
      const y = grid.groundY(x + 0.5, z + 0.5) + 0.003;
      const same = (dx: number, dz: number) => {
        const c = grid.cell(x + dx, z + dz);
        if (c !== CELL.FLOOR) return false;
        const o = grid.zoneAt(x + dx + 0.5, z + dz + 0.5);
        return o?.id === zs.id;
      };
      const L = !same(-1, 0);
      const R = !same(1, 0);
      const T = !same(0, -1);
      const B = !same(0, 1);
      const col = style.metal;
      const strip = (x0: number, z0: number, x1: number, z1: number) => {
        batch.add(box(x1 - x0, 0.004, z1 - z0), mat, M((x0 + x1) / 2, y, (z0 + z1) / 2), { color: col, cast: false });
      };
      if (T) strip(x + (L ? inset : 0), z + inset, x + 1 - (R ? inset : 0), z + inset + bw);
      if (B) strip(x + (L ? inset : 0), z + 1 - inset - bw, x + 1 - (R ? inset : 0), z + 1 - inset);
      if (L) strip(x + inset, z + (T ? inset + bw : 0), x + inset + bw, z + 1 - (B ? inset + bw : 0));
      if (R) strip(x + 1 - inset - bw, z + (T ? inset + bw : 0), x + 1 - inset, z + 1 - (B ? inset + bw : 0));
      // coins rentrants
      if (!L && !T && !same(-1, -1)) strip(x, z + inset, x + inset + bw, z + inset + bw);
      if (!R && !T && !same(1, -1)) strip(x + 1 - inset - bw, z + inset, x + 1, z + inset + bw);
      if (!L && !B && !same(-1, 1)) strip(x, z + 1 - inset - bw, x + inset + bw, z + 1 - inset);
      if (!R && !B && !same(1, 1)) strip(x + 1 - inset - bw, z + 1 - inset - bw, x + 1, z + 1 - inset);
      if (!L && !T && !same(-1, -1)) strip(x + inset, z, x + inset + bw, z + inset);
      if (!R && !T && !same(1, -1)) strip(x + 1 - inset - bw, z, x + 1 - inset, z + inset);
      if (!L && !B && !same(-1, 1)) strip(x + inset, z + 1 - inset, x + inset + bw, z + 1);
      if (!R && !B && !same(1, 1)) strip(x + 1 - inset - bw, z + 1 - inset, x + 1 - inset, z + 1);
    }
}

function shadeHex(c: string, k: number): string {
  const col = new THREE.Color(c);
  col.lerp(new THREE.Color(k >= 0 ? '#ffffff' : '#000000'), Math.abs(k));
  return '#' + col.getHexString();
}

// ─────────────────────────────────────────── Socle

/** Contours (boucles fermées) de l'emprise non vide, en coordonnées (x, z). */
function footprintLoops(grid: SalonGrid): THREE.Vector2[][] {
  type Edge = { ax: number; az: number; bx: number; bz: number };
  const edges = new Map<string, Edge[]>();
  const add = (ax: number, az: number, bx: number, bz: number) => {
    const k = `${ax},${az}`;
    let arr = edges.get(k);
    if (!arr) edges.set(k, (arr = []));
    arr.push({ ax, az, bx, bz });
  };
  for (let z = 0; z < grid.d; z++)
    for (let x = 0; x < grid.w; x++) {
      if (grid.isVoid(x, z)) continue;
      // arêtes orientées (sens trigonométrique vu de dessus avec axes x → droite, z → bas : on garde un sens cohérent)
      if (grid.isVoid(x, z - 1)) add(x, z, x + 1, z);
      if (grid.isVoid(x + 1, z)) add(x + 1, z, x + 1, z + 1);
      if (grid.isVoid(x, z + 1)) add(x + 1, z + 1, x, z + 1);
      if (grid.isVoid(x - 1, z)) add(x, z + 1, x, z);
    }
  const loops: THREE.Vector2[][] = [];
  const take = (k: string): Edge | undefined => {
    const arr = edges.get(k);
    if (!arr || arr.length === 0) return undefined;
    const e = arr.pop();
    if (arr.length === 0) edges.delete(k);
    return e;
  };
  while (edges.size > 0) {
    const firstKey = edges.keys().next().value as string;
    let e = take(firstKey);
    if (!e) break;
    const pts: THREE.Vector2[] = [new THREE.Vector2(e.ax, e.az)];
    let guard = 0;
    while (e && guard++ < 100000) {
      const nk = `${e.bx},${e.bz}`;
      pts.push(new THREE.Vector2(e.bx, e.bz));
      e = take(nk);
    }
    // retire le point de fermeture et les points colinéaires
    if (pts.length > 1 && pts[0].equals(pts[pts.length - 1])) pts.pop();
    const clean: THREE.Vector2[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[(i + pts.length - 1) % pts.length];
      const c = pts[i];
      const q = pts[(i + 1) % pts.length];
      const cross = (c.x - p.x) * (q.y - c.y) - (c.y - p.y) * (q.x - c.x);
      if (Math.abs(cross) > 1e-9) clean.push(c);
    }
    if (clean.length >= 3) loops.push(clean);
  }
  return loops;
}

/** Socle biseauté sous le salon (trois strates : parement, liseré doré, bandeau). */
export function buildPlinth(grid: SalonGrid, style: BiomeStyle, parent: THREE.Object3D): FloorBuild {
  const out: FloorBuild = { meshes: [], materials: [], geometries: [] };
  const loops = footprintLoops(grid);
  if (loops.length === 0) return out;
  // séparation contours extérieurs / trous selon l'aire signée
  const area = (l: THREE.Vector2[]) => THREE.ShapeUtils.area(l);
  const sorted = loops.map((l) => ({ l, a: area(l) }));
  const outerSign = Math.sign(sorted.reduce((best, s) => (Math.abs(s.a) > Math.abs(best.a) ? s : best)).a);
  const outers = sorted.filter((s) => Math.sign(s.a) === outerSign);
  const holes = sorted.filter((s) => Math.sign(s.a) !== outerSign);
  const shapes: THREE.Shape[] = [];
  for (const o of outers) {
    const sh = new THREE.Shape(o.l);
    for (const h of holes) {
      // trou contenu dans ce contour ?
      if (pointInPoly(h.l[0], o.l)) sh.holes.push(new THREE.Path(h.l));
    }
    shapes.push(sh);
  }
  const tiers: { top: number; depth: number; bevel: number; offset: number; mat: THREE.Material }[] = [];
  const extTex = exteriorTexture(style.id);
  const matA = new THREE.MeshStandardMaterial({ map: extTex, roughness: 0.82, color: '#ffffff' });
  const matB = new THREE.MeshStandardMaterial({ color: style.metal, roughness: 0.25, metalness: 0.85 });
  const matC = new THREE.MeshStandardMaterial({ color: style.plinthLow, roughness: 0.7 });
  tiers.push({ top: -0.02, depth: 0.3, bevel: 0.035, offset: 0.0, mat: matA });
  tiers.push({ top: -0.38, depth: 0.03, bevel: 0.02, offset: 0.0, mat: matB });
  tiers.push({ top: -0.45, depth: 0.42, bevel: 0.05, offset: -0.1, mat: matC });
  for (const t of tiers) {
    const geo = new THREE.ExtrudeGeometry(shapes, {
      depth: t.depth,
      bevelEnabled: true,
      bevelThickness: t.bevel,
      bevelSize: t.bevel,
      bevelOffset: t.offset,
      bevelSegments: 2,
      curveSegments: 1,
    });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, t.top - t.bevel, 0);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, t.mat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.matrixAutoUpdate = false;
    parent.add(mesh);
    out.meshes.push(mesh);
    out.geometries.push(geo);
    out.materials.push(t.mat);
  }
  return out;
}

function pointInPoly(p: THREE.Vector2, poly: THREE.Vector2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
