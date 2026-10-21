/**
 * Fournisseur d'icônes de plats : images 3D (data URL) quand elles sont prêtes,
 * sinon icône SVG de secours. Rafraîchissement paresseux des éléments [data-dish].
 */
import type { DishId } from '../types';
import { DISH_SVG } from './icons';

const ALL: DishId[] = ['croffle', 'brioche', 'pancakes', 'tiramisu', 'avotoast', 'mocktail', 'latte', 'golden'];

export class DishIcons {
  private provider: ((id: DishId) => string) | null = null;
  private cache = new Map<DishId, string>();
  private lastTry = new Map<DishId, number>();
  private timer = 0;

  constructor(private readonly scope: HTMLElement) {}

  setProvider(fn: (id: DishId) => string): void {
    this.provider = fn;
    this.cache.clear();
    this.lastTry.clear();
    this.refreshAll();
    if (!this.timer) this.timer = window.setInterval(() => this.poll(), 700);
  }

  /** URL de l'icône 3D, ou '' si pas encore disponible (essais espacés). */
  url(id: DishId): string {
    const c = this.cache.get(id);
    if (c) return c;
    if (!this.provider) return '';
    const now = performance.now();
    const last = this.lastTry.get(id) ?? -1e9;
    if (now - last < 400) return '';
    this.lastTry.set(id, now);
    let u = '';
    try {
      u = this.provider(id) || '';
    } catch {
      u = '';
    }
    if (u) this.cache.set(id, u);
    return u;
  }

  /** Remplit `host` avec l'icône du plat (n'écrit le DOM que si nécessaire). */
  fill(host: HTMLElement, id: DishId | null): void {
    if (!id) {
      if (host.dataset.k !== '') {
        host.dataset.k = '';
        host.innerHTML = '';
      }
      return;
    }
    const u = this.url(id);
    const k = (u ? 'i:' : 's:') + id;
    if (host.dataset.k === k) return;
    host.dataset.k = k;
    host.dataset.dish = id;
    host.innerHTML = u ? `<img src="${u}" alt="" draggable="false">` : DISH_SVG[id];
  }

  /** Gabarit HTML d'une icône (rafraîchie plus tard si besoin). */
  markup(id: DishId, cls = 'dz-dish'): string {
    const u = this.url(id);
    return `<span class="${cls}" data-dish="${id}" data-k="${u ? 'i:' : 's:'}${id}">${u ? `<img src="${u}" alt="" draggable="false">` : DISH_SVG[id]}</span>`;
  }

  /** Tant que des icônes manquent, réessaie et met à jour les éléments déjà affichés. */
  private poll(): void {
    if (!this.provider) return;
    let missing = 0;
    for (const id of ALL) {
      if (this.cache.has(id)) continue;
      if (this.url(id)) this.refreshAll(id);
      else missing++;
    }
    if (!missing) {
      clearInterval(this.timer);
      this.timer = 0;
    }
  }

  private refreshAll(only?: DishId): void {
    const sel = only ? `[data-dish="${only}"]` : '[data-dish]';
    this.scope.querySelectorAll<HTMLElement>(sel).forEach((e) => {
      const id = e.dataset.dish as DishId;
      if (id) this.fill(e, id);
    });
  }
}
