/**
 * Lueurs additives en points (flammes de bougies, halos de lampes, éclats de cristal) animées
 * dans le shader, et petit réservoir de vraies PointLights (nombre fixe : pas de recompilation).
 */
import * as THREE from 'three';
import { glowTexture, spriteAtlas } from './textures';
import { SHARED } from './mats';

/** Uniformes partagés des systèmes de points (pixels par mètre à l'écran). */
export const POINTS_SHARED = {
  uPx: { value: 60 },
};

/** 0 = fixe, 1 = flamme vacillante, 2 = scintillement de cristal, 3 = respiration lente. */
export type GlowMode = 0 | 1 | 2 | 3;

const VERT = /* glsl */ `
  attribute float aSize;
  attribute vec4 aCol;
  attribute vec2 aMode; // mode, phase
  uniform float uPx;
  uniform float uTime;
  uniform float uBoost;
  varying vec4 vCol;
  varying float vSpark;
  void main() {
    float m = aMode.x;
    float ph = aMode.y;
    float k = 1.0;
    float sp = 0.0;
    if (m > 0.5 && m < 1.5) {
      k = 0.82 + 0.12 * sin(uTime * 11.0 + ph * 7.0) + 0.08 * sin(uTime * 23.0 + ph * 3.0);
    } else if (m > 1.5 && m < 2.5) {
      float t = fract(uTime * 0.35 + ph);
      sp = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.05, 0.18, t));
      k = 0.35 + 1.6 * sp;
    } else if (m > 2.5) {
      k = 0.75 + 0.25 * sin(uTime * 1.6 + ph * 6.28);
    }
    vCol = vec4(aCol.rgb * k * uBoost, aCol.a);
    vSpark = sp;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPx * (0.85 + 0.3 * k);
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uTex;
  uniform sampler2D uAtlas;
  varying vec4 vCol;
  varying float vSpark;
  void main() {
    vec2 uv = vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y);
    float a = texture2D(uTex, uv).a;
    // étoile d'éclat (case 15 de l'atlas) pour les cristaux
    vec2 auv = (uv + vec2(3.0, 0.0)) / 4.0;
    float s = texture2D(uAtlas, auv).a * vSpark;
    gl_FragColor = vec4(vCol.rgb * (a + s * 1.5), 1.0) * vCol.a;
  }
`;

/** Collection de lueurs statiques (dans le repère de son parent). */
export class GlowPoints {
  private pos: number[] = [];
  private col: number[] = [];
  private size: number[] = [];
  private mode: number[] = [];
  points: THREE.Points | null = null;
  readonly uniforms = { uBoost: { value: 1 } };

  add(x: number, y: number, z: number, color: THREE.ColorRepresentation, size: number, mode: GlowMode = 0, intensity = 1, phase = Math.random()): void {
    const c = new THREE.Color(color);
    this.pos.push(x, y, z);
    this.col.push(c.r * intensity, c.g * intensity, c.b * intensity, 1);
    this.size.push(size);
    this.mode.push(mode, phase);
  }

  get count(): number {
    return this.size.length;
  }

  build(parent: THREE.Object3D): THREE.Points | null {
    if (this.size.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(this.col, 4));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(this.size, 1));
    g.setAttribute('aMode', new THREE.Float32BufferAttribute(this.mode, 2));
    g.computeBoundingSphere();
    if (g.boundingSphere) g.boundingSphere.radius += 1;
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uPx: POINTS_SHARED.uPx,
        uTime: SHARED.uTime,
        uBoost: this.uniforms.uBoost,
        uTex: { value: glowTexture() },
        uAtlas: { value: spriteAtlas() },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const p = new THREE.Points(g, m);
    p.frustumCulled = true;
    p.renderOrder = 5;
    parent.add(p);
    this.points = p;
    return p;
  }

  dispose(): void {
    if (!this.points) return;
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.points.removeFromParent();
    this.points = null;
  }
}

// ─────────────────────────────────────────── Réservoir de lumières

interface LightRequest {
  x: number;
  y: number;
  z: number;
  color: THREE.Color;
  intensity: number;
  distance: number;
  priority: number;
}

/** Quelques PointLights réelles attribuées chaque image aux demandes les plus prioritaires. */
export class LightPool {
  readonly lights: THREE.PointLight[] = [];
  private requests: LightRequest[] = [];
  private free: LightRequest[] = [];

  constructor(parent: THREE.Object3D, count = 3) {
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight('#ffd9a0', 0, 4, 2);
      l.castShadow = false;
      parent.add(l);
      this.lights.push(l);
    }
  }

  request(x: number, y: number, z: number, color: THREE.ColorRepresentation, intensity: number, distance: number, priority: number): void {
    if (intensity <= 0.01) return;
    const r = this.free.pop() ?? { x: 0, y: 0, z: 0, color: new THREE.Color(), intensity: 0, distance: 0, priority: 0 };
    r.x = x;
    r.y = y;
    r.z = z;
    r.color.set(color);
    r.intensity = intensity;
    r.distance = distance;
    r.priority = priority;
    this.requests.push(r);
  }

  /** Attribue les lumières (priorité pondérée par la proximité du centre de l'écran). */
  flush(cx: number, cz: number): void {
    for (const r of this.requests) r.priority -= Math.hypot(r.x - cx, r.z - cz) * 0.08;
    this.requests.sort((a, b) => b.priority - a.priority);
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      const r = this.requests[i];
      if (r) {
        l.position.set(r.x, r.y, r.z);
        l.color.copy(r.color);
        l.intensity = r.intensity;
        l.distance = r.distance;
      } else l.intensity = 0;
    }
    for (const r of this.requests) this.free.push(r);
    this.requests.length = 0;
  }

  clear(): void {
    for (const l of this.lights) l.intensity = 0;
    this.requests.length = 0;
  }
}
