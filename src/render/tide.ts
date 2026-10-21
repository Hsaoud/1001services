/**
 * Marée de mousse de cappuccino (mode Coup de Feu) : nappe crémeuse tourbillonnante (crème,
 * caramel, motifs de latte art) parsemée de bulles dorées, qui s'étend depuis l'origine avec
 * un bord bouillonnant ; limitée à l'emprise du salon.
 */
import * as THREE from 'three';
import type { SalonLayout, TideViewState } from '../types';
import { CELL } from '../types';

const NOISE = /* glsl */ `
  float th(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float tn(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(th(i), th(i + vec2(1, 0)), u.x), mix(th(i + vec2(0, 1)), th(i + vec2(1, 1)), u.x), u.y);
  }
  float tfbm(vec2 p) {
    float s = 0.0; float a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * tn(p); p *= 2.03; a *= 0.5; }
    return s;
  }
`;

const VERT = /* glsl */ `
  uniform vec2 uOrigin;
  uniform float uRadius;
  uniform float uTime;
  uniform sampler2D uMask;
  uniform vec2 uGrid;
  varying vec3 vW;
  varying vec3 vN;
  varying float vEdge;
  ${NOISE}
  float edgeR(vec2 p) {
    vec2 d = p - uOrigin;
    float a = atan(d.y, d.x);
    return uRadius + 0.35 * sin(a * 7.0 + uTime * 1.3) + 0.25 * sin(a * 13.0 - uTime * 2.1) + (tn(p * 1.3 + uTime * 0.4) - 0.5) * 0.6;
  }
  float mask(vec2 p) {
    return texture2D(uMask, p / uGrid).r;
  }
  float hgt(vec2 p) {
    float d = length(p - uOrigin);
    float e = edgeR(p);
    float body = smoothstep(e + 0.15, e - 1.1, d);
    float bumps = (tn(p * 2.2 + vec2(uTime * 0.3, -uTime * 0.2)) - 0.5) * 0.08;
    return (0.36 + bumps) * body * mask(p);
  }
  void main() {
    vec2 p = position.xz;
    float h = hgt(p);
    float e = 0.12;
    float hx = hgt(p + vec2(e, 0.0)) - hgt(p - vec2(e, 0.0));
    float hz = hgt(p + vec2(0.0, e)) - hgt(p - vec2(0.0, e));
    vN = normalize(vec3(-hx, 2.0 * e, -hz));
    vec3 w = vec3(p.x, h + 0.005, p.y);
    vW = w;
    vEdge = length(p - uOrigin) - edgeR(p);
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec2 uOrigin;
  uniform float uTime;
  uniform sampler2D uMask;
  uniform vec2 uGrid;
  varying vec3 vW;
  varying vec3 vN;
  varying float vEdge;
  ${NOISE}
  void main() {
    if (vEdge > 0.12) discard;
    if (texture2D(uMask, vW.xz / uGrid).r < 0.5) discard;
    vec2 p = vW.xz;
    vec2 d = p - uOrigin;
    float r = length(d);
    float a = atan(d.y, d.x);
    // tourbillon de latte art
    vec2 sw = vec2(cos(a + r * 0.35 - uTime * 0.25), sin(a + r * 0.35 - uTime * 0.25)) * r;
    float n = tfbm(sw * 0.45 + uTime * 0.05);
    float rosette = sin(r * 1.6 - uTime * 0.9 + n * 4.0) * 0.5 + 0.5;
    vec3 latte = vec3(0.78, 0.58, 0.36);
    vec3 milk = vec3(0.95, 0.88, 0.76);
    vec3 caramel = vec3(0.46, 0.22, 0.07);
    vec3 col = mix(latte, milk, smoothstep(0.42, 0.78, rosette));
    col = mix(col, caramel, smoothstep(0.6, 0.85, n) * 0.65);
    // bulles dorées
    vec2 bp = p * 3.2 + vec2(0.0, uTime * 0.15);
    vec2 bi = floor(bp);
    vec2 bf = fract(bp) - 0.5;
    float bh = th(bi);
    vec2 bo = vec2(th(bi + 3.1), th(bi + 7.7)) - 0.5;
    float bubble = 0.0;
    if (bh > 0.7) {
      float rr = 0.1 + 0.12 * fract(bh * 13.0);
      float bd = length(bf - bo * 0.5);
      bubble = smoothstep(rr, rr - 0.04, bd) - smoothstep(rr - 0.05, rr - 0.09, bd) * 0.6;
    }
    // éclairage doux
    vec3 L = normalize(vec3(-0.4, 1.0, 0.55));
    float diff = 0.5 + 0.5 * max(dot(normalize(vN), L), 0.0);
    col *= diff;
    col += vec3(1.0, 0.78, 0.38) * bubble * 0.85;
    // bord : crête de mousse blanche puis liseré caramel
    float crest = smoothstep(-0.7, -0.15, vEdge) * (1.0 - smoothstep(-0.15, 0.08, vEdge));
    float rimDark = smoothstep(-0.12, 0.06, vEdge);
    col = mix(col, milk * 1.08, crest * 0.75);
    col = mix(col, caramel * 0.9, rimDark * 0.7);
    float alpha = 1.0 - smoothstep(0.02, 0.12, vEdge);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class TideLayer {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private mat: THREE.ShaderMaterial | null = null;
  private maskTex: THREE.DataTexture | null = null;
  private level = 0;
  private state: TideViewState | null = null;

  constructor(parent: THREE.Object3D) {
    parent.add(this.group);
  }

  /** Prépare la nappe pour un salon (grille + masque d'emprise). */
  setSalon(layout: SalonLayout | null): void {
    this.disposeMesh();
    if (!layout) return;
    const W = layout.width;
    const D = layout.depth;
    const data = new Uint8Array(W * D * 4);
    for (let i = 0; i < W * D; i++) {
      const c = layout.cells[i];
      const v = c === CELL.FLOOR || c === CELL.RAIL ? 255 : 0;
      data[i * 4] = v;
      data[i * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, W, D, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    this.maskTex = tex;
    const res = Math.max(1, Math.min(3, Math.floor(Math.sqrt(36000 / (W * D)))));
    const geo = new THREE.PlaneGeometry(W, D, W * res, D * res);
    geo.rotateX(-Math.PI / 2);
    geo.translate(W / 2, 0, D / 2);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uOrigin: { value: new THREE.Vector2() },
        uRadius: { value: 0 },
        uTime: { value: 0 },
        uMask: { value: tex },
        uGrid: { value: new THREE.Vector2(W, D) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: true,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
    this.group.add(this.mesh);
  }

  set(state: TideViewState | null): void {
    this.state = state && state.active ? state : null;
  }

  update(dt: number): void {
    if (!this.mesh || !this.mat) return;
    const s = this.state;
    const target = s ? Math.max(0, s.radius) : 0;
    // le rayon visuel suit la simulation (avec un léger amorti) ; reflux doux quand inactif
    this.level += (target - this.level) * (1 - Math.exp(-(s ? 8 : 2.5) * dt));
    const u = this.mat.uniforms;
    if (s) {
      (u.uOrigin.value as THREE.Vector2).set(s.origin.x, s.origin.z);
      u.uTime.value = s.t;
    } else u.uTime.value += dt;
    u.uRadius.value = this.level;
    this.mesh.visible = this.level > 0.05;
  }

  private disposeMesh(): void {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.removeFromParent();
    }
    this.mat?.dispose();
    this.maskTex?.dispose();
    this.mesh = null;
    this.mat = null;
    this.maskTex = null;
    this.level = 0;
  }

  dispose(): void {
    this.disposeMesh();
    this.group.removeFromParent();
  }
}
