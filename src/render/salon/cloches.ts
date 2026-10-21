/**
 * Guéridons et cloches : cloche en argent (mystère) ou sonnette dorée (bonus). États :
 * caché → apparition élastique → repos (reflet qui glisse) → ouverture (le couvercle se soulève
 * et bascule, éclats) → disparu.
 */
import * as THREE from 'three';
import type { View } from '../api';
import type { ClocheViewState, PedestalSpec } from '../../types';
import { chamferCylinder, disposeTree, gold, lathe, mesh, silver, sphere, torus, cylinder, matte } from '../kit';
import { M } from '../batch';
import { vc } from '../mats';
import { glowTexture } from '../textures';
import type { SalonCtx } from './context';
import { Marker } from './marker';

export const PEDESTAL_TOP = 0.62;

/** Guéridon (statique, dans le batch). */
function buildPedestal(ctx: SalonCtx, p: PedestalSpec, gy: number): void {
  const { batch, style } = ctx;
  const g = vc('gold');
  const c = vc('ceramic');
  batch.push(M(p.x, gy, p.z));
  // trois pieds galbés
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.5;
    batch.add(cylinder(0.018, 0.022, 0.26, 8), g, M(Math.cos(a) * 0.13, 0.0, Math.sin(a) * 0.13, 0, 1, 1, 1, 0, 0), { color: style.metal });
    batch.add(sphere(0.03, 8, 6), g, M(Math.cos(a) * 0.15, 0.02, Math.sin(a) * 0.15), { color: style.metal });
  }
  batch.add(
    lathe(
      [
        [0.16, 0.2],
        [0.05, 0.26],
        [0.035, 0.34],
        [0.05, 0.42],
        [0.03, 0.52],
        [0.06, PEDESTAL_TOP - 0.03],
        [0, PEDESTAL_TOP - 0.03],
      ],
      16,
      'gueridon',
    ),
    g,
    null,
    { color: style.metal },
  );
  batch.add(chamferCylinder(0.25, 0.25, 0.03, 0.01, 28), c, M(0, PEDESTAL_TOP - 0.03, 0), { color: style.marbleTop });
  batch.add(torus(0.25, 0.01, 6, 36), g, M(0, PEDESTAL_TOP - 0.015, 0, 0, 1, 1, 1, Math.PI / 2), { color: style.metal, cast: false });
  batch.pop();
}

/** Courbe élastique (dépassement puis stabilisation). */
function elastic(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
}

export function buildCloche(ctx: SalonCtx, p: PedestalSpec): View<ClocheViewState> {
  const gy = ctx.grid.groundY(p.x, p.z);
  buildPedestal(ctx, p, gy);
  return new ClocheView(ctx, p, gy);
}

class ClocheView implements View<ClocheViewState> {
  readonly root = new THREE.Group();
  /** Contenu qui apparaît (plateau + cloche). */
  private item = new THREE.Group();
  private silverSet = new THREE.Group();
  private goldSet = new THREE.Group();
  private silverLid = new THREE.Group();
  private goldLid = new THREE.Group();
  private halo: THREE.Sprite;
  private marker: Marker;
  private state: ClocheViewState['state'] = 'hidden';
  private golden = false;
  private time = 0;
  private glintT = 1;

  constructor(
    private ctx: SalonCtx,
    p: PedestalSpec,
    gy: number,
  ) {
    this.root.position.set(p.x, gy, p.z);
    this.root.name = `cloche:${p.id}`;
    ctx.root.add(this.root);
    this.item.position.y = PEDESTAL_TOP;
    this.root.add(this.item);
    // cloche en argent
    const sv = silver('#e4e8ee');
    this.silverSet.add(mesh(chamferCylinder(0.23, 0.2, 0.025, 0.008, 28), sv));
    this.silverSet.add(mesh(torus(0.225, 0.008, 6, 36), sv, 0, 0.025, 0)).rotation.x = Math.PI / 2;
    const dome = lathe(
      [
        [0.205, 0],
        [0.21, 0.012],
        [0.2, 0.05],
        [0.175, 0.12],
        [0.13, 0.18],
        [0.07, 0.215],
        [0.0, 0.225],
      ],
      28,
      'clocheDome',
    );
    this.silverLid.add(mesh(dome, sv, 0, 0.022, 0));
    this.silverLid.add(mesh(torus(0.207, 0.01, 6, 36), gold(), 0, 0.03, 0)).rotation.x = Math.PI / 2;
    this.silverLid.add(mesh(cylinder(0.012, 0.016, 0.04, 8), sv, 0, 0.24, 0));
    this.silverLid.add(mesh(sphere(0.03, 12, 8), sv, 0, 0.29, 0));
    this.silverSet.add(this.silverLid);
    this.item.add(this.silverSet);
    // sonnette dorée
    const gd = gold('#e2b23c');
    this.goldSet.add(mesh(chamferCylinder(0.16, 0.17, 0.05, 0.015, 24), matte('#3d2a22')));
    this.goldSet.add(mesh(torus(0.163, 0.008, 6, 32), gd, 0, 0.05, 0)).rotation.x = Math.PI / 2;
    this.goldLid.add(
      mesh(
        lathe(
          [
            [0.15, 0],
            [0.15, 0.01],
            [0.13, 0.06],
            [0.09, 0.11],
            [0.04, 0.135],
            [0.0, 0.14],
          ],
          24,
          'deskbell',
        ),
        gd,
        0,
        0.05,
        0,
      ),
    );
    this.goldLid.add(mesh(cylinder(0.01, 0.01, 0.06, 8), gd, 0, 0.19, 0));
    this.goldLid.add(mesh(sphere(0.028, 12, 8), gd, 0, 0.25, 0));
    this.goldSet.add(this.goldLid);
    this.item.add(this.goldSet);
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffd36b', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }),
    );
    this.halo.position.y = 0.2;
    this.halo.scale.set(0.9, 0.9, 1);
    this.item.add(this.halo);
    this.item.visible = false;
    this.marker = new Marker(0.42, 0.42, 0.42);
    this.marker.mesh.position.y = 0.012;
    this.root.add(this.marker.mesh);
  }

  update(s: ClocheViewState, dt: number): void {
    this.time += dt;
    this.marker.update(s.state === 'idle' || s.state === 'appearing' ? s.highlight : 0, dt);
    const fx = this.ctx.fx;
    const wp = this.root.position;
    if (s.golden !== this.golden) this.golden = s.golden;
    this.silverSet.visible = !this.golden;
    this.goldSet.visible = this.golden;
    const lid = this.golden ? this.goldLid : this.silverLid;
    const top = wp.y + PEDESTAL_TOP + (this.golden ? 0.3 : 0.32);
    if (s.state !== this.state) {
      if (s.state === 'appearing') fx.emit('cloche', wp.x, wp.z, { y: top - 0.1, scale: 0.7, color: this.golden ? '#ffe39a' : undefined });
      if (s.state === 'opening') fx.emit(this.golden ? 'golden' : 'cloche', wp.x, wp.z, { y: top, scale: 1.1 });
      this.state = s.state;
    }
    const t = Math.max(0, Math.min(1, s.t));
    const haloMat = this.halo.material as THREE.SpriteMaterial;
    switch (s.state) {
      case 'hidden':
      case 'gone':
        this.item.visible = false;
        break;
      case 'appearing': {
        this.item.visible = true;
        const e = elastic(t);
        this.item.scale.set(e, Math.max(0.01, e), e);
        lid.position.y = 0;
        lid.rotation.x = 0;
        lid.scale.setScalar(1);
        haloMat.opacity = this.golden ? 0.5 * t : 0;
        break;
      }
      case 'idle': {
        this.item.visible = true;
        this.item.scale.setScalar(1);
        lid.position.y = Math.max(0, Math.sin(this.time * 2.2)) * 0.004;
        lid.rotation.x = 0;
        lid.scale.setScalar(1);
        haloMat.opacity = this.golden ? 0.4 + 0.15 * Math.sin(this.time * 3) : 0.08 + 0.06 * Math.sin(this.time * 2);
        this.glintT -= dt;
        if (this.glintT <= 0) {
          this.glintT = 1.4 + Math.random() * 1.2;
          const a = Math.random() * Math.PI * 2;
          fx.glint(wp.x + Math.cos(a) * 0.09, top - 0.08 + Math.random() * 0.06, wp.z + Math.sin(a) * 0.09, 0.42, this.golden ? '#fff1b0' : '#ffffff');
        }
        break;
      }
      case 'opening': {
        this.item.visible = true;
        this.item.scale.setScalar(1);
        const e = 1 - Math.pow(1 - t, 3);
        lid.position.y = e * 0.5;
        lid.position.z = -e * 0.12;
        lid.rotation.x = -e * 2.3;
        const fade = t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
        lid.scale.setScalar(Math.max(0.01, fade));
        haloMat.opacity = (1 - t) * 0.6;
        break;
      }
    }
  }

  dispose(): void {
    this.marker.dispose();
    (this.halo.material as THREE.Material).dispose();
    this.root.removeFromParent();
    disposeTree(this.root);
  }
}
