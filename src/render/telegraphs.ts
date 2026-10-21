/**
 * Télégraphes au sol : cercles, anneaux, lignes, cônes, croix. Contour net + liseré sombre pour
 * le contraste sur tous les sols, remplissage qui progresse, pulsation qui s'accélère vers 1,
 * zone active rayée, flaques persistantes brillantes (sirop ambré, cire bleutée).
 */
import * as THREE from 'three';
import type { Telegraph, TelegraphTone } from '../types';
import { SHARED } from './mats';

const VERT = /* glsl */ `
  uniform vec2 uSize;
  varying vec2 vP;
  void main() {
    vP = position.xz * uSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform int uType;       // 0 cercle, 1 anneau, 2 ligne, 3 cône, 4 croix
  uniform vec4 uA;         // paramètres de forme
  uniform float uProgress;
  uniform float uActive;
  uniform float uPersist;
  uniform float uFade;
  uniform float uTime;
  uniform float uSeed;
  uniform vec3 uCol;
  uniform vec3 uDark;
  varying vec2 vP;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }

  void main() {
    vec2 p = vP;
    float d = 0.0;      // distance signée au bord (< 0 dedans)
    float fillD = 0.0;  // < 0 : dans la partie remplie
    float along = 0.0;  // coordonnée de progression (0..1) pour le front
    float prog = clamp(uProgress, 0.0, 1.0);
    if (uType == 0) {
      float r = length(p);
      d = r - uA.x;
      along = r / max(uA.x, 1e-3);
      fillD = r - prog * uA.x;
    } else if (uType == 1) {
      float r = length(p);
      float mid = (uA.x + uA.y) * 0.5;
      float hw = (uA.y - uA.x) * 0.5;
      d = abs(r - mid) - hw;
      along = (r - uA.x) / max(uA.y - uA.x, 1e-3);
      fillD = r - (uA.x + (uA.y - uA.x) * prog);
    } else if (uType == 2) {
      float L = uA.x;
      float hw = uA.y;
      vec2 q = vec2(p.x - clamp(p.x, -L * 0.5, L * 0.5), p.y);
      d = length(q) - hw;
      along = (p.x + L * 0.5) / max(L, 1e-3);
      fillD = p.x - (-L * 0.5 + L * prog);
    } else if (uType == 3) {
      float r = length(p);
      float a = abs(atan(p.x, p.y));
      float d1 = r - uA.x;
      float d2 = (a - uA.y) * max(r, 0.05);
      d = max(d1, d2);
      along = r / max(uA.x, 1e-3);
      fillD = r - prog * uA.x;
    } else {
      float L = uA.x;
      float hw = uA.y;
      d = min(sdBox(p, vec2(L, hw)), sdBox(p, vec2(hw, L)));
      float m = max(abs(p.x), abs(p.y));
      along = m / max(L, 1e-3);
      fillD = m - prog * L;
    }

    float aa = fwidth(d) * 1.2 + 0.004;
    float t = uTime;
    vec3 col = uCol;
    float alpha = 0.0;

    if (uPersist > 0.5) {
      // flaque brillante aux bords organiques
      float n = noise(p * 2.2 + uSeed) - 0.5;
      float wob = sin(atan(p.y, p.x) * 5.0 + t * 0.4 + uSeed) * 0.03;
      float dd = d + n * 0.18 + wob;
      float inside = 1.0 - smoothstep(-aa, aa, dd);
      float rim = smoothstep(-0.12, -0.01, dd) * inside;
      float spec = smoothstep(0.68, 0.82, noise(p * 1.6 + vec2(t * 0.08, -t * 0.05) + uSeed * 3.0));
      float sheen = smoothstep(0.2, 0.9, dot(normalize(p + 1e-4), normalize(vec2(-0.7, -0.7)))) * smoothstep(-0.35, -0.05, dd);
      col = mix(uCol, uDark, rim * 0.55);
      col += vec3(1.0) * (spec * 0.55 + sheen * 0.35);
      alpha = inside * (0.82 + spec * 0.15) * uFade;
      // ombre portée douce sous le bord
      float shadow = (1.0 - smoothstep(0.0, 0.08, dd)) * (1.0 - inside) * 0.25;
      col = mix(col, uDark * 0.4, shadow / max(alpha + shadow, 1e-3));
      alpha = max(alpha, shadow * uFade);
    } else {
      float freq = mix(3.5, 17.0, prog * prog);
      float pulse = 0.5 + 0.5 * sin(t * freq);
      float inside = 1.0 - smoothstep(-aa, aa, d);
      // contour net + liseré sombre extérieur (contraste sur les sols clairs)
      float lineW = 0.055;
      float outline = 1.0 - smoothstep(lineW - aa, lineW + aa, abs(d + lineW));
      float darkRim = (1.0 - smoothstep(0.0, 0.11, d)) * step(0.0, d);
      // remplissage
      float filled = (1.0 - smoothstep(-aa, aa, fillD)) * inside;
      float front = (1.0 - smoothstep(0.0, 0.1, abs(fillD))) * inside * step(0.001, prog) * (1.0 - step(0.999, prog));
      float base = inside * (0.24 + 0.1 * pulse);
      float fillA = filled * (0.5 + 0.18 * pulse + 0.2 * prog);
      // hachures fines dans la zone à venir (lisibles même sur sol chargé)
      float hatch = smoothstep(0.55, 0.75, sin((p.x - p.y) * 14.0) * 0.5 + 0.5) * inside * (1.0 - filled) * 0.22;
      // zone active : rayures animées
      float stripes = 0.0;
      if (uActive > 0.5) {
        stripes = smoothstep(0.3, 0.7, sin((p.x + p.y) * 9.0 - t * 7.0) * 0.5 + 0.5) * inside;
        base = inside * 0.55;
        fillA = 0.0;
        hatch = 0.0;
      }
      float flash = smoothstep(0.85, 1.0, prog) * (0.5 + 0.5 * sin(t * 30.0)) * inside * 0.3;
      alpha = max(max(base + hatch, fillA), outline);
      alpha = max(alpha, front);
      alpha = max(alpha, stripes * 0.85);
      alpha = max(alpha, darkRim * 0.6);
      alpha += flash;
      col = uCol * (1.0 + 0.2 * pulse * filled + front * 0.5 + stripes * 0.25);
      col = mix(col, uDark, max(darkRim * (1.0 - outline), hatch * 2.0) * 0.9);
      col = mix(col, vec3(1.0), flash);
      alpha *= uFade;
    }
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const TONES: Record<TelegraphTone, { col: string; dark: string; puddle: string; puddleDark: string }> = {
  pink: { col: '#ff3f82', dark: '#8c1840', puddle: '#f06e98', puddleDark: '#9c2c52' },
  gold: { col: '#ffb21a', dark: '#7a4a00', puddle: '#d17c12', puddleDark: '#6e3604' },
  cream: { col: '#fff6e0', dark: '#5e4426', puddle: '#fff3dc', puddleDark: '#a88a60' },
  blue: { col: '#3d9dff', dark: '#123f78', puddle: '#d2e8fa', puddleDark: '#6f98bf' },
};

interface Entry {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  id: number;
  fade: number;
  alive: boolean;
  seen: boolean;
}

const MARGIN = 0.2;

export class TelegraphLayer {
  readonly group = new THREE.Group();
  private entries = new Map<number, Entry>();
  private pool: Entry[] = [];
  private geo: THREE.PlaneGeometry;
  groundMax: (x0: number, z0: number, x1: number, z1: number) => number = () => 0;

  constructor(parent: THREE.Object3D) {
    parent.add(this.group);
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.geo.rotateX(-Math.PI / 2);
  }

  private make(): Entry {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uSize: { value: new THREE.Vector2(1, 1) },
        uType: { value: 0 },
        uA: { value: new THREE.Vector4() },
        uProgress: { value: 0 },
        uActive: { value: 0 },
        uPersist: { value: 0 },
        uFade: { value: 0 },
        uTime: SHARED.uTime,
        uSeed: { value: 0 },
        uCol: { value: new THREE.Color() },
        uDark: { value: new THREE.Color() },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return { mesh, mat, id: -1, fade: 0, alive: false, seen: false };
  }

  sync(list: readonly Telegraph[]): void {
    for (const e of this.entries.values()) e.seen = false;
    for (const t of list) {
      let e = this.entries.get(t.id);
      if (!e) {
        e = this.pool.pop() ?? this.make();
        e.id = t.id;
        e.fade = 0;
        e.mesh.visible = true;
        this.entries.set(t.id, e);
      }
      e.seen = true;
      e.alive = true;
      this.apply(e, t);
    }
    for (const e of this.entries.values()) if (!e.seen) e.alive = false;
  }

  private apply(e: Entry, t: Telegraph): void {
    const u = e.mat.uniforms;
    const s = t.shape;
    const m = e.mesh;
    const tone = TONES[t.tone] ?? TONES.pink;
    const persist = !!t.persistent;
    (u.uCol.value as THREE.Color).set(persist ? tone.puddle : tone.col);
    (u.uDark.value as THREE.Color).set(persist ? tone.puddleDark : tone.dark);
    u.uProgress.value = t.progress;
    u.uActive.value = t.active ? 1 : 0;
    u.uPersist.value = persist ? 1 : 0;
    u.uSeed.value = (t.id * 7.31) % 13;
    let cx = 0;
    let cz = 0;
    let sx = 1;
    let sz = 1;
    let rot = 0;
    const A = u.uA.value as THREE.Vector4;
    switch (s.type) {
      case 'circle':
        u.uType.value = 0;
        A.set(s.r, 0, 0, 0);
        cx = s.x;
        cz = s.z;
        sx = sz = 2 * (s.r + MARGIN + (persist ? 0.15 : 0));
        break;
      case 'ring':
        u.uType.value = 1;
        A.set(Math.min(s.r0, s.r1), Math.max(s.r0, s.r1), 0, 0);
        cx = s.x;
        cz = s.z;
        sx = sz = 2 * (Math.max(s.r0, s.r1) + MARGIN);
        break;
      case 'line': {
        u.uType.value = 2;
        const dx = s.bx - s.ax;
        const dz = s.bz - s.az;
        const L = Math.hypot(dx, dz);
        A.set(L, s.width / 2, 0, 0);
        cx = (s.ax + s.bx) / 2;
        cz = (s.az + s.bz) / 2;
        rot = Math.atan2(-dz, dx);
        sx = L + s.width + MARGIN * 2;
        sz = s.width + MARGIN * 2 + (persist ? 0.3 : 0);
        break;
      }
      case 'cone':
        u.uType.value = 3;
        A.set(s.length, s.spread, 0, 0);
        cx = s.x;
        cz = s.z;
        rot = s.angle;
        sx = sz = 2 * (s.length + MARGIN);
        break;
      case 'cross':
        u.uType.value = 4;
        A.set(s.length, s.width / 2, 0, 0);
        cx = s.x;
        cz = s.z;
        sx = sz = 2 * (s.length + MARGIN);
        break;
    }
    (u.uSize.value as THREE.Vector2).set(sx, sz);
    m.scale.set(sx, 1, sz);
    m.rotation.y = rot;
    const ext = Math.max(sx, sz) / 2;
    const y = this.groundMax(cx - ext, cz - ext, cx + ext, cz + ext);
    m.position.set(cx, y + 0.02 + (t.id % 8) * 0.0015, cz);
  }

  update(dt: number): void {
    for (const [id, e] of this.entries) {
      e.fade += ((e.alive ? 1 : 0) - e.fade) * (1 - Math.exp(-(e.alive ? 14 : 10) * dt));
      e.mat.uniforms.uFade.value = e.fade;
      if (!e.alive && e.fade < 0.02) {
        e.mesh.visible = false;
        this.entries.delete(id);
        this.pool.push(e);
      }
    }
  }

  clear(): void {
    for (const e of this.entries.values()) {
      e.mesh.visible = false;
      this.pool.push(e);
    }
    this.entries.clear();
  }

  dispose(): void {
    this.clear();
    for (const e of this.pool) e.mat.dispose();
    this.geo.dispose();
    this.group.removeFromParent();
  }
}
