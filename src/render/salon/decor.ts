/**
 * Décor du salon : toutes les `DecorKind` (plantes, fleurs, oliviers, parasols, fontaine animée,
 * arches florales, colonnes, lustres scintillants, tapis, banquettes de velours, piano, miroirs,
 * tableaux, lampes, vitrine à gâteaux, bibliothèque, treillage, lanternes, statues, marches, portes).
 * Le statique va dans le batch ; les éléments animés renvoient un `Animated`.
 */
import * as THREE from 'three';
import type { DecorSpec } from '../../types';
import { CELL } from '../../types';
import { StaticBatch, M } from '../batch';
import { vc, vcGlass, vcGlow, SHARED } from '../mats';
import {
  archGeo,
  archPanelGeo,
  bushGeo,
  columnShaftGeo,
  cone,
  crystalGeo,
  flowerGeo,
  GeoBuilder,
  leafGeo,
  openCylinder,
  potGeo,
  urnGeo,
  box,
  flatDisc,
} from '../geo';
import { chamferCylinder, lathe, roundedBox, sphere, torus, cylinder } from '../kit';
import { paintingTexture, rugTexture } from '../textures';
import { GlowPoints } from '../glow';
import type { Animated, SalonCtx } from './context';
import { rand, seedOf } from './context';
import { entranceInfo } from './walls';
import { RAIL_H } from './grid';

const RAIL_TOP = RAIL_H + 0.06;

type Builder = (ctx: SalonCtx, d: DecorSpec, gy: number, r: () => number) => Animated | void;

/** Construit tout le décor du salon. */
export function buildDecor(ctx: SalonCtx): void {
  const ent = entranceInfo(ctx.grid);
  ctx.layout.decor.forEach((d, i) => {
    if (d.kind === 'door' && ent && Math.hypot(d.x - (ent.x + 0.5), d.z - (ent.z + 0.5)) < 1.2) return;
    const fn = BUILDERS[d.kind];
    if (!fn) return;
    const gy = groundUnder(ctx, d.x, d.z);
    const r = rand(seedOf(ctx.layout.seed, 9000 + i * 31));
    try {
      const a = fn(ctx, d, gy, r);
      if (a) ctx.anim.push(a);
    } catch (e) {
      console.warn(`[rendu] décor « ${d.kind} » ignoré :`, e);
    }
  });
  finalizeDecor(ctx);
}

/** Hauteur du sol sous un décor (une case de mur prend la hauteur du sol voisin le plus bas). */
function groundUnder(ctx: SalonCtx, x: number, z: number): number {
  const g = ctx.grid;
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  const c = g.cell(cx, cz);
  if (c === CELL.FLOOR || c === CELL.RAIL) return g.groundY(x, z);
  let best = Infinity;
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ])
    if (g.cell(cx + dx, cz + dz) === CELL.FLOOR) best = Math.min(best, g.groundY(cx + dx + 0.5, cz + dz + 0.5));
  return best === Infinity ? 0 : best;
}

const dirOf = (rot: number): [number, number] => [Math.sin(rot), Math.cos(rot)];

/**
 * Plaque un meuble adossé contre le mur derrière lui (sens −rot) : renvoie la position corrigée.
 * `halfDepth` = demi-profondeur du meuble.
 */
function snapToWall(ctx: SalonCtx, d: DecorSpec, halfDepth: number): [number, number] {
  const [dx, dz] = dirOf(d.rot);
  const g = ctx.grid;
  for (let s = 0.05; s <= 1.2; s += 0.05) {
    const px = d.x - dx * s;
    const pz = d.z - dz * s;
    if (g.isSolid(Math.floor(px), Math.floor(pz))) {
      const face = s - 0.05;
      const shift = face - halfDepth - 0.01;
      if (shift > 0 && shift < 0.9) return [d.x - dx * shift, d.z - dz * shift];
      break;
    }
  }
  return [d.x, d.z];
}

/** Point d'accroche mural : face du mur côté salle, et hauteur du mur (pour les murets). */
function wallMount(ctx: SalonCtx, d: DecorSpec): { x: number; z: number; wallH: number } {
  const [dx, dz] = dirOf(d.rot);
  const g = ctx.grid;
  const cx = Math.floor(d.x);
  const cz = Math.floor(d.z);
  if (g.isSolid(cx, cz)) {
    // case de mur : face = centre + 0.5 dans la direction de la salle (sur l'axe dominant)
    const ax = Math.abs(dx) > Math.abs(dz);
    const fx = ax ? cx + 0.5 + Math.sign(dx) * 0.5 : d.x;
    const fz = ax ? d.z : cz + 0.5 + Math.sign(dz) * 0.5;
    return { x: fx, z: fz, wallH: g.wallHeight(cx, cz) };
  }
  // sinon : le mur est derrière
  for (let s = 0.05; s <= 1.5; s += 0.05) {
    const px = d.x - dx * s;
    const pz = d.z - dz * s;
    const qx = Math.floor(px);
    const qz = Math.floor(pz);
    if (g.isSolid(qx, qz)) return { x: d.x - dx * (s - 0.05), z: d.z - dz * (s - 0.05), wallH: g.wallHeight(qx, qz) };
  }
  return { x: d.x, z: d.z, wallH: 0 };
}

function shade(c: string, k: number): string {
  const col = new THREE.Color(c);
  col.lerp(new THREE.Color(k >= 0 ? '#ffffff' : '#000000'), Math.abs(k));
  return '#' + col.getHexString();
}

// ─────────────────────────────────────────── Plantes

function foliageClump(b: StaticBatch, colors: string[], r: () => number, x: number, y: number, z: number, rad: number, sway = 1): void {
  const col = colors[Math.floor(r() * colors.length)];
  b.add(bushGeo(rad, Math.floor(r() * 4)), vc('foliage'), M(x, y, z, r() * 6.28), { color: col, sway });
}

const plant: Builder = (ctx, d, gy, r) => {
  const { batch, style } = ctx;
  const s = d.scale ?? 1;
  const v = (d.variant ?? Math.floor(r() * 4)) % 4;
  batch.push(M(d.x, gy, d.z, d.rot, s));
  batch.setSwayBase(gy + 0.3 * s, 0.7 * s);
  const potCol = v === 2 ? style.metal : style.pot;
  batch.add(potGeo(0.17, 0.3), v === 2 ? vc('gold') : vc('ceramic'), null, { color: potCol });
  batch.add(chamferCylinder(0.16, 0.16, 0.02, 0.005, 14), vc('matte'), M(0, 0.26, 0), { color: '#5a4033', cast: false });
  const f = style.foliage;
  if (v === 0) {
    foliageClump(batch, f, r, 0, 0.5, 0, 0.22);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * 6.28 + r();
      foliageClump(batch, f, r, Math.cos(a) * 0.13, 0.42 + r() * 0.2, Math.sin(a) * 0.13, 0.15);
    }
  } else if (v === 1) {
    // fougère : frondes rayonnantes
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * 6.28 + r() * 0.3;
      batch.add(leafGeo(0.42 + r() * 0.12, 0.13, 0.6), vc('foliage'), M(0, 0.28, 0, a, 1, 1, 1, 0.75 + r() * 0.35), { color: f[k % f.length], sway: 1.2 });
    }
  } else if (v === 2) {
    // topiaire : boule de buis sur tige
    batch.add(cylinder(0.02, 0.025, 0.35, 8), vc('wood'), M(0, 0.28, 0), { color: '#6b4a3a' });
    batch.add(sphere(0.24, 16, 12), vc('foliage'), M(0, 0.78, 0), { color: f[f.length - 1], sway: 0.5 });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * 6.28;
      batch.add(sphere(0.06, 8, 6), vc('foliage'), M(Math.cos(a) * 0.18, 0.78 + Math.sin(a * 2) * 0.1, Math.sin(a) * 0.18), { color: f[0], sway: 0.5 });
    }
  } else {
    foliageClump(batch, f, r, 0, 0.48, 0, 0.2);
    foliageClump(batch, f, r, 0.1, 0.4, 0.06, 0.15);
    for (let k = 0; k < 9; k++) {
      const a = r() * 6.28;
      const rr = 0.12 + r() * 0.1;
      batch.add(flowerGeo(0.045), vc('matte'), M(Math.cos(a) * rr, 0.5 + r() * 0.2, Math.sin(a) * rr, a), { color: style.flowers[k % style.flowers.length], sway: 1 });
    }
  }
  batch.pop();
};

const bigplant: Builder = (ctx, d, gy, r) => {
  const { batch, style } = ctx;
  const s = d.scale ?? 1;
  const v = (d.variant ?? Math.floor(r() * 2)) % 2;
  batch.push(M(d.x, gy, d.z, d.rot, s));
  batch.setSwayBase(gy + 0.5 * s, 1.5 * s);
  batch.add(potGeo(0.27, 0.48), vc('ceramic'), null, { color: style.pot, tall: true });
  batch.add(torus(0.29, 0.015, 6, 28), vc('gold'), M(0, 0.44, 0, 0, 1, 1, 1, Math.PI / 2), { color: style.metal, cast: false, tall: true });
  const f = style.foliage;
  if (v === 0) {
    // palmier
    let y = 0.45;
    for (let k = 0; k < 6; k++) {
      batch.add(chamferCylinder(0.06 - k * 0.004, 0.07 - k * 0.004, 0.22, 0.02, 10), vc('wood'), M(Math.sin(k) * 0.02, y, 0, k), { color: k % 2 ? '#8a6a4a' : '#7a5a3e', tall: true });
      y += 0.2;
    }
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * 6.28 + r() * 0.3;
      batch.add(leafGeo(0.95 + r() * 0.2, 0.26, 0.7), vc('foliage'), M(0, y, 0, a, 1, 1, 1, 0.9 + r() * 0.5), { color: f[k % f.length], sway: 1.3, tall: true });
    }
  } else {
    // monstera / ficus touffu
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * 6.28 + r();
      const h = 0.9 + r() * 0.8;
      batch.add(cylinder(0.012, 0.015, h - 0.45, 6), vc('foliage'), M(Math.cos(a) * 0.05, 0.45, Math.sin(a) * 0.05, a, 1, 1, 1, 0.25), { color: f[0], tall: true, sway: 0.6 });
      batch.add(leafGeo(0.55, 0.45, 0.35), vc('foliage'), M(Math.cos(a) * 0.32, h, Math.sin(a) * 0.32, a, 1, 1, 1, 1.0 + r() * 0.4), { color: f[k % f.length], sway: 1.2, tall: true });
    }
    for (let k = 0; k < 4; k++) foliageClump(batch, f, r, (r() - 0.5) * 0.3, 1.2 + r() * 0.5, (r() - 0.5) * 0.3, 0.22, 1);
  }
  batch.pop();
};

const flowers: Builder = (ctx, d, gy, r) => {
  const { batch, style } = ctx;
  const s = d.scale ?? 1;
  const v = (d.variant ?? Math.floor(r() * 3)) % 3;
  batch.push(M(d.x, gy, d.z, d.rot, s));
  batch.setSwayBase(gy + 0.3 * s, 0.8 * s);
  const fl = style.flowers;
  if (v === 0) {
    // grand vase Médicis et bouquet
    batch.add(roundedBox(0.42, 0.3, 0.42, 0.03, 2), vc('satin'), M(0, 0.15, 0), { color: style.trim });
    batch.add(urnGeo(1.0), vc('ceramic'), M(0, 0.3, 0), { color: style.id === 'galerie' ? '#f6f3ee' : style.accent });
    for (let k = 0; k < 14; k++) {
      const a = r() * 6.28;
      const rr = r() * 0.22;
      const y = 0.85 + (0.22 - rr) * 0.9 + r() * 0.12;
      batch.add(flowerGeo(0.06 + r() * 0.02), vc('matte'), M(Math.cos(a) * rr, y, Math.sin(a) * rr, a, 1, 1, 1, rr * 2), { color: fl[k % fl.length], sway: 0.8 });
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * 6.28;
      batch.add(leafGeo(0.22, 0.09, 0.5), vc('foliage'), M(Math.cos(a) * 0.1, 0.78, Math.sin(a) * 0.1, a, 1, 1, 1, 1.2), { color: style.foliage[k % style.foliage.length], sway: 0.8 });
    }
  } else if (v === 1) {
    // jardinière fleurie
    const w = d.w ?? 1.0;
    batch.add(roundedBox(w, 0.32, 0.36, 0.03, 2), vc('satin'), M(0, 0.16, 0), { color: style.id === 'terrasse' ? style.pot : style.trim });
    batch.add(box(w - 0.04, 0.02, 0.32), vc('matte'), M(0, 0.32, 0), { color: '#5a4033', cast: false });
    const n = Math.round(w * 9);
    for (let k = 0; k < n; k++) {
      const x = (r() - 0.5) * (w - 0.1);
      const z = (r() - 0.5) * 0.26;
      foliageClump(batch, style.foliage, r, x, 0.4, z, 0.09, 0.8);
      batch.add(flowerGeo(0.045), vc('matte'), M(x, 0.47 + r() * 0.1, z, r() * 6), { color: fl[k % fl.length], sway: 1 });
    }
  } else {
    // massif d'hortensias
    batch.add(potGeo(0.22, 0.32), vc('ceramic'), null, { color: style.pot });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * 6.28 + r();
      const rr = 0.12 + r() * 0.06;
      const col = fl[k % fl.length];
      batch.add(bushGeo(0.12, k), vc('matte'), M(Math.cos(a) * rr, 0.5 + r() * 0.12, Math.sin(a) * rr), { color: col, sway: 0.7 });
    }
    foliageClump(batch, style.foliage, r, 0, 0.42, 0, 0.2, 0.5);
  }
  batch.pop();
};

const olive: Builder = (ctx, d, gy, r) => {
  const { batch } = ctx;
  const s = d.scale ?? 1;
  batch.push(M(d.x, gy, d.z, d.rot, s));
  batch.setSwayBase(gy + 1.0 * s, 1.0 * s);
  batch.add(potGeo(0.3, 0.45), vc('ceramic'), null, { color: '#d08c60', tall: true });
  batch.add(torus(0.31, 0.02, 6, 28), vc('matte'), M(0, 0.4, 0, 0, 1, 1, 1, Math.PI / 2), { color: '#b9734d', tall: true });
  // tronc tortueux
  let x = 0;
  let z = 0;
  let y = 0.42;
  for (let k = 0; k < 5; k++) {
    const nx = x + (r() - 0.5) * 0.12;
    const nz = z + (r() - 0.5) * 0.12;
    batch.add(chamferCylinder(0.045 - k * 0.005, 0.055 - k * 0.005, 0.22, 0.015, 8), vc('wood'), M(x, y, z, r() * 6, 1, 1, 1, (nz - z) * 2, -(nx - x) * 2), { color: '#7b6a58', tall: true });
    x = nx;
    z = nz;
    y += 0.2;
  }
  const cols = ['#8ea07a', '#9cae86', '#7f9470', '#a9b894'];
  for (let k = 0; k < 9; k++) {
    const a = r() * 6.28;
    const rr = r() * 0.42;
    batch.add(bushGeo(0.2 + r() * 0.08, k % 4), vc('foliage'), M(x + Math.cos(a) * rr, y + 0.15 + r() * 0.4, z + Math.sin(a) * rr, a, 1, 0.75, 1), {
      color: cols[k % cols.length],
      sway: 1,
      tall: true,
    });
  }
  // petites olives
  for (let k = 0; k < 8; k++) batch.add(sphere(0.022, 6, 4), vc('ceramic'), M(x + (r() - 0.5) * 0.7, y + 0.1 + r() * 0.4, z + (r() - 0.5) * 0.7), { color: '#3f4a2a', cast: false, tall: true });
  batch.pop();
};

// ─────────────────────────────────────────── Terrasse

const parasol: Builder = (ctx, d, gy, r) => {
  const { batch, style } = ctx;
  const s = Math.min(1.15, d.scale ?? 1);
  const R = 1.0;
  const H = 2.3;
  batch.push(M(d.x, gy, d.z, d.rot, s));
  batch.add(chamferCylinder(0.26, 0.3, 0.1, 0.03, 20), vc('satin'), null, { color: style.trim });
  batch.add(cylinder(0.03, 0.035, H, 10), vc('wood'), M(0, 0.1, 0), { color: '#f4ede2', tall: true });
  // toile à rayures (secteurs alternés) avec festons
  const n = 12;
  const a1 = new GeoBuilder();
  const a2 = new GeoBuilder();
  const apex: [number, number, number] = [0, H + 0.32, 0];
  for (let i = 0; i < n; i++) {
    const t0 = (i / n) * Math.PI * 2;
    const t1 = ((i + 1) / n) * Math.PI * 2;
    const tm = (t0 + t1) / 2;
    const p0: [number, number, number] = [Math.cos(t0) * R, H, Math.sin(t0) * R];
    const p1: [number, number, number] = [Math.cos(t1) * R, H, Math.sin(t1) * R];
    const pm: [number, number, number] = [Math.cos(tm) * R * 0.97, H + 0.03, Math.sin(tm) * R * 0.97];
    const g = i % 2 ? a1 : a2;
    g.tri(apex, p1, pm);
    g.tri(apex, pm, p0);
    // feston
    const f0: [number, number, number] = [Math.cos(t0) * R, H - 0.13, Math.sin(t0) * R];
    const f1: [number, number, number] = [Math.cos(t1) * R, H - 0.13, Math.sin(t1) * R];
    const fm: [number, number, number] = [Math.cos(tm) * R * 1.0, H - 0.2, Math.sin(tm) * R * 1.0];
    g.quad(f1, f0, p0, p1);
    g.tri(f0, f1, fm);
  }
  const ca = style.id === 'terrasse' ? style.accent : style.accent;
  const g1 = a1.build();
  const g2 = a2.build();
  ctx.owned.geometries.push(g1, g2);
  batch.add(g1, vc('satin'), null, { color: '#fbf6ee', tall: true });
  batch.add(g2, vc('satin'), null, { color: ca, tall: true });
  batch.add(sphere(0.06, 10, 8), vc('gold'), M(0, H + 0.36, 0), { color: style.metal, tall: true });
  batch.pop();
  void r;
};

const lantern: Builder = (ctx, d, gy, r) => {
  const { batch, style, glows } = ctx;
  const s = d.scale ?? 1;
  const v = (d.variant ?? Math.floor(r() * 2)) % 2;
  const brass = vc('brass');
  const metal = style.id === 'terrasse' ? '#3d3a40' : style.metal;
  const mat = style.id === 'terrasse' ? vc('lacquer') : brass;
  const onRail = !!d.wall && ctx.grid.cell(Math.floor(d.x), Math.floor(d.z)) === CELL.RAIL;
  const y0 = onRail ? RAIL_TOP : v === 1 ? 1.45 : 0;
  const gx = onRail ? Math.floor(d.x) + 0.5 : d.x;
  const gz = onRail ? Math.floor(d.z) + 0.5 : d.z;
  batch.push(M(gx, gy, gz, d.rot, s));
  if (onRail) {
    batch.add(roundedBox(0.22, 0.1, 0.22, 0.02, 1), vc('satin'), M(0, RAIL_TOP - 0.06, 0), { color: style.trim });
  } else if (v === 1) {
    batch.add(chamferCylinder(0.14, 0.18, 0.08, 0.02, 14), mat, null, { color: metal, tall: true });
    batch.add(cylinder(0.03, 0.035, y0, 8), mat, M(0, 0.06, 0), { color: metal, tall: true });
  }
  batch.add(roundedBox(0.28, 0.04, 0.28, 0.01, 1), mat, M(0, y0 + 0.02, 0), { color: metal, tall: v === 1 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) batch.add(box(0.025, 0.38, 0.025), mat, M(sx * 0.12, y0 + 0.23, sz * 0.12), { color: metal, tall: v === 1 });
  batch.add(box(0.24, 0.36, 0.24), vcGlass(0.25), M(0, y0 + 0.22, 0), { color: '#fff3d8', cast: false, tall: v === 1 });
  batch.add(cone(0.2, 0.16, 4), mat, M(0, y0 + 0.42, 0, Math.PI / 4), { color: metal, tall: v === 1 });
  batch.add(torus(0.05, 0.01, 6, 16), mat, M(0, y0 + 0.62, 0), { color: metal, tall: v === 1 });
  batch.add(cylinder(0.035, 0.035, 0.12, 8), vc('ceramic'), M(0, y0 + 0.05, 0), { color: '#fff8ea', tall: v === 1 });
  batch.add(cone(0.016, 0.05, 6), vcGlow(2.4), M(0, y0 + 0.18, 0), { color: '#ffcf70', cast: false });
  batch.pop();
  glows.add(gx, gy + (y0 + 0.2) * s, gz, style.bulb, 0.85 * s, 1, 1.1);
};

// ─────────────────────────────────────────── Architecture

const column: Builder = (ctx, d, gy) => {
  const { batch, style } = ctx;
  const s = d.scale ?? 1;
  const H = 2.75;
  const marble = style.id === 'galerie' ? '#f7f4ef' : style.trim;
  batch.push(M(d.x, gy, d.z, d.rot, s));
  batch.add(roundedBox(0.66, 0.16, 0.66, 0.02, 1), vc('satin'), M(0, 0.08, 0), { color: marble, tall: true });
  batch.add(columnShaftGeo(H - 0.26), vc('ceramic'), M(0, 0.16, 0), { color: marble, tall: true });
  batch.add(torus(0.17, 0.018, 6, 20), vc('gold'), M(0, 0.4, 0, 0, 1, 1, 1, Math.PI / 2), { color: style.metal, tall: true });
  batch.add(torus(0.155, 0.018, 6, 20), vc('gold'), M(0, H - 0.4, 0, 0, 1, 1, 1, Math.PI / 2), { color: style.metal, tall: true });
  batch.add(roundedBox(0.7, 0.1, 0.7, 0.02, 1), vc('satin'), M(0, H - 0.05, 0), { color: marble, tall: true });
  // volutes du chapiteau
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    batch.add(sphere(0.07, 10, 8), vc('gold'), M(Math.cos(a) * 0.27, H - 0.16, Math.sin(a) * 0.27), { color: style.metal, tall: true });
  }
  batch.pop();
};

const arch: Builder = (ctx, d, gy, r) => {
  const { batch, style } = ctx;
  const s = d.scale ?? 1;
  const W = Math.max(1.2, d.w ?? 2.0);
  const postH = 2.0;
  // grande ouverture : arc surbaissé (montée plafonnée)
  const rise = Math.min(W / 2, 0.85);
  const ky = rise / (W / 2);
  const vegetal = style.id === 'jardin';
  batch.push(M(d.x, gy, d.z, d.rot, s));
  batch.setSwayBase(gy, 2.5);
  const frameCol = vegetal ? '#f2efe6' : style.metal;
  const frameMat = vegetal ? vc('satin') : vc('gold');
  for (const sx of [-1, 1]) {
    batch.add(roundedBox(0.1, postH, 0.22, 0.02, 1), frameMat, M((sx * W) / 2, postH / 2, 0), { color: frameCol, tall: true });
    batch.add(roundedBox(0.3, 0.12, 0.34, 0.03, 1), vc('satin'), M((sx * W) / 2, 0.06, 0), { color: style.trim, tall: true });
  }
  batch.add(archGeo(W, 0.08, 0.18, 20), frameMat, M(0, postH, 0, 0, 1, ky, 1), { color: frameCol, tall: true });
  // feuillage et fleurs le long de l'arche
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= 10; k++) {
    for (const sx of [-1, 1]) pts.push(new THREE.Vector3((sx * W) / 2 + (r() - 0.5) * 0.12, 0.2 + (k / 10) * (postH - 0.2), (r() - 0.5) * 0.15));
  }
  const nArc = Math.max(10, Math.round(W * 5));
  for (let k = 0; k <= nArc; k++) {
    const a = (k / nArc) * Math.PI;
    pts.push(new THREE.Vector3(Math.cos(a) * (W / 2 + 0.04), postH + Math.sin(a) * (W / 2 + 0.04) * ky, (r() - 0.5) * 0.15));
  }
  for (const p of pts) {
    batch.add(bushGeo(0.1 + r() * 0.05, Math.floor(r() * 4)), vc('foliage'), M(p.x, p.y, p.z, r() * 6, 1, 0.85, 0.8), { color: style.foliage[Math.floor(r() * style.foliage.length)], sway: 0.6, tall: true });
    // feuilles qui débordent
    batch.add(leafGeo(0.16, 0.07, 0.4), vc('foliage'), M(p.x, p.y, p.z, r() * 6.28, 1, 1, 1, 1.2 + r() * 0.6), { color: style.foliage[0], sway: 0.8, tall: true, cast: false });
    const nf = vegetal ? (r() < 0.4 ? 1 : 0) : 2;
    for (let q = 0; q < nf; q++)
      batch.add(flowerGeo(0.045 + r() * 0.02), vc('matte'), M(p.x + (r() - 0.5) * 0.14, p.y + (r() - 0.5) * 0.12, p.z + (r() < 0.5 ? 0.11 : -0.11), r() * 6, 1, 1, 1, Math.PI / 2), {
        color: style.flowers[Math.floor(r() * style.flowers.length)],
        sway: 0.6,
        tall: true,
        cast: false,
      });
  }
  batch.pop();
};

const trellis: Builder = (ctx, d, gy, r) => {
  const { batch, style } = ctx;
  const s = d.scale ?? 1;
  const W = d.w ?? (d.wall ? 0.95 : 1.4);
  const H = 1.9;
  let px = d.x;
  let pz = d.z;
  if (d.wall) {
    // contre une verrière ou un mur : le panneau se pose côté salle
    const [dx, dz] = dirOf(d.rot);
    const solid = ctx.grid.cell(Math.floor(d.x), Math.floor(d.z));
    const off = solid === CELL.WALL ? 0.5 + 0.2 : 0.3;
    px = Math.floor(d.x) + 0.5 + dx * off;
    pz = Math.floor(d.z) + 0.5 + dz * off;
  }
  batch.push(M(px, gy, pz, d.rot, s));
  batch.setSwayBase(gy, 2);
  const wood = '#f4efe4';
  // jardinière
  batch.add(roundedBox(W, 0.34, 0.34, 0.03, 2), vc('satin'), M(0, 0.17, 0), { color: style.id === 'terrasse' ? style.pot : style.trim, tall: true });
  // cadre
  for (const sx of [-1, 1]) batch.add(box(0.05, H, 0.05), vc('satin'), M((sx * W) / 2, H / 2 + 0.3, -0.05), { color: wood, tall: true });
  batch.add(box(W + 0.05, 0.05, 0.05), vc('satin'), M(0, H + 0.3, -0.05), { color: wood, tall: true });
  // lattes en diagonale (segments découpés au cadre)
  const step = 0.28;
  for (const sign of [-1, 1]) {
    for (let c = -W - H; c <= W + H; c += step) {
      // droite : y = sign * x + c (repère du panneau, x ∈ [−W/2, W/2], y ∈ [0, H])
      const xs: number[] = [];
      for (const x of [-W / 2, W / 2]) {
        const y = sign * x + c;
        if (y >= 0 && y <= H) xs.push(x);
      }
      for (const y of [0, H]) {
        const x = (y - c) / sign;
        if (x >= -W / 2 && x <= W / 2) xs.push(x);
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a - b);
      const x0 = xs[0];
      const x1 = xs[xs.length - 1];
      const y0 = sign * x0 + c;
      const y1 = sign * x1 + c;
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len < 0.05) continue;
      batch.add(box(len, 0.025, 0.02), vc('satin'), M((x0 + x1) / 2, 0.3 + (y0 + y1) / 2, -0.05, 0, 1, 1, 1, 0, Math.atan2(y1 - y0, x1 - x0)), { color: wood, tall: true, cast: true });
    }
  }
  // plante grimpante et grappes de glycine
  for (let k = 0; k < 16; k++) {
    const x = (r() - 0.5) * W;
    const y = 0.45 + r() * (H - 0.2);
    batch.add(bushGeo(0.1 + r() * 0.06, k % 4), vc('foliage'), M(x, y, 0.02, r() * 6, 1, 1, 0.6), { color: style.foliage[k % style.foliage.length], sway: 0.6, tall: true });
  }
  const wis = style.id === 'jardin' ? '#e8b4d0' : '#b9a3dc';
  for (let k = 0; k < 9; k++) {
    const x = (r() - 0.5) * (W - 0.1);
    const y = 0.9 + r() * (H - 0.6);
    for (let q = 0; q < 5; q++) batch.add(sphere(0.035 - q * 0.004, 6, 4), vc('matte'), M(x + (r() - 0.5) * 0.02, y - q * 0.05, 0.08), { color: q % 2 ? wis : shade(wis, 0.2), sway: 1, tall: true });
  }
  batch.pop();
};

const statue: Builder = (ctx, d, gy, r) => {
  const { batch, style } = ctx;
  const s = d.scale ?? 1;
  const marble = '#f4f1ec';
  const v = (d.variant ?? Math.floor(r() * 2)) % 2;
  batch.push(M(d.x, gy, d.z, d.rot, s));
  batch.add(roundedBox(0.5, 0.08, 0.5, 0.02, 1), vc('satin'), M(0, 0.04, 0), { color: style.trim, tall: true });
  batch.add(roundedBox(0.4, 0.8, 0.4, 0.02, 1), vc('satin'), M(0, 0.48, 0), { color: shade(style.trim, -0.03), tall: true });
  batch.add(roundedBox(0.5, 0.08, 0.5, 0.02, 1), vc('satin'), M(0, 0.92, 0), { color: style.trim, tall: true });
  batch.add(box(0.3, 0.012, 0.012), vc('gold'), M(0, 0.7, 0.201), { color: style.metal, cast: false, tall: true });
  if (v === 0) {
    // buste
    batch.add(lathe([[0.09, 0], [0.16, 0.04], [0.2, 0.14], [0.17, 0.26], [0.08, 0.32], [0.05, 0.36], [0, 0.36]], 16, 'bust'), vc('ceramic'), M(0, 0.96, 0, 0, 1, 1, 0.7), { color: marble, tall: true });
    batch.add(sphere(0.11, 16, 12), vc('ceramic'), M(0, 1.42, 0.01, 0, 1, 1.12, 1), { color: marble, tall: true });
    batch.add(sphere(0.07, 12, 8), vc('ceramic'), M(0, 1.5, -0.08), { color: marble, tall: true });
    batch.add(torus(0.1, 0.014, 6, 18, Math.PI), vc('gold'), M(0, 1.5, 0, 0, 1, 1, 1, -0.3), { color: style.metal, tall: true });
  } else {
    // vase-amphore monumental
    batch.add(urnGeo(1.3), vc('ceramic'), M(0, 0.96, 0), { color: marble, tall: true });
    batch.add(torus(0.22, 0.014, 6, 22), vc('gold'), M(0, 1.36, 0, 0, 1, 1, 1, Math.PI / 2), { color: style.metal, tall: true });
  }
  batch.pop();
};

const stageSteps: Builder = (ctx, d) => {
  const { batch, style, grid } = ctx;
  // direction de la montée : vers le sol le plus haut
  let rot = d.rot;
  let best = -1;
  let low = Infinity;
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const [dx, dz] = dirOf(a);
    const h = grid.groundY(d.x + dx * 0.6, d.z + dz * 0.6);
    low = Math.min(low, h);
    if (h > best) {
      best = h;
      rot = a;
    }
  }
  const base = low === Infinity ? 0 : low;
  const hTop = Math.max(0.12, best - base);
  const [ux, uz] = dirOf(rot);
  // bord de l'estrade le long de la direction de montée
  let edge = 0;
  for (let s = -1; s <= 1.0; s += 0.05) {
    if (grid.groundY(d.x + ux * (s + 0.025), d.z + uz * (s + 0.025)) > base + 0.05) {
      edge = s;
      break;
    }
  }
  const W = d.w ?? 1.6;
  const D = Math.max(0.3, d.d ?? 0.45);
  const n = hTop > 0.25 ? 3 : 2;
  batch.push(M(d.x + ux * edge, base, d.z + uz * edge, rot));
  for (let k = 0; k < n; k++) {
    const h = (hTop * (k + 1)) / (n + 1);
    const depth = (D * (n - k)) / n;
    batch.add(roundedBox(W, h, depth, 0.012, 1), vc('wood'), M(0, h / 2, -depth / 2), { color: shade(style.wood, 0.08 - k * 0.04) });
    batch.add(box(W, 0.02, 0.03), vc('gold'), M(0, h - 0.01, -depth + 0.015), { color: style.metal, cast: false });
  }
  // tapis d'escalier (velours) posé sur les marches
  for (let k = 0; k < n; k++) {
    const h = (hTop * (k + 1)) / (n + 1);
    const depth = (D * (n - k)) / n;
    batch.add(box(Math.min(W * 0.45, 1.0), 0.008, depth / n + 0.01), vc('velvet'), M(0, h + 0.004, -depth + depth / n / 2), { color: style.velvet, cast: false });
  }
  batch.pop();
};

// ─────────────────────────────────────────── Mobilier

const banquette: Builder = (ctx, d, gy, r) => {
  const { batch, style } = ctx;
  const L = Math.max(0.8, d.w ?? 2.0);
  const D = 0.56;
  const [px, pz] = snapToWall(ctx, d, D / 2);
  const vel = vc('velvet');
  const col = style.velvet;
  batch.push(M(px, gy, pz, d.rot));
  // assise
  batch.add(roundedBox(L, 0.14, D - 0.12, 0.05, 2), vel, M(0, 0.36, 0.05), { color: col });
  batch.add(roundedBox(L - 0.02, 0.2, D - 0.14, 0.03, 2), vel, M(0, 0.2, 0.04), { color: shade(col, -0.12) });
  // dossier capitonné en côtes
  const ribs = Math.max(3, Math.round(L / 0.24));
  const rw = L / ribs;
  for (let k = 0; k < ribs; k++) {
    const x = -L / 2 + rw * (k + 0.5);
    batch.add(roundedBox(rw - 0.01, 0.5, 0.14, Math.min(0.065, rw / 2 - 0.01), 2), vel, M(x, 0.66, -D / 2 + 0.08), { color: k % 2 ? col : shade(col, 0.04) });
  }
  batch.add(roundedBox(L + 0.04, 0.05, 0.18, 0.02, 1), vc('wood'), M(0, 0.93, -D / 2 + 0.08), { color: style.id === 'galerie' ? style.metal : style.wood });
  // accoudoirs
  for (const s of [-1, 1]) batch.add(roundedBox(0.1, 0.42, D - 0.06, 0.04, 2), vel, M(s * (L / 2 + 0.03), 0.32, 0.02), { color: shade(col, -0.05) });
  // pieds dorés
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) batch.add(cone(0.03, 0.12, 8), vc('gold'), M(sx * (L / 2 - 0.05), 0.12, sz * (D / 2 - 0.08), 0, 1, 1, 1, Math.PI), { color: style.metal, cast: false });
  // coussins
  for (let k = 0; k < Math.floor(L / 0.9); k++) {
    const x = -L / 2 + 0.45 + k * 0.9 + (r() - 0.5) * 0.1;
    batch.add(roundedBox(0.32, 0.28, 0.1, 0.05, 2), vel, M(x, 0.56, -D / 2 + 0.2, (r() - 0.5) * 0.4, 1, 1, 1, -0.25), { color: style.flowers[k % style.flowers.length] });
  }
  batch.pop();
};

const piano: Builder = (ctx, d, gy) => {
  const { batch, style } = ctx;
  const s = d.scale ?? 1;
  const lacquer = vc('lacquer');
  const black = style.id === 'jardin' || style.id === 'boudoir' ? '#fbf7f0' : '#1c1a1f';
  const sh = new THREE.Shape();
  // contour d'un piano à queue (sy = −z), clavier vers +Z
  sh.moveTo(-0.72, -0.58);
  sh.lineTo(0.72, -0.58);
  sh.lineTo(0.72, -0.2);
  sh.bezierCurveTo(0.72, 0.1, 0.1, 0.05, 0.05, 0.42);
  sh.bezierCurveTo(0.0, 0.82, -0.72, 0.88, -0.72, 0.52);
  sh.lineTo(-0.72, -0.58);
  const body = new THREE.ExtrudeGeometry(sh, { depth: 0.26, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 16 });
  body.rotateX(-Math.PI / 2);
  body.clearGroups();
  const lid = new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false, curveSegments: 16 });
  lid.rotateX(-Math.PI / 2);
  lid.clearGroups();
  ctx.owned.geometries.push(body, lid);
  batch.push(M(d.x, gy, d.z, d.rot, s));
  batch.add(body, lacquer, M(0, 0.56, 0), { color: black });
  // pieds
  for (const [x, z] of [
    [-0.6, 0.48],
    [0.6, 0.48],
    [-0.45, -0.66],
  ])
    batch.add(chamferCylinder(0.05, 0.035, 0.56, 0.01, 10), lacquer, M(x, 0, z), { color: black });
  // clavier
  batch.add(roundedBox(1.36, 0.06, 0.2, 0.01, 1), vc('ceramic'), M(0, 0.78, 0.68), { color: '#fffaf0' });
  for (let k = 0; k < 18; k++) if (k % 7 !== 2 && k % 7 !== 6) batch.add(box(0.035, 0.02, 0.1), lacquer, M(-0.64 + k * 0.075, 0.82, 0.64), { color: '#1c1a1f', cast: false });
  batch.add(roundedBox(1.44, 0.1, 0.12, 0.02, 1), lacquer, M(0, 0.72, 0.74), { color: black });
  // couvercle ouvert sur sa béquille
  batch.add(lid, lacquer, M(0.7, 0.85, 0, 0, 1, 1, 1, 0, 0.62), { color: black, tall: true });
  batch.add(cylinder(0.008, 0.008, 0.62, 6), vc('gold'), M(0.55, 0.84, 0.0, 0, 1, 1, 1, 0, 0.25), { color: style.metal, tall: true });
  // pupitre
  batch.add(roundedBox(0.6, 0.24, 0.02, 0.01, 1), lacquer, M(0, 0.96, 0.48, 0, 1, 1, 1, -0.3), { color: black });
  batch.add(box(0.36, 0.24, 0.01), vc('satin'), M(0, 0.97, 0.495, 0, 1, 1, 1, -0.3), { color: '#fbf6ea', cast: false });
  batch.pop();
};

const cakeDisplay: Builder = (ctx, d, gy, r) => {
  const { batch, style } = ctx;
  const s = d.scale ?? 1;
  batch.push(M(d.x, gy, d.z, d.rot, s));
  // guéridon de présentation
  batch.add(chamferCylinder(0.24, 0.28, 0.05, 0.015, 20), vc('gold'), null, { color: style.metal });
  batch.add(lathe([[0.06, 0.05], [0.04, 0.2], [0.05, 0.5], [0.035, 0.68], [0.08, 0.72], [0, 0.72]], 14, 'cakeleg'), vc('gold'), null, { color: style.metal });
  batch.add(chamferCylinder(0.4, 0.4, 0.04, 0.012, 28), vc('ceramic'), M(0, 0.72, 0), { color: style.marbleTop });
  // présentoir à étages
  const cakeCols = [style.accent, '#fbf3e8', '#f6c6d0', '#c9b6e4', '#a8d8c8'];
  let y = 0.76;
  for (let k = 0; k < 3; k++) {
    const rr = 0.3 - k * 0.08;
    batch.add(chamferCylinder(rr, rr * 0.95, 0.015, 0.005, 24), vc('gold'), M(0, y, 0), { color: style.metal });
    batch.add(cylinder(0.012, 0.012, 0.16, 6), vc('gold'), M(0, y, 0), { color: style.metal, cast: false });
    // gâteaux / macarons
    const n = 6 - k * 2;
    for (let q = 0; q < n; q++) {
      const a = (q / n) * Math.PI * 2 + k;
      const cx = Math.cos(a) * (rr - 0.07);
      const cz = Math.sin(a) * (rr - 0.07);
      const c = cakeCols[(q + k) % cakeCols.length];
      batch.add(chamferCylinder(0.04, 0.04, 0.025, 0.012, 12), vc('satin'), M(cx, y + 0.015, cz), { color: c });
      batch.add(chamferCylinder(0.035, 0.035, 0.012, 0.004, 12), vc('satin'), M(cx, y + 0.04, cz), { color: '#fff7ea', cast: false });
      batch.add(chamferCylinder(0.04, 0.04, 0.025, 0.012, 12), vc('satin'), M(cx, y + 0.052, cz), { color: c, cast: false });
    }
    y += 0.16;
  }
  // gâteau à étages au sommet
  batch.add(cylinder(0.09, 0.09, 0.09, 18), vc('satin'), M(0, y, 0), { color: '#fbf3e8' });
  batch.add(cylinder(0.065, 0.065, 0.07, 18), vc('satin'), M(0, y + 0.09, 0), { color: style.accent });
  batch.add(sphere(0.025, 8, 6), vc('ceramic'), M(0, y + 0.18, 0), { color: '#d43b5a' });
  // cloche de verre
  batch.add(lathe([[0.33, 0], [0.34, 0.02], [0.33, 0.35], [0.26, 0.6], [0.12, 0.72], [0.05, 0.75], [0, 0.76]], 24, 'glassdome'), vcGlass(0.18), M(0, 0.76, 0), {
    color: '#f4fbfb',
    cast: false,
    receive: false,
    tall: true,
  });
  batch.add(sphere(0.03, 8, 6), vc('gold'), M(0, 1.54, 0), { color: style.metal, tall: true });
  batch.pop();
  void r;
};

/**
 * Ajoute un bibelot ou objet d'orfèvrerie luxueux sur une étagère (repère local : y = dessus de la planche)
 * et renvoie la largeur (en m) occupée le long de l'étagère.
 */
export function addShelfLuxuryItem(
  batch: StaticBatch,
  style: SalonCtx['style'],
  x: number,
  y: number,
  z: number,
  kind: number,
  r: () => number,
  tall = true,
): number {
  const gold = vc('gold');
  const cer = vc('ceramic');
  const sat = vc('satin');
  const vel = vc('velvet');
  const glass = vcGlass(0.24);
  const bordeaux = '#581c34';
  const cream = '#fff8ec';
  const rose = '#f4b8c4';

  switch (((kind % 8) + 8) % 8) {
    case 0: {
      // Service à thé en porcelaine & or (théière ventrue + tasse sur soucoupe)
      const cx = x + 0.08;
      batch.add(chamferCylinder(0.048, 0.055, 0.018, 0.005, 14), gold, M(cx, y + 0.009, z), { color: style.metal, tall, cast: false });
      batch.add(sphere(0.068, 14, 10), cer, M(cx, y + 0.075, z, 0, 1, 0.88, 1), { color: cream, tall });
      batch.add(torus(0.056, 0.007, 6, 18), gold, M(cx, y + 0.085, z, 0, 1, 1, 1, Math.PI / 2), { color: style.metal, tall, cast: false });
      batch.add(chamferCylinder(0.036, 0.042, 0.018, 0.006, 12), gold, M(cx, y + 0.132, z), { color: style.metal, tall, cast: false });
      batch.add(sphere(0.016, 8, 6), gold, M(cx, y + 0.155, z), { color: style.metal, tall, cast: false });
      // Anse et bec verseur dorés
      batch.add(torus(0.038, 0.007, 6, 14, Math.PI), gold, M(cx - 0.055, y + 0.08, z, 0, 1, 1, 1, 0, Math.PI / 2), { color: style.metal, tall, cast: false });
      batch.add(cylinder(0.008, 0.015, 0.065, 8), gold, M(cx + 0.052, y + 0.065, z, 0, 1, 1, 1, 0, -0.65), { color: style.metal, tall, cast: false });
      // Tasse & soucoupe assorties
      const tx = cx + 0.11;
      batch.add(chamferCylinder(0.042, 0.032, 0.01, 0.004, 12), cer, M(tx, y + 0.005, z + 0.01), { color: cream, tall, cast: false });
      batch.add(chamferCylinder(0.03, 0.022, 0.042, 0.005, 12), cer, M(tx, y + 0.028, z + 0.01), { color: rose, tall });
      batch.add(torus(0.029, 0.004, 5, 12), gold, M(tx, y + 0.048, z + 0.01, 0, 1, 1, 1, Math.PI / 2), { color: style.metal, tall, cast: false });
      return 0.24;
    }
    case 1: {
      // Candélabre royal en or à deux branches
      const cx = x + 0.1;
      batch.add(chamferCylinder(0.046, 0.056, 0.024, 0.008, 14), gold, M(cx, y + 0.012, z), { color: style.metal, tall });
      batch.add(cylinder(0.011, 0.016, 0.16, 8), gold, M(cx, y + 0.02, z), { color: style.metal, tall });
      batch.add(sphere(0.02, 8, 6), gold, M(cx, y + 0.11, z), { color: style.metal, tall, cast: false });
      batch.add(torus(0.055, 0.008, 6, 16, Math.PI), gold, M(cx, y + 0.145, z, 0, 1, 1, 1, Math.PI), { color: style.metal, tall, cast: false });
      for (const sx of [-0.055, 0.055]) {
        batch.add(chamferCylinder(0.02, 0.014, 0.014, 0.004, 10), gold, M(cx + sx, y + 0.15, z), { color: style.metal, tall, cast: false });
        batch.add(cylinder(0.01, 0.011, 0.075, 8), cer, M(cx + sx, y + 0.156, z), { color: cream, tall, cast: false });
        batch.add(cone(0.009, 0.028, 6), vcGlow(2.2), M(cx + sx, y + 0.232, z), { color: '#ffd26a', tall, cast: false });
      }
      return 0.21;
    }
    case 2: {
      // Cloche d'apparat dorée sur plateau d'orfèvrerie
      const cx = x + 0.11;
      batch.add(chamferCylinder(0.092, 0.082, 0.014, 0.005, 18), vc('chrome'), M(cx, y + 0.007, z), { color: '#eef3f7', tall });
      batch.add(torus(0.088, 0.006, 5, 18), gold, M(cx, y + 0.014, z, 0, 1, 1, 1, Math.PI / 2), { color: style.metal, tall, cast: false });
      batch.add(sphere(0.074, 16, 10), gold, M(cx, y + 0.016, z, 0, 1, 0.85, 1), { color: style.metal, tall });
      batch.add(torus(0.016, 0.005, 6, 12), gold, M(cx, y + 0.088, z), { color: style.metal, tall, cast: false });
      return 0.22;
    }
    case 3: {
      // Carafe en cristal à élixir rubis & deux coupes dorées
      const cx = x + 0.08;
      batch.add(chamferCylinder(0.044, 0.05, 0.016, 0.005, 12), gold, M(cx, y + 0.008, z), { color: style.metal, tall, cast: false });
      batch.add(sphere(0.048, 12, 8), vel, M(cx, y + 0.062, z, 0, 1, 0.85, 1), { color: '#8c1d3b', tall, cast: false });
      batch.add(sphere(0.058, 14, 10), glass, M(cx, y + 0.068, z, 0, 1, 1.05, 1), { color: '#fff5f8', tall, cast: false, receive: false });
      batch.add(cylinder(0.016, 0.022, 0.085, 10), glass, M(cx, y + 0.11, z), { color: '#fff5f8', tall, cast: false, receive: false });
      batch.add(torus(0.02, 0.006, 6, 12), gold, M(cx, y + 0.155, z, 0, 1, 1, 1, Math.PI / 2), { color: style.metal, tall, cast: false });
      batch.add(sphere(0.02, 10, 8), gold, M(cx, y + 0.205, z, 0, 0.85, 1.25, 0.85), { color: style.metal, tall, cast: false });
      // Petite coupe à pied d'or
      const gx = cx + 0.095;
      batch.add(chamferCylinder(0.022, 0.026, 0.01, 0.003, 10), gold, M(gx, y + 0.005, z + 0.01), { color: style.metal, tall, cast: false });
      batch.add(cylinder(0.005, 0.006, 0.055, 6), gold, M(gx, y + 0.01, z + 0.01), { color: style.metal, tall, cast: false });
      batch.add(chamferCylinder(0.026, 0.014, 0.045, 0.005, 10), glass, M(gx, y + 0.085, z + 0.01), { color: '#fff5f8', tall, cast: false, receive: false });
      return 0.22;
    }
    case 4: {
      // Bonbonnière en cristal garnie de macarons pastel
      const cx = x + 0.09;
      batch.add(chamferCylinder(0.052, 0.06, 0.02, 0.006, 14), gold, M(cx, y + 0.01, z), { color: style.metal, tall });
      const macCols = ['#f6c6d0', '#a8d8c8', '#f5d488', '#c9b6e4', '#e86a7a'];
      for (let m = 0; m < 4; m++) {
        batch.add(
          chamferCylinder(0.032, 0.032, 0.022, 0.008, 10),
          sat,
          M(cx + (m % 2 ? 0.01 : -0.01), y + 0.032 + m * 0.026, z + (m > 1 ? 0.008 : -0.008)),
          { color: macCols[(m + Math.floor(r() * 3)) % macCols.length], tall, cast: false },
        );
      }
      batch.add(cylinder(0.058, 0.058, 0.135, 14), glass, M(cx, y + 0.02, z), { color: '#f8fcfc', tall, cast: false, receive: false });
      batch.add(chamferCylinder(0.062, 0.058, 0.022, 0.008, 14), gold, M(cx, y + 0.162, z), { color: style.metal, tall });
      batch.add(sphere(0.018, 8, 6), gold, M(cx, y + 0.186, z), { color: style.metal, tall, cast: false });
      return 0.19;
    }
    case 5: {
      // Duo de boîtes à thé impériales (velours bordeaux & laque ivoire, blasons d'or)
      const cx = x + 0.065;
      batch.add(roundedBox(0.082, 0.165, 0.082, 0.018, 1), vel, M(cx, y + 0.082, z), { color: bordeaux, tall });
      batch.add(box(0.048, 0.068, 0.008), gold, M(cx, y + 0.085, z + 0.041), { color: style.metal, tall, cast: false });
      batch.add(chamferCylinder(0.032, 0.036, 0.028, 0.008, 12), gold, M(cx, y + 0.178, z), { color: style.metal, tall, cast: false });
      const cx2 = cx + 0.09;
      batch.add(roundedBox(0.068, 0.125, 0.068, 0.015, 1), cer, M(cx2, y + 0.062, z + 0.01), { color: cream, tall });
      batch.add(box(0.04, 0.05, 0.008), gold, M(cx2, y + 0.065, z + 0.043), { color: style.metal, tall, cast: false });
      batch.add(chamferCylinder(0.026, 0.03, 0.022, 0.006, 10), gold, M(cx2, y + 0.134, z + 0.01), { color: style.metal, tall, cast: false });
      return 0.21;
    }
    case 6: {
      // Vase Médicis doré et bouquet de roses du salon
      const cx = x + 0.09;
      batch.add(urnGeo(0.22), gold, M(cx, y, z), { color: style.metal, tall });
      for (let q = 0; q < 4; q++) {
        const a = (q / 4) * Math.PI * 2 + 0.4;
        batch.add(
          flowerGeo(0.034),
           vc('matte'),
          M(cx + Math.cos(a) * 0.032, y + 0.165 + (q % 2) * 0.018, z + Math.sin(a) * 0.032, a),
          { color: style.flowers[q % style.flowers.length], tall, cast: false },
        );
      }
      return 0.19;
    }
    default: {
      // Pendule royale de salon en or ciselé et velours bordeaux
      const cx = x + 0.11;
      batch.add(roundedBox(0.15, 0.028, 0.09, 0.008, 1), gold, M(cx, y + 0.014, z), { color: style.metal, tall });
      batch.add(roundedBox(0.12, 0.16, 0.072, 0.022, 1), vel, M(cx, y + 0.105, z), { color: bordeaux, tall });
      batch.add(roundedBox(0.132, 0.172, 0.064, 0.024, 1), gold, M(cx, y + 0.105, z - 0.003), { color: style.metal, tall });
      batch.add(chamferCylinder(0.042, 0.042, 0.014, 0.004, 16), cer, M(cx, y + 0.115, z + 0.036, 0, 1, 1, 1, Math.PI / 2), { color: cream, tall, cast: false });
      batch.add(torus(0.043, 0.006, 6, 16), gold, M(cx, y + 0.115, z + 0.042), { color: style.metal, tall, cast: false });
      batch.add(sphere(0.022, 10, 8), gold, M(cx, y + 0.205, z), { color: style.metal, tall, cast: false });
      return 0.22;
    }
  }
}

const bookshelf: Builder = (ctx, d, gy, r) => {
  const { batch, style } = ctx;
  const W = d.w ?? 1.2;
  const H = 2.0;
  const D = 0.34;
  const [px, pz] = snapToWall(ctx, d, D / 2);
  const wood = style.id === 'galerie' ? '#f3ede4' : style.id === 'boudoir' ? '#f2dcd6' : '#efe8d8';
  const backCol = style.id === 'jardin' ? shade(wood, -0.08) : '#581c34';
  const gold = vc('gold');
  batch.push(M(px, gy, pz, d.rot));
  // Fond capitonné / velours bordeaux sombre et montants moulurés à filets d'or
  batch.add(roundedBox(W, H, 0.03, 0.01, 1), vc('velvet'), M(0, H / 2, -D / 2 + 0.015), { color: backCol, tall: true });
  for (const s of [-1, 1]) {
    batch.add(roundedBox(0.045, H, D, 0.01, 1), vc('satin'), M((s * (W - 0.045)) / 2, H / 2, 0), { color: wood, tall: true });
    batch.add(box(0.016, H - 0.08, 0.016), gold, M((s * (W - 0.045)) / 2, H / 2, D / 2 + 0.006), { color: style.metal, tall: true, cast: false });
  }
  // Corniche royale et fronton doré au sommet
  batch.add(roundedBox(W + 0.09, 0.085, D + 0.07, 0.02, 1), vc('satin'), M(0, H + 0.04, 0.01), { color: wood, tall: true });
  batch.add(box(W + 0.04, 0.02, 0.02), gold, M(0, H, D / 2 + 0.022), { color: style.metal, tall: true, cast: false });
  batch.add(archGeo(Math.min(0.55, W * 0.45), 0.045, 0.04, 12), gold, M(0, H + 0.075, D / 2 - 0.02), { color: style.metal, tall: true, cast: false });
  batch.add(sphere(0.048, 10, 8), gold, M(0, H + 0.14, D / 2), { color: style.metal, tall: true, cast: false });

  const shelves = 5;
  const bookCols = ['#581c34', '#7a2e3a', '#a8b89a', '#e8b4b8', '#3d4a6b', '#d4a537', '#9f86c0', '#f3e3c8', '#6b4a3a'];
  for (let k = 0; k < shelves; k++) {
    const y = 0.08 + k * ((H - 0.12) / shelves);
    batch.add(box(W - 0.06, 0.03, D - 0.03), vc('satin'), M(0, y, 0), { color: wood, tall: true });
    // Filet d'or sur la tranche de chaque étagère
    batch.add(box(W - 0.07, 0.012, 0.012), gold, M(0, y + 0.002, (D - 0.03) / 2 + 0.005), { color: style.metal, tall: true, cast: false });

    const yTop = y + 0.015;
    let x = -W / 2 + 0.065;
    let itemSlot = (k * 3 + Math.floor(r() * 4)) % 8;
    while (x < W / 2 - 0.11) {
      // Plus de décors luxueux : ~45 % d'objets d'orfèvrerie, porcelaine, pâtisserie et cristal
      if (x < W / 2 - 0.24 && r() < 0.46) {
        const wUsed = addShelfLuxuryItem(batch, style, x, yTop, 0.02, itemSlot++, r, true);
        x += wUsed + 0.025;
        continue;
      }
      const bw = 0.036 + r() * 0.028;
      const bh = 0.19 + r() * 0.11;
      const lean = r() < 0.08 ? 0.22 : 0;
      const bCol = bookCols[Math.floor(r() * bookCols.length)];
      batch.add(box(bw, bh, D - 0.1), vc('satin'), M(x + bw / 2, yTop + bh / 2, 0.02, 0, 1, 1, 1, 0, lean), { color: bCol, tall: true });
      // Dos de reliure doré
      if (lean === 0 && r() < 0.65) {
        batch.add(box(bw * 0.82, 0.012, 0.008), gold, M(x + bw / 2, yTop + bh * 0.76, (D - 0.1) / 2 + 0.022), { color: style.metal, tall: true, cast: false });
      }
      x += bw + 0.005 + lean * 0.09;
    }
  }
  // Ornements au sommet de la bibliothèque (urnes dorées et cloche centrale)
  for (const sx of [-W * 0.34, W * 0.34]) {
    batch.add(urnGeo(0.24), gold, M(sx, H + 0.08, 0), { color: style.metal, tall: true });
  }
  batch.pop();
};

// ─────────────────────────────────────────── Muraux

const mirror: Builder = (ctx, d, gy) => {
  const { batch, style } = ctx;
  const m = wallMount(ctx, d);
  const s = d.scale ?? 1;
  const g = vc('gold');
  const chrome = vc('chrome');
  if (m.wallH < 1.5) {
    // psyché sur pied
    batch.push(M(d.x, gy, d.z, d.rot, s));
    batch.add(archPanelGeo(0.5, 1.2), chrome, M(0, 0.35, 0.0), { color: '#dfe8ee', tall: true });
    batch.add(archGeo(0.5, 0.05, 0.05, 12), g, M(0, 0.35 + 0.95, 0), { color: style.metal, tall: true });
    for (const sx of [-1, 1]) {
      batch.add(box(0.05, 0.95, 0.05), g, M(sx * 0.275, 0.35 + 0.475, 0), { color: style.metal, tall: true });
      batch.add(box(0.05, 0.4, 0.3), g, M(sx * 0.3, 0.2, 0, 0, 1, 1, 1, 0.2), { color: style.metal, tall: true });
    }
    batch.pop();
    return;
  }
  batch.push(M(m.x, gy, m.z, d.rot, s));
  const w = 0.8;
  const h = 1.3;
  const y0 = 0.95;
  batch.add(archPanelGeo(w, h), chrome, M(0, y0, 0.02), { color: '#e3ecf1', cast: false });
  batch.add(archGeo(w, 0.08, 0.05, 16), g, M(0, y0 + h - w / 2, 0.03), { color: style.metal });
  for (const sx of [-1, 1]) batch.add(roundedBox(0.08, h - w / 2, 0.05, 0.015, 1), g, M((sx * (w + 0.08)) / 2, y0 + (h - w / 2) / 2, 0.03), { color: style.metal });
  batch.add(roundedBox(w + 0.16, 0.08, 0.06, 0.02, 1), g, M(0, y0 - 0.02, 0.03), { color: style.metal });
  // fronton en coquille
  batch.add(sphere(0.1, 12, 8, ), g, M(0, y0 + h + 0.08, 0.04, 0, 1.2, 0.8, 0.4), { color: style.metal });
  for (const sx of [-1, 1]) batch.add(sphere(0.045, 8, 6), g, M(sx * 0.18, y0 + h - 0.02, 0.05), { color: style.metal });
  batch.pop();
};

const painting: Builder = (ctx, d, gy, r) => {
  const { batch, style } = ctx;
  const m = wallMount(ctx, d);
  const v = d.variant ?? Math.floor(r() * 4);
  const mat = paintingMaterial(v);
  const w = 0.62;
  const h = 0.78;
  const g = vc('gold');
  if (m.wallH < 1.5) {
    // chevalet
    batch.push(M(d.x, gy, d.z, d.rot));
    for (const sx of [-1, 1]) batch.add(box(0.035, 1.5, 0.035), vc('wood'), M(sx * 0.25, 0.72, 0, 0, 1, 1, 1, -0.1, sx * -0.12), { color: style.wood, tall: true });
    batch.add(box(0.035, 1.4, 0.035), vc('wood'), M(0, 0.68, -0.25, 0, 1, 1, 1, 0.35), { color: style.wood, tall: true });
    batch.add(box(0.7, 0.04, 0.08), vc('wood'), M(0, 0.62, 0.05), { color: style.wood, tall: true });
    batch.push(M(0, 0.64, 0.06, 0, 1, 1, 1, -0.1));
    batch.add(panel(w, h), mat, M(0, h / 2 + 0.02, 0.02), { cast: false, tall: true });
    batch.add(roundedBox(w + 0.1, h + 0.1, 0.04, 0.015, 1), g, M(0, h / 2 + 0.02, 0), { color: style.metal, tall: true });
    batch.pop();
    batch.pop();
    return;
  }
  batch.push(M(m.x, gy, m.z, d.rot, d.scale ?? 1));
  const cy = 1.55;
  batch.add(roundedBox(w + 0.14, h + 0.14, 0.05, 0.02, 2), g, M(0, cy, 0.025), { color: style.metal });
  batch.add(box(w + 0.02, h + 0.02, 0.02), vc('satin'), M(0, cy, 0.045), { color: '#3a2c26', cast: false });
  batch.add(panel(w, h), mat, M(0, cy, 0.056), { cast: false });
  // lampe de tableau
  batch.add(cylinder(0.012, 0.012, 0.12, 6), g, M(0, cy + h / 2 + 0.07, 0.05, 0, 1, 1, 1, Math.PI / 2.6), { color: style.metal, cast: false });
  batch.add(roundedBox(0.36, 0.035, 0.05, 0.015, 1), g, M(0, cy + h / 2 + 0.12, 0.13), { color: style.metal, cast: false });
  batch.pop();
};

const paintCache = new Map<number, THREE.MeshStandardMaterial>();
function paintingMaterial(v: number): THREE.MeshStandardMaterial {
  const k = ((v % 4) + 4) % 4;
  let m = paintCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: paintingTexture(k), roughness: 0.6 });
    m.userData.shared = true;
    paintCache.set(k, m);
  }
  return m;
}

const panelCache = new Map<string, THREE.BufferGeometry>();
function panel(w: number, h: number): THREE.BufferGeometry {
  const key = `${w}:${h}`;
  let g = panelCache.get(key);
  if (!g) {
    g = new THREE.PlaneGeometry(w, h);
    g.userData.shared = true;
    panelCache.set(key, g);
  }
  return g;
}

const lamp: Builder = (ctx, d, gy, r) => {
  const { batch, style, glows } = ctx;
  const g = vc('gold');
  const m = d.wall ? wallMount(ctx, d) : null;
  if (m && m.wallH >= 1.5) {
    // applique murale à deux bras
    batch.push(M(m.x, gy, m.z, d.rot));
    batch.add(roundedBox(0.1, 0.18, 0.03, 0.02, 1), g, M(0, 1.62, 0.015), { color: style.metal });
    for (const sx of [-1, 1]) {
      batch.add(torus(0.1, 0.012, 6, 12, Math.PI / 2), g, M(sx * 0.0, 1.62, 0.1, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 1, 1, 1, 0, 0), { color: style.metal, cast: false });
      batch.add(cylinder(0.025, 0.02, 0.04, 8), g, M(sx * 0.12, 1.66, 0.12), { color: style.metal, cast: false });
      batch.add(lathe([[0.06, 0], [0.04, 0.09], [0, 0.09]], 10, 'sconceShade'), vc('satin'), M(sx * 0.12, 1.72, 0.12), { color: '#fff1dc', cast: false });
      glows.add(m.x + Math.cos(d.rot) * sx * 0.12 + Math.sin(d.rot) * 0.12, gy + 1.74, m.z - Math.sin(d.rot) * sx * 0.12 + Math.cos(d.rot) * 0.12, style.bulb, 0.6, 3, 1);
    }
    batch.pop();
    return;
  }
  // lampadaire à abat-jour plissé
  const s = d.scale ?? 1;
  batch.push(M(d.x, gy, d.z, d.rot, s));
  batch.add(chamferCylinder(0.16, 0.18, 0.04, 0.012, 18), g, null, { color: style.metal, tall: true });
  batch.add(lathe([[0.03, 0.04], [0.018, 0.4], [0.03, 0.42], [0.016, 0.45], [0.014, 1.4], [0.03, 1.42], [0, 1.42]], 10, 'lampstem'), g, null, { color: style.metal, tall: true });
  const shadeCol = r() < 0.5 ? '#fff4e2' : style.accent;
  const sg = lathe([[0.24, 0], [0.235, 0.012], [0.16, 0.3], [0.15, 0.31], [0.0, 0.31]], 16, 'lampshade');
  batch.add(sg, vc('satin'), M(0, 1.3, 0), { color: shadeCol, tall: true });
  batch.add(torus(0.24, 0.008, 4, 24), g, M(0, 1.3, 0, 0, 1, 1, 1, Math.PI / 2), { color: style.metal, cast: false, tall: true });
  batch.pop();
  glows.add(d.x, gy + 1.35 * s, d.z, style.bulb, 1.1 * s, 3, 0.9);
};

const door: Builder = (ctx, d, gy) => {
  const { batch, style } = ctx;
  const m = wallMount(ctx, d);
  if (m.wallH < 1.5) return;
  batch.push(M(m.x, gy, m.z, d.rot));
  const doorCol = style.id === 'galerie' ? '#f7f2ea' : shade(style.accent, -0.1);
  for (const s of [-1, 1]) {
    batch.add(roundedBox(0.5, 1.95, 0.05, 0.015, 1), vc('lacquer'), M(s * 0.26, 0.975, 0.025), { color: doorCol });
    batch.add(roundedBox(0.34, 0.7, 0.015, 0.01, 1), vc('lacquer'), M(s * 0.26, 1.4, 0.055), { color: shade(doorCol, 0.12) });
    batch.add(roundedBox(0.34, 0.6, 0.015, 0.01, 1), vc('lacquer'), M(s * 0.26, 0.55, 0.055), { color: shade(doorCol, 0.12) });
    batch.add(sphere(0.03, 8, 6), vc('gold'), M(s * 0.06, 1.0, 0.07), { color: style.metal });
    batch.add(roundedBox(0.12, 2.2, 0.08, 0.02, 1), vc('satin'), M(s * 0.6, 1.1, 0.04), { color: style.trim });
  }
  batch.add(roundedBox(1.36, 0.14, 0.12, 0.03, 1), vc('satin'), M(0, 2.15, 0.06), { color: style.trim });
  batch.pop();
};

// ─────────────────────────────────────────── Tapis

const rugMats = new Map<number, THREE.MeshStandardMaterial>();
function rugMaterial(v: number): THREE.MeshStandardMaterial {
  const k = ((v % 4) + 4) % 4;
  let m = rugMats.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: rugTexture(k), roughness: 0.95, alphaTest: 0.4, transparent: false });
    m.userData.shared = true;
    rugMats.set(k, m);
  }
  return m;
}

const rug: Builder = (ctx, d, gy, r) => {
  const w = d.w ?? 2.4;
  const dd = d.d ?? 1.6;
  const v = d.variant ?? (ctx.style.id === 'galerie' ? 0 : ctx.style.id === 'boudoir' ? 1 : ctx.style.id === 'jardin' ? 2 : 3);
  const geo = new THREE.PlaneGeometry(w, dd);
  geo.rotateX(-Math.PI / 2);
  ctx.owned.geometries.push(geo);
  ctx.batch.add(geo, rugMaterial(v), M(d.x, gy + 0.006, d.z, d.rot), { cast: false });
  void r;
};

// ─────────────────────────────────────────── Fontaine (animée)

const WATER_VERT = /* glsl */ `
  varying vec2 vP;
  void main() {
    vP = position.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const WATER_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uR;
  uniform float uFall;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  varying vec2 vP;
  void main() {
    float d = length(vP);
    float e = d / uR;
    float t = uTime;
    float rings = sin((abs(d - uFall)) * 26.0 - t * 5.0) * exp(-abs(d - uFall) * 3.0);
    float caust = (sin(vP.x * 9.0 + t * 1.3) + sin(vP.y * 11.0 - t * 1.1) + sin((vP.x + vP.y) * 7.0 + t * 0.7)) / 3.0;
    vec3 col = mix(uDeep, uShallow, smoothstep(0.0, 1.0, e));
    col += vec3(0.9, 0.97, 1.0) * (max(0.0, rings) * 0.35 + smoothstep(0.55, 1.0, caust) * 0.25);
    col += vec3(1.0) * smoothstep(0.86, 1.0, e) * 0.25;
    gl_FragColor = vec4(col, 0.88);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
const SHEET_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    float u = vUv.x * 60.0;
    float s = sin(u + sin(u * 0.37) * 2.0) * 0.5 + 0.5;
    float flow = fract(vUv.y * 3.0 + uTime * 1.8 + sin(u * 0.21) * 0.3);
    float a = (0.25 + 0.45 * s) * (0.5 + 0.5 * smoothstep(0.0, 0.6, flow));
    a *= smoothstep(0.0, 0.15, vUv.y);
    gl_FragColor = vec4(vec3(0.88, 0.96, 1.0), a * 0.75);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
const SHEET_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fountain: Builder = (ctx, d, gy) => {
  const { batch, style, fx } = ctx;
  const s = d.scale ?? (d.w ? d.w / 2.6 : 1);
  const R = 1.25;
  const stone = style.id === 'galerie' ? '#f6f3ee' : style.id === 'terrasse' ? '#efe6d6' : style.trim;
  batch.push(M(d.x, gy, d.z, d.rot, s));
  // bassin (octogonal adouci)
  batch.add(lathe([[R, 0], [R + 0.08, 0.02], [R + 0.08, 0.36], [R + 0.12, 0.4], [R + 0.12, 0.46], [R - 0.08, 0.46], [R - 0.1, 0.42], [R - 0.1, 0.1], [0, 0.1]], 8, 'fbasin'), vc('ceramic'), M(0, 0, 0, Math.PI / 8), { color: stone });
  batch.add(torus(R + 0.1, 0.02, 6, 8), vc('gold'), M(0, 0.44, 0, Math.PI / 8, 1, 1, 1, Math.PI / 2), { color: style.metal, cast: false });
  // fût central et vasque haute
  batch.add(lathe([[0.22, 0.1], [0.16, 0.2], [0.11, 0.35], [0.13, 0.6], [0.09, 0.85], [0.12, 1.0], [0, 1.0]], 16, 'fstem'), vc('ceramic'), null, { color: stone, tall: true });
  batch.add(lathe([[0.1, 0.98], [0.3, 1.06], [0.5, 1.14], [0.55, 1.2], [0.5, 1.22], [0.3, 1.15], [0, 1.15]], 24, 'fbowl'), vc('ceramic'), null, { color: stone, tall: true });
  batch.add(torus(0.53, 0.015, 6, 28), vc('gold'), M(0, 1.2, 0, 0, 1, 1, 1, Math.PI / 2), { color: style.metal, tall: true, cast: false });
  batch.add(urnGeo(0.7), vc('ceramic'), M(0, 1.15, 0), { color: stone, tall: true });
  batch.add(sphere(0.06, 12, 8), vc('gold'), M(0, 1.55, 0), { color: style.metal, tall: true });
  batch.pop();
  // eau
  const group = new THREE.Group();
  group.position.set(d.x, gy, d.z);
  group.scale.setScalar(s);
  ctx.root.add(group);
  const waterMat = new THREE.ShaderMaterial({
    uniforms: { uTime: SHARED.uTime, uR: { value: R - 0.1 }, uFall: { value: 0.6 }, uDeep: { value: new THREE.Color('#6fb8c8') }, uShallow: { value: new THREE.Color('#bfe8ee') } },
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: false,
  });
  const topMat = waterMat.clone();
  topMat.uniforms.uTime = SHARED.uTime;
  topMat.uniforms.uR.value = 0.48;
  topMat.uniforms.uFall.value = 0.0;
  const sheetMat = new THREE.ShaderMaterial({
    uniforms: { uTime: SHARED.uTime },
    vertexShader: SHEET_VERT,
    fragmentShader: SHEET_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  ctx.owned.materials.push(waterMat, topMat, sheetMat);
  const basinWater = new THREE.Mesh(flatDisc(R - 0.09, 8), waterMat);
  basinWater.rotation.y = Math.PI / 8;
  basinWater.position.y = 0.38;
  basinWater.receiveShadow = true;
  const topWater = new THREE.Mesh(flatDisc(0.5, 24), topMat);
  topWater.position.y = 1.17;
  const sheet = new THREE.Mesh(openCylinder(0.55, 0.64, 0.8, 32), sheetMat);
  sheet.position.y = 0.38;
  sheet.renderOrder = 2;
  group.add(basinWater, topWater, sheet);
  let dropT = 0;
  return {
    update(dt) {
      dropT -= dt;
      if (dropT <= 0) {
        dropT = 0.07;
        const a = Math.random() * Math.PI * 2;
        const rr = 0.6 * s;
        fx.spawn({
          x: d.x + Math.cos(a) * rr,
          y: gy + 0.42 * s,
          z: d.z + Math.sin(a) * rr,
          vx: Math.cos(a) * 0.3,
          vy: 0.9 + Math.random() * 0.5,
          vz: Math.sin(a) * 0.3,
          gravity: 6,
          life: 0.4,
          size: 0.05,
          color: '#e8f8ff',
          alpha: 0.8,
          sprite: 13,
          ground: gy + 0.38 * s,
        });
        if (Math.random() < 0.3)
          fx.spawn({ x: d.x + Math.cos(a) * rr, y: gy + 0.45 * s, z: d.z + Math.sin(a) * rr, vy: 0.3, life: 0.9, size: 0.2, size1: 0.45, color: '#ffffff', alpha: 0.18, sprite: 5, fadeIn: 0.2 });
      }
    },
    dispose() {
      group.removeFromParent();
    },
  };
};

// ─────────────────────────────────────────── Lustres (animés)

interface ChandTemplate {
  meshes: { geo: THREE.BufferGeometry; mat: THREE.Material; cast: boolean }[];
  flames: THREE.Vector3[];
  crystals: THREE.Vector3[];
}
const chandCache = new Map<string, ChandTemplate>();

function chandelierTemplate(metal: string): ChandTemplate {
  let t = chandCache.get(metal);
  if (t) return t;
  const b = new StaticBatch();
  const g = vc('gold');
  const crystal = vc('chrome');
  const flames: THREE.Vector3[] = [];
  const crystals: THREE.Vector3[] = [];
  // chaîne et cache-plafond
  for (let k = 0; k < 7; k++) b.add(torus(0.035, 0.008, 4, 10), g, M(0, 0.62 + k * 0.1, 0, k % 2 ? Math.PI / 2 : 0), { color: metal, tall: true });
  b.add(lathe([[0.0, 0], [0.09, 0.0], [0.1, 0.06], [0.05, 0.12], [0.06, 0.2], [0.04, 0.32], [0.07, 0.42], [0.03, 0.56], [0.0, 0.62]], 14, 'chstem'), g, M(0, -0.05, 0), { color: metal, tall: true });
  // bras
  const arms = 6;
  for (let k = 0; k < arms; k++) {
    const a = (k / arms) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    b.add(torus(0.22, 0.016, 6, 14, Math.PI * 0.9), g, M(ca * 0.24, 0.12, sa * 0.24, -a + Math.PI / 2, 1, 1, 1, 0, Math.PI * 1.05), { color: metal, tall: true });
    const bx = ca * 0.47;
    const bz = sa * 0.47;
    b.add(lathe([[0.0, 0], [0.045, 0.0], [0.055, 0.03], [0.03, 0.05], [0.0, 0.05]], 10, 'bobeche'), g, M(bx, 0.12, bz), { color: metal, tall: true });
    b.add(cylinder(0.018, 0.018, 0.11, 8), vc('ceramic'), M(bx, 0.165, bz), { color: '#fff8ea', tall: true });
    b.add(cone(0.012, 0.035, 6), vcGlow(2.6), M(bx, 0.28, bz), { color: '#ffd27a', cast: false, tall: true });
    flames.push(new THREE.Vector3(bx, 0.3, bz));
    // pampilles
    for (let q = 0; q < 3; q++) {
      const px = ca * (0.47 - q * 0.12);
      const pz = sa * (0.47 - q * 0.12);
      const py = 0.02 - q * 0.04;
      b.add(crystalGeo(0.025, 0.09), crystal, M(px, py, pz), { color: '#f4fbff', cast: false, tall: true });
      crystals.push(new THREE.Vector3(px, py, pz));
    }
  }
  // couronne de perles et pampille centrale
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2;
    b.add(sphere(0.018, 6, 4), crystal, M(Math.cos(a) * 0.3, 0.05 - Math.abs(Math.sin(a * 3)) * 0.04, Math.sin(a) * 0.3), { color: '#ffffff', cast: false, tall: true });
  }
  b.add(crystalGeo(0.05, 0.22), crystal, M(0, -0.2, 0), { color: '#f4fbff', tall: true });
  crystals.push(new THREE.Vector3(0, -0.2, 0));
  const tmp = new THREE.Group();
  const meshes = b.build(tmp, 1000);
  t = { meshes: meshes.map((m) => ({ geo: m.geometry, mat: m.material as THREE.Material, cast: m.castShadow })), flames, crystals };
  for (const m of t.meshes) m.geo.userData.shared = true;
  chandCache.set(metal, t);
  return t;
}

interface ChandItem {
  x: number;
  y: number;
  z: number;
  s: number;
  phase: number;
}

/** Tous les lustres d'un salon : par tronçon spatial, un InstancedMesh par matériau (peu de draw calls, culling conservé). */
class ChandelierSet {
  items: ChandItem[] = [];
  private groups: { items: ChandItem[]; meshes: THREE.InstancedMesh[] }[] = [];
  private glow = new GlowPoints();
  private shake = 0;

  constructor(private ctx: SalonCtx) {}

  finalize(): void {
    if (this.items.length === 0) return;
    const { style } = this.ctx;
    const tpl = chandelierTemplate(style.metal);
    const byChunk = new Map<string, ChandItem[]>();
    for (const it of this.items) {
      const k = `${Math.floor(it.x / 12)}:${Math.floor(it.z / 12)}`;
      let arr = byChunk.get(k);
      if (!arr) byChunk.set(k, (arr = []));
      arr.push(it);
    }
    for (const items of byChunk.values()) {
      const meshes: THREE.InstancedMesh[] = [];
      for (const m of tpl.meshes) {
        const im = new THREE.InstancedMesh(m.geo, m.mat, items.length);
        im.castShadow = m.cast;
        im.receiveShadow = false;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.ctx.root.add(im);
        meshes.push(im);
      }
      this.groups.push({ items, meshes });
    }
    const tmp = new THREE.Matrix4();
    const v = new THREE.Vector3();
    for (const it of this.items) {
      this.compose(it, 0, 0, tmp);
      for (const f of tpl.flames) {
        v.copy(f).applyMatrix4(tmp);
        this.glow.add(v.x, v.y, v.z, style.bulb, 0.26 * it.s, 1, 1.0);
      }
      for (const c of tpl.crystals) {
        v.copy(c).applyMatrix4(tmp);
        this.glow.add(v.x, v.y, v.z, '#ffffff', 0.17 * it.s, 2, 0.85);
      }
      v.set(0, 0.18, 0).applyMatrix4(tmp);
      this.glow.add(v.x, v.y, v.z, style.bulb, 1.0 * it.s, 3, 0.16);
    }
    this.glow.build(this.ctx.root);
    this.update(0);
    // sphères englobantes calculées une fois (le balancement reste minime)
    for (const g of this.groups)
      for (const m of g.meshes) {
        m.computeBoundingSphere();
        if (m.boundingSphere) m.boundingSphere.radius += 0.6;
      }
    this.ctx.chandeliers.push({ setShake: (a: number) => (this.shake = Math.max(0, Math.min(1, a))) });
    this.ctx.anim.push({ update: (_dt, time) => this.update(time), dispose: () => this.dispose() });
  }

  private compose(it: ChandItem, rx: number, rz: number, out: THREE.Matrix4): THREE.Matrix4 {
    _e.set(rx, 0, rz);
    _q.setFromEuler(_e);
    // pivot (plafond) → rotation → descente → échelle
    out.compose(_p.set(it.x, it.y, it.z), _q, _s.set(1, 1, 1));
    return out.multiply(_t.makeTranslation(0, -0.85 * it.s, 0)).multiply(_sc.makeScale(it.s, it.s, it.s));
  }

  private update(time: number): void {
    const sh = this.shake;
    const sw = 0.015 + sh * 0.08;
    const f = 1 + sh * 6;
    for (const g of this.groups) {
      for (let i = 0; i < g.items.length; i++) {
        const it = g.items[i];
        const t = time + it.phase;
        const rx = Math.sin(t * 0.9 * f) * sw + (sh > 0 ? Math.sin(t * 23 + it.phase) * sh * 0.02 : 0);
        const rz = Math.sin(t * 0.7 * f + 1.3) * sw + (sh > 0 ? Math.sin(t * 19 + 1 + it.phase) * sh * 0.02 : 0);
        this.compose(it, rx, rz, _m4);
        for (const m of g.meshes) m.setMatrixAt(i, _m4);
      }
      for (const m of g.meshes) m.instanceMatrix.needsUpdate = true;
    }
    this.glow.uniforms.uBoost.value = 1 + sh * 1.2;
  }

  private dispose(): void {
    for (const g of this.groups)
      for (const m of g.meshes) {
        m.removeFromParent();
        m.dispose();
      }
    this.glow.dispose();
  }
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _t = new THREE.Matrix4();
const _sc = new THREE.Matrix4();
const _m4 = new THREE.Matrix4();
const chandSets = new WeakMap<SalonCtx, ChandelierSet>();

const chandelier: Builder = (ctx, d, gy, r) => {
  let set = chandSets.get(ctx);
  if (!set) chandSets.set(ctx, (set = new ChandelierSet(ctx)));
  const s = (d.scale ?? 1) * (ctx.style.id === 'galerie' ? 1.3 : 1);
  set.items.push({ x: d.x, y: gy + 3.2, z: d.z, s, phase: r() * 10 });
};

/** Finalise les ensembles instanciés (lustres). */
function finalizeDecor(ctx: SalonCtx): void {
  chandSets.get(ctx)?.finalize();
  chandSets.delete(ctx);
}

// ─────────────────────────────────────────── Table des constructeurs

const BUILDERS: Partial<Record<DecorSpec['kind'], Builder>> = {
  plant,
  bigplant,
  flowers,
  olive,
  parasol,
  fountain,
  arch,
  column,
  chandelier,
  rug,
  banquette,
  piano,
  mirror,
  painting,
  lamp,
  cake_display: cakeDisplay,
  bookshelf,
  trellis,
  lantern,
  statue,
  stage_steps: stageSteps,
  door,
};
