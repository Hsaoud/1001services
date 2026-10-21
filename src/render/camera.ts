/**
 * Caméra orthographique isométrique (lacet 45°, depuis +X+Z) : suivi amorti, bornes du salon,
 * secousses et mode vitrine (panoramique lent de l'écran titre).
 */
import * as THREE from 'three';
import { damp } from './kit';

const BASE_YAW = Math.PI / 4;
const BASE_ELEV = THREE.MathUtils.degToRad(47);
/** Hauteur visible (m) à 16:9 : assez serré pour lire les personnages, assez large pour anticiper. */
const BASE_VIEW_H = 14;
const DIST = 60;

export class CameraRig {
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 200);
  /** Axes écran en monde (mis à jour à chaque image). */
  readonly right = new THREE.Vector3();
  readonly up = new THREE.Vector3();
  /** Direction vers la caméra. */
  readonly toCam = new THREE.Vector3();
  /** Point visé au sol (après bornes et amorti). */
  readonly center = new THREE.Vector3();

  yaw = BASE_YAW;
  elevation = BASE_ELEV;
  viewH = BASE_VIEW_H;
  aspect = 16 / 9;
  /** Facteur de zoom (1 = cadrage de jeu ; < 1 = plus près). Réservé aux outils (lab). */
  zoom = 1;

  private goal = new THREE.Vector2();
  private cur = new THREE.Vector2();
  private bounds = { minX: 0, minZ: 0, maxX: 10, maxZ: 10, yLow: -0.8, yHigh: 2.6 };
  private shakeAmp = 0;
  private time = 0;
  private showcase = false;
  private showBlend = 0;
  private showT = 0;
  private baseViewH = BASE_VIEW_H;

  constructor() {
    this.camera.position.set(10, 10, 10);
  }

  /** Bornes du salon (en m) pour éviter de montrer trop de vide. */
  setBounds(minX: number, minZ: number, maxX: number, maxZ: number, yHigh = 2.6): void {
    this.bounds = { minX, minZ, maxX, maxZ, yLow: -0.9, yHigh };
  }

  follow(x: number, z: number, snap = false): void {
    this.goal.set(x, z);
    if (snap) this.cur.set(x, z);
  }

  shake(amount: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, Math.max(0, Math.min(1, amount)));
  }

  setShowcase(on: boolean): void {
    if (on && !this.showcase) this.showT = 0;
    this.showcase = on;
  }

  resize(w: number, h: number): void {
    this.aspect = Math.max(0.2, w / Math.max(1, h));
    // garde une largeur visible confortable sur les écrans étroits
    this.baseViewH = Math.max(BASE_VIEW_H, Math.min(22, 22 / this.aspect));
  }

  /** Pixels (du tampon de rendu) par mètre à l'écran. */
  pixelsPerUnit(bufferHeight: number): number {
    return bufferHeight / this.viewH;
  }

  update(dt: number): void {
    this.time += dt;
    const sb = (this.showBlend = damp(this.showBlend, this.showcase ? 1 : 0, 1.6, dt));
    if (this.showcase) this.showT += dt;
    const st = this.showT;
    this.yaw = BASE_YAW + sb * 0.12 * Math.sin(st * 0.07);
    this.elevation = BASE_ELEV + sb * THREE.MathUtils.degToRad(3) * Math.sin(st * 0.05 + 1);
    const b = this.bounds;
    const sw = b.maxX - b.minX;
    const sd = b.maxZ - b.minZ;
    this.computeAxes();
    // étendue du salon à l'écran
    let minSx = Infinity;
    let maxSx = -Infinity;
    let minSy = Infinity;
    let maxSy = -Infinity;
    const R = this.right;
    const U = this.up;
    for (const x of [b.minX, b.maxX])
      for (const y of [b.yLow, b.yHigh])
        for (const z of [b.minZ, b.maxZ]) {
          const px = x * R.x + y * R.y + z * R.z;
          const py = x * U.x + y * U.y + z * U.z;
          minSx = Math.min(minSx, px);
          maxSx = Math.max(maxSx, px);
          minSy = Math.min(minSy, py);
          maxSy = Math.max(maxSy, py);
        }
    // petits salons : cadrage resserré (le salon entier reste visible, plus lisible)
    const fit = Math.max(maxSy - minSy + 0.6, (maxSx - minSx + 0.8) / this.aspect);
    const gameH = Math.max(11, Math.min(this.baseViewH, fit));
    // vitrine : cadre un peu plus serré, sauf petits salons montrés en entier
    const showH = Math.min(this.baseViewH * 0.85, Math.max(9, (sw + sd) * 0.42));
    this.viewH = THREE.MathUtils.lerp(gameH * this.zoom, showH, sb);

    // cible : suivi amorti, ou parcours lent en vitrine
    this.cur.x = damp(this.cur.x, this.goal.x, 4.2, dt);
    this.cur.y = damp(this.cur.y, this.goal.y, 4.2, dt);
    let tx = this.cur.x;
    let tz = this.cur.y;
    if (sb > 0.001) {
      const cx = (b.minX + b.maxX) / 2;
      const cz = (b.minZ + b.maxZ) / 2;
      const ax = Math.sin(st * 0.055) * sw * 0.3;
      const az = Math.sin(st * 0.041 + 1.3) * sd * 0.26;
      tx = THREE.MathUtils.lerp(tx, cx + ax, sb);
      tz = THREE.MathUtils.lerp(tz, cz + az, sb);
    }
    // bornes en espace écran
    const hw = (this.viewH * this.aspect) / 2;
    const hh = this.viewH / 2;
    const margin = 1.4;
    let sx = tx * R.x + tz * R.z;
    let sy = tx * U.x + tz * U.z;
    const lo = minSx + hw - margin;
    const hi = maxSx - hw + margin;
    sx = lo > hi ? (minSx + maxSx) / 2 : Math.max(lo, Math.min(hi, sx));
    const loY = minSy + hh - margin;
    const hiY = maxSy - hh + margin * 0.6;
    sy = loY > hiY ? (minSy + maxSy) / 2 : Math.max(loY, Math.min(hiY, sy));
    // secousse
    this.shakeAmp *= Math.exp(-5.5 * dt);
    if (this.shakeAmp < 0.002) this.shakeAmp = 0;
    const a = this.shakeAmp * 0.32;
    const t = this.time;
    sx += a * (Math.sin(t * 47.3) * 0.6 + Math.sin(t * 83.1 + 1.7) * 0.4);
    sy += a * (Math.sin(t * 53.9 + 0.4) * 0.6 + Math.sin(t * 71.7 + 2.1) * 0.4);
    // retour au sol : t·R = sx, t·U = sy (y = 0)
    const se = Math.sin(this.elevation);
    const bb = -sy / se;
    const cy = Math.cos(this.yaw);
    const sy2 = Math.sin(this.yaw);
    const gx = sx * cy + bb * sy2;
    const gz = -sx * sy2 + bb * cy;
    this.center.set(gx, 0, gz);

    const cam = this.camera;
    cam.position.copy(this.center).addScaledVector(this.toCam, DIST);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.center);
    if (cam.top !== hh || cam.right !== hw) {
      cam.left = -hw;
      cam.right = hw;
      cam.top = hh;
      cam.bottom = -hh;
      cam.near = 0.5;
      cam.far = DIST * 2 + 40;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
  }

  private computeAxes(): void {
    const ce = Math.cos(this.elevation);
    const se = Math.sin(this.elevation);
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    this.toCam.set(sy * ce, se, cy * ce);
    this.right.set(cy, 0, -sy);
    this.up.set(-se * sy, ce, -se * cy);
  }

  /** Demi-largeur / demi-hauteur visibles (m). */
  get halfW(): number {
    return (this.viewH * this.aspect) / 2;
  }

  get halfH(): number {
    return this.viewH / 2;
  }
}
