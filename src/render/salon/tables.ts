/**
 * Tables du salon : plateau (marbre ou nappe), piétement, art de la table, centre de table,
 * décor VIP (chemin de table doré, chandeliers, bouquet, couronne), clients attablés,
 * assiettes servies, anneau de service et petites humeurs (nuage rouge, cœurs).
 */
import * as THREE from 'three';
import type { View } from '../api';
import type { DishId, TableSpec, TableViewState } from '../../types';
import { createSeatedClient, type SeatedClient } from '../models/clients';
import { createDishMesh } from '../models/dishes';
import { chamferCylinder, disposeTree, lathe, roundedBox, sphere, torus, cylinder } from '../kit';
import { M } from '../batch';
import { vc, vcGlass, vcGlow } from '../mats';
import { box, cone, flowerGeo, leafGeo } from '../geo';
import { SPRITE } from '../textures';
import type { SalonCtx } from './context';
import { rand, seedOf } from './context';
import { Marker } from './marker';

export const TABLE_TOP = 0.55;

type TableLook = 'marble' | 'cloth' | 'bistro';

function lookOf(ctx: SalonCtx, t: TableSpec, r: () => number): TableLook {
  if (t.vip) return 'cloth';
  const b = ctx.style.id;
  const z = ctx.grid.zoneSpec(t.zone);
  if (z?.kind === 'terrasse' || z?.kind === 'jardin') return r() < 0.7 ? 'bistro' : 'marble';
  if (b === 'galerie') return r() < 0.75 ? 'cloth' : 'marble';
  if (b === 'boudoir') return r() < 0.5 ? 'cloth' : 'marble';
  return r() < 0.5 ? 'marble' : 'bistro';
}

/** Points de pose des assiettes (repère local de la table, aligné monde), un par siège. */
function placeSpots(t: TableSpec): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const s of t.seats) {
    let dx = s.x - t.x;
    let dz = s.z - t.z;
    if (t.shape === 'round') {
      const l = Math.hypot(dx, dz) || 1;
      const r = Math.max(0.15, t.w / 2 - 0.19);
      dx = (dx / l) * r;
      dz = (dz / l) * r;
    } else {
      const hx = Math.max(0.05, t.w / 2 - 0.19);
      const hz = Math.max(0.05, t.d / 2 - 0.19);
      dx = Math.max(-hx, Math.min(hx, dx));
      dz = Math.max(-hz, Math.min(hz, dz));
    }
    out.push(new THREE.Vector3(dx, 0, dz));
  }
  return out;
}

/** Construit la partie statique (dans le batch) et renvoie la vue dynamique. */
export function buildTable(ctx: SalonCtx, t: TableSpec): View<TableViewState> {
  const { style, batch, grid } = ctx;
  const r = rand(seedOf(ctx.layout.seed, 1000 + t.id));
  const gy = grid.groundY(t.x, t.z);
  const look = lookOf(ctx, t, r);
  const round = t.shape === 'round';
  const rad = t.w / 2;
  const top = TABLE_TOP;
  const matte = vc('matte');
  const satin = vc('satin');
  const gold = vc('gold');
  const ceramic = vc('ceramic');
  const velvet = vc('velvet');
  const metal = style.metal;
  const clothCol = t.vip ? '#fffaf0' : style.cloth;

  batch.push(M(t.x, gy, t.z));
  // ── piétement & plateau
  if (look === 'cloth') {
    if (round) {
      // nappe tombante (tour) + plateau
      const R0 = rad + 0.02;
      batch.add(
        lathe(
          [
            [R0 + 0.08, 0.06],
            [R0 + 0.085, 0.08],
            [R0 + 0.06, 0.25],
            [R0 + 0.02, top - 0.05],
            [R0, top - 0.01],
            [R0 - 0.02, top],
            [0, top],
          ],
          32,
          `cloth:${R0}`,
        ),
        satin,
        null,
        { color: clothCol },
      );
      // ourlet (galon)
      batch.add(torus(R0 + 0.08, 0.012, 6, 40), satin, M(0, 0.07, 0, 0, 1, 1, 1, Math.PI / 2), { color: t.vip ? metal : style.accent, cast: false });
      // napperon / chemin
      batch.add(chamferCylinder(rad * 0.62, rad * 0.62, 0.006, 0.002, 28), satin, M(0, top, 0), { color: t.vip ? metal : style.accent, cast: false });
    } else {
      batch.add(roundedBox(t.w + 0.08, top - 0.12, t.d + 0.08, 0.04, 2), satin, M(0, 0.12 + (top - 0.12) / 2, 0), { color: clothCol });
      batch.add(roundedBox(t.w + 0.1, 0.02, t.d + 0.1, 0.008, 1), satin, M(0, 0.13, 0), { color: t.vip ? metal : style.accent, cast: false });
      // chemin de table
      const along = t.w >= t.d;
      batch.add(box(along ? t.w + 0.1 : 0.32, 0.006, along ? 0.32 : t.d + 0.1), satin, M(0, top + 0.003, 0), { color: t.vip ? metal : style.accent, cast: false });
    }
  } else {
    const topCol = look === 'marble' ? style.marbleTop : '#fbf7f0';
    const legCol = look === 'bistro' ? (style.id === 'terrasse' ? '#5a4f63' : style.id === 'jardin' ? '#4f6b4a' : '#3d2a22') : metal;
    const legMat = look === 'bistro' ? matte : gold;
    if (round) {
      batch.add(chamferCylinder(0.24, 0.27, 0.035, 0.012, 24), legMat, null, { color: legCol });
      batch.add(
        lathe(
          [
            [0.05, 0.03],
            [0.035, 0.1],
            [0.028, 0.3],
            [0.04, 0.42],
            [0.03, top - 0.05],
            [0.07, top - 0.035],
            [0, top - 0.035],
          ],
          14,
          'tblleg',
        ),
        legMat,
        null,
        { color: legCol },
      );
      batch.add(chamferCylinder(rad, rad, 0.04, 0.012, 32), ceramic, M(0, top - 0.04, 0), { color: topCol });
      batch.add(torus(rad, 0.012, 6, 40), gold, M(0, top - 0.02, 0, 0, 1, 1, 1, Math.PI / 2), { color: metal, cast: false });
    } else {
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const lx = sx * (t.w / 2 - 0.09);
          const lz = sz * (t.d / 2 - 0.09);
          batch.add(chamferCylinder(0.022, 0.032, top - 0.04, 0.006, 10), legMat, M(lx, 0, lz), { color: legCol });
          batch.add(sphere(0.028, 8, 6), gold, M(lx, 0.02, lz), { color: metal, cast: false });
        }
      batch.add(roundedBox(t.w, 0.045, t.d, 0.015, 2), ceramic, M(0, top - 0.0225, 0), { color: topCol });
      batch.add(roundedBox(t.w - 0.1, 0.06, t.d - 0.1, 0.01, 1), matte, M(0, top - 0.075, 0), { color: legCol });
    }
  }

  // ── art de la table (assiettes de présentation, verres)
  const spots = placeSpots(t);
  for (let i = 0; i < spots.length; i++) {
    const p = spots[i];
    batch.add(chamferCylinder(0.155, 0.15, 0.008, 0.003, 24), gold, M(p.x, top, p.z), { color: t.vip ? metal : '#e9dcc0', cast: false });
    // verre à pied, posé à droite du couvert
    const s = t.seats[i];
    const ang = Math.atan2(s.x - t.x, s.z - t.z);
    const gx = p.x * 0.72 + Math.cos(ang) * 0.13;
    const gz = p.z * 0.72 - Math.sin(ang) * 0.13;
    batch.add(
      lathe(
        [
          [0.03, 0],
          [0.004, 0.01],
          [0.004, 0.06],
          [0.03, 0.08],
          [0.034, 0.13],
          [0.0, 0.13],
        ],
        10,
        'wineglass',
      ),
      vcGlass(0.45),
      M(gx, top, gz),
      { color: '#eef7f8', cast: false, receive: false },
    );
  }

  // ── centre de table
  const glowCol = style.bulb;
  if (t.vip) {
    // couronne dorée sur coussin, chandeliers, bouquet
    batch.add(roundedBox(0.2, 0.05, 0.2, 0.02, 2), velvet, M(0, top + 0.025, 0), { color: style.id === 'galerie' ? '#7a2e3a' : '#b2475e' });
    batch.add(chamferCylinder(0.075, 0.075, 0.035, 0.008, 20), gold, M(0, top + 0.05, 0), { color: metal });
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      batch.add(cone(0.022, 0.07, 6), gold, M(Math.cos(a) * 0.065, top + 0.085, Math.sin(a) * 0.065), { color: metal });
      batch.add(sphere(0.013, 6, 4), gold, M(Math.cos(a) * 0.065, top + 0.16, Math.sin(a) * 0.065), { color: '#fff3c4', cast: false });
    }
    batch.add(sphere(0.018, 8, 6), ceramic, M(0, top + 0.07, 0.075), { color: '#d43b5a', cast: false });
    const off = round ? rad * 0.42 : Math.max(t.w, t.d) * 0.28;
    const along = round || t.w >= t.d;
    for (const s of [-1, 1]) {
      const cx = along ? s * off : 0;
      const cz = along ? 0 : s * off;
      batch.add(
        lathe(
          [
            [0.05, 0],
            [0.05, 0.012],
            [0.015, 0.03],
            [0.012, 0.15],
            [0.03, 0.17],
            [0.0, 0.17],
          ],
          12,
          'candlestick',
        ),
        gold,
        M(cx, top, cz),
        { color: metal },
      );
      batch.add(cylinder(0.016, 0.016, 0.12, 8), ceramic, M(cx, top + 0.17, cz), { color: '#fff8ea' });
      batch.add(cone(0.011, 0.04, 6), vcGlow(2.2), M(cx, top + 0.295, cz), { color: '#ffcf70', cast: false });
      ctx.glows.add(t.x + cx, gy + top + 0.31, t.z + cz, glowCol, 0.42, 1, 1.2);
    }
  } else {
    // soliflore
    const vaseCol = style.id === 'galerie' ? '#f6f3ee' : style.accent;
    batch.add(
      lathe(
        [
          [0.03, 0],
          [0.04, 0.03],
          [0.025, 0.08],
          [0.012, 0.11],
          [0.016, 0.12],
          [0.0, 0.12],
        ],
        12,
        'budvase',
      ),
      ceramic,
      M(0, top, 0),
      { color: vaseCol },
    );
    const fl = style.flowers[Math.floor(r() * style.flowers.length)];
    batch.add(flowerGeo(0.035), matte, M(0.005, top + 0.17, 0), { color: fl });
    batch.add(leafGeo(0.08, 0.035), vc('foliage'), M(0, top + 0.1, 0, r() * 6, 1, 1, 1, 0.5), { color: style.foliage[0], cast: false });
  }
  batch.pop();

  return new TableView(ctx, t, gy, spots);
}

class TableView implements View<TableViewState> {
  readonly root = new THREE.Group();
  private clients: SeatedClient[] = [];
  private dishes: THREE.Object3D[] = [];
  private dishKey = '';
  private dishPop: number[] = [];
  private marker: Marker;
  private time = 0;
  private puffT = 0;
  private lastMood: TableViewState['mood'] = 'empty';

  constructor(
    private ctx: SalonCtx,
    private spec: TableSpec,
    gy: number,
    private spots: THREE.Vector3[],
  ) {
    this.root.position.set(spec.x, gy, spec.z);
    this.root.name = `table:${spec.id}`;
    ctx.root.add(this.root);
    const seedBase = seedOf(ctx.layout.seed, 5000 + spec.id * 17);
    spec.seats.forEach((s, i) => {
      const c = createSeatedClient(seedOf(seedBase, i), spec.vip);
      c.root.position.set(s.x - spec.x, 0, s.z - spec.z);
      c.root.rotation.y = s.angle;
      c.setPresent(false);
      this.root.add(c.root);
      this.clients.push(c);
    });
    const round = spec.shape === 'round';
    const hw = (round ? spec.w / 2 : spec.w / 2) + 0.62;
    const hd = (round ? spec.w / 2 : spec.d / 2) + 0.62;
    this.marker = new Marker(hw, hd, round ? hw : 0.55);
    this.marker.mesh.position.y = 0.012;
    this.root.add(this.marker.mesh);
  }

  update(s: TableViewState, dt: number): void {
    this.time += dt;
    this.marker.update(s.highlight, dt);
    for (let i = 0; i < this.clients.length; i++) {
      const c = this.clients[i];
      c.setPresent(i < s.clients);
      c.update(dt, { mood: s.mood, push: s.chairPush[i] ?? 0, time: this.time });
    }
    this.syncDishes(s.served, dt);
    // humeurs
    const fx = this.ctx.fx;
    const wx = this.root.position.x;
    const wy = this.root.position.y;
    const wz = this.root.position.z;
    if (s.mood === 'angry') {
      this.puffT -= dt;
      if (this.puffT <= 0) {
        this.puffT = 0.9 + Math.random() * 0.4;
        fx.puff(wx + (Math.random() - 0.5) * 0.5, wy + 1.25, wz + (Math.random() - 0.5) * 0.5, '#c2414f', 0.26, 0.75);
      }
    } else if (s.mood === 'eating' && s.served.length > 0) {
      this.puffT -= dt;
      if (this.puffT <= 0) {
        this.puffT = 1.6 + Math.random();
        const p = this.spots[Math.floor(Math.random() * Math.max(1, this.spots.length))] ?? new THREE.Vector3();
        fx.puff(wx + p.x, wy + TABLE_TOP + 0.2, wz + p.z, '#ffffff', 0.12, 0.35);
      }
    }
    if (s.mood === 'happy' && this.lastMood !== 'happy') {
      for (let k = 0; k < 5; k++)
        fx.spawn({
          x: wx + (Math.random() - 0.5) * 0.8,
          y: wy + 1.0,
          z: wz + (Math.random() - 0.5) * 0.8,
          vy: 0.8 + Math.random() * 0.5,
          flutter: 0.5,
          life: 1.2,
          size: 0.16,
          color: k % 2 ? '#f29fb2' : '#ffc7d4',
          sprite: SPRITE.heart,
          fadeIn: 0.15,
        });
    }
    this.lastMood = s.mood;
  }

  private syncDishes(served: readonly DishId[], dt: number): void {
    const key = served.join(',');
    if (key !== this.dishKey) {
      const prev = this.dishKey ? this.dishKey.split(',') : [];
      for (const d of this.dishes) {
        d.removeFromParent();
        disposeTree(d);
      }
      this.dishes = [];
      this.dishPop = [];
      const n = served.length;
      for (let i = 0; i < n; i++) {
        const m = createDishMesh(served[i]);
        const p = this.spots.length ? this.spots[i % this.spots.length] : new THREE.Vector3();
        const ring = Math.floor(i / Math.max(1, this.spots.length));
        m.position.set(p.x * (1 - ring * 0.45), TABLE_TOP + 0.008, p.z * (1 - ring * 0.45));
        const s = this.spec.seats[i % Math.max(1, this.spec.seats.length)];
        if (s) m.rotation.y = s.angle + Math.PI;
        this.root.add(m);
        this.dishes.push(m);
        // les nouvelles assiettes « popent »
        this.dishPop.push(i < prev.length && prev[i] === served[i] ? 1 : 0);
      }
      this.dishKey = key;
    }
    for (let i = 0; i < this.dishes.length; i++) {
      if (this.dishPop[i] >= 1) continue;
      this.dishPop[i] = Math.min(1, this.dishPop[i] + dt * 3.2);
      const t = this.dishPop[i];
      const s = 1 + Math.sin(t * Math.PI) * 0.25 * (1 - t);
      const e = 1 - Math.pow(1 - t, 3);
      this.dishes[i].scale.setScalar(Math.max(0.01, e * s));
    }
  }

  dispose(): void {
    this.marker.dispose();
    for (const d of this.dishes) disposeTree(d);
    this.root.removeFromParent();
    disposeTree(this.root);
  }
}
