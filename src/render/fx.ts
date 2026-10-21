/**
 * Système de particules mutualisé : deux nuages de points (additif / alpha) alimentés par un atlas
 * de sprites, plus un petit réservoir d'ondes au sol. Palette pastel et or, effets élégants.
 */
import * as THREE from 'three';
import type { FxKind, FxOptions } from '../types';
import { SPRITE, spriteAtlas } from './textures';
import { POINTS_SHARED } from './glow';

const VERT = /* glsl */ `
  attribute vec4 aCol;
  attribute float aSize;
  attribute vec2 aRS; // rotation, sprite
  uniform float uPx;
  varying vec4 vCol;
  varying vec2 vRS;
  void main() {
    vCol = aCol;
    vRS = aRS;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPx;
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uAtlas;
  varying vec4 vCol;
  varying vec2 vRS;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float c = cos(vRS.x);
    float s = sin(vRS.x);
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    if (abs(p.x) > 0.5 || abs(p.y) > 0.5) discard;
    p += 0.5;
    float cell = vRS.y;
    float col = mod(cell, 4.0);
    float row = floor(cell / 4.0);
    vec2 uv = vec2((col + p.x) / 4.0, (3.0 - row + (1.0 - p.y)) / 4.0);
    vec4 t = texture2D(uAtlas, uv);
    float a = t.a * vCol.a;
    if (a < 0.004) discard;
    gl_FragColor = vec4(t.rgb * vCol.rgb, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Paramètres d'une particule à faire naître. */
export interface ParticleSpec {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size: number;
  size1?: number;
  color: THREE.ColorRepresentation;
  alpha?: number;
  sprite?: number;
  rot?: number;
  spin?: number;
  gravity?: number;
  drag?: number;
  /** Rotation autour d'un axe vertical (cx, cz) en rad/s. */
  swirl?: number;
  cx?: number;
  cz?: number;
  /** Ondulation latérale (pétales, confettis). */
  flutter?: number;
  /** Rebond / pose au sol à cette hauteur (NaN = traverse). */
  ground?: number;
  fadeIn?: number;
  additive?: boolean;
}

const F = 22; // champs par particule
/** Échelle globale des particules (lisibilité à la distance de jeu). */
const SIZE_K = 1.35;

/** Indices des champs dans le tableau de structure. */
const X = 0,
  Y = 1,
  Z = 2,
  VX = 3,
  VY = 4,
  VZ = 5,
  AGE = 6,
  LIFE = 7,
  S0 = 8,
  S1 = 9,
  R = 10,
  G = 11,
  B = 12,
  A = 13,
  ROT = 14,
  SPIN = 15,
  SPR = 16,
  GRAV = 17,
  DRAG = 18,
  SWIRL = 19,
  FLUT = 20,
  GND = 21;

class Layer {
  readonly data: Float32Array;
  readonly extra: Float32Array; // cx, cz, fadeIn, phase
  count = 0;
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private rs: Float32Array;
  private geo: THREE.BufferGeometry;

  constructor(
    readonly cap: number,
    private readonly additive: boolean,
    parent: THREE.Object3D,
  ) {
    this.data = new Float32Array(cap * F);
    this.extra = new Float32Array(cap * 4);
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 4);
    this.size = new Float32Array(cap);
    this.rs = new Float32Array(cap * 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aRS', new THREE.BufferAttribute(this.rs, 2).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geo = g;
    const m = new THREE.ShaderMaterial({
      uniforms: { uPx: POINTS_SHARED.uPx, uAtlas: { value: spriteAtlas() } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 12 : 11;
    parent.add(this.points);
  }

  spawn(p: ParticleSpec): void {
    let i: number;
    if (this.count < this.cap) i = this.count++;
    else i = Math.floor(Math.random() * this.cap); // remplace une particule au hasard
    const d = this.data;
    const o = i * F;
    const c = _c.set(p.color);
    // les éclats additifs sont « HDR » (au-delà de 1) pour accrocher le bloom
    if (this.additive) c.multiplyScalar(1.9);
    d[o + X] = p.x;
    d[o + Y] = p.y;
    d[o + Z] = p.z;
    d[o + VX] = p.vx ?? 0;
    d[o + VY] = p.vy ?? 0;
    d[o + VZ] = p.vz ?? 0;
    d[o + AGE] = 0;
    d[o + LIFE] = Math.max(0.05, p.life);
    d[o + S0] = p.size * SIZE_K;
    d[o + S1] = (p.size1 ?? p.size) * SIZE_K;
    d[o + R] = c.r;
    d[o + G] = c.g;
    d[o + B] = c.b;
    d[o + A] = p.alpha ?? 1;
    d[o + ROT] = p.rot ?? Math.random() * Math.PI * 2;
    d[o + SPIN] = p.spin ?? 0;
    d[o + SPR] = p.sprite ?? SPRITE.dot;
    d[o + GRAV] = p.gravity ?? 0;
    d[o + DRAG] = p.drag ?? 0;
    d[o + SWIRL] = p.swirl ?? 0;
    d[o + FLUT] = p.flutter ?? 0;
    d[o + GND] = p.ground ?? Number.NaN;
    const e = this.extra;
    e[i * 4] = p.cx ?? p.x;
    e[i * 4 + 1] = p.cz ?? p.z;
    e[i * 4 + 2] = p.fadeIn ?? 0.08;
    e[i * 4 + 3] = Math.random() * 6.28;
  }

  update(dt: number): void {
    const d = this.data;
    const e = this.extra;
    let n = this.count;
    for (let i = 0; i < n; i++) {
      const o = i * F;
      d[o + AGE] += dt;
      if (d[o + AGE] >= d[o + LIFE]) {
        // retire par permutation avec la dernière
        n--;
        if (i !== n) {
          d.copyWithin(o, n * F, n * F + F);
          e.copyWithin(i * 4, n * 4, n * 4 + 4);
        }
        i--;
        continue;
      }
      const drag = Math.exp(-d[o + DRAG] * dt);
      d[o + VX] *= drag;
      d[o + VY] = d[o + VY] * drag - d[o + GRAV] * dt;
      d[o + VZ] *= drag;
      let x = d[o + X] + d[o + VX] * dt;
      let y = d[o + Y] + d[o + VY] * dt;
      let z = d[o + Z] + d[o + VZ] * dt;
      const sw = d[o + SWIRL];
      if (sw !== 0) {
        const cx = e[i * 4];
        const cz = e[i * 4 + 1];
        const a = sw * dt;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const rx = x - cx;
        const rz = z - cz;
        x = cx + rx * ca - rz * sa;
        z = cz + rx * sa + rz * ca;
      }
      const fl = d[o + FLUT];
      if (fl !== 0) {
        const ph = e[i * 4 + 3] + d[o + AGE] * 4.2;
        x += Math.sin(ph) * fl * dt;
        z += Math.cos(ph * 0.8) * fl * dt;
      }
      const gnd = d[o + GND];
      if (gnd === gnd && y < gnd) {
        y = gnd;
        if (d[o + VY] < -0.6) {
          d[o + VY] = -d[o + VY] * 0.35;
          d[o + VX] *= 0.6;
          d[o + VZ] *= 0.6;
          d[o + SPIN] *= 0.5;
        } else {
          d[o + VY] = 0;
          d[o + VX] *= 0.8;
          d[o + VZ] *= 0.8;
          d[o + SPIN] *= 0.8;
          d[o + FLUT] = 0;
        }
      }
      d[o + X] = x;
      d[o + Y] = y;
      d[o + Z] = z;
      d[o + ROT] += d[o + SPIN] * dt;
    }
    this.count = n;
    // écrit les attributs
    const pos = this.pos;
    const col = this.col;
    const size = this.size;
    const rs = this.rs;
    for (let i = 0; i < n; i++) {
      const o = i * F;
      const t = d[o + AGE] / d[o + LIFE];
      const fi = e[i * 4 + 2];
      const fadeIn = fi > 0 ? Math.min(1, d[o + AGE] / fi) : 1;
      const fadeOut = t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
      pos[i * 3] = d[o + X];
      pos[i * 3 + 1] = d[o + Y];
      pos[i * 3 + 2] = d[o + Z];
      col[i * 4] = d[o + R];
      col[i * 4 + 1] = d[o + G];
      col[i * 4 + 2] = d[o + B];
      col[i * 4 + 3] = d[o + A] * fadeIn * fadeOut;
      size[i] = d[o + S0] + (d[o + S1] - d[o + S0]) * t;
      rs[i * 2] = d[o + ROT];
      rs[i * 2 + 1] = d[o + SPR];
    }
    const g = this.geo;
    for (const name of ['position', 'aCol', 'aSize', 'aRS']) {
      const attr = g.attributes[name] as THREE.BufferAttribute;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n * attr.itemSize);
      attr.needsUpdate = true;
    }
    g.setDrawRange(0, n);
  }

  clear(): void {
    this.count = 0;
    this.geo.setDrawRange(0, 0);
  }

  dispose(): void {
    this.geo.dispose();
    (this.points.material as THREE.Material).dispose();
    this.points.removeFromParent();
  }
}

const _c = new THREE.Color();

// ─────────────────────────────────────────── Ondes au sol

const WAVE_VERT = /* glsl */ `
  varying vec2 vP;
  void main() {
    vP = position.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const WAVE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uR;
  uniform float uW;
  uniform float uA;
  varying vec2 vP;
  void main() {
    float d = length(vP);
    float k = 1.0 - smoothstep(0.0, uW, abs(d - uR));
    float inner = smoothstep(uR, 0.0, d) * 0.18;
    float a = (k + inner) * uA;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

interface Wave {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  age: number;
  life: number;
  r0: number;
  r1: number;
  w: number;
  alive: boolean;
}

/** Système d'effets complet (particules + ondes). */
export class FxSystem {
  readonly group = new THREE.Group();
  private add: Layer;
  private norm: Layer;
  private waves: Wave[] = [];
  /** Hauteur du sol au point (x, z) (fournie par le salon courant). */
  groundAt: (x: number, z: number) => number = () => 0;

  constructor(parent: THREE.Object3D) {
    parent.add(this.group);
    this.norm = new Layer(2400, false, this.group);
    this.add = new Layer(1800, true, this.group);
    const geo = new THREE.PlaneGeometry(2, 2);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color() }, uR: { value: 0 }, uW: { value: 0.1 }, uA: { value: 1 } },
        vertexShader: WAVE_VERT,
        fragmentShader: WAVE_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 4;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.waves.push({ mesh, mat, age: 0, life: 1, r0: 0, r1: 1, w: 0.1, alive: false });
    }
  }

  spawn(p: ParticleSpec): void {
    (p.additive ? this.add : this.norm).spawn(p);
  }

  /** Onde circulaire au sol. */
  wave(x: number, z: number, color: THREE.ColorRepresentation, r0: number, r1: number, life: number, width = 0.12, y?: number): void {
    let w = this.waves.find((v) => !v.alive);
    if (!w) w = this.waves.reduce((a, b) => (a.age / a.life > b.age / b.life ? a : b));
    w.alive = true;
    w.age = 0;
    w.life = life;
    w.r0 = r0;
    w.r1 = r1;
    w.w = width;
    (w.mat.uniforms.uColor.value as THREE.Color).set(color);
    w.mesh.position.set(x, (y ?? this.groundAt(x, z)) + 0.03, z);
    w.mesh.scale.setScalar(r1 + width * 2);
    w.mesh.visible = true;
  }

  update(dt: number): void {
    this.norm.update(dt);
    this.add.update(dt);
    for (const w of this.waves) {
      if (!w.alive) continue;
      w.age += dt;
      const t = w.age / w.life;
      if (t >= 1) {
        w.alive = false;
        w.mesh.visible = false;
        continue;
      }
      const e = 1 - Math.pow(1 - t, 3);
      const r = w.r0 + (w.r1 - w.r0) * e;
      const s = w.mesh.scale.x;
      w.mat.uniforms.uR.value = r / s;
      w.mat.uniforms.uW.value = w.w / s;
      w.mat.uniforms.uA.value = (1 - t) * (1 - t);
    }
  }

  clear(): void {
    this.norm.clear();
    this.add.clear();
    for (const w of this.waves) {
      w.alive = false;
      w.mesh.visible = false;
    }
  }

  dispose(): void {
    this.norm.dispose();
    this.add.dispose();
    for (const w of this.waves) w.mat.dispose();
    this.waves[0]?.mesh.geometry.dispose();
    this.group.removeFromParent();
  }

  // ─────────────────────────────────────── Effets nommés

  emit(kind: FxKind, x: number, z: number, opts: FxOptions = {}): void {
    const gy = this.groundAt(x, z);
    const y = opts.y ?? gy + 0.9;
    const sc = opts.scale ?? 1;
    const rnd = Math.random;
    const R = (a: number, b: number) => a + (b - a) * rnd();
    const pick = <T>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];
    const n = (base: number) => Math.max(1, Math.round((opts.count ?? base) * (opts.count ? 1 : Math.min(2, Math.max(0.5, sc)))));
    const col = opts.color;
    const GOLD = ['#ffd77a', '#f2c14e', '#fff0b8'];
    const PETALS = ['#f6b8c4', '#fbd3dc', '#ffe8ec', '#f29fb2'];
    const PASTEL = ['#f6b8c4', '#c9b6e4', '#a8d8c8', '#ffe1a8', '#f7c8b8', '#d4a537', '#ffffff'];
    switch (kind) {
      case 'serve': {
        for (let i = 0; i < n(16); i++) {
          const a = R(0, Math.PI * 2);
          const s = R(0.8, 2.2) * sc;
          this.spawn({ x, y, z, vx: Math.cos(a) * s, vy: R(1.5, 3.4), vz: Math.sin(a) * s, gravity: 4, drag: 2.2, life: R(0.5, 0.9), size: R(0.16, 0.3) * sc, size1: 0.02, color: col ?? pick(GOLD), sprite: SPRITE.sparkle, spin: R(-4, 4), additive: true });
        }
        for (let i = 0; i < n(9); i++) {
          const a = R(0, Math.PI * 2);
          this.spawn({ x: x + Math.cos(a) * 0.2, y: y + 0.3, z: z + Math.sin(a) * 0.2, vx: Math.cos(a) * R(0.4, 1.2), vy: R(1.2, 2.2), vz: Math.sin(a) * R(0.4, 1.2), gravity: 1.6, drag: 1.6, flutter: 1.2, life: R(1.2, 1.8), size: R(0.14, 0.2) * sc, color: pick(PETALS), sprite: SPRITE.petal, spin: R(-3, 3), ground: gy + 0.02 });
        }
        this.wave(x, z, col ?? '#ffd77a', 0.2, 1.1 * sc, 0.6, 0.08, gy);
        break;
      }
      case 'coins': {
        for (let i = 0; i < n(8); i++) {
          const a = R(0, Math.PI * 2);
          const s = R(0.5, 1.4);
          this.spawn({ x, y, z, vx: Math.cos(a) * s, vy: R(2.6, 4.2), vz: Math.sin(a) * s, gravity: 9, drag: 0.5, life: R(0.9, 1.3), size: R(0.18, 0.24) * sc, color: '#ffffff', sprite: SPRITE.coin, spin: R(-10, 10), ground: gy + 0.05 });
        }
        for (let i = 0; i < n(6); i++) this.spawn({ x: x + R(-0.3, 0.3), y: y + R(0, 0.4), z: z + R(-0.3, 0.3), vy: R(0.3, 0.8), life: R(0.4, 0.7), size: R(0.1, 0.2), size1: 0, color: '#fff3c4', sprite: SPRITE.glint, additive: true });
        break;
      }
      case 'pickup': {
        for (let i = 0; i < n(8); i++) {
          const a = (i / 8) * Math.PI * 2;
          this.spawn({ x: x + Math.cos(a) * 0.25, y, z: z + Math.sin(a) * 0.25, vx: Math.cos(a) * 0.6, vy: R(0.8, 1.5), vz: Math.sin(a) * 0.6, drag: 3, life: R(0.4, 0.6), size: 0.16 * sc, size1: 0.02, color: col ?? pick(GOLD), sprite: SPRITE.sparkle, additive: true });
        }
        this.spawn({ x, y: y + 0.2, z, life: 0.35, size: 0.3 * sc, size1: 0.9 * sc, color: col ?? '#ffe7a0', sprite: SPRITE.ring, alpha: 0.9, additive: true, fadeIn: 0 });
        break;
      }
      case 'foam': {
        const yy = opts.y ?? gy + 0.3;
        for (let i = 0; i < n(26); i++) {
          const a = R(0, Math.PI * 2);
          const s = R(1.2, 3.6) * sc;
          // taille des bouffées en racine de l'échelle : la portée suit la zone sans boucher l'écran
          const ps = Math.sqrt(sc);
          this.spawn({ x, y: yy, z, vx: Math.cos(a) * s, vy: R(0.5, 2.2), vz: Math.sin(a) * s, gravity: 3, drag: 2.6, life: R(0.7, 1.2), size: R(0.3, 0.5) * ps, size1: R(0.45, 0.8) * ps, color: col ?? pick(['#fffaf0', '#fbefd9', '#ffffff']), sprite: SPRITE.puff, spin: R(-1, 1), ground: gy + 0.15 });
        }
        this.wave(x, z, '#fff3dc', 0.2, 2.2 * sc, 0.55, 0.18, gy);
        break;
      }
      case 'champagne': {
        const dx = opts.dirX ?? 0;
        const dz = opts.dirZ ?? 0;
        const has = Math.hypot(dx, dz) > 0.01;
        this.spawn({ x, y, z, life: 0.2, size: 0.6 * sc, size1: 1.4 * sc, color: '#fff6d8', sprite: SPRITE.glint, additive: true, fadeIn: 0 });
        for (let i = 0; i < n(18); i++) {
          const a = has ? Math.atan2(dz, dx) + R(-0.35, 0.35) : R(0, Math.PI * 2);
          const s = R(2, 5);
          this.spawn({ x, y, z, vx: Math.cos(a) * s, vy: R(0.5, 2), vz: Math.sin(a) * s, gravity: 2, drag: 3, life: R(0.4, 0.8), size: R(0.12, 0.22), size1: 0.02, color: pick(GOLD), sprite: SPRITE.sparkle, additive: true });
        }
        for (let i = 0; i < n(16); i++)
          this.spawn({ x: x + R(-0.4, 0.4), y: y + R(-0.2, 0.3), z: z + R(-0.4, 0.4), vy: R(0.6, 1.6), flutter: 0.6, life: R(0.9, 1.6), size: R(0.08, 0.16), color: '#fff3c8', sprite: SPRITE.bubble, alpha: 0.85 });
        break;
      }
      case 'syrup': {
        for (let i = 0; i < n(18); i++) {
          const a = R(0, Math.PI * 2);
          const s = R(0.8, 2.4) * sc;
          this.spawn({ x, y: gy + 0.2, z, vx: Math.cos(a) * s, vy: R(1.5, 3), vz: Math.sin(a) * s, gravity: 9, drag: 1, life: R(0.6, 1), size: R(0.1, 0.18) * sc, color: col ?? pick(['#d98b2b', '#c47a1f', '#e6a446']), sprite: SPRITE.drop, ground: gy + 0.02 });
        }
        break;
      }
      case 'dust': {
        for (let i = 0; i < n(5); i++)
          this.spawn({ x: x + R(-0.2, 0.2), y: gy + 0.08, z: z + R(-0.2, 0.2), vx: R(-0.5, 0.5), vy: R(0.2, 0.6), vz: R(-0.5, 0.5), drag: 3, life: R(0.4, 0.7), size: R(0.18, 0.28) * sc, size1: R(0.35, 0.5) * sc, color: col ?? '#efe2cf', sprite: SPRITE.puff, alpha: 0.55 });
        break;
      }
      case 'crash': {
        for (let i = 0; i < n(6); i++) {
          const a = R(0, Math.PI * 2);
          const s = R(1, 2.6);
          this.spawn({ x, y, z, vx: Math.cos(a) * s, vy: R(3, 5), vz: Math.sin(a) * s, gravity: 11, drag: 0.4, life: R(1.0, 1.4), size: R(0.24, 0.32), color: '#ffffff', sprite: SPRITE.plate, spin: R(-14, 14), ground: gy + 0.03 });
        }
        for (let i = 0; i < n(4); i++) {
          const a = R(0, Math.PI * 2);
          this.spawn({ x, y, z, vx: Math.cos(a) * R(1, 3), vy: R(3, 5), vz: Math.sin(a) * R(1, 3), gravity: 11, life: R(0.9, 1.2), size: 0.22, color: '#ffffff', sprite: SPRITE.fork, spin: R(-18, 18), ground: gy + 0.03 });
        }
        for (let i = 0; i < n(8); i++) {
          const a = R(0, Math.PI * 2);
          this.spawn({ x, y: y - 0.2, z, vx: Math.cos(a) * R(1, 2.5), vy: R(0.5, 1.5), vz: Math.sin(a) * R(1, 2.5), drag: 3, life: R(0.5, 0.8), size: 0.14, size1: 0.02, color: '#fff2c8', sprite: SPRITE.sparkle, additive: true });
        }
        this.emit('dust', x, z, { scale: 1.6, count: 6 });
        break;
      }
      case 'flash': {
        this.spawn({ x, y: y + 0.2, z, life: 0.28, size: 3.5 * sc, size1: 6 * sc, color: '#ffffff', alpha: 1, sprite: SPRITE.dot, additive: true, fadeIn: 0 });
        this.spawn({ x, y: y + 0.2, z, life: 0.35, size: 1.2 * sc, size1: 2.4 * sc, color: '#ffffff', sprite: SPRITE.glint, additive: true, fadeIn: 0 });
        for (let i = 0; i < n(10); i++) {
          const a = R(0, Math.PI * 2);
          this.spawn({ x, y: y + 0.2, z, vx: Math.cos(a) * R(2, 4), vy: R(-0.5, 1.5), vz: Math.sin(a) * R(2, 4), drag: 4, life: R(0.3, 0.5), size: 0.2, size1: 0.02, color: '#ffffff', sprite: SPRITE.sparkle, additive: true });
        }
        break;
      }
      case 'teleport': {
        for (let i = 0; i < n(34); i++) {
          const a = R(0, Math.PI * 2);
          const r = R(0.3, 0.8);
          this.spawn({ x: x + Math.cos(a) * r, y: gy + R(0.05, 0.4), z: z + Math.sin(a) * r, cx: x, cz: z, swirl: R(5, 8), vy: R(1.2, 2.6), drag: 0.6, life: R(0.7, 1.1), size: R(0.1, 0.22), size1: 0.02, color: pick(GOLD), sprite: SPRITE.sparkle, additive: true });
        }
        this.wave(x, z, '#ffd77a', 0.1, 1.2, 0.7, 0.12, gy);
        this.spawn({ x, y: gy + 0.9, z, life: 0.5, size: 1.8, size1: 0.4, color: '#ffe9a8', alpha: 0.8, sprite: SPRITE.swirl, spin: 9, additive: true, fadeIn: 0.05 });
        break;
      }
      case 'dash': {
        const dx = opts.dirX ?? 0;
        const dz = opts.dirZ ?? 0;
        const l = Math.hypot(dx, dz) || 1;
        for (let i = 0; i < n(7); i++) {
          const k = i * 0.16;
          this.spawn({ x: x - (dx / l) * k + R(-0.08, 0.08), y: gy + R(0.15, 0.7), z: z - (dz / l) * k + R(-0.08, 0.08), vx: (-dx / l) * 0.6, vz: (-dz / l) * 0.6, drag: 3, life: R(0.3, 0.45), size: R(0.3, 0.42) * sc, size1: 0.1, color: col ?? pick(['#fff3dc', '#f8dfe4']), sprite: SPRITE.puff, alpha: 0.5 });
          this.spawn({ x: x - (dx / l) * k, y: gy + R(0.3, 1), z: z - (dz / l) * k, life: R(0.25, 0.4), size: R(0.1, 0.16), size1: 0.01, color: '#ffe7a0', sprite: SPRITE.sparkle, additive: true });
        }
        break;
      }
      case 'petals': {
        const rad = 6 * sc;
        for (let i = 0; i < n(70); i++) {
          const a = R(0, Math.PI * 2);
          const r = Math.sqrt(rnd()) * rad;
          this.spawn({ x: x + Math.cos(a) * r, y: gy + R(3.5, 6.5), z: z + Math.sin(a) * r, vy: R(-1.4, -0.8), vx: R(-0.3, 0.3), vz: R(-0.3, 0.3), flutter: R(0.8, 1.6), life: R(3.5, 5), size: R(0.13, 0.2), color: col ?? pick(PETALS), sprite: SPRITE.petal, spin: R(-2.5, 2.5), ground: gy + 0.02, fadeIn: 0.4 });
        }
        break;
      }
      case 'steam': {
        const dx = opts.dirX ?? 0;
        const dz = opts.dirZ ?? 0;
        const jet = Math.hypot(dx, dz) > 0.01;
        for (let i = 0; i < n(jet ? 14 : 8); i++) {
          const s = R(2.5, 5) * sc;
          this.spawn({
            x: x + R(-0.08, 0.08),
            y: (opts.y ?? gy + 0.4) + R(-0.05, 0.05),
            z: z + R(-0.08, 0.08),
            vx: jet ? dx * s + R(-0.3, 0.3) : R(-0.15, 0.15),
            vy: jet ? R(0.2, 0.8) : R(0.6, 1.2),
            vz: jet ? dz * s + R(-0.3, 0.3) : R(-0.15, 0.15),
            drag: jet ? 2.2 : 0.8,
            life: R(0.6, 1.1),
            size: R(0.18, 0.3) * sc,
            size1: R(0.6, 0.9) * sc,
            color: col ?? '#ffffff',
            alpha: 0.5,
            sprite: SPRITE.puff,
            spin: R(-1, 1),
          });
        }
        break;
      }
      case 'confetti': {
        for (let i = 0; i < n(60); i++) {
          const a = R(0, Math.PI * 2);
          const s = R(1, 3.4) * sc;
          this.spawn({ x, y, z, vx: Math.cos(a) * s, vy: R(3.5, 6.5), vz: Math.sin(a) * s, gravity: 4.5, drag: 1.4, flutter: 1.4, life: R(1.8, 2.8), size: R(0.1, 0.16), color: pick(PASTEL), sprite: SPRITE.confetti, spin: R(-12, 12), ground: gy + 0.02 });
        }
        break;
      }
      case 'stun': {
        const yy = opts.y ?? gy + 1.35;
        for (let i = 0; i < n(5); i++) {
          const a = (i / 5) * Math.PI * 2;
          this.spawn({ x: x + Math.cos(a) * 0.35, y: yy, z: z + Math.sin(a) * 0.35, cx: x, cz: z, swirl: 4.5, life: 1.4, size: 0.2, color: '#ffe066', sprite: SPRITE.star, spin: 3, fadeIn: 0.1, additive: false });
        }
        break;
      }
      case 'ring': {
        this.wave(x, z, col ?? '#ffd77a', 0.2, 4.2 * sc, 0.9, 0.22, gy);
        this.wave(x, z, '#f6b8c4', 0.1, 3.0 * sc, 1.1, 0.12, gy);
        for (let i = 0; i < n(30); i++) {
          const a = (i / 30) * Math.PI * 2;
          const s = R(3.5, 5) * sc;
          this.spawn({ x, y: gy + 0.3, z, vx: Math.cos(a) * s, vy: R(0.2, 1.2), vz: Math.sin(a) * s, drag: 2.5, life: R(0.6, 0.9), size: 0.18, size1: 0.02, color: col ?? pick(GOLD), sprite: SPRITE.sparkle, additive: true });
        }
        break;
      }
      case 'cloche': {
        this.spawn({ x, y, z, life: 0.45, size: 0.5 * sc, size1: 1.5 * sc, color: '#ffffff', sprite: SPRITE.glint, spin: 1.5, additive: true, fadeIn: 0 });
        for (let i = 0; i < n(14); i++) {
          const a = R(0, Math.PI * 2);
          this.spawn({ x, y, z, vx: Math.cos(a) * R(0.8, 2), vy: R(0.5, 2.5), vz: Math.sin(a) * R(0.8, 2), drag: 2.5, life: R(0.5, 0.9), size: R(0.1, 0.2), size1: 0.02, color: col ?? pick(['#ffffff', '#e8eef5', '#fff3c4']), sprite: SPRITE.sparkle, additive: true });
        }
        break;
      }
      case 'golden': {
        for (let i = 0; i < n(14); i++) {
          const a = R(0, Math.PI * 2);
          const r = R(0.2, 0.6);
          this.spawn({ x: x + Math.cos(a) * r, y: gy + R(0.1, 1.2), z: z + Math.sin(a) * r, cx: x, cz: z, swirl: R(1, 2), vy: R(0.5, 1.1), life: R(0.8, 1.4), size: R(0.08, 0.18), size1: 0.02, color: pick(GOLD), sprite: rnd() < 0.5 ? SPRITE.sparkle : SPRITE.dot, additive: true, fadeIn: 0.15 });
        }
        this.spawn({ x, y: gy + 0.7, z, life: 0.8, size: 1.6, size1: 2, color: '#ffcf5a', alpha: 0.35, sprite: SPRITE.dot, additive: true, fadeIn: 0.2 });
        break;
      }
      case 'splash': {
        this.wave(x, z, col ?? '#bfe6ff', 0.1, 1.4 * sc, 0.7, 0.1, gy);
        this.wave(x, z, '#ffffff', 0.05, 0.9 * sc, 0.9, 0.06, gy);
        for (let i = 0; i < n(18); i++) {
          const a = R(0, Math.PI * 2);
          const s = R(0.6, 1.8) * sc;
          this.spawn({ x, y: gy + 0.1, z, vx: Math.cos(a) * s, vy: R(2, 4), vz: Math.sin(a) * s, gravity: 10, life: R(0.5, 0.8), size: R(0.08, 0.15), color: col ?? pick(['#ffffff', '#dff2ff', '#f3e3c8']), sprite: SPRITE.drop, ground: gy, alpha: 0.9 });
        }
        break;
      }
    }
  }

  /** Petit nuage (colère d'une table, fumée). */
  puff(x: number, y: number, z: number, color: THREE.ColorRepresentation, size = 0.3, alpha = 0.7): void {
    this.spawn({ x, y, z, vx: (Math.random() - 0.5) * 0.3, vy: 0.5, vz: (Math.random() - 0.5) * 0.3, drag: 1.5, life: 0.9, size, size1: size * 1.8, color, alpha, sprite: SPRITE.puff, spin: (Math.random() - 0.5) * 2, fadeIn: 0.15 });
  }

  /** Étincelle isolée (reflets). */
  glint(x: number, y: number, z: number, size = 0.3, color: THREE.ColorRepresentation = '#ffffff'): void {
    this.spawn({ x, y, z, life: 0.5, size: size * 0.2, size1: size, color, sprite: SPRITE.glint, spin: 2, additive: true, fadeIn: 0.15 });
  }
}
