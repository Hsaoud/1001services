/**
 * Guidage : fines particules (poussière dorée, volutes de café, pétales) qui dérivent du joueur
 * vers les cibles prioritaires (au plus 3), discrètes mais lisibles.
 */
import type { Vec2 } from '../types';
import type { FxSystem } from './fx';
import { SPRITE } from './textures';

export class GuideLayer {
  private from: Vec2 = { x: 0, z: 0 };
  private targets: Vec2[] = [];
  private acc: number[] = [0, 0, 0];
  private enabled = false;

  constructor(private fx: FxSystem) {}

  set(from: Vec2, targets: readonly Vec2[]): void {
    this.from = { x: from.x, z: from.z };
    this.targets = targets.slice(0, 3).map((t) => ({ x: t.x, z: t.z }));
    this.enabled = this.targets.length > 0;
  }

  clear(): void {
    this.targets = [];
    this.enabled = false;
  }

  update(dt: number): void {
    if (!this.enabled) return;
    const fx = this.fx;
    const gy = fx.groundAt(this.from.x, this.from.z);
    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i];
      const dx = t.x - this.from.x;
      const dz = t.z - this.from.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.2) continue;
      // la cible la plus urgente (index 0) émet un peu plus
      const rate = i === 0 ? 7 : 4.5;
      this.acc[i] += dt * rate;
      while (this.acc[i] >= 1) {
        this.acc[i] -= 1;
        const nx = dx / dist;
        const nz = dz / dist;
        const speed = 1.7 + Math.random() * 0.5;
        // parcours limité : indique la direction sans traverser toute la salle
        const travel = Math.min(dist - 0.6, 3.6 + Math.random() * 1.2);
        const life = travel / speed;
        const side = (Math.random() - 0.5) * 0.5;
        const start = 0.45 + Math.random() * 0.25;
        const roll = Math.random();
        const x = this.from.x + nx * start - nz * side;
        const z = this.from.z + nz * start + nx * side;
        if (roll < 0.62) {
          fx.spawn({
            x,
            y: gy + 0.55 + Math.random() * 0.45,
            z,
            vx: nx * speed,
            vz: nz * speed,
            vy: 0.08,
            life,
            size: 0.09 + Math.random() * 0.06,
            size1: 0.03,
            color: i === 0 ? '#ffd877' : '#ffe9b0',
            alpha: 0.85,
            sprite: SPRITE.dot,
            flutter: 0.35,
            additive: true,
            fadeIn: 0.25,
          });
        } else if (roll < 0.85) {
          fx.spawn({
            x,
            y: gy + 0.7 + Math.random() * 0.3,
            z,
            vx: nx * speed * 0.85,
            vz: nz * speed * 0.85,
            vy: 0.12,
            life,
            size: 0.13,
            size1: 0.3,
            color: '#c9a07a',
            alpha: 0.32,
            sprite: SPRITE.swirl,
            spin: 1.5,
            fadeIn: 0.3,
          });
        } else {
          fx.spawn({
            x,
            y: gy + 0.8 + Math.random() * 0.3,
            z,
            vx: nx * speed * 0.9,
            vz: nz * speed * 0.9,
            vy: -0.05,
            life,
            size: 0.11,
            color: '#f8c3cf',
            alpha: 0.85,
            sprite: SPRITE.petal,
            spin: 2,
            flutter: 0.8,
            fadeIn: 0.3,
          });
        }
      }
    }
  }
}
