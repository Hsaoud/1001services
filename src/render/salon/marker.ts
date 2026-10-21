/**
 * Anneau doré au sol (table / comptoir / guéridon à portée) : contour arrondi doux,
 * reflets qui tournent, intensité pilotée par `highlight` (0..1).
 */
import * as THREE from 'three';
import { SHARED } from '../mats';

const VERT = /* glsl */ `
  uniform vec2 uScale;
  varying vec2 vP;
  void main() {
    vP = position.xz * uScale;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec2 uHalf;     // demi-taille du contour (m)
  uniform float uRadius;  // rayon des coins
  uniform float uA;
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vP;
  float sdRound(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  void main() {
    float d = sdRound(vP, uHalf, uRadius);
    float edge = 1.0 - smoothstep(0.025, 0.055, abs(d));
    float halo = (1.0 - smoothstep(0.0, 0.3, abs(d + 0.05))) * 0.3;
    float inside = d < 0.0 ? smoothstep(-0.5, 0.0, d) * 0.12 : 0.0;
    // reflets tournants le long du contour
    float ang = atan(vP.y, vP.x);
    float sweep = pow(0.5 + 0.5 * cos(ang * 3.0 - uTime * 2.2), 6.0);
    float pulse = 0.85 + 0.15 * sin(uTime * 4.0);
    float a = (edge * (0.75 + 0.6 * sweep) + halo + inside) * uA * pulse;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor * (1.0 + sweep * 0.6), a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

let planeGeo: THREE.BufferGeometry | null = null;

export class Marker {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private level = 0;

  /** `hw`, `hd` : demi-dimensions du contour ; `radius` : rayon des coins (= hw pour un cercle). */
  constructor(hw: number, hd: number, radius: number, color: THREE.ColorRepresentation = '#ffd36b') {
    if (!planeGeo) {
      planeGeo = new THREE.PlaneGeometry(1, 1);
      planeGeo.rotateX(-Math.PI / 2);
      planeGeo.userData.shared = true;
    }
    const sx = hw * 2 + 0.8;
    const sz = hd * 2 + 0.8;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uScale: { value: new THREE.Vector2(sx, sz) },
        uHalf: { value: new THREE.Vector2(hw, hd) },
        uRadius: { value: Math.min(radius, hw, hd) },
        uA: { value: 0 },
        uTime: SHARED.uTime,
        uColor: { value: new THREE.Color(color) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    this.mesh = new THREE.Mesh(planeGeo, this.mat);
    this.mesh.scale.set(sx, 1, sz);
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
  }

  /** Met à jour l'intensité (amortie). */
  update(target: number, dt: number): void {
    const k = 1 - Math.exp(-10 * dt);
    this.level += (Math.max(0, Math.min(1, target)) - this.level) * k;
    this.mat.uniforms.uA.value = this.level;
    this.mesh.visible = this.level > 0.01;
  }

  dispose(): void {
    this.mat.dispose();
    this.mesh.removeFromParent();
  }
}
