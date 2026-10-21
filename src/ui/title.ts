/** Écran-titre : carte de menu posée à gauche, le salon 3D s'anime derrière. */
import type { GameMode } from '../types';
import { LEVEL_COUNT } from '../data/progression';
import type { TitleHandlers, TitleInfo } from './api';
import { MODE_NAME, otherMode, type UiCtx } from './ctx';
import { $, esc, html } from './dom';
import { ICON } from './icons';
import type { Screen } from './nav';
import { corners, croissantArt, crown, cupArt, fleuron, sprigArt } from './ornaments';

export function createTitle(ctx: UiCtx, info: TitleInfo, h: TitleHandlers): Screen {
  const modeLine = (m: GameMode) => {
    const s = info.modes[m];
    const started = info.hasSave && (s.unlocked > 1 || Object.keys(s.best).length > 0);
    const n = Math.min(LEVEL_COUNT, Math.max(1, s.current));
    const opened = Math.min(LEVEL_COUNT, Math.max(1, s.unlocked));
    return {
      price: started ? `Service n°&nbsp;${n}` : 'Service n°&nbsp;1',
      meta: started ? `${opened} / ${LEVEL_COUNT} services ouverts` : m === 'salon' ? 'Commencer l’histoire' : 'Relever le défi',
      progress: (opened - 1) / (LEVEL_COUNT - 1),
    };
  };
  const sl = modeLine('salon');
  const cf = modeLine('coupdefeu');

  const el = html(`<div class="dz-title">
    <div class="dz-title-vignette"></div>
    <section class="dz-title-card dz-paper dz-frame" aria-label="Menu principal">
      ${corners()}
      <div class="dz-title-crown">${crown()}</div>
      <div class="dz-title-pre dz-caps">La Duchesse · Brunch à Toulouse</div>
      <h1 class="dz-title-main">
        <span class="dz-t-1001"><span class="dz-t-les">Les</span> 1001 Services</span>
        <span class="dz-t-script dz-script">de La Duchesse</span>
      </h1>
      <p class="dz-tagline">Croffles dorées, lattes soyeux et coups de feu : servez le Tout-Toulouse avec panache.</p>
      <div class="dz-fleuron-wrap">${fleuron()}</div>
      <nav class="dz-title-menu">
        <button class="dz-mi dz-mi-mode" data-nav data-mode="salon">
          <span class="dz-mi-row"><span class="dz-mi-ico">${ICON.teacup}</span><span class="dz-mi-name">Salon de Thé</span><span class="dz-mi-dots"></span><span class="dz-mi-price">${sl.price}</span></span>
          <span class="dz-mi-desc"><em>Histoire</em> — le service en douceur, sans minuteur</span>
          <span class="dz-mi-meta"><span class="dz-mi-prog"><i style="width:${(sl.progress * 100).toFixed(1)}%"></i></span>${esc(sl.meta)}</span>
        </button>
        <button class="dz-mi dz-mi-mode" data-nav data-mode="coupdefeu">
          <span class="dz-mi-row"><span class="dz-mi-ico dz-fire">${ICON.fire}</span><span class="dz-mi-name">Coup de Feu</span><span class="dz-mi-dots"></span><span class="dz-mi-price">${cf.price}</span></span>
          <span class="dz-mi-desc"><em>Défi</em> — contre la montre… gare à la marée de mousse&nbsp;!</span>
          <span class="dz-mi-meta"><span class="dz-mi-prog"><i style="width:${(cf.progress * 100).toFixed(1)}%"></i></span>${esc(cf.meta)}</span>
        </button>
        <div class="dz-mi-sep"><span></span><span class="dz-mi-sep-t dz-script">et aussi</span><span></span></div>
        <button class="dz-mi dz-mi-sub" data-nav data-act="carte" data-toggle>
          <span class="dz-mi-ico">${ICON.menu}</span><span class="dz-mi-name">La Carte des Services</span><span class="dz-mi-dots"></span><span class="dz-chip dz-modechip"><b>‹</b><span class="dz-chip-t"></span><b>›</b></span>
        </button>
        <button class="dz-mi dz-mi-sub" data-nav data-act="wardrobe" data-toggle>
          <span class="dz-mi-ico">${ICON.hanger}</span><span class="dz-mi-name">La Garde-robe</span><span class="dz-mi-dots"></span><span class="dz-chip dz-modechip"><b>‹</b><span class="dz-chip-t"></span><b>›</b></span>
        </button>
        <button class="dz-mi dz-mi-sub" data-nav data-act="settings">
          <span class="dz-mi-ico">${ICON.gear}</span><span class="dz-mi-name">Réglages</span><span class="dz-mi-dots"></span>
        </button>
      </nav>
      <div class="dz-title-art">
        <span class="dz-ta-cup">${cupArt()}</span>
        <span class="dz-ta-sprig">${sprigArt()}</span>
        <span class="dz-ta-crois">${croissantArt()}</span>
      </div>
      <footer class="dz-title-foot">
        <div class="dz-title-keys"><span class="dz-key">↑</span><span class="dz-key">↓</span> choisir <span class="dz-dot">·</span> <span class="dz-key">Entrée</span> servir</div>
        <div class="dz-title-credit">Inspiré de <em>La Duchesse</em>, brunch à Toulouse <span class="dz-dot">·</span> @laduchesse.31</div>
      </footer>
    </section>
  </div>`);

  const chips = Array.from(el.querySelectorAll<HTMLElement>('.dz-chip-t'));
  const setMode = (m: GameMode) => {
    ctx.titleMode = m;
    for (const c of chips) c.textContent = MODE_NAME[m];
    el.dataset.mode = m;
    el.querySelectorAll<HTMLElement>('.dz-mi-mode').forEach((b) => b.classList.toggle('dz-sel', b.dataset.mode === m));
  };
  setMode(ctx.titleMode);

  el.querySelectorAll<HTMLElement>('.dz-mi-mode').forEach((b) => {
    const m = b.dataset.mode as GameMode;
    b.addEventListener('dz-focus', () => setMode(m));
    b.addEventListener('click', () => h.onPlay(m));
  });
  const act = (name: string) => {
    if (name === 'carte') h.onLevelSelect(ctx.titleMode);
    else if (name === 'wardrobe') h.onWardrobe(ctx.titleMode);
    else if (name === 'settings') h.onSettings();
  };
  el.querySelectorAll<HTMLElement>('[data-act]').forEach((b) => {
    b.addEventListener('click', (e) => {
      // Clic sur le chip : bascule le mode au lieu d'ouvrir.
      if ((e.target as Element).closest('.dz-modechip')) {
        setMode(otherMode(ctx.titleMode));
        return;
      }
      act(b.dataset.act as string);
    });
  });

  const screen: Screen = {
    el,
    covers: true,
    focus: () => $(el, `.dz-mi-mode[data-mode="${ctx.titleMode}"]`),
    key(e) {
      const a = ctx.stack.current;
      if (a && a.dataset.toggle !== undefined && (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyA' || e.code === 'KeyD')) {
        setMode(otherMode(ctx.titleMode));
        const chip = a.querySelector('.dz-modechip');
        chip?.classList.remove('dz-flip');
        void (chip as HTMLElement | null)?.offsetWidth;
        chip?.classList.add('dz-flip');
        return true;
      }
      return false;
    },
  };
  return screen;
}
