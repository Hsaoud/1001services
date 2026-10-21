/**
 * Pièges des cloches en argent : chaque piège dessine sa zone au sol (rose / doré), laisse le temps
 * de Dasher hors de la zone, puis déclenche son effet.
 */
import type { TrapKind } from '../../types';
import type { HazardCtx } from './context';
import { TelegraphSet } from './context';
import { Strike } from './strike';
import { TAU, circle, cross, dist, line, ring } from './util';

/** Rayons et dimensions des pièges (u). */
export const TRAP_DIMS = {
  chantillyR: 2.2,
  champagneWidth: 0.6,
  champagneMax: 30,
  syrupR: 1.8,
  trapdoorR: 1.3,
  revolvingR0: 0.4,
  revolvingR1: 1.1,
  percolatorArm: 4.5,
  percolatorWidth: 0.8,
} as const;

export class TrapManager {
  private readonly ctx: HazardCtx;
  private readonly tg: TelegraphSet;
  private readonly spawnHungry: (x: number, z: number) => void;
  private strikes: Strike[] = [];

  constructor(ctx: HazardCtx, spawnHungry: (x: number, z: number) => void) {
    this.ctx = ctx;
    this.tg = new TelegraphSet(ctx.world);
    this.spawnHungry = spawnHungry;
  }

  /** Une cloche piégée vient d'être ouverte sur le guéridon (x, z). */
  trigger(kind: TrapKind, x: number, z: number): void {
    const ctx = this.ctx;
    ctx.world.sfx('trap_warn');
    const src = `trap:${kind}:${ctx.uid()}`;
    switch (kind) {
      case 'chantilly':
        return this.chantilly(x, z, src);
      case 'champagne':
        return this.champagne(x, z, src);
      case 'syrup':
        return this.syrup(x, z);
      case 'trapdoor':
        return this.trapdoor(x, z, src);
      case 'hungry_group': {
        const p = ctx.player;
        this.spawnHungry(p.x, p.z);
        return;
      }
      case 'revolving':
        return this.revolving(x, z, src);
      case 'percolator':
        return this.percolator(x, z, src);
    }
  }

  /** Siphon à chantilly : explosion circulaire autour du guéridon. */
  private chantilly(x: number, z: number, src: string): void {
    const ctx = this.ctx;
    const w = ctx.world;
    const shape = circle(x, z, TRAP_DIMS.chantillyR);
    this.strikes.push(
      new Strike(this.tg, [{ shape, tone: 'pink' }], ctx.warn(1.1), 0.35, {
        fire: () => {
          w.fx('foam', x, z, { scale: TRAP_DIMS.chantillyR / 2.2 });
          ctx.sfxAt('foam_burst', x, z);
          w.shake(0.4);
          const p = ctx.player;
          if (ctx.playerInside(shape)) ctx.hit(30, 7, src, p.x - x, p.z - z);
        },
      }),
    );
  }

  /** Bouchon de champagne : tir rectiligne du guéridon jusqu'au mur. */
  private champagne(x: number, z: number, src: string): void {
    const ctx = this.ctx;
    const w = ctx.world;
    const p = ctx.player;
    const d = dist(x, z, p.x, p.z);
    let dx: number;
    let dz: number;
    if (!p.busy && d < 10 && d > 0.15) {
      dx = (p.x - x) / d;
      dz = (p.z - z) / d;
    } else {
      const a = ctx.rng.range(0, TAU);
      dx = Math.sin(a);
      dz = Math.cos(a);
    }
    const len = Math.max(1.5, w.castRay(x, z, dx, dz, TRAP_DIMS.champagneMax));
    const ax = x + dx * 0.3;
    const az = z + dz * 0.3;
    const bx = x + dx * len;
    const bz = z + dz * len;
    const shape = line(ax, az, bx, bz, TRAP_DIMS.champagneWidth);
    this.strikes.push(
      new Strike(this.tg, [{ shape, tone: 'gold' }], ctx.warn(1.0), 0.3, {
        fire: () => {
          ctx.sfxAt('champagne_pop', x, z);
          const n = Math.max(1, Math.round(len / 2.2));
          for (let i = 0; i <= n; i++) {
            const t = (i / n) * len;
            w.fx('champagne', x + dx * t, z + dz * t, { dirX: dx, dirZ: dz, count: i === 0 ? 14 : 5 });
          }
          if (ctx.playerInside(shape)) {
            const k = ctx.perpFromLine(ax, az, bx, bz);
            ctx.hit(35, 7, src, k.x, k.z);
          }
        },
      }),
    );
  }

  /** Sirop d'érable : flaque glissante persistante (~10 s). */
  private syrup(x: number, z: number): void {
    const ctx = this.ctx;
    const w = ctx.world;
    const p = ctx.player;
    let cx = x;
    let cz = z;
    if (dist(x, z, p.x, p.z) < 5) {
      // entre le guéridon et le joueur
      cx = (x + p.x) / 2;
      cz = (z + p.z) / 2;
    }
    const shape = circle(cx, cz, TRAP_DIMS.syrupR);
    this.strikes.push(
      new Strike(this.tg, [{ shape, tone: 'gold' }], ctx.warn(0.8), 0, {
        fire: () => {
          ctx.slippery.addSyrup(cx, cz, TRAP_DIMS.syrupR);
          w.fx('syrup', cx, cz, { scale: TRAP_DIMS.syrupR });
        },
      }),
    );
  }

  /** Trappe de cave : s'ouvre sous les pieds du joueur ; le trou reste ouvert ~1,5 s. */
  private trapdoor(_x: number, _z: number, src: string): void {
    const ctx = this.ctx;
    const w = ctx.world;
    const p = ctx.player;
    const cx = p.x;
    const cz = p.z;
    const shape = circle(cx, cz, TRAP_DIMS.trapdoorR);
    let dropped = false;
    this.strikes.push(
      new Strike(this.tg, [{ shape, tone: 'gold' }], ctx.warn(1.0), 1.5, {
        fire: () => {
          w.fx('dust', cx, cz, { scale: TRAP_DIMS.trapdoorR });
        },
        active: () => {
          // il faut avoir le centre au-dessus du trou pour tomber
          if (!dropped && ctx.playerInside(shape, 0)) dropped = w.dropPlayer(src);
        },
      }),
    );
  }

  /** Passe-plat tournant : téléporte devant un comptoir au hasard si le joueur reste dans l'anneau. */
  private revolving(x: number, z: number, src: string): void {
    const ctx = this.ctx;
    const w = ctx.world;
    const p = ctx.player;
    const cx = p.busy ? x : p.x;
    const cz = p.busy ? z : p.z;
    const shape = ring(cx, cz, TRAP_DIMS.revolvingR0, TRAP_DIMS.revolvingR1);
    const disc = circle(cx, cz, TRAP_DIMS.revolvingR1);
    this.strikes.push(
      new Strike(this.tg, [{ shape, tone: 'pink' }], ctx.warn(0.9), 0.25, {
        fire: () => {
          const counters = ctx.layout.counters;
          if (counters.length && ctx.playerInside(disc)) {
            const c = ctx.rng.pick(counters);
            const fromX = ctx.player.x;
            const fromZ = ctx.player.z;
            if (w.teleportPlayer(c.front.x, c.front.z, src)) {
              w.fx('teleport', fromX, fromZ);
              w.fx('teleport', c.front.x, c.front.z);
              w.sfx('teleport');
              return;
            }
          }
          w.fx('teleport', cx, cz, { scale: 0.6 });
        },
      }),
    );
  }

  /** Percolateur : jets de vapeur en croix autour du guéridon, actifs 1,2 s. */
  private percolator(x: number, z: number, src: string): void {
    const ctx = this.ctx;
    const w = ctx.world;
    const arm = TRAP_DIMS.percolatorArm;
    const hw = TRAP_DIMS.percolatorWidth / 2;
    const shape = cross(x, z, arm, TRAP_DIMS.percolatorWidth);
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const;
    // jets de taille normale répartis le long de chaque bras, arrêtés par les murs
    const reach = dirs.map(([dx, dz]) => Math.min(arm, w.castRay(x, z, dx, dz, arm) - 0.3));
    const steam = (): void => {
      dirs.forEach(([dx, dz], i) => {
        for (let d = 0.6; d < reach[i]; d += 1.3) w.fx('steam', x + dx * d, z + dz * d, { dirX: dx, dirZ: dz, scale: 0.75 });
      });
    };
    let hit = false;
    let puff = 0;
    this.strikes.push(
      new Strike(this.tg, [{ shape, tone: 'gold' }], ctx.warn(1.0), 1.2, {
        fire: () => {
          steam();
          ctx.sfxAt('foam_burst', x, z, 1, 0.8);
        },
        active: (t) => {
          if (t - puff >= 0.4) {
            puff = t;
            steam();
          }
          if (hit || !ctx.playerInside(shape)) return;
          // recul perpendiculaire au bras touché (radial au centre de la croix)
          const p = ctx.player;
          const rx = p.x - x;
          const rz = p.z - z;
          let kx = rx;
          let kz = rz;
          if (Math.abs(rz) <= hw + p.radius && Math.abs(rx) > hw + p.radius) {
            kx = 0;
            kz = rz || 1;
          } else if (Math.abs(rx) <= hw + p.radius && Math.abs(rz) > hw + p.radius) {
            kx = rx || 1;
            kz = 0;
          }
          hit = ctx.hit(25, 5, src, kx, kz);
        },
      }),
    );
  }

  update(dt: number): void {
    if (!this.strikes.length) return;
    for (const s of this.strikes) s.update(dt);
    this.strikes = this.strikes.filter((s) => !s.done);
  }

  /** Nombre de pièges en cours (télégraphe ou effet). */
  get pending(): number {
    return this.strikes.length;
  }

  /** Tournée Générale : annule tous les télégraphes en attente et les effets en cours. */
  cancelAll(): void {
    for (const s of this.strikes) s.cancel();
    this.strikes = [];
  }

  dispose(): void {
    this.cancelAll();
    this.tg.clear();
  }
}
