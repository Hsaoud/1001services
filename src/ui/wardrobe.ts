/** « La Garde-robe » : portrait en pied de La Duchesse sur son piédestal royal, 10 emplacements, récapitulatif des statistiques. */
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

const DUCHESS_SVG = `<svg class="dz-mannequin dz-duchess-svg" viewBox="0 0 180 280" aria-hidden="true">
  <defs>
    <linearGradient id="dz-dc-skirt" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#e3d5c1"/>
      <stop offset=".25" stop-color="#f8f1e5"/>
      <stop offset=".5" stop-color="#fffaf0"/>
      <stop offset=".75" stop-color="#f4eadb"/>
      <stop offset="1" stop-color="#dccbb4"/>
    </linearGradient>
    <linearGradient id="dz-dc-velvet" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#752646"/>
      <stop offset=".5" stop-color="#581c34"/>
      <stop offset="1" stop-color="#3a0f21"/>
    </linearGradient>
    <linearGradient id="dz-dc-hair" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6e4331"/>
      <stop offset=".5" stop-color="#523022"/>
      <stop offset="1" stop-color="#381e14"/>
    </linearGradient>
    <linearGradient id="dz-dc-skin" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fae2d2"/>
      <stop offset="1" stop-color="#ecc5b0"/>
    </linearGradient>
    <linearGradient id="dz-dc-ped" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#dfd1bd"/>
      <stop offset=".5" stop-color="#fbf5ea"/>
      <stop offset="1" stop-color="#d5c4ad"/>
    </linearGradient>
  </defs>
  <!-- Ombre au sol & Piédestal royal ivoire et or -->
  <ellipse cx="90" cy="264" rx="64" ry="8" fill="#4a1520" opacity=".18"/>
  <ellipse cx="90" cy="256" rx="58" ry="9" fill="url(#dz-dc-ped)" stroke="#8a6420" stroke-width="1.2"/>
  <ellipse cx="90" cy="252" rx="55" ry="7.5" fill="none" stroke="url(#dzg-gold)" stroke-width="2.2"/>
  <path d="M40 232h100l-4 20c-22 6-70 6-92 0z" fill="url(#dz-dc-ped)" stroke="#8a6420" stroke-width="1.1"/>
  <path d="M38 242c26 6 78 6 104 0" fill="none" stroke="url(#dzg-gold)" stroke-width="2.4"/>
  <ellipse cx="90" cy="231" rx="52" ry="8" fill="url(#dz-dc-ped)" stroke="url(#dzg-gold)" stroke-width="2"/>
  <ellipse cx="90" cy="229" rx="46" ry="5.5" fill="#fffaf0" opacity=".8"/>

  <!-- Jupe à crinoline plissée ivoire -->
  <path d="M68 128c-18 14-34 52-38 95 28 12 92 12 120 0-4-43-20-81-38-95z" fill="url(#dz-dc-skirt)" stroke="#8a6420" stroke-width="1.2"/>
  <!-- Plis verticaux de la crinoline -->
  <g stroke="#d2c0a8" stroke-width="1.1" fill="none" opacity=".8">
    <path d="M74 132c-10 26-18 58-22 92"/>
    <path d="M80 133c-6 28-10 60-12 94"/>
    <path d="M86 134c-2 28-3 60-3 95"/>
    <path d="M94 134c2 28 3 60 3 95"/>
    <path d="M100 133c6 28 10 60 12 94"/>
    <path d="M106 132c10 26 18 58 22 92"/>
  </g>
  <!-- Bande bordeaux et doubles galons d'or à l'ourlet -->
  <path d="M31.5 208c30 11 87 11 117 0l1.5 15c-28 12-92 12-120 0z" fill="url(#dz-dc-velvet)"/>
  <path d="M31.5 208c30 11 87 11 117 0" fill="none" stroke="url(#dzg-gold)" stroke-width="2.6"/>
  <path d="M30 223c28 12 92 12 120 0" fill="none" stroke="url(#dzg-gold)" stroke-width="2.2"/>

  <!-- Pans drapés latéraux en velours bordeaux bordés d'or -->
  <path d="M68 126c-16 6-27 28-30 56 8 4 16 2 22-6 4-14 7-32 10-48z" fill="url(#dz-dc-velvet)" stroke="url(#dzg-gold)" stroke-width="1.8"/>
  <path d="M112 126c16 6 27 28 30 56-8 4-16 2-22-6-4-14-7-32-10-48z" fill="url(#dz-dc-velvet)" stroke="url(#dzg-gold)" stroke-width="1.8"/>

  <!-- Bras & Manches ballons bordeaux -->
  <path d="M62 96c-8 10-12 22-8 32 3 6 9 8 14 6" fill="none" stroke="url(#dz-dc-skin)" stroke-width="7.5" stroke-linecap="round"/>
  <path d="M118 96c8 10 12 22 8 32-3 6-9 8-14 6" fill="none" stroke="url(#dz-dc-skin)" stroke-width="7.5" stroke-linecap="round"/>
  <ellipse cx="62" cy="96" rx="10.5" ry="11.5" fill="url(#dz-dc-velvet)" stroke="url(#dzg-gold)" stroke-width="1.5"/>
  <ellipse cx="118" cy="96" rx="10.5" ry="11.5" fill="url(#dz-dc-velvet)" stroke="url(#dzg-gold)" stroke-width="1.5"/>
  <path d="M53 104c5 3 12 3 17 0M110 104c5 3 12 3 17 0" fill="none" stroke="url(#dzg-gold)" stroke-width="2.4" stroke-linecap="round"/>

  <!-- Corset royal en velours bordeaux et basque en pointe -->
  <path d="M66 86h48l-6 42L90 140l-18-12z" fill="url(#dz-dc-velvet)" stroke="url(#dzg-gold)" stroke-width="1.8"/>
  <!-- Décolleté et cou -->
  <path d="M83 72h14v16H83z" fill="url(#dz-dc-skin)"/>
  <path d="M72 84c6 6 30 6 36 0l-3 13c-9 4-21 4-30 0z" fill="url(#dz-dc-skin)"/>
  <path d="M72 85c5 11 31 11 36 0" fill="none" stroke="url(#dzg-gold)" stroke-width="2.4"/>
  <!-- Baleines d'or et bijou rubis de corsage -->
  <path d="M81 97l3 35M99 97l-3 35" fill="none" stroke="url(#dzg-gold)" stroke-width="1.3" opacity=".85"/>
  <circle cx="90" cy="96" r="4" fill="#8c1d3b" stroke="url(#dzg-gold)" stroke-width="1.5"/>

  <!-- Coiffure châtain : volume arrière & chignon haut côtelé -->
  <ellipse cx="90" cy="24" rx="20" ry="14" fill="url(#dz-dc-hair)" stroke="#2e170e" stroke-width="1"/>
  <path d="M78 14c-2 6-2 14 0 20M86 11c-1 8-1 16 0 22M94 11c1 8 1 16 0 22M102 14c2 6 2 14 0 20" fill="none" stroke="#381e14" stroke-width="1.1" opacity=".7"/>
  <circle cx="90" cy="54" r="28" fill="url(#dz-dc-hair)"/>

  <!-- Diadème doré serti de rubis -->
  <path d="M68 33c7-5 37-5 44 0l-3-12-8 6-6-10-5 9-5-9-6 10-8-6z" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width="1"/>
  <circle cx="90" cy="15" r="2.3" fill="url(#dzg-gold)"/>
  <circle cx="79" cy="19" r="1.9" fill="url(#dzg-gold)"/>
  <circle cx="101" cy="19" r="1.9" fill="url(#dzg-gold)"/>
  <circle cx="90" cy="28" r="2.6" fill="#8c1d3b" stroke="#fff3c4" stroke-width=".6"/>
  <circle cx="80" cy="30" r="2" fill="#8c1d3b"/>
  <circle cx="100" cy="30" r="2" fill="#8c1d3b"/>

  <!-- Visage de La Duchesse -->
  <ellipse cx="90" cy="57" rx="22" ry="21" fill="url(#dz-dc-skin)" stroke="#d7ab94" stroke-width=".8"/>
  <!-- Bandeaux bouffants séparés au milieu -->
  <path d="M90 35c-10 0-22 7-24 20 6-6 16-9 24-14 8 5 18 8 24 14-2-13-14-20-24-20z" fill="url(#dz-dc-hair)"/>
  <!-- Joues rosées, yeux expressifs et sourire -->
  <ellipse cx="76" cy="62" rx="4.5" ry="2.6" fill="#f4a3ad" opacity=".65"/>
  <ellipse cx="104" cy="62" rx="4.5" ry="2.6" fill="#f4a3ad" opacity=".65"/>
  <path d="M76 50c3-2 6-2 9 0M95 50c3-2 6-2 9 0" fill="none" stroke="#4a2a1c" stroke-width="1.5" stroke-linecap="round"/>
  <ellipse cx="80.5" cy="56" rx="2.7" ry="3.3" fill="#2b2230"/>
  <ellipse cx="99.5" cy="56" rx="2.7" ry="3.3" fill="#2b2230"/>
  <circle cx="79.7" cy="54.8" r="1" fill="#fff"/>
  <circle cx="98.7" cy="54.8" r="1" fill="#fff"/>
  <path d="M85.5 65.5c2.5 2.8 6.5 2.8 9 0" fill="none" stroke="#8a3444" stroke-width="1.8" stroke-linecap="round"/>
  <!-- Boucles d'oreilles -->
  <circle cx="66.5" cy="61" r="2.2" fill="url(#dzg-gold)"/>
  <circle cx="66.5" cy="65" r="2.5" fill="#8c1d3b"/>
  <circle cx="113.5" cy="61" r="2.2" fill="url(#dzg-gold)"/>
  <circle cx="113.5" cy="65" r="2.5" fill="#8c1d3b"/>
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
  const portraitUrl = ctx.duchessPortrait?.() ?? '';
  const figureContent = portraitUrl
    ? `<img class="dz-duchess-portrait" src="${portraitUrl}" alt="La Duchesse" draggable="false" />${DUCHESS_SVG}`
    : DUCHESS_SVG;
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
          <div class="dz-wr-figure ${portraitUrl ? 'dz-has-3d' : ''}"><div class="dz-wr-spot"></div>${figureContent}<div class="dz-wr-caption dz-caps">Sa Grâce La Duchesse</div></div>
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
