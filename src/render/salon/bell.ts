/**
 * Cloche Royale : cloche dorée suspendue à un portique en laiton près de l'entrée.
 * `lit` → lueur chaude, balancement doux, faisceau de lumière et paillettes ; `ring` → volée.
 */
import * as THREE from 'three';
import type { View } from '../api';
import type { BellViewState } from '../../types';
import { chamferCylinder, disposeTree, lathe, mesh, roundedBox, sphere, torus, cylinder, gold, velvet, matte } from '../kit';
import { beamTexture, glowTexture } from '../textures';
import { cone } from '../geo';
import type { SalonCtx } from './context';
import { Marker } from './marker';

export function buildBell(ctx: SalonCtx): View<BellViewState> {
  return new BellView(ctx);
}

const POST_H = 1.05;

class BellView implements View<BellViewState> {
  readonly root = new THREE.Group();
  private pivot = new THREE.Group();
  private bellMat: THREE.MeshStandardMaterial;
  private halo: THREE.Sprite;
  private beam: THREE.Mesh;
  private beamMat: THREE.MeshBasicMaterial;
  private marker: Marker;
  private time = 0;
  private lit = 0;
  private sparkT = 0;
  private wasRing = 0;

  constructor(private ctx: SalonCtx) {
    const { layout, grid, style } = ctx;
    const b = layout.royalBell;
    const gy = grid.groundY(b.x, b.z);
    this.root.position.set(b.x, gy, b.z);
    const dx = b.front.x - b.x;
    const dz = b.front.z - b.z;
    this.root.rotation.y = Math.hypot(dx, dz) > 0.01 ? Math.atan2(dx, dz) : 0;
    this.root.name = 'royalBell';
    ctx.root.add(this.root);
    const g = gold(style.metal);
    const marble = matte(style.marbleTop);
    // socle de marbre à deux degrés
    this.root.add(mesh(roundedBox(0.9, 0.08, 0.56, 0.03, 2), marble, 0, 0.04, 0));
    this.root.add(mesh(roundedBox(0.78, 0.06, 0.44, 0.025, 2), marble, 0, 0.11, 0));
    this.root.add(mesh(roundedBox(0.92, 0.02, 0.58, 0.008, 1), g, 0, 0.005, 0));
    // portique
    for (const s of [-1, 1]) {
      this.root.add(mesh(cylinder(0.032, 0.04, POST_H - 0.14, 10), g, s * 0.34, 0.14, 0));
      this.root.add(mesh(sphere(0.05, 12, 8), g, s * 0.34, 0.18, 0));
      this.root.add(mesh(sphere(0.045, 12, 8), g, s * 0.34, POST_H, 0));
      // volutes
      const v = mesh(torus(0.08, 0.012, 6, 16, Math.PI * 1.4), g, s * 0.26, POST_H - 0.12, 0);
      v.rotation.z = s > 0 ? 0.2 : Math.PI - 0.2 - Math.PI * 0.4;
      this.root.add(v);
    }
    const arch = mesh(torus(0.34, 0.025, 8, 28, Math.PI), g, 0, POST_H, 0);
    this.root.add(arch);
    // petite couronne au sommet
    const crown = new THREE.Group();
    crown.position.y = POST_H + 0.36;
    crown.add(mesh(chamferCylinder(0.07, 0.06, 0.05, 0.01, 16), g));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      crown.add(mesh(cone(0.018, 0.06, 6), g, Math.cos(a) * 0.06, 0.05, Math.sin(a) * 0.06));
    }
    crown.add(mesh(sphere(0.022, 10, 8), matte('#d43b5a'), 0, 0.03, 0.065));
    this.root.add(crown);
    // cloche
    this.pivot.position.y = POST_H + 0.3;
    this.root.add(this.pivot);
    this.bellMat = new THREE.MeshStandardMaterial({ color: '#e2b23c', metalness: 0.85, roughness: 0.22, emissive: '#ffb347', emissiveIntensity: 0, side: THREE.DoubleSide });
    const bellGeo = lathe(
      [
        [0.0, -0.02],
        [0.06, -0.02],
        [0.08, -0.05],
        [0.11, -0.12],
        [0.14, -0.24],
        [0.2, -0.36],
        [0.26, -0.44],
        [0.27, -0.47],
        [0.25, -0.475],
        [0.2, -0.44],
      ],
      28,
      'royalbell',
    );
    this.pivot.add(mesh(bellGeo, this.bellMat));
    this.pivot.add(mesh(torus(0.255, 0.014, 6, 32), this.bellMat, 0, -0.43, 0)).rotation.x = Math.PI / 2;
    this.pivot.add(mesh(cylinder(0.012, 0.012, 0.3, 6), g, 0, -0.38, 0));
    this.pivot.add(mesh(sphere(0.05, 12, 8), g, 0, -0.42, 0));
    // cordon de velours à pompon
    this.pivot.add(mesh(cylinder(0.012, 0.012, 0.42, 6), velvet('#9b2f45'), 0, -0.86, 0));
    this.pivot.add(mesh(lathe([[0, 0], [0.04, 0.02], [0.045, 0.08], [0.02, 0.12], [0, 0.13]], 12, 'tassel'), velvet('#c9a24a'), 0, -0.98, 0));
    // halo, faisceau
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffbf5a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }),
    );
    this.halo.position.y = POST_H + 0.05;
    this.halo.scale.set(1.8, 1.8, 1);
    this.root.add(this.halo);
    this.beamMat = new THREE.MeshBasicMaterial({
      map: beamTexture(),
      color: '#ffc870',
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beamGeo = new THREE.CylinderGeometry(0.42, 0.75, 4.2, 20, 1, true);
    beamGeo.translate(0, 2.1, 0);
    this.beam = new THREE.Mesh(beamGeo, this.beamMat);
    this.beam.renderOrder = 6;
    this.beam.visible = false;
    this.root.add(this.beam);
    this.marker = new Marker(0.65, 0.5, 0.45);
    this.marker.mesh.position.y = 0.012;
    this.root.add(this.marker.mesh);
  }

  update(s: BellViewState, dt: number): void {
    this.time += dt;
    this.marker.update(s.highlight, dt);
    this.lit += ((s.lit ? 1 : 0) - this.lit) * (1 - Math.exp(-3 * dt));
    const L = this.lit;
    const t = this.time;
    // balancement doux quand allumée, volée quand on sonne
    const ring = Math.max(0, Math.min(1, s.ring));
    const swing = ring > 0 ? Math.sin(ring * Math.PI * 5) * (1 - ring) * 0.75 : 0;
    this.pivot.rotation.x = swing + Math.sin(t * 1.7) * 0.06 * L;
    this.pivot.rotation.z = Math.sin(t * 1.3 + 0.7) * 0.05 * L;
    this.bellMat.emissiveIntensity = L * (0.22 + 0.1 * Math.sin(t * 3.1)) + ring * 0.5;
    (this.halo.material as THREE.SpriteMaterial).opacity = L * (0.22 + 0.08 * Math.sin(t * 2.4));
    this.beam.visible = L > 0.02;
    this.beamMat.opacity = L * (0.1 + 0.03 * Math.sin(t * 1.9));
    this.beam.rotation.y = t * 0.2;
    const wp = this.root.position;
    if (L > 0.05) {
      this.ctx.lights.request(wp.x, wp.y + 1.2, wp.z, '#ffc76b', L * 1.6 + ring * 1.5, 4, 10);
      this.sparkT -= dt;
      if (this.sparkT <= 0) {
        this.sparkT = 0.12;
        const a = Math.random() * Math.PI * 2;
        const r = 0.2 + Math.random() * 0.5;
        this.ctx.fx.spawn({
          x: wp.x + Math.cos(a) * r,
          y: wp.y + 0.3 + Math.random() * 1.2,
          z: wp.z + Math.sin(a) * r,
          vy: 0.5 + Math.random() * 0.6,
          cx: wp.x,
          cz: wp.z,
          swirl: 0.8,
          life: 1.4,
          size: 0.08 + Math.random() * 0.1,
          size1: 0.01,
          color: Math.random() < 0.5 ? '#ffe7a0' : '#fff6d8',
          sprite: 1,
          additive: true,
          fadeIn: 0.2,
        });
      }
    }
    if (ring > 0.02 && this.wasRing <= 0.02) {
      this.ctx.fx.emit('ring', wp.x, wp.z, { scale: 0.6, color: '#ffd77a' });
    }
    this.wasRing = ring;
  }

  dispose(): void {
    this.marker.dispose();
    (this.halo.material as THREE.Material).dispose();
    this.beamMat.dispose();
    this.beam.geometry.dispose();
    this.bellMat.dispose();
    this.root.removeFromParent();
    disposeTree(this.root);
  }
}
