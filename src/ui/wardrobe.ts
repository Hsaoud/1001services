/** « La Garde-robe » : mannequin de couturière, 10 emplacements, récapitulatif des statistiques. */
import type { Equipment, GameMode, ItemType, PlayerStats, RingId } from '../types';
import { BASE, ITEMS, RING_INFO, tierOf } from '../data/items';
import { MODE_NAME, type UiCtx } from './ctx';
import { $, esc, fmtDuration, html } from './dom';
import { ICON, ITEM_SVG } from './icons';
import type { Screen } from './nav';
import { corners } from './ornaments';

const LEFT: ItemType[] = ['tray', 'vest', 'grinder'];
const RIGHT: ItemType[] = ['latte', 'passkey', 'boots'];
const RINGS: ItemType[] = ['ring_tournee', 'ring_temps', 'ring_brigade', 'ring_grace'];
const RING_IDS: RingId[] = ['tournee', 'temps', 'brigade', 'grace'];

const MANNEQUIN = `<svg class="dz-mannequin" viewBox="0 0 140 250" aria-hidden="true">
  <defs><linearGradient id="dz-mq-fab" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e9c2c4"/><stop offset=".45" stop-color="#f8e3e0"/><stop offset="1" stop-color="#dfb1b5"/></linearGradient></defs>
  <ellipse cx="70" cy="240" rx="42" ry="5" fill="#5b1f2a" opacity=".1"/>
  <path d="M70 196 42 236M70 196l28 40M70 196v42" stroke="url(#dzg-wood)" stroke-width="4" stroke-linecap="round"/>
  <circle cx="42" cy="236" r="3.4" fill="url(#dzg-gold)"/><circle cx="98" cy="236" r="3.4" fill="url(#dzg-gold)"/><circle cx="70" cy="238" r="3.4" fill="url(#dzg-gold)"/>
  <rect x="67" y="132" width="6" height="66" rx="2" fill="url(#dzg-gold-v)" stroke="#8a6420" stroke-width=".8"/>
  <rect x="62" y="184" width="16" height="7" rx="2" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width=".8"/>
  <path d="M52 30c-5 5-17 8-20 20-3 13 4 28 6 42 2 13-2 25-5 38 11 9 63 9 74 0-3-13-7-25-5-38 2-14 9-29 6-42-3-12-15-15-20-20z" fill="url(#dz-mq-fab)" stroke="#7a2e3a" stroke-width="1.4"/>
  <path d="M56 32c-2 22-6 40-4 60 2 18 0 30-2 44M84 32c2 22 6 40 4 60-2 18 0 30 2 44" fill="none" stroke="#c0606f" stroke-width=".9" stroke-dasharray="2.4 2.4" opacity=".7"/>
  <path d="M38 92c20 6 44 6 64 0" fill="none" stroke="url(#dzg-gold)" stroke-width="2.4"/>
  <path d="M33 130c12 9 62 9 74 0" fill="none" stroke="#7a2e3a" stroke-width="1.4"/>
  <path d="M52 30c4 6 10 9 18 9s14-3 18-9" fill="none" stroke="#7a2e3a" stroke-width="1.4"/>
  <rect x="62" y="16" width="16" height="16" rx="3" fill="url(#dz-mq-fab)" stroke="#7a2e3a" stroke-width="1.2"/>
  <ellipse cx="70" cy="16" rx="11" ry="3.4" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width="1"/>
  <circle cx="70" cy="9" r="5" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width="1"/>
  <path d="M63 41l7 4 7-4v8l-7-4-7 4z" fill="#7a2e3a" stroke="#4a1520" stroke-width=".8"/>
  <path d="M44 52c-2 10 0 22 3 32" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".55"/>
  <g fill="#c9a24a"><circle cx="70" cy="60" r="1.6"/><circle cx="70" cy="72" r="1.6"/><circle cx="70" cy="84" r="1.6"/></g>
</svg>`;

function slotHtml(type: ItemType, eq: Equipment, compact = false): string {
  const it = eq[type];
  const def = ITEMS[type];
  if (!it)
    return `<button class="dz-wslot dz-empty ${compact ? 'dz-compact' : ''}" data-nav data-type="${type}">
      <span class="dz-ws-art">${ITEM_SVG[type]}</span>
      <span class="dz-ws-info"><span class="dz-ws-slot dz-caps">${esc(def.slot)}</span><span class="dz-ws-name">Emplacement libre</span></span>
    </button>`;
  const tier = tierOf(it.level);
  return `<button class="dz-wslot ${compact ? 'dz-compact' : ''}" data-nav data-type="${type}" style="--tier:${tier.color}">
    <span class="dz-ws-art">${ITEM_SVG[type]}</span>
    <span class="dz-ws-info"><span class="dz-ws-slot dz-caps">${esc(def.slot)}</span><span class="dz-ws-name">${esc(def.name)}</span><span class="dz-ws-lvl">Niv.&nbsp;<b>${it.level}</b> · ${esc(tier.name)}</span></span>
  </button>`;
}

const pct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(0)}&nbsp;%`;
const num = (x: number, d = 1) => x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

export function createWardrobe(ctx: UiCtx, mode: GameMode, eq: Equipment, stats: PlayerStats, onClose: () => void): Screen {
  const canToggle = !!ctx.titleHandlers;
  const speedPct = (stats.speed / BASE.speed - 1) * 100;
  const rows: [string, string][] = [
    ['Vitesse', `${num(stats.speed)}&nbsp;m/s <small>${speedPct > 0.05 ? pct(speedPct) : ''}</small>`],
    ['Équilibre', `${Math.round(stats.balanceMax)} <small>points</small>`],
    ['Pourboire', stats.tipBonus > 0 ? pct(stats.tipBonus * 100) : '—'],
    ['Capacité du plateau', `${stats.capacity} <small>plats</small>`],
    ['Pas chassé', `${stats.dashCharges} <small>charge${stats.dashCharges > 1 ? 's' : ''}</small>`],
    ['Recharge du Pas chassé', `${num(stats.dashCooldown, 2)}&nbsp;s`],
    ['Passe-Partout', stats.passkeyCooldown === null ? '<em>non porté</em>' : `recharge ${num(stats.passkeyCooldown)}&nbsp;s`],
  ];
  const ringRows = RING_IDS.map((id) => {
    const cd = stats.rings[id];
    return `<li class="${cd === null ? 'dz-off' : ''}"><span class="dz-key">${RING_INFO[id].key}</span><span class="dz-rr-name">${esc(RING_INFO[id].name)}</span><span class="dz-bl-dots"></span><span class="dz-rr-v">${cd === null ? '<em>non équipé</em>' : fmtDuration(cd)}</span></li>`;
  }).join('');

  const el = html(`<div class="dz-wardrobe">
    <div class="dz-backdrop"></div>
    <div class="dz-wr-card dz-paper dz-frame">
      ${corners()}
      <header class="dz-wr-head">
        <div class="dz-h-eyebrow">Les 1001 Services de La Duchesse</div>
        <h2 class="dz-h-title">La Garde-robe</h2>
        <div class="dz-ls-modes ${canToggle ? '' : 'dz-hidden'}">
          <button class="dz-tab ${mode === 'salon' ? 'dz-on' : ''}" data-nav data-tab="salon">${ICON.teacup}<span>Salon de Thé</span></button>
          <button class="dz-tab ${mode === 'coupdefeu' ? 'dz-on' : ''}" data-nav data-tab="coupdefeu">${ICON.fire}<span>Coup de Feu</span></button>
        </div>
        <div class="dz-ls-sub ${canToggle ? 'dz-hidden' : ''}"><em>${MODE_NAME[mode]}</em></div>
      </header>
      <div class="dz-wr-body">
        <div class="dz-wr-doll">
          <div class="dz-wr-col">${LEFT.map((t) => slotHtml(t, eq)).join('')}</div>
          <div class="dz-wr-figure"><div class="dz-wr-spot"></div>${MANNEQUIN}</div>
          <div class="dz-wr-col">${RIGHT.map((t) => slotHtml(t, eq)).join('')}</div>
          <div class="dz-wr-rings"><div class="dz-wr-rings-h"><span></span><span class="dz-caps">Les anneaux royaux</span><span></span></div><div class="dz-wr-rings-row">${RINGS.map((t) => slotHtml(t, eq, true)).join('')}</div></div>
        </div>
        <aside class="dz-wr-side">
          <div class="dz-wr-detail"></div>
          <div class="dz-wr-stats">
            <div class="dz-wr-stats-h dz-caps">Vos atouts de service</div>
            <ul class="dz-wr-list">${rows.map(([k, v]) => `<li><span>${k}</span><span class="dz-bl-dots"></span><span class="dz-rr-v">${v}</span></li>`).join('')}</ul>
            <div class="dz-wr-stats-h dz-caps dz-sub">Pouvoirs des anneaux <small>· recharge</small></div>
            <ul class="dz-wr-list dz-wr-rings-list">${ringRows}</ul>
          </div>
        </aside>
      </div>
      <footer class="dz-ls-foot">
        <span class="dz-ls-keys"><span class="dz-key">←</span><span class="dz-key">→</span><span class="dz-key">↑</span><span class="dz-key">↓</span> parcourir <span class="dz-dot">·</span> <span class="dz-key">Échap</span> fermer</span>
        <button class="dz-btn dz-ghost dz-wr-close" data-nav>Fermer</button>
      </footer>
    </div>
  </div>`);

  const detail = $(el, '.dz-wr-detail');
  const showDetail = (type: ItemType) => {
    const it = eq[type];
    const def = ITEMS[type];
    if (!it) {
      detail.innerHTML = `<div class="dz-wd dz-empty"><div class="dz-wd-slot dz-caps">${esc(def.slot)}</div><div class="dz-wd-name">${esc(def.name)}</div><p>${esc(def.description)}</p><div class="dz-wd-stat"><em>Pas encore dans votre garde-robe&nbsp;: réussissez des services pour l’obtenir.</em></div></div>`;
      return;
    }
    const tier = tierOf(it.level);
    detail.innerHTML = `<div class="dz-wd" style="--tier:${tier.color}">
      <div class="dz-wd-slot dz-caps">${esc(def.slot)} · <span class="dz-wd-tier">${esc(tier.name)}</span></div>
      <div class="dz-wd-name">${esc(def.name)}</div>
      <div class="dz-wd-stat"><b>Niveau ${it.level}</b> — ${esc(def.format(it.level))}</div>
      <p>${esc(def.description)}</p>
      ${def.ring ? `<div class="dz-wd-ring"><span class="dz-key">${RING_INFO[def.ring].key}</span> ${esc(RING_INFO[def.ring].power)}</div>` : ''}
    </div>`;
  };
  el.querySelectorAll<HTMLElement>('[data-type]').forEach((b) => {
    const t = b.dataset.type as ItemType;
    b.addEventListener('dz-focus', () => showDetail(t));
    b.addEventListener('mouseenter', () => showDetail(t));
  });
  el.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      const m = b.dataset.tab as GameMode;
      if (m === mode || !ctx.titleHandlers) return;
      ctx.titleMode = m;
      ctx.titleHandlers.onWardrobe(m);
    }),
  );
  const close = () => {
    void ctx.stack.remove(screen);
    onClose();
  };
  $(el, '.dz-wr-close').addEventListener('click', close);
  const first = (Object.keys(ITEMS) as ItemType[]).find((t) => eq[t]) ?? 'tray';
  showDetail(first);
  const screen: Screen = {
    el,
    back: close,
    focus: () => el.querySelector<HTMLElement>(`[data-type="${first}"]`),
  };
  return screen;
}
