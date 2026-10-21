/** « La Carte des Services » : 100 services en 20 chapitres de 5, comme une carte de menu. */
import type { BiomeId, GameMode, ModeSave } from '../types';
import { INTROS } from '../data/bestiary';
import { DISHES } from '../data/dishes';
import { BIOME_NAMES, LEVEL_COUNT, biomeOf, levelPlan } from '../data/progression';
import { MODE_NAME, otherMode, type UiCtx } from './ctx';
import { $, esc, fmtClock, fmtInt, html, roman } from './dom';
import { ICON } from './icons';
import type { Screen } from './nav';
import { corners, fleuron } from './ornaments';

export const BIOME_GLYPH: Record<BiomeId, string> = {
  boudoir: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5c-5-3.4-8.5-6.6-8.5-10.4A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 8.5 2.5c0 3.8-3.5 7-8.5 10.4z" fill="currentColor" opacity=".85"/><path d="M8 9.6c.6-1 1.6-1.6 2.6-1.6" stroke="#fff" stroke-width="1.1" fill="none" stroke-linecap="round" opacity=".7"/></svg>`,
  jardin: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22V9" stroke="currentColor" stroke-width="1.4"/><path d="M12 14c-4.6 0-7-2.6-7.4-6.6 4.2-.2 7 2.2 7.4 6.6zM12 11.6c3.8 0 6-2.2 6.4-5.6-3.6-.2-6 1.8-6.4 5.6z" fill="currentColor" opacity=".85"/><circle cx="12" cy="6" r="2.4" fill="currentColor"/></svg>`,
  terrasse: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.6" fill="currentColor"/><g stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></g></svg>`,
  galerie: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21h16M5.5 19h13M6 7h12M5 5h14l-1-2H6z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/><path d="M8 8v10M12 8v10M16 8v10" stroke="currentColor" stroke-width="1.6"/></svg>`,
};

export function createLevelSelect(ctx: UiCtx, mode: GameMode, save: ModeSave, onPick: (level: number) => void, onBack: () => void): Screen {
  const unlocked = Math.max(1, Math.min(LEVEL_COUNT, save.unlocked));
  const current = Math.max(1, Math.min(unlocked, save.current || 1));
  const canToggle = !!ctx.titleHandlers;

  let chapters = '';
  for (let c = 0; c < LEVEL_COUNT / 5; c++) {
    const first = c * 5 + 1;
    const biome = biomeOf(first);
    let items = '';
    for (let L = first; L < first + 5; L++) {
      const locked = L > unlocked;
      const best = save.best[L];
      const plan = levelPlan(L);
      const won = best !== undefined && best >= plan.quota;
      const notes = INTROS.filter((i) => i.level === L);
      const cls = ['dz-lv', locked ? 'dz-locked' : '', L === current ? 'dz-current' : '', won ? 'dz-won' : ''].join(' ');
      items += `<li><button class="${cls}" data-nav data-level="${L}" ${locked ? 'aria-disabled="true"' : ''}>
        <span class="dz-lv-row">
          <span class="dz-lv-no"><em>n°</em>&nbsp;${L}</span>
          <span class="dz-lv-dots"></span>
          <span class="dz-lv-best">${locked ? `<span class="dz-ico dz-lock">${ICON.lock}</span>` : best !== undefined ? `${won ? `<span class="dz-ico dz-won-ico">${ICON.check}</span>` : ''}${fmtInt(best)}` : '<span class="dz-lv-new">à servir</span>'}</span>
        </span>
        ${notes.length ? `<span class="dz-lv-note"><span class="dz-ico">${ICON.sparkle}</span>${notes.map((n) => esc(n.title)).join(' · ')}</span>` : ''}
      </button></li>`;
    }
    chapters += `<section class="dz-chap dz-b-${biome}">
      <h3 class="dz-chap-h">
        <span class="dz-chap-glyph">${BIOME_GLYPH[biome]}</span>
        <span class="dz-chap-num dz-caps">Chapitre ${roman(c + 1)}</span>
        <span class="dz-chap-name">${esc(BIOME_NAMES[biome])}</span>
        <span class="dz-chap-range">Services ${first} à ${first + 4}</span>
      </h3>
      <ol class="dz-chap-list">${items}</ol>
    </section>`;
  }

  const el = html(`<div class="dz-ls">
    <div class="dz-backdrop"></div>
    <div class="dz-ls-card dz-paper dz-frame">
      ${corners()}
      <header class="dz-ls-head">
        <div class="dz-h-eyebrow">Les 1001 Services de La Duchesse</div>
        <h2 class="dz-h-title">La Carte des Services</h2>
        <div class="dz-ls-modes ${canToggle ? '' : 'dz-hidden'}" role="tablist">
          <button class="dz-tab ${mode === 'salon' ? 'dz-on' : ''}" data-nav data-tab="salon" role="tab">${ICON.teacup}<span>Salon de Thé</span></button>
          <button class="dz-tab ${mode === 'coupdefeu' ? 'dz-on' : ''}" data-nav data-tab="coupdefeu" role="tab">${ICON.fire}<span>Coup de Feu</span></button>
        </div>
        <div class="dz-ls-sub ${canToggle ? 'dz-hidden' : ''}"><em>${MODE_NAME[mode]}</em></div>
        <div class="dz-ls-progress"><em>${unlocked}</em> services ouverts sur ${LEVEL_COUNT}</div>
      </header>
      <div class="dz-ls-body">
        <div class="dz-ls-scroll"><div class="dz-ls-grid">${chapters}</div></div>
        <aside class="dz-ls-detail"></aside>
      </div>
      <footer class="dz-ls-foot">
        <span class="dz-ls-keys"><span class="dz-key">←</span><span class="dz-key">→</span><span class="dz-key">↑</span><span class="dz-key">↓</span> parcourir <span class="dz-dot">·</span> <span class="dz-key">Entrée</span> servir <span class="dz-dot">·</span> <span class="dz-key">Échap</span> retour</span>
        <button class="dz-btn dz-ghost dz-ls-back" data-nav>Retour</button>
      </footer>
    </div>
  </div>`);

  const detail = $(el, '.dz-ls-detail');
  let shown = -1;
  const showDetail = (L: number) => {
    if (L === shown) return;
    shown = L;
    const plan = levelPlan(L);
    const locked = L > unlocked;
    const best = save.best[L];
    const notes = INTROS.filter((i) => i.level === L);
    const vip = plan.vipTables > 0 ? ` <small>dont ${plan.vipTables} VIP</small>` : '';
    detail.innerHTML = `<div class="dz-det ${locked ? 'dz-locked' : ''}">
      <div class="dz-det-biome"><span class="dz-chap-glyph">${BIOME_GLYPH[plan.biome]}</span>${esc(BIOME_NAMES[plan.biome])}</div>
      <div class="dz-det-title"><span class="dz-caps">Service</span> <b>n°&nbsp;${L}</b></div>
      <div class="dz-det-rule">${fleuron()}</div>
      <dl class="dz-det-facts">
        <div><dt>Objectif</dt><dd>${fmtInt(plan.quota)}</dd></div>
        <div><dt>${mode === 'coupdefeu' ? 'Minuteur' : 'Durée'}</dt><dd>${mode === 'coupdefeu' ? fmtClock(plan.duration) : '<em>sans minuteur</em>'}</dd></div>
        <div><dt>Tables</dt><dd>${plan.tables}${vip}</dd></div>
        <div><dt>Meilleur score</dt><dd>${best !== undefined ? fmtInt(best) : '—'}</dd></div>
      </dl>
      <div class="dz-det-menu-h dz-caps">À la carte</div>
      <div class="dz-det-dishes">${plan.dishes.map((d) => `<span class="dz-det-dish" title="${esc(DISHES[d].name)}">${ctx.icons.markup(d)}</span>`).join('')}</div>
      ${notes.map((n) => `<div class="dz-det-note"><div class="dz-det-note-h"><span class="dz-ico">${ICON.sparkle}</span>Nouveauté · ${esc(n.category)}</div><div class="dz-det-note-t">${esc(n.title)}</div><p>${esc(n.text)}</p></div>`).join('')}
      ${locked ? `<div class="dz-det-locked"><span class="dz-ico">${ICON.lock}</span> Réussissez le service n°&nbsp;${unlocked} pour ouvrir la suite</div>` : ''}
    </div>`;
  };

  const pick = (L: number) => {
    if (L > unlocked) {
      const b = el.querySelector<HTMLElement>(`[data-level="${L}"]`);
      b?.classList.remove('dz-deny');
      void b?.offsetWidth;
      b?.classList.add('dz-deny');
      return;
    }
    void ctx.stack.remove(screen);
    onPick(L);
  };

  el.querySelectorAll<HTMLElement>('[data-level]').forEach((b) => {
    const L = Number(b.dataset.level);
    b.addEventListener('dz-focus', () => showDetail(L));
    b.addEventListener('mouseenter', () => showDetail(L));
    b.addEventListener('click', () => pick(L));
  });
  el.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => {
    b.addEventListener('click', () => {
      const m = b.dataset.tab as GameMode;
      if (m === mode || !ctx.titleHandlers) return;
      ctx.titleMode = m;
      ctx.titleHandlers.onLevelSelect(m);
    });
  });
  const back = () => {
    void ctx.stack.remove(screen);
    onBack();
  };
  $(el, '.dz-ls-back').addEventListener('click', back);
  showDetail(current);

  const screen: Screen = {
    el,
    back,
    focus: () => el.querySelector<HTMLElement>(`[data-level="${current}"]`),
    key(e) {
      // Page précédente / suivante : changer de mode rapidement.
      if ((e.code === 'PageUp' || e.code === 'PageDown') && canToggle) {
        ctx.titleHandlers?.onLevelSelect(otherMode(mode));
        return true;
      }
      return false;
    },
  };
  return screen;
}
