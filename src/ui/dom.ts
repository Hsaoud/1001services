/** Petits utilitaires DOM & mise en forme partagés par toute l'interface. */

type Child = Node | string | number | null | undefined | false;

/** Crée un élément HTML avec classes et enfants. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', ...children: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    e.append(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  return e;
}

/** Crée un élément à partir d'un fragment HTML (premier élément racine). */
export function html<T extends Element = HTMLElement>(markup: string): T {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild as T;
}

/** Échappe un texte destiné à être injecté dans un gabarit HTML. */
export function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** Sélecteur typé, qui lève une erreur explicite si l'élément manque (bug de gabarit). */
export function $<T extends Element = HTMLElement>(root: ParentNode, sel: string): T {
  const e = root.querySelector<T & Element>(sel);
  if (!e) throw new Error(`UI : élément introuvable « ${sel} »`);
  return e as T;
}

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
/** 12450 → « 12 450 » (espace fine insécable, à la française). */
export function fmtInt(n: number): string {
  return nf.format(Math.round(n));
}

/** 154 → « 2:34 ». */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Durée lisible : 45 → « 45 s », 200 → « 3 min 20 ». */
export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${String(r).padStart(2, '0')}` : `${m} min`;
}

/** Chiffres romains (chapitres de la carte). */
export function roman(n: number): string {
  const map: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let out = '';
  for (const [v, r] of map) {
    while (n >= v) {
      out += r;
      n -= v;
    }
  }
  return out;
}

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Attend la fin d'une durée (ms). */
export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Retire un élément après une animation de sortie (classe CSS), avec filet de sécurité. */
export function leave(el: HTMLElement, cls = 'dz-leaving', ms = 420): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      el.remove();
      resolve();
    };
    el.classList.add(cls);
    el.addEventListener('animationend', (e) => e.target === el && end());
    setTimeout(end, ms + 80);
  });
}

/** Préférence système « réduire les animations ». */
export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
