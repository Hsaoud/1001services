/**
 * Plan du salon (mini-carte) dessiné sur canvas, tourné de 45° pour coller à la caméra isométrique :
 * la caméra regarde depuis (+X, +Z) vers (−X, −Z), donc (−X, −Z) est le « haut » de l'écran.
 * Projection : u = (x − z)·k, v = (x + z)·k — le salon devient un losange, murs du fond en haut.
 * Couche statique (cases, zones) redessinée seulement quand `cells` change ; couche dynamique à chaque image.
 */
import type { MinimapState, StationKind } from '../types';
import { CELL } from '../types';
import { DISHES } from '../data/dishes';
import { html } from './dom';

const ZONE_TINTS = ['#f8ece2', '#f5dcd8', '#e5eedf', '#f7ecd0', '#ece2ee', '#e9e6d6', '#f3e4d4'];
const STATION_COLOR: Record<StationKind, string> = {
  croffle: '#d9a441',
  brioche: '#d68b3c',
  tiramisu: '#8a5a44',
  sale: '#8fae5a',
  bar: '#b98a64',
};

export class Minimap {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private stat: HTMLCanvasElement;
  private sctx: CanvasRenderingContext2D;
  private cellsRef: Uint8Array | null = null;
  private zoneRef: Int16Array | null = null;
  private dims = { w: 0, d: 0 };
  private px = 0; // taille du canvas en pixels physiques
  private k = 1; // pixels physiques par unité de monde (avant √2)
  private ox = 0;
  private oy = 0;
  private visible = false;
  private expanded = false;
  private dpr = 1;
  /** Taille CSS du canvas, mise en cache (évite une lecture de mise en page à chaque image). */
  private cssSize = 0;

  constructor() {
    this.el = html(`<div class="dz-minimap dz-hidden">
      <div class="dz-mm-frame dz-paper">
        <div class="dz-mm-title dz-caps">Plan du salon</div>
        <canvas class="dz-mm-canvas"></canvas>
        <div class="dz-mm-legend">
          <span><i class="dz-lg-table"></i>Commande</span>
          <span><i class="dz-lg-urgent"></i>Pressée</span>
          <span><i class="dz-lg-counter"></i>Comptoir</span>
          <span><i class="dz-lg-cloche"></i>Cloche</span>
          <span><i class="dz-lg-npc"></i>Gêneur</span>
          <span><i class="dz-lg-bell"></i>Cloche Royale</span>
          <span><i class="dz-lg-you"></i>Vous</span>
        </div>
        <div class="dz-mm-hint"><span class="dz-key">Tab</span> vue d'ensemble</div>
      </div>
    </div>`);
    this.canvas = this.el.querySelector('canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.stat = document.createElement('canvas');
    this.sctx = this.stat.getContext('2d') as CanvasRenderingContext2D;
    if (typeof ResizeObserver !== 'undefined')
      new ResizeObserver((entries) => {
        for (const e of entries) this.cssSize = e.contentRect.width;
      }).observe(this.canvas);
  }

  update(m: MinimapState | null, expanded: boolean): void {
    if (!m) {
      if (this.visible) {
        this.visible = false;
        this.el.classList.add('dz-hidden');
      }
      return;
    }
    if (!this.visible) {
      this.visible = true;
      this.el.classList.remove('dz-hidden');
    }
    if (expanded !== this.expanded) {
      this.expanded = expanded;
      this.el.classList.toggle('dz-expanded', expanded);
      this.cssSize = 0;
    }
    // Taille CSS du canvas → pixels physiques (mesurée seulement si inconnue).
    if (!this.cssSize) this.cssSize = this.canvas.clientWidth;
    const css = this.cssSize;
    if (!css) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(css * dpr);
    const sizeChanged = px !== this.px || dpr !== this.dpr;
    if (sizeChanged) {
      this.px = px;
      this.dpr = dpr;
      this.canvas.width = this.canvas.height = px;
      this.stat.width = this.stat.height = px;
    }
    if (sizeChanged || m.cells !== this.cellsRef || m.zoneOf !== this.zoneRef || m.width !== this.dims.w || m.depth !== this.dims.d) {
      this.cellsRef = m.cells;
      this.zoneRef = m.zoneOf;
      this.dims = { w: m.width, d: m.depth };
      this.drawStatic(m);
    }
    this.drawDynamic(m);
  }

  /** Projection monde → pixels du canvas. */
  private proj(x: number, z: number): [number, number] {
    return [this.ox + (x - z) * this.k, this.oy + (x + z) * this.k];
  }

  private drawStatic(m: MinimapState): void {
    const W = m.width;
    const D = m.depth;
    const pad = this.px * 0.05;
    this.k = (this.px - pad * 2) / (W + D);
    this.ox = pad + D * this.k;
    this.oy = pad + ((this.px - pad * 2) - (W + D) * this.k) / 2;
    const c = this.sctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.px, this.px);
    const k = this.k;

    // Ombre portée douce sous le salon.
    c.save();
    c.setTransform(k, k, -k, k, this.ox, this.oy);
    c.shadowColor = 'rgba(91, 31, 42, 0.28)';
    c.shadowBlur = 8 * this.dpr;
    c.shadowOffsetY = 3 * this.dpr;
    c.fillStyle = '#f4e6d6';
    c.fillRect(0, 0, W, D);
    c.restore();

    c.setTransform(k, k, -k, k, this.ox, this.oy);
    const e = 0.04; // recouvrement anti-joints
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        const i = z * W + x;
        const cell = m.cells[i];
        if (cell === CELL.VOID) continue;
        if (cell === CELL.FLOOR) {
          const zone = m.zoneOf[i];
          c.fillStyle = zone >= 0 ? ZONE_TINTS[zone % ZONE_TINTS.length] : '#f6ebdf';
        } else if (cell === CELL.WALL) c.fillStyle = '#7a2e3a';
        else if (cell === CELL.RAIL) c.fillStyle = '#9fb89c';
        else if (cell === CELL.GLASS) c.fillStyle = '#bcd6de';
        c.fillRect(x - e, z - e, 1 + e * 2, 1 + e * 2);
      }
    }
    // Liseré entre zones.
    c.strokeStyle = 'rgba(201, 162, 74, 0.55)';
    c.lineWidth = 0.08;
    c.beginPath();
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        const i = z * W + x;
        if (m.cells[i] !== CELL.FLOOR) continue;
        const zo = m.zoneOf[i];
        if (x + 1 < W && m.cells[i + 1] === CELL.FLOOR && m.zoneOf[i + 1] !== zo) {
          c.moveTo(x + 1, z);
          c.lineTo(x + 1, z + 1);
        }
        if (z + 1 < D && m.cells[i + W] === CELL.FLOOR && m.zoneOf[i + W] !== zo) {
          c.moveTo(x, z + 1);
          c.lineTo(x + 1, z + 1);
        }
      }
    }
    c.stroke();
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  private drawDynamic(m: MinimapState): void {
    const c = this.ctx;
    const t = performance.now() / 1000;
    const s = this.k * Math.SQRT2; // taille d'une case à l'écran
    const unit = Math.max(this.dpr * 3, s * 0.5);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.px, this.px);
    c.drawImage(this.stat, 0, 0);

    // Marée de mousse.
    if (m.tide && m.tide.radius > 0) {
      const [u, v] = this.proj(m.tide.origin.x, m.tide.origin.z);
      const r = m.tide.radius * s;
      const g = c.createRadialGradient(u, v, r * 0.2, u, v, r);
      g.addColorStop(0, 'rgba(255, 252, 244, 0.92)');
      g.addColorStop(0.8, 'rgba(246, 234, 216, 0.85)');
      g.addColorStop(1, 'rgba(217, 186, 150, 0.6)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(u, v, r, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(192, 96, 111, 0.7)';
      c.lineWidth = this.dpr * 1.5;
      c.setLineDash([this.dpr * 4, this.dpr * 3]);
      c.lineDashOffset = -t * 12 * this.dpr;
      c.stroke();
      c.setLineDash([]);
    }

    // Comptoirs.
    for (const ct of m.counters) {
      const [u, v] = this.proj(ct.x, ct.z);
      const r = unit * 1.15;
      c.fillStyle = '#fffaf1';
      c.strokeStyle = '#5b1f2a';
      c.lineWidth = this.dpr * 1.2;
      roundRect(c, u - r, v - r * 0.75, r * 2, r * 1.5, r * 0.35);
      c.fill();
      c.stroke();
      c.fillStyle = STATION_COLOR[ct.station];
      c.beginPath();
      c.arc(u, v, r * 0.42, 0, Math.PI * 2);
      c.fill();
      if (ct.ready > 0) {
        c.fillStyle = '#d4a537';
        c.strokeStyle = '#8a6420';
        c.lineWidth = this.dpr * 0.8;
        const n = Math.min(4, ct.ready);
        for (let i = 0; i < n; i++) {
          c.beginPath();
          c.arc(u - ((n - 1) / 2 - i) * r * 0.62, v - r * 1.05, r * 0.26, 0, Math.PI * 2);
          c.fill();
          c.stroke();
        }
      }
    }

    // Cloches en argent.
    for (const cl of m.cloches) {
      const [u, v] = this.proj(cl.x, cl.z);
      const r = unit * 0.8;
      c.fillStyle = '#dfe3e8';
      c.strokeStyle = '#6f7884';
      c.lineWidth = this.dpr;
      c.beginPath();
      c.arc(u, v + r * 0.3, r, Math.PI, 0);
      c.closePath();
      c.fill();
      c.stroke();
      c.beginPath();
      c.arc(u, v - r * 0.82, r * 0.22, 0, Math.PI * 2);
      c.fill();
    }

    // Tables.
    for (const tb of m.tables) {
      const [u, v] = this.proj(tb.x, tb.z);
      const r = unit * 0.95;
      if (tb.urgent && tb.dish) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 7);
        c.strokeStyle = `rgba(192, 96, 111, ${0.35 + pulse * 0.5})`;
        c.lineWidth = this.dpr * 2;
        c.beginPath();
        c.arc(u, v, r * (1.5 + pulse * 0.5), 0, Math.PI * 2);
        c.stroke();
      }
      c.beginPath();
      c.arc(u, v, r, 0, Math.PI * 2);
      c.fillStyle = tb.dish ? DISHES[tb.dish].color : '#efe3d3';
      c.fill();
      c.lineWidth = this.dpr * (tb.vip ? 2 : 1.2);
      c.strokeStyle = tb.vip ? '#c9a24a' : tb.dish ? '#5b1f2a' : 'rgba(91, 31, 42, 0.35)';
      c.stroke();
      if (tb.vip) {
        // Petite couronne.
        const cw = r * 1.1;
        const cy = v - r * 1.25;
        c.fillStyle = '#d4a537';
        c.beginPath();
        c.moveTo(u - cw, cy + cw * 0.5);
        c.lineTo(u - cw, cy - cw * 0.3);
        c.lineTo(u - cw * 0.45, cy + cw * 0.1);
        c.lineTo(u, cy - cw * 0.55);
        c.lineTo(u + cw * 0.45, cy + cw * 0.1);
        c.lineTo(u + cw, cy - cw * 0.3);
        c.lineTo(u + cw, cy + cw * 0.5);
        c.closePath();
        c.fill();
      }
    }

    // Gêneurs.
    c.fillStyle = '#d98c95';
    c.strokeStyle = '#fff';
    c.lineWidth = this.dpr * 0.8;
    for (const n of m.npcs) {
      const [u, v] = this.proj(n.x, n.z);
      c.beginPath();
      c.arc(u, v, unit * 0.55, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }

    // Cloche Royale.
    {
      const [u, v] = this.proj(m.bell.x, m.bell.z);
      const r = unit * 1.25;
      if (m.bell.lit) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 4);
        const g = c.createRadialGradient(u, v, 0, u, v, r * (2.4 + pulse));
        g.addColorStop(0, 'rgba(244, 215, 127, 0.9)');
        g.addColorStop(1, 'rgba(244, 215, 127, 0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(u, v, r * (2.4 + pulse), 0, Math.PI * 2);
        c.fill();
      }
      star(c, u, v, r, m.bell.lit ? '#d4a537' : '#b9aa92', m.bell.lit ? '#8a6420' : '#7d705e', this.dpr);
    }

    // Joueur : flèche bordeaux orientée.
    {
      const [u, v] = this.proj(m.player.x, m.player.z);
      const dx = Math.sin(m.player.heading);
      const dz = Math.cos(m.player.heading);
      const ang = Math.atan2(dx + dz, dx - dz);
      const r = unit * 1.5;
      c.save();
      c.translate(u, v);
      c.fillStyle = 'rgba(255, 250, 240, 0.85)';
      c.beginPath();
      c.arc(0, 0, r * 1.05, 0, Math.PI * 2);
      c.fill();
      c.rotate(ang);
      c.beginPath();
      c.moveTo(r, 0);
      c.lineTo(-r * 0.7, r * 0.66);
      c.lineTo(-r * 0.35, 0);
      c.lineTo(-r * 0.7, -r * 0.66);
      c.closePath();
      c.fillStyle = '#7a2e3a';
      c.fill();
      c.strokeStyle = '#d4a537';
      c.lineWidth = this.dpr * 1.1;
      c.stroke();
      c.restore();
    }
  }
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function star(c: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke: string, dpr: number): void {
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  c.strokeStyle = stroke;
  c.lineWidth = dpr;
  c.stroke();
}
