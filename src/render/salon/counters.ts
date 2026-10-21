/**
 * Comptoirs / passe-plats par poste (croffle, brioche, tiramisu, salé, bar) : meuble à panneaux,
 * accessoires typés, passe avec lampes chauffantes, plats prêts, arc de cuisson, vapeur, lueur.
 */
import * as THREE from 'three';
import type { View } from '../api';
import type { CounterSpec, CounterViewState, DishId, StationKind } from '../../types';
import { createDishMesh } from '../models/dishes';
import { chamferCylinder, disposeTree, lathe, roundedBox, sphere, cylinder } from '../kit';
import { M } from '../batch';
import { vc, vcGlass, SHARED } from '../mats';
import { box, bushGeo, cone, potGeo } from '../geo';
import { glowTexture } from '../textures';
import type { SalonCtx } from './context';
import { Marker } from './marker';

export const COUNTER_TOP = 0.82;

/** Couleurs propres à chaque poste (identité visuelle). */
const STATION_LOOK: Record<StationKind, { body: string; top: string; panel: string; accent: string }> = {
  croffle: { body: '#f6e3c8', top: '#f7f2ea', panel: '#efd2a8', accent: '#d9a441' },
  brioche: { body: '#f3d9d6', top: '#efe7df', panel: '#e8c0bd', accent: '#d68b3c' },
  tiramisu: { body: '#e9dcd0', top: '#f6f3ee', panel: '#d9c3b0', accent: '#8a5a44' },
  sale: { body: '#dfe7d4', top: '#c99a6b', panel: '#c9d6bb', accent: '#7d9474' },
  bar: { body: '#e4d7ee', top: '#2f2a33', panel: '#d2c0e2', accent: '#c9a24a' },
};

const ARC_VERT = /* glsl */ `
  uniform float uSize;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uSize;
    gl_Position = projectionMatrix * mv;
  }
`;
const ARC_FRAG = /* glsl */ `
  uniform float uP;
  uniform float uA;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ang = atan(p.x, p.y); // 0 en haut, sens horaire
    float f = fract(ang / 6.28318);
    float aa = fwidth(r) * 1.5;
    float ring = 1.0 - smoothstep(0.17 - aa, 0.17 + aa, abs(r - 0.7));
    float filled = ring * step(f, uP);
    // tête lumineuse
    vec2 hp = vec2(sin(uP * 6.28318), cos(uP * 6.28318)) * 0.7;
    float head = 1.0 - smoothstep(0.0, 0.3, length(p - hp));
    // médaillon sombre (contraste sur les fonds clairs) + liseré
    float disc = 1.0 - smoothstep(0.88 - aa, 0.88 + aa, r);
    float edge = 1.0 - smoothstep(0.03, 0.03 + aa * 2.0, abs(r - 0.9));
    vec3 cocoa = vec3(0.16, 0.08, 0.06);
    vec3 cream = vec3(0.95, 0.88, 0.75);
    vec3 gold = vec3(1.0, 0.72, 0.25);
    float pulse = 0.85 + 0.15 * sin(uTime * 6.0);
    vec3 col = cocoa;
    col = mix(col, cream * 0.55, ring);
    col = mix(col, gold * 1.7 * pulse, filled);
    col += gold * head * 1.2;
    col = mix(col, gold, edge);
    float a = max(disc * 0.82, max(edge, head * 0.8)) * uA;
    if (a < 0.01) discard;
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

interface StationBuild {
  /** Point d'émission de vapeur (repère local). */
  steam: THREE.Vector3;
}

export function buildCounter(ctx: SalonCtx, c: CounterSpec): View<CounterViewState> {
  const { style, batch, grid } = ctx;
  const gy = grid.groundY(c.x, c.z);
  const rot = (c.rot * Math.PI) / 2;
  const lw = c.rot % 2 === 0 ? c.w : c.d;
  const ld = c.rot % 2 === 0 ? c.d : c.w;
  const look = STATION_LOOK[c.station];
  const matte = vc('matte');
  const satin = vc('satin');
  const gold = vc('gold');
  const ceramic = vc('ceramic');
  const metal = style.metal;
  const H = COUNTER_TOP;

  batch.push(M(c.x, gy, c.z, rot));
  // ── meuble
  batch.add(roundedBox(lw - 0.04, 0.1, ld - 0.04, 0.02, 1), matte, M(0, 0.05, 0), { color: shadeHex(look.body, -0.25) });
  batch.add(roundedBox(lw - 0.08, H - 0.15, ld - 0.08, 0.03, 2), satin, M(0, 0.1 + (H - 0.15) / 2, 0), { color: look.body });
  // panneaux moulurés sur les faces visibles
  const faces: [number, number, number][] = c.island
    ? [
        [0, ld / 2, 0],
        [0, -ld / 2, Math.PI],
        [lw / 2, 0, Math.PI / 2],
        [-lw / 2, 0, -Math.PI / 2],
      ]
    : [
        [0, ld / 2, 0],
        [lw / 2, 0, Math.PI / 2],
        [-lw / 2, 0, -Math.PI / 2],
      ];
  for (const [fx, fz, fr] of faces) {
    const span = Math.abs(fr) === Math.PI / 2 ? ld : lw;
    const n = Math.max(1, Math.round((span - 0.2) / 0.6));
    const pw = (span - 0.24) / n;
    batch.push(M(fx, 0, fz, fr));
    for (let k = 0; k < n; k++) {
      const px = -span / 2 + 0.12 + pw * (k + 0.5);
      batch.add(roundedBox(pw - 0.08, H - 0.32, 0.02, 0.01, 1), satin, M(px, 0.12 + (H - 0.32) / 2 + 0.04, -0.03), { color: look.panel, cast: false });
      batch.add(box(pw - 0.14, 0.012, 0.012), gold, M(px, H - 0.17, -0.015), { color: metal, cast: false });
      batch.add(box(pw - 0.14, 0.012, 0.012), gold, M(px, 0.21, -0.015), { color: metal, cast: false });
    }
    batch.pop();
  }
  // plateau
  const topMat = c.station === 'sale' ? vc('wood') : c.station === 'bar' ? vc('lacquer') : ceramic;
  batch.add(roundedBox(lw + 0.06, 0.06, ld + 0.06, 0.02, 2), topMat, M(0, H - 0.03, 0), { color: look.top });
  batch.add(box(lw + 0.02, 0.018, ld + 0.02), gold, M(0, H - 0.07, 0), { color: metal, cast: false });
  // passe : rail doré côté service
  batch.add(cylinder(0.012, 0.012, lw - 0.1, 8), gold, M(-(lw - 0.1) / 2, H + 0.035, ld / 2 + 0.01, 0, 1, 1, 1, 0, -Math.PI / 2), { color: metal, cast: false });
  for (const s of [-1, 1]) batch.add(sphere(0.022, 8, 6), gold, M(s * ((lw - 0.1) / 2), H + 0.035, ld / 2 + 0.01), { color: metal, cast: false });
  // potence des lampes chauffantes
  const lampZ = ld / 2 - 0.2;
  const lampH = 1.48;
  for (const s of [-1, 1]) {
    batch.add(cylinder(0.018, 0.022, lampH - H, 8), gold, M(s * (lw / 2 - 0.08), H, lampZ), { color: metal });
    batch.add(sphere(0.03, 8, 6), gold, M(s * (lw / 2 - 0.08), lampH + 0.01, lampZ), { color: metal });
  }
  batch.add(roundedBox(lw - 0.12, 0.04, 0.07, 0.015, 1), gold, M(0, lampH - 0.02, lampZ), { color: metal });
  const nLamps = lw > 2.2 ? 3 : 2;
  const lampXs: number[] = [];
  for (let k = 0; k < nLamps; k++) {
    const lx = (k - (nLamps - 1) / 2) * ((lw - 0.4) / Math.max(1, nLamps - 1));
    lampXs.push(lx);
    batch.add(cone(0.11, 0.12, 14), gold, M(lx, lampH - 0.16, lampZ), { color: metal });
    batch.add(cylinder(0.008, 0.008, 0.06, 6), gold, M(lx, lampH - 0.07, lampZ), { color: metal, cast: false });
  }
  const st = stationProps(ctx, c.station, lw, ld, c.island);
  batch.pop();

  return new CounterView(ctx, c, gy, rot, lw, ld, lampXs, lampZ, lampH, st);
}

/** Accessoires typés (partie arrière du plan de travail, z local < 0). */
function stationProps(ctx: SalonCtx, station: StationKind, lw: number, ld: number, island: boolean): StationBuild {
  const { batch, style } = ctx;
  const H = COUNTER_TOP;
  const matte = vc('matte');
  const satin = vc('satin');
  const gold = vc('gold');
  const silver = vc('silver');
  const ceramic = vc('ceramic');
  const glassM = vcGlass(0.32);
  const metal = style.metal;
  const bz = island ? -0.05 : -ld / 2 + 0.25;
  switch (station) {
    case 'croffle': {
      for (const s of [-1, 1]) {
        const x = s * Math.min(0.5, lw / 4);
        batch.add(roundedBox(0.34, 0.07, 0.3, 0.025, 2), matte, M(x, H + 0.035, bz), { color: '#3a3238' });
        batch.add(roundedBox(0.3, 0.012, 0.26, 0.006, 1), matte, M(x, H + 0.073, bz), { color: '#d9a441', cast: false });
        // couvercle relevé
        batch.add(roundedBox(0.34, 0.05, 0.3, 0.02, 2), matte, M(x, H + 0.1 + 0.11, bz - 0.13, 0, 1, 1, 1, -1.05), { color: '#3a3238' });
        batch.add(cylinder(0.012, 0.012, 0.16, 6), gold, M(x - 0.08, H + 0.08, bz - 0.15, 0, 1, 1, 1, 0, -Math.PI / 2), { color: metal });
        batch.add(roundedBox(0.04, 0.03, 0.18, 0.01, 1), gold, M(x, H + 0.06, bz + 0.2), { color: metal });
      }
      // pile de croffles dorées
      for (let k = 0; k < 4; k++) batch.add(roundedBox(0.16, 0.035, 0.16, 0.015, 2), satin, M(0, H + 0.02 + k * 0.035, bz + 0.05, k * 0.4), { color: k % 2 ? '#d9a441' : '#e6b35c' });
      batch.add(cylinder(0.045, 0.045, 0.22, 14), silver, M(lw / 2 - 0.2, H, bz - 0.05), { color: '#dfe3e8' });
      batch.add(cone(0.02, 0.06, 8), silver, M(lw / 2 - 0.2, H + 0.22, bz - 0.05), { color: '#dfe3e8' });
      return { steam: new THREE.Vector3(Math.min(0.5, lw / 4), H + 0.12, bz) };
    }
    case 'brioche': {
      batch.add(roundedBox(Math.min(0.9, lw - 0.6), 0.08, 0.42, 0.02, 1), matte, M(-0.1, H + 0.04, bz + 0.02), { color: '#4a4448' });
      batch.add(box(Math.min(0.86, lw - 0.64), 0.012, 0.38), silver, M(-0.1, H + 0.085, bz + 0.02), { color: '#8d8f94' });
      batch.add(box(Math.min(0.9, lw - 0.6), 0.03, 0.02), gold, M(-0.1, H + 0.09, bz + 0.24), { color: metal, cast: false });
      // brioche dorée et pancakes
      batch.add(roundedBox(0.32, 0.16, 0.18, 0.07, 3), satin, M(lw / 2 - 0.3, H + 0.08, bz), { color: '#cf8a3e' });
      batch.add(roundedBox(0.3, 0.03, 0.16, 0.012, 1), satin, M(lw / 2 - 0.3, H + 0.165, bz), { color: '#e6b35c', cast: false });
      for (let k = 0; k < 3; k++) batch.add(chamferCylinder(0.07, 0.07, 0.025, 0.01, 16), satin, M(-0.2 + k * 0.18, H + 0.093, bz + 0.02), { color: '#e2b06a', cast: false });
      batch.add(lathe([[0.04, 0], [0.04, 0.12], [0.015, 0.16], [0.012, 0.2], [0, 0.2]], 10, 'syrup'), glassM, M(-lw / 2 + 0.25, H, bz), { color: '#d98b2b' });
      return { steam: new THREE.Vector3(-0.1, H + 0.12, bz + 0.02) };
    }
    case 'tiramisu': {
      const vw = Math.min(1.3, lw - 0.4);
      const vh = 0.42;
      const vd = 0.4;
      batch.push(M(0, H, bz + 0.04));
      batch.add(roundedBox(vw, 0.04, vd, 0.015, 1), gold, M(0, 0.02, 0), { color: metal });
      batch.add(roundedBox(vw, 0.03, vd, 0.012, 1), gold, M(0, vh, 0), { color: metal });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) batch.add(box(0.025, vh, 0.025), gold, M(sx * (vw / 2 - 0.015), vh / 2, sz * (vd / 2 - 0.015)), { color: metal });
      batch.add(box(vw - 0.04, 0.008, vd - 0.04), glassM, M(0, vh * 0.52, 0), { color: '#eef7f8', cast: false });
      // coupelles bicolores
      for (const [yy, n] of [
        [0.04, 4],
        [vh * 0.52 + 0.005, 3],
      ] as const)
        for (let k = 0; k < n; k++) {
          const x = (k - (n - 1) / 2) * ((vw - 0.2) / Math.max(1, n - 1));
          batch.add(cylinder(0.055, 0.05, 0.05, 14), ceramic, M(x, yy, 0), { color: '#f6ead8' });
          batch.add(cylinder(0.056, 0.056, 0.012, 14), matte, M(x, yy + 0.05, 0), { color: '#6b4030' });
        }
      // vitres
      batch.add(box(vw, vh, 0.006), glassM, M(0, vh / 2, vd / 2), { color: '#f2fafb', cast: false, receive: false });
      batch.add(box(vw, vh, 0.006), glassM, M(0, vh / 2, -vd / 2), { color: '#f2fafb', cast: false, receive: false });
      for (const s of [-1, 1]) batch.add(box(0.006, vh, vd), glassM, M(s * vw / 2, vh / 2, 0), { color: '#f2fafb', cast: false, receive: false });
      batch.add(box(vw, 0.006, vd), glassM, M(0, vh, 0), { color: '#f2fafb', cast: false, receive: false });
      batch.pop();
      return { steam: new THREE.Vector3(0, H + 0.5, bz) };
    }
    case 'sale': {
      batch.add(roundedBox(0.6, 0.04, 0.36, 0.015, 1), vc('wood'), M(-0.15, H + 0.02, bz + 0.03), { color: '#b98252' });
      // demi-avocats, pain, œufs
      for (let k = 0; k < 3; k++) {
        const x = -0.33 + k * 0.13;
        batch.add(sphere(0.05, 10, 8), satin, M(x, H + 0.06, bz + 0.03, 0, 1, 0.55, 1.3), { color: '#5f7f34' });
        batch.add(sphere(0.042, 10, 8), satin, M(x, H + 0.075, bz + 0.03, 0, 1, 0.45, 1.25), { color: '#c9dd8a', cast: false });
        batch.add(sphere(0.018, 8, 6), satin, M(x, H + 0.088, bz + 0.03), { color: '#7a4a2a', cast: false });
      }
      batch.add(roundedBox(0.26, 0.09, 0.12, 0.04, 2), satin, M(0.05, H + 0.085, bz + 0.03, 0.3), { color: '#d8a565' });
      batch.add(lathe([[0.1, 0], [0.12, 0.06], [0.12, 0.07], [0, 0.07]], 14, 'basket'), matte, M(lw / 2 - 0.25, H, bz), { color: '#b98a5a' });
      for (let k = 0; k < 4; k++) batch.add(sphere(0.03, 8, 6), ceramic, M(lw / 2 - 0.25 + Math.cos(k * 1.6) * 0.05, H + 0.07, bz + Math.sin(k * 1.6) * 0.05, 0, 1, 1.25, 1), { color: '#fbf3e6' });
      // pots d'aromates
      for (let k = 0; k < 3; k++) {
        const x = -lw / 2 + 0.16 + k * 0.15;
        batch.add(potGeo(0.05, 0.08), ceramic, M(x, H, bz - 0.06), { color: '#d08c60' });
        batch.add(bushGeo(0.07, k + 3), vc('foliage'), M(x, H + 0.12, bz - 0.06), { color: style.foliage[k % style.foliage.length], sway: 0.6 });
      }
      return { steam: new THREE.Vector3(-0.15, H + 0.1, bz) };
    }
    case 'bar': {
      // machine à espresso en laiton
      const mx = -Math.min(0.35, lw / 4);
      batch.push(M(mx, H, bz + 0.02));
      batch.add(roundedBox(0.56, 0.36, 0.34, 0.05, 2), gold, M(0, 0.2, 0), { color: '#c9a24a' });
      batch.add(roundedBox(0.6, 0.03, 0.38, 0.012, 1), satin, M(0, 0.02, 0), { color: '#2f2a33' });
      batch.add(lathe([[0.2, 0], [0.19, 0.06], [0.12, 0.14], [0.03, 0.18], [0.03, 0.22], [0, 0.22]], 18, 'espdome'), gold, M(0, 0.38, 0), { color: '#d4a537' });
      batch.add(sphere(0.045, 12, 8), gold, M(0, 0.62, 0), { color: '#e9c46a' });
      batch.add(roundedBox(0.4, 0.08, 0.02, 0.01, 1), matte, M(0, 0.28, 0.172), { color: '#f6efe2', cast: false });
      for (const s of [-1, 1]) {
        batch.add(cylinder(0.035, 0.03, 0.06, 10), silver, M(s * 0.13, 0.12, 0.2), { color: '#d8dce2' });
        batch.add(cylinder(0.01, 0.01, 0.12, 6), matte, M(s * 0.13, 0.11, 0.26, 0, 1, 1, 1, Math.PI / 2), { color: '#2f2a33', cast: false });
        batch.add(cylinder(0.03, 0.025, 0.05, 10), ceramic, M(s * 0.13, 0.03, 0.2), { color: '#ffffff' });
      }
      for (let k = 0; k < 4; k++) batch.add(cylinder(0.028, 0.024, 0.04, 10), ceramic, M(-0.18 + k * 0.12, 0.665, 0), { color: k % 2 ? '#ffffff' : style.accent, cast: false });
      batch.pop();
      // bocaux à mocktails
      const jarCols = ['#f29fb2', '#a8d8c8', '#f3b37a'];
      for (let k = 0; k < 3; k++) {
        const x = lw / 2 - 0.22 - k * 0.18;
        batch.add(cylinder(0.06, 0.06, 0.18, 14), ceramic, M(x, H, bz + 0.02), { color: jarCols[k] });
        batch.add(cylinder(0.07, 0.07, 0.24, 14), glassM, M(x, H, bz + 0.02), { color: '#f2fbfb', cast: false, receive: false });
        batch.add(cylinder(0.072, 0.072, 0.02, 14), gold, M(x, H + 0.24, bz + 0.02), { color: metal, cast: false });
        batch.add(sphere(0.022, 8, 6), ceramic, M(x, H + 0.27, bz + 0.02), { color: '#fff7e8', cast: false });
      }
      // verres
      for (let k = 0; k < 4; k++) batch.add(lathe([[0.03, 0], [0.032, 0.09], [0, 0.09]], 10, 'tumbler'), glassM, M(lw / 2 - 0.2 - k * 0.11, H, bz + 0.2), { color: '#eef7f8', cast: false, receive: false });
      return { steam: new THREE.Vector3(mx, H + 0.62, bz + 0.02) };
    }
  }
}

class CounterView implements View<CounterViewState> {
  readonly root = new THREE.Group();
  private marker: Marker;
  private dishes: THREE.Object3D[] = [];
  private dishKey = '';
  private dishPop: number[] = [];
  private lampMat: THREE.MeshStandardMaterial;
  private lamps: THREE.Mesh;
  private halo: THREE.Sprite;
  private arc: THREE.Mesh;
  private arcMat: THREE.ShaderMaterial;
  private steamT = 0;
  private glow = 0;
  private time = 0;
  private wasCooking = false;

  constructor(
    private ctx: SalonCtx,
    private spec: CounterSpec,
    gy: number,
    rot: number,
    private lw: number,
    private ld: number,
    lampXs: number[],
    private lampZ: number,
    lampH: number,
    private station: StationBuild,
  ) {
    this.root.position.set(spec.x, gy, spec.z);
    this.root.rotation.y = rot;
    this.root.name = `counter:${spec.id}`;
    ctx.root.add(this.root);
    // ampoules des lampes chauffantes (émissif dynamique)
    this.lampMat = new THREE.MeshStandardMaterial({ color: '#fff4d8', emissive: '#ffb347', emissiveIntensity: 0.3, roughness: 0.4 });
    const g = new THREE.SphereGeometry(0.05, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const parts: THREE.BufferGeometry[] = [];
    for (const lx of lampXs) parts.push(g.clone().translate(lx, lampH - 0.16, lampZ));
    this.lamps = new THREE.Mesh(mergeSimple(parts), this.lampMat);
    g.dispose();
    for (const p of parts) p.dispose();
    this.root.add(this.lamps);
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffc46b', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }),
    );
    this.halo.position.set(0, COUNTER_TOP + 0.25, lampZ);
    this.halo.scale.set(lw * 1.05, 0.8, 1);
    this.root.add(this.halo);
    // arc de cuisson (billboard)
    this.arcMat = new THREE.ShaderMaterial({
      uniforms: { uSize: { value: 0.3 }, uP: { value: 0 }, uA: { value: 0 }, uTime: SHARED.uTime },
      vertexShader: ARC_VERT,
      fragmentShader: ARC_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    this.arc = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.arcMat);
    this.arc.position.set(0, 2.0, 0);
    this.arc.renderOrder = 20;
    this.arc.frustumCulled = false;
    this.arc.visible = false;
    this.root.add(this.arc);
    this.marker = new Marker(lw / 2 + 0.28, ld / 2 + 0.28, 0.35);
    this.marker.mesh.position.y = 0.012;
    this.root.add(this.marker.mesh);
  }

  update(s: CounterViewState, dt: number): void {
    this.time += dt;
    this.marker.update(s.highlight, dt);
    this.syncDishes(s.ready, dt);
    // lueur « prêt à servir »
    this.glow += (Math.max(0, Math.min(1, s.glow)) - this.glow) * (1 - Math.exp(-6 * dt));
    const g = this.glow;
    const flick = 0.92 + 0.08 * Math.sin(this.time * 7.3);
    this.lampMat.emissiveIntensity = 0.2 + g * 1.7 * flick;
    (this.halo.material as THREE.SpriteMaterial).opacity = g * 0.2 * flick;
    if (g > 0.05) {
      const p = this.root.localToWorld(_v.set(0, COUNTER_TOP + 0.45, this.lampZ));
      this.ctx.lights.request(p.x, p.y, p.z, '#ffbf6b', g * 1.5, 3.2, g + 0.5);
    }
    // cuisson : arc + vapeur
    const cooking = s.cooking > 0.001 && s.cooking < 0.999;
    this.arc.visible = cooking || this.arcMat.uniforms.uA.value > 0.01;
    const ua = this.arcMat.uniforms.uA;
    ua.value += ((cooking ? 1 : 0) - ua.value) * (1 - Math.exp(-10 * dt));
    if (cooking) this.arcMat.uniforms.uP.value = s.cooking;
    if (cooking) {
      this.steamT -= dt;
      if (this.steamT <= 0) {
        this.steamT = 0.28;
        const p = this.root.localToWorld(_v.copy(this.station.steam));
        this.ctx.fx.spawn({
          x: p.x + (Math.random() - 0.5) * 0.1,
          y: p.y,
          z: p.z + (Math.random() - 0.5) * 0.1,
          vy: 0.7,
          vx: (Math.random() - 0.5) * 0.15,
          vz: (Math.random() - 0.5) * 0.15,
          drag: 0.6,
          life: 1.1,
          size: 0.14,
          size1: 0.5,
          color: '#ffffff',
          alpha: 0.42,
          sprite: 5,
          spin: (Math.random() - 0.5) * 1.5,
          fadeIn: 0.2,
        });
      }
    }
    if (!cooking && this.wasCooking && s.ready.length > 0) {
      const p = this.root.localToWorld(_v.set(0, COUNTER_TOP + 0.3, this.ld / 2 - 0.17));
      this.ctx.fx.emit('pickup', p.x, p.z, { y: p.y, scale: 0.8 });
    }
    this.wasCooking = cooking;
  }

  private syncDishes(ready: readonly DishId[], dt: number): void {
    const list = ready.slice(0, 4);
    const key = list.join(',');
    if (key !== this.dishKey) {
      const prev = this.dishKey ? this.dishKey.split(',') : [];
      for (const d of this.dishes) {
        d.removeFromParent();
        disposeTree(d);
      }
      this.dishes = [];
      this.dishPop = [];
      const n = list.length;
      const span = Math.min(0.32, (this.lw - 0.3) / 4);
      for (let i = 0; i < n; i++) {
        const m = createDishMesh(list[i]);
        m.position.set((i - (n - 1) / 2) * span, COUNTER_TOP, this.ld / 2 - 0.17);
        this.root.add(m);
        this.dishes.push(m);
        this.dishPop.push(prev.includes(list[i]) && prev.length >= n ? 1 : 0);
      }
      this.dishKey = key;
    }
    for (let i = 0; i < this.dishes.length; i++) {
      if (this.dishPop[i] >= 1) continue;
      this.dishPop[i] = Math.min(1, this.dishPop[i] + dt * 3);
      const t = this.dishPop[i];
      const e = 1 - Math.pow(1 - t, 3);
      this.dishes[i].scale.setScalar(Math.max(0.01, e * (1 + Math.sin(t * Math.PI) * 0.2)));
    }
  }

  dispose(): void {
    this.marker.dispose();
    for (const d of this.dishes) disposeTree(d);
    this.lamps.geometry.dispose();
    this.lampMat.dispose();
    (this.halo.material as THREE.Material).dispose();
    this.arc.geometry.dispose();
    this.arcMat.dispose();
    this.root.removeFromParent();
  }
}

const _v = new THREE.Vector3();

function mergeSimple(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  for (const p of parts) {
    const o = pos.length / 3;
    const P = p.attributes.position;
    const N = p.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i));
      nrm.push(N.getX(i), N.getY(i), N.getZ(i));
    }
    const I = p.index;
    if (I) for (let i = 0; i < I.count; i++) idx.push(I.getX(i) + o);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

function shadeHex(c: string, k: number): string {
  const col = new THREE.Color(c);
  col.lerp(new THREE.Color(k >= 0 ? '#ffffff' : '#000000'), Math.abs(k));
  return '#' + col.getHexString();
}

