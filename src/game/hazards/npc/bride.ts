/**
 * Cortège de la mariée : une farandole (la mariée + 4 à 6 invités, une vue chacun, `aux` = rang)
 * suit une boucle fermée ; un trait crème montre les ~3 u à venir devant la mariée.
 */
import type { Vec2 } from '../../../types';
import type { TelegraphHandle } from '../api';
import type { HazardCtx } from '../context';
import { dist, headingOf, line, turnToward, Polyline } from '../util';
import { Agent } from './base';

const RADIUS = 0.35;
const SPACING = 0.9;
const SPEED = 2.3;
const AHEAD = 3;

/** Segment droit dégagé pour un corps de rayon `r` ? */
function segClear(ctx: HazardCtx, ax: number, az: number, bx: number, bz: number, r: number): boolean {
  const d = dist(ax, az, bx, bz);
  const n = Math.max(1, Math.ceil(d / 0.35));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (!ctx.world.isFree(ax + (bx - ax) * t, az + (bz - az) * t, r)) return false;
  }
  return true;
}

/** Construit la boucle de la farandole : rectangle dégagé, sinon boucle de chemins, sinon aller-retour sur un couloir. */
export function buildLoop(ctx: HazardCtx): Polyline | null {
  const w = ctx.world;
  const rng = ctx.rng;
  for (let attempt = 0; attempt < 50; attempt++) {
    const shrink = 1 - attempt / 70;
    const c = w.randomFreePoint();
    if (!c) continue;
    const hw = rng.range(2.2, 5.5) * shrink;
    const hd = rng.range(1.6, 4.2) * shrink;
    if (hw < 1.4 || hd < 1.1) continue;
    // de préférence, une boucle qui n'entoure pas le point de départ du joueur
    const ps = ctx.layout.playerStart;
    if (attempt < 35 && Math.abs(ps.x - c.x) <= hw + 1.5 && Math.abs(ps.z - c.z) <= hd + 1.5) continue;
    const pts: Vec2[] = [
      { x: c.x - hw, z: c.z - hd },
      { x: c.x + hw, z: c.z - hd },
      { x: c.x + hw, z: c.z + hd },
      { x: c.x - hw, z: c.z + hd },
    ];
    let ok = true;
    for (let i = 0; i < 4 && ok; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % 4];
      ok = segClear(ctx, a.x, a.z, b.x, b.z, 0.4);
    }
    if (ok) return new Polyline(pts, true);
  }
  // boucle de chemins entre quatre points autour d'un centre (validée par findPath)
  for (let attempt = 0; attempt < 6; attempt++) {
    const c = w.randomFreePoint();
    if (!c) continue;
    const corners: { p: Vec2; a: number }[] = [];
    for (let k = 0; k < 4; k++) {
      const p = w.randomFreePoint(c, 2.5, 5.5);
      if (p) corners.push({ p, a: Math.atan2(p.x - c.x, p.z - c.z) });
    }
    if (corners.length < 3) continue;
    corners.sort((u, v) => u.a - v.a);
    const pts: Vec2[] = [corners[0].p];
    let ok = true;
    for (let k = 0; k < corners.length && ok; k++) {
      const a = corners[k].p;
      const b = corners[(k + 1) % corners.length].p;
      const path = w.findPath(a.x, a.z, b.x, b.z);
      if (!path || !path.length) ok = false;
      else for (const q of path) {
        const last = pts[pts.length - 1];
        if (dist(last.x, last.z, q.x, q.z) > 0.2) pts.push({ x: q.x, z: q.z });
      }
    }
    if (!ok) continue;
    // le dernier point rejoint le premier : on le retire
    const f = pts[0];
    const l = pts[pts.length - 1];
    if (pts.length > 2 && dist(f.x, f.z, l.x, l.z) < 0.2) pts.pop();
    const poly = new Polyline(pts, true);
    if (poly.total >= 9) return poly;
  }
  // aller-retour sur le plus long couloir
  const lanes = ctx.lanes();
  let best: Polyline | null = null;
  for (const ln of lanes) {
    const p = new Polyline([ln.a, ln.b], true);
    if (!best || p.total > best.total) best = p;
  }
  return best && best.total >= 4 ? best : null;
}

export class Bride extends Agent {
  private readonly loop: Polyline | null;
  private s = 0;
  private readonly speed: number;
  private teles: (TelegraphHandle | null)[] = [null, null];

  constructor(ctx: HazardCtx, regular = true) {
    super(ctx, 'bride', regular);
    this.loop = buildLoop(ctx);
    this.speed = SPEED * ctx.speedScale;
    const guests = ctx.rng.int(4, 6);
    const loop = this.loop;
    if (loop) {
      // départ : la portion de boucle la plus éloignée du joueur
      let bestS = 0;
      let bestD = -1;
      for (let i = 0; i < 16; i++) {
        const s = (loop.total * i) / 16;
        let dmin = Infinity;
        for (let g = 0; g <= guests; g++) {
          const q = loop.at(s - g * SPACING);
          dmin = Math.min(dmin, ctx.playerDistance(q.x, q.z));
        }
        if (dmin > bestD) {
          bestD = dmin;
          bestS = s;
        }
      }
      this.s = bestS;
      for (let g = 0; g <= guests; g++) {
        const q = loop.at(this.s - g * SPACING);
        this.addBody(q.x, q.z, RADIUS, headingOf(q.tx, q.tz), g);
      }
    } else {
      // pas de place pour une boucle : la noce danse sur place
      const p = ctx.spawnPoint(0.8);
      for (let g = 0; g <= guests; g++) {
        const a = (g / (guests + 1)) * Math.PI * 2;
        this.addBody(p.x + Math.sin(a) * 0.9, p.z + Math.cos(a) * 0.9, RADIUS, a, g);
      }
    }
    for (const b of this.bodies) b.action = 'dance';
  }

  protected think(dt: number): void {
    const loop = this.loop;
    const t = this.ctx.time;
    if (loop) this.s = (this.s + this.speed * dt) % loop.total;
    this.bodies.forEach((b, g) => {
      if (loop) {
        const q = loop.at(this.s - g * SPACING);
        b.x = q.x;
        b.z = q.z;
        b.heading = turnToward(b.heading, headingOf(q.tx, q.tz), 7 * dt);
        b.speed01 = 0.5;
      } else b.speed01 = 0;
      b.action = 'dance';
      b.actionT = (((t * 1.2 + g * 0.25) % 1) + 1) % 1;
    });
    // un seul identifiant de source pour toute la noce : un choc à la fois
    for (const b of this.bodies) if (this.touch(b, 20, 4)) break;
    this.updateAhead();
  }

  /** Trait crème sur les ~3 u à venir (un ou deux segments si un virage approche). */
  private updateAhead(): void {
    const loop = this.loop;
    if (!loop) return;
    const p0 = loop.at(this.s);
    const p1 = loop.at(this.s + AHEAD);
    const segs: [number, number, number, number][] = [];
    if (p0.seg === p1.seg) segs.push([p0.x, p0.z, p1.x, p1.z]);
    else {
      const c = loop.pts[(p0.seg + 1) % loop.pts.length];
      segs.push([p0.x, p0.z, c.x, c.z]);
      segs.push([c.x, c.z, p1.x, p1.z]);
    }
    for (let i = 0; i < 2; i++) {
      const sg = segs[i];
      if (!sg || dist(sg[0], sg[1], sg[2], sg[3]) < 0.05) {
        this.teles[i] = this.tg.remove(this.teles[i]);
        continue;
      }
      const shape = line(sg[0], sg[1], sg[2], sg[3], 0.7);
      const h = this.teles[i];
      if (h) h.shape = shape;
      else this.teles[i] = this.tg.add(shape, 'cream', true);
    }
  }

  protected override onCalm(): void {
    this.teles = [null, null];
  }
}
