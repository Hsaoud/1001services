/**
 * Pile d'écrans modaux et navigation clavier / souris.
 *
 * - Les touches ne sont écoutées que lorsqu'au moins un écran (menu, carte, modale) est ouvert :
 *   pendant le jeu, l'interface ne capte rien.
 * - Écoute en phase de capture sur `window` : une touche traitée par un menu est consommée
 *   (preventDefault + stopImmediatePropagation) et n'atteint donc pas le jeu.
 * - Flèches / ZQSD / WASD : navigation spatiale entre les éléments `[data-nav]` de l'écran du dessus.
 *   Entrée / E / Espace : valider. Échap / Retour arrière : revenir.
 */
import { audio } from '../audio';
import { device } from '../core/device';
import { leave } from './dom';

export interface Screen {
  el: HTMLElement;
  /** Gestion spécifique d'une touche ; renvoie true si elle est consommée. */
  key?(e: KeyboardEvent): boolean;
  /** Échap / retour. */
  back?(): void;
  /** Élément à focaliser à l'ouverture. */
  focus?(): HTMLElement | null | undefined;
  /** Dernier élément focalisé (restauré quand l'écran repasse au premier plan). */
  last?: HTMLElement | null;
  /** Masque les écrans du dessous tant qu'il est ouvert (par défaut : oui). */
  covers?: boolean;
}

type Dir = 'up' | 'down' | 'left' | 'right';

const DIR_KEYS: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
};

export function isConfirmKey(e: KeyboardEvent): boolean {
  return e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space' || e.code === 'KeyE';
}

export function isBackKey(e: KeyboardEvent): boolean {
  return e.code === 'Escape' || e.code === 'Backspace';
}

export class ScreenStack {
  private stack: Screen[] = [];
  private hovered: Element | null = null;
  /** Élément « courant » (surligné), indépendant du focus système (fenêtre inactive, etc.). */
  private cur: HTMLElement | null = null;

  constructor(readonly layer: HTMLElement) {
    window.addEventListener('keydown', this.onKey, true);
    // Survol : focalise l'élément (le clavier reprend de là) et joue un léger son.
    layer.addEventListener('pointerover', (e) => {
      const t = (e.target as Element | null)?.closest<HTMLElement>('[data-nav]');
      if (!t || t === this.hovered) return;
      this.hovered = t;
      if (!this.inTop(t)) return;
      if (this.cur !== t) {
        t.focus({ preventScroll: true });
        this.mark(t);
        if (!isDisabled(t)) audio.sfx('ui_hover');
      }
    });
    layer.addEventListener('pointerout', (e) => {
      const t = (e.target as Element | null)?.closest('[data-nav]');
      if (t && t === this.hovered && !t.contains(e.relatedTarget as Node | null)) this.hovered = null;
    });
    // Clic : son commun à tous les boutons.
    layer.addEventListener(
      'click',
      (e) => {
        const t = (e.target as Element | null)?.closest<HTMLElement>('[data-nav]');
        if (t && !isDisabled(t) && t.dataset.silent === undefined) audio.sfx('ui_click');
      },
      true,
    );
    layer.addEventListener('pointerdown', () => audio.unlock(), { passive: true });
    layer.addEventListener('focusin', (e) => {
      const t = (e.target as Element | null)?.closest<HTMLElement>('[data-nav]');
      if (t && this.inTop(t)) this.mark(t);
    });
  }

  /** Élément actuellement surligné dans l'écran du dessus. */
  get current(): HTMLElement | null {
    const s = this.top();
    return this.cur && s && s.el.contains(this.cur) && this.cur.isConnected ? this.cur : null;
  }

  /** Surligne un élément (classe .dz-f) et prévient l'écran (évènement « dz-focus »). */
  private mark(el: HTMLElement): void {
    if (this.cur === el) return;
    this.cur?.classList.remove('dz-f');
    this.cur = el;
    el.classList.add('dz-f');
    const s = this.top();
    if (s && s.el.contains(el)) s.last = el;
    el.dispatchEvent(new CustomEvent('dz-focus', { bubbles: true }));
  }

  get open(): boolean {
    return this.stack.length > 0;
  }

  top(): Screen | undefined {
    return this.stack[this.stack.length - 1];
  }

  has(s: Screen): boolean {
    return this.stack.includes(s);
  }

  push(s: Screen, sound = true): void {
    const prev = this.top();
    if (prev && s.covers !== false) prev.el.classList.add('dz-under');
    this.stack.push(s);
    s.el.classList.add('dz-screen');
    this.layer.appendChild(s.el);
    if (sound) audio.sfx('ui_open');
    this.focusTop();
    requestAnimationFrame(() => this.focusTop());
  }

  /** Remplace un écran par un autre à la même place dans la pile (ex. rafraîchissement). */
  replace(old: Screen, s: Screen): void {
    const i = this.stack.indexOf(old);
    if (i < 0) return this.push(s, false);
    this.stack[i] = s;
    s.el.classList.add('dz-screen', 'dz-noanim');
    if (old.el.classList.contains('dz-under')) s.el.classList.add('dz-under');
    old.el.replaceWith(s.el);
    if (i === this.stack.length - 1) {
      this.focusTop();
      requestAnimationFrame(() => this.focusTop());
    }
  }

  remove(s: Screen, animate = true): Promise<void> {
    const i = this.stack.indexOf(s);
    if (i < 0) return Promise.resolve();
    this.stack.splice(i, 1);
    // L'écran désormais au sommet redevient visible.
    const t = this.top();
    if (t) {
      t.el.classList.remove('dz-under');
      if (i === this.stack.length) {
        this.focusTop();
        requestAnimationFrame(() => this.focusTop());
      }
    }
    if (!animate) {
      s.el.remove();
      return Promise.resolve();
    }
    return leave(s.el, 'dz-leaving', 380);
  }

  private focusTop(): void {
    const s = this.top();
    if (!s) return;
    const want = (s.last && s.el.contains(s.last) && !isHidden(s.last) ? s.last : null) ?? s.focus?.() ?? this.items(s)[0];
    if (!want) return;
    if (document.activeElement !== want) want.focus({ preventScroll: true });
    this.cur = this.cur === want ? null : this.cur;
    this.mark(want);
    // Touch readers start at the heading; keyboard users need the selected control in view.
    if (device.mode !== 'touch' || want.closest('.dz-ls-scroll')) scrollIntoViewIfNeeded(want);
  }

  private inTop(el: Element): boolean {
    const s = this.top();
    return !!s && s.el.contains(el);
  }

  private items(s: Screen): HTMLElement[] {
    return Array.from(s.el.querySelectorAll<HTMLElement>('[data-nav]')).filter((e) => !isHidden(e) && !e.closest('.dz-under'));
  }

  private onKey = (e: KeyboardEvent): void => {
    const s = this.top();
    if (!s || e.ctrlKey || e.metaKey || e.altKey) return;
    let handled = false;
    if (s.key?.(e)) handled = true;
    else if (isBackKey(e)) {
      if (s.back) {
        if (!e.repeat) s.back();
        handled = true;
      }
    } else if (isConfirmKey(e)) {
      const a = this.current;
      if (!e.repeat && a) {
        if (a instanceof HTMLInputElement && a.type === 'checkbox') a.click();
        else if (!(a instanceof HTMLInputElement)) a.click();
      } else if (!e.repeat) {
        // Rien de focalisé : on focalise le premier élément.
        this.focusTop();
      }
      handled = true;
    } else if (e.code === 'Tab') {
      this.cycle(s, e.shiftKey ? -1 : 1);
      handled = true;
    } else if (DIR_KEYS[e.code]) {
      const a = this.current;
      const dir = DIR_KEYS[e.code];
      // Curseurs : gauche / droite modifient la valeur.
      if (a instanceof HTMLInputElement && a.type === 'range' && (dir === 'left' || dir === 'right')) {
        const step = Number(a.step) || 0.05;
        const v = Math.min(Number(a.max), Math.max(Number(a.min), Number(a.value) + (dir === 'right' ? step : -step)));
        a.value = String(v);
        a.dispatchEvent(new Event('input', { bubbles: true }));
        audio.sfx('ui_hover');
      } else {
        this.move(s, dir);
      }
      handled = true;
    }
    if (handled) {
      e.preventDefault();
      e.stopImmediatePropagation();
      audio.unlock();
    }
  };

  private cycle(s: Screen, delta: number): void {
    const list = this.items(s);
    if (!list.length) return;
    const i = this.current ? list.indexOf(this.current) : -1;
    const n = list[(i + delta + list.length) % list.length];
    this.focusEl(n);
  }

  private focusEl(n: HTMLElement, sound = true, reveal = true): void {
    n.focus({ preventScroll: true });
    this.mark(n);
    if (reveal) scrollIntoViewIfNeeded(n);
    if (sound) audio.sfx('ui_hover');
  }

  /** Sélectionne un élément de l'écran du dessus (sans son). */
  select(n: HTMLElement): void {
    if (this.inTop(n)) this.focusEl(n, false, device.mode !== 'touch');
  }

  /** Navigation spatiale : élément le plus proche dans la direction demandée. */
  move(s: Screen, dir: Dir): void {
    const list = this.items(s);
    if (!list.length) return;
    const cur = this.current;
    if (!cur || !list.includes(cur)) {
      this.focusEl(list[0]);
      return;
    }
    const r0 = cur.getBoundingClientRect();
    const cx = r0.left + r0.width / 2;
    const cy = r0.top + r0.height / 2;
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const c of list) {
      if (c === cur) continue;
      const r = c.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const dx = x - cx;
      const dy = y - cy;
      let main: number;
      let side: number;
      if (dir === 'up' || dir === 'down') {
        main = dir === 'up' ? -dy : dy;
        // Chevauchement horizontal : on privilégie les éléments « en face ».
        const overlap = Math.min(r.right, r0.right) - Math.max(r.left, r0.left);
        side = overlap > 0 ? 0 : Math.abs(dx);
        if (main <= Math.min(r0.height, r.height) * 0.3) continue;
      } else {
        main = dir === 'left' ? -dx : dx;
        const overlap = Math.min(r.bottom, r0.bottom) - Math.max(r.top, r0.top);
        side = overlap > 0 ? 0 : Math.abs(dy);
        if (main <= Math.min(r0.width, r.width) * 0.3) continue;
      }
      const score = main + side * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (!best && (dir === 'up' || dir === 'down')) {
      // Bouclage vertical dans les listes simples.
      best = dir === 'down' ? list[0] : list[list.length - 1];
      if (best === cur) best = null;
    }
    if (best) this.focusEl(best);
  }
}

function isDisabled(e: Element): boolean {
  return (e as HTMLButtonElement).disabled === true || e.getAttribute('aria-disabled') === 'true';
}

function isHidden(e: HTMLElement): boolean {
  return e.offsetParent === null && getComputedStyle(e).position !== 'fixed';
}

/** Fait défiler le conteneur scrollable le plus proche pour montrer l'élément (sans saut brutal). */
export function scrollIntoViewIfNeeded(el: HTMLElement): void {
  let p = el.parentElement;
  while (p && p !== document.body) {
    const st = getComputedStyle(p);
    if (/(auto|scroll)/.test(st.overflowY) && p.scrollHeight > p.clientHeight) {
      const r = el.getBoundingClientRect();
      const pr = p.getBoundingClientRect();
      const margin = Math.min(80, pr.height * 0.15);
      if (r.top < pr.top + margin) p.scrollBy({ top: r.top - pr.top - margin, behavior: 'smooth' });
      else if (r.bottom > pr.bottom - margin) p.scrollBy({ top: r.bottom - pr.bottom + margin, behavior: 'smooth' });
      return;
    }
    p = p.parentElement;
  }
}
