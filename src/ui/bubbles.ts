/**
 * Bulles de commande au-dessus des tables : nœuds DOM recyclés (clé = id de table),
 * positionnés en translate3d, anneau de patience doré en SVG (stroke-dashoffset).
 */
import type { BubbleState } from '../types';
import type { DishIcons } from './dishicons';
import { crown } from './ornaments';

interface BubbleNode {
  el: HTMLElement;
  icon: HTMLElement;
  ring: SVGCircleElement;
  x: number;
  y: number;
  p: number;
  cls: string;
  dish: string;
  seen: boolean;
  shown: boolean;
}

export class Bubbles {
  readonly el: HTMLElement;
  private nodes = new Map<string, BubbleNode>();
  private pool: BubbleNode[] = [];

  constructor(private icons: DishIcons) {
    this.el = document.createElement('div');
    this.el.className = 'dz-layer dz-bubbles';
  }

  private make(): BubbleNode {
    const el = document.createElement('div');
    el.className = 'dz-bubble';
    el.innerHTML = `<div class="dz-bub-in">
      <div class="dz-bub-body">
        <svg class="dz-bub-ring" viewBox="0 0 60 60"><circle class="dz-bub-trk" cx="30" cy="30" r="27"/><circle class="dz-bub-prg" cx="30" cy="30" r="27" pathLength="100"/></svg>
        <span class="dz-bub-icon"></span>
      </div>
      <span class="dz-bub-tail"></span>
      <span class="dz-bub-crown">${crown()}</span>
      <span class="dz-bub-key dz-key">E</span>
    </div>`;
    this.el.appendChild(el);
    return {
      el,
      icon: el.querySelector('.dz-bub-icon') as HTMLElement,
      ring: el.querySelector('.dz-bub-prg') as SVGCircleElement,
      x: NaN,
      y: NaN,
      p: -1,
      cls: '',
      dish: '',
      seen: false,
      shown: false,
    };
  }

  sync(list: readonly BubbleState[]): void {
    for (const n of this.nodes.values()) n.seen = false;
    for (const b of list) {
      if (!b.visible) continue;
      let n = this.nodes.get(b.key);
      if (!n) {
        n = this.pool.pop() ?? this.make();
        n.x = n.y = NaN;
        n.p = -1;
        n.cls = '\u0000';
        n.dish = '';
        this.nodes.set(b.key, n);
      }
      n.seen = true;
      if (!n.shown) {
        n.shown = true;
        n.el.style.display = '';
        // Apparition : petite éclosion.
        n.el.classList.remove('dz-born');
        void n.el.offsetWidth;
        n.el.classList.add('dz-born');
      }
      const x = Math.round(b.sx * 4) / 4;
      const y = Math.round(b.sy * 4) / 4;
      if (x !== n.x || y !== n.y) {
        n.x = x;
        n.y = y;
        n.el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }
      const p = Math.round(Math.max(0, Math.min(1, b.patience01)) * 400) / 4;
      if (p !== n.p) {
        n.p = p;
        n.ring.style.strokeDashoffset = String(100 - p);
      }
      const cls = `dz-bubble${b.vip ? ' dz-vip' : ''}${b.urgent ? ' dz-urgent' : ''}${b.inRange ? ' dz-inrange' : ''}${b.matching ? ' dz-match' : ''}${b.dish === 'golden' ? ' dz-golden' : ''} dz-born`;
      if (cls !== n.cls) {
        n.cls = cls;
        n.el.className = cls;
      }
      if (n.dish !== b.dish || n.icon.dataset.k?.startsWith('s:')) {
        n.dish = b.dish;
        this.icons.fill(n.icon, b.dish);
      }
    }
    for (const [key, n] of this.nodes) {
      if (n.seen) continue;
      n.shown = false;
      n.el.style.display = 'none';
      this.nodes.delete(key);
      if (this.pool.length < 48) this.pool.push(n);
      else n.el.remove();
    }
  }

  clear(): void {
    this.sync([]);
  }
}
