/** Effets d'interface éphémères : popups flottants, toasts, grande annonce, flash & vignette d'urgence. */
import type { PopupSpec } from '../types';
import type { ToastKind } from './api';
import { esc, html } from './dom';
import { ICON } from './icons';
import { fleuron } from './ornaments';

export class Popups {
  readonly el: HTMLElement;
  private live = 0;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'dz-layer dz-popups';
  }

  show(p: PopupSpec): void {
    if (this.live > 28) {
      // Trop de popups simultanés : on retire le plus ancien.
      this.el.firstElementChild?.remove();
      this.live--;
    }
    const e = document.createElement('div');
    e.className = `dz-popup dz-pop-${p.tone}${p.big ? ' dz-big' : ''}`;
    e.style.left = `${Math.round(p.sx)}px`;
    e.style.top = `${Math.round(p.sy)}px`;
    // Légère dérive horizontale aléatoire pour éviter les superpositions.
    e.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * 30)}px`);
    const span = document.createElement('span');
    span.textContent = p.text;
    e.appendChild(span);
    this.live++;
    const done = () => {
      if (!e.isConnected) return;
      e.remove();
      this.live--;
    };
    e.addEventListener('animationend', done);
    setTimeout(done, p.big ? 2200 : 1700);
    this.el.appendChild(e);
  }
}

const TOAST_ICON: Record<ToastKind, string> = {
  tip: `<svg viewBox="0 0 24 24"><path d="M12 3c-4 0-7 2.8-7 6.6 0 2.4 1.2 4 2.6 5.2.8.7 1.2 1.4 1.2 2.4V18h6.4v-.8c0-1 .4-1.7 1.2-2.4 1.4-1.2 2.6-2.8 2.6-5.2C19 5.8 16 3 12 3z" fill="#fff6dc" stroke="#a8792a" stroke-width="1.3"/><path d="M9.6 20.2h4.8M10.4 22h3.2" stroke="#a8792a" stroke-width="1.3" stroke-linecap="round"/><path d="M10 11.5l2 2 2-2" fill="none" stroke="#c9a24a" stroke-width="1.1"/></svg>`,
  intro: ICON.sparkle,
  warn: `<svg viewBox="0 0 24 24"><path d="M12 3 22 20H2z" fill="#f3d9d6" stroke="#7a2e3a" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 9.5v5" stroke="#7a2e3a" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1.2" fill="#7a2e3a"/></svg>`,
  gold: ICON.coin,
  item: `<svg viewBox="0 0 24 24"><rect x="3.5" y="9" width="17" height="11.5" rx="1.4" fill="#f3d9d6" stroke="#7a2e3a" stroke-width="1.3"/><path d="M3.5 12.5h17M12 9v11.5" stroke="#c9a24a" stroke-width="1.8"/><path d="M12 9c-1.8-3.6-6-4-6-1.6C6 9 9.6 9 12 9zm0 0c1.8-3.6 6-4 6-1.6C18 9 14.4 9 12 9z" fill="none" stroke="#c9a24a" stroke-width="1.4"/></svg>`,
};

export class Toasts {
  readonly el: HTMLElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'dz-toasts';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
  }

  show(text: string, kind: ToastKind = 'tip', seconds = 4.5): void {
    // Évite les doublons exacts déjà affichés.
    for (const c of Array.from(this.el.children) as HTMLElement[]) {
      if (c.dataset.text === text && !c.classList.contains('dz-leaving')) {
        c.classList.remove('dz-again');
        void c.offsetWidth;
        c.classList.add('dz-again');
        return;
      }
    }
    const label: Record<ToastKind, string> = {
      tip: 'Conseil',
      intro: 'Nouveauté',
      warn: 'Attention',
      gold: 'Bravo',
      item: 'Équipement',
    };
    const t = html(`<div class="dz-toast dz-toast-${kind} dz-paper">
      <span class="dz-toast-ico">${TOAST_ICON[kind]}</span>
      <span class="dz-toast-body"><span class="dz-toast-kind dz-caps">${label[kind]}</span><span class="dz-toast-text">${esc(text)}</span></span>
      <span class="dz-toast-timer" style="animation-duration:${seconds}s"></span>
    </div>`);
    t.dataset.text = text;
    this.el.appendChild(t);
    // Pas plus de 4 cartes empilées.
    const live = Array.from(this.el.children).filter((c) => !c.classList.contains('dz-leaving'));
    if (live.length > 4) this.dismiss(live[0] as HTMLElement);
    setTimeout(() => this.dismiss(t), seconds * 1000);
  }

  private dismiss(t: HTMLElement): void {
    if (!t.isConnected || t.classList.contains('dz-leaving')) return;
    t.classList.add('dz-leaving');
    setTimeout(() => t.remove(), 450);
  }
}

export class Announce {
  readonly el: HTMLElement;
  private timer = 0;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'dz-announce';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
  }

  show(title: string, subtitle?: string, tone: 'gold' | 'rose' | 'cream' = 'gold'): void {
    clearTimeout(this.timer);
    this.el.innerHTML = '';
    const b = html(`<div class="dz-ann dz-ann-${tone}">
      <div class="dz-ann-rule">${fleuron()}</div>
      <div class="dz-ann-title">${esc(title)}</div>
      ${subtitle ? `<div class="dz-ann-sub">${esc(subtitle)}</div>` : ''}
      <div class="dz-ann-rule dz-flip">${fleuron()}</div>
    </div>`);
    this.el.appendChild(b);
    this.timer = window.setTimeout(() => {
      b.classList.add('dz-leaving');
      setTimeout(() => b.remove(), 600);
    }, Math.min(8000, Math.max(3200, (title.length + (subtitle?.length ?? 0)) * 55)));
  }
}

/** Flash plein écran (photo, pouvoirs) et vignette d'urgence (marée, minuteur). */
export class Overlays {
  readonly flash: HTMLElement;
  readonly rush: HTMLElement;
  private rushAmt = -1;

  constructor() {
    this.flash = document.createElement('div');
    this.flash.className = 'dz-layer dz-flash';
    this.rush = document.createElement('div');
    this.rush.className = 'dz-layer dz-rushfx';
    this.rush.innerHTML = '<div class="dz-rushfx-pulse"></div>';
  }

  screenFlash(color: string, strength: number): void {
    const s = Math.max(0, Math.min(1, strength));
    if (s <= 0) return;
    this.flash.style.background = `radial-gradient(ellipse at center, ${color} 0%, ${color} 45%, color-mix(in srgb, ${color} 70%, transparent) 100%)`;
    this.flash.getAnimations().forEach((a) => a.cancel());
    this.flash.animate([{ opacity: s }, { opacity: s * 0.85, offset: 0.15 }, { opacity: 0 }], {
      duration: 260 + s * 520,
      easing: 'ease-out',
      fill: 'forwards',
    });
  }

  setRush(amount: number): void {
    const a = Math.round(Math.max(0, Math.min(1, amount)) * 50) / 50;
    if (a === this.rushAmt) return;
    this.rushAmt = a;
    this.rush.style.opacity = String(a);
    this.rush.style.setProperty('--rush', String(a));
    this.rush.classList.toggle('dz-on', a > 0);
  }
}
