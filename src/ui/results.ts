/** Fin de service : l'Addition (ticket), l'échec dans la mousse, et le grand final. */
import type { GameMode, ServiceResult } from '../types';
import { LEVEL_COUNT } from '../data/progression';
import { MODE_NAME, type UiCtx } from './ctx';
import { $, fmtClock, fmtInt, html } from './dom';
import { ICON } from './icons';
import type { Screen } from './nav';
import { corners, crown, fleuron, laurel, waxSeal } from './ornaments';

export function showResultsCard(ctx: UiCtx, r: ServiceResult): Promise<void> {
  const ratio = r.quota > 0 ? r.score / r.quota : 0;
  const lines: [string, string, string?][] = [
    ['Plats servis', fmtInt(r.served)],
    ['Pourboires', `+${fmtInt(r.tips)}`, 'dz-good'],
    ['Meilleur combo', `×${r.bestCombo}`],
    ['Commandes perdues', fmtInt(r.expired), r.expired > 0 ? 'dz-bad' : ''],
    ['Plateaux renversés', fmtInt(r.crashes), r.crashes > 0 ? 'dz-bad' : ''],
    ['Durée du service', fmtClock(r.time)],
  ];
  const now = new Date();
  const date = now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const hour = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const verdict = r.success ? (ratio >= 1.5 ? 'Service d’exception' : ratio >= 1.2 ? 'Service remarquable' : 'Service réussi') : 'Service manqué';

  const el = html(`<div class="dz-results">
    <div class="dz-backdrop"></div>
    <div class="dz-bill-wrap">
      <div class="dz-bill-shadow"><article class="dz-bill ${r.success ? 'dz-success' : 'dz-fail'}">
        <div class="dz-bill-head">
          <div class="dz-bill-brand dz-script">La Duchesse</div>
          <div class="dz-bill-addr dz-caps">Brunch · Salon de thé · Toulouse</div>
          <div class="dz-bill-title dz-caps">L’Addition</div>
          <div class="dz-bill-meta"><span>Service n°&nbsp;${r.level}</span><span>${MODE_NAME[r.mode]}</span></div>
          <div class="dz-bill-meta dz-dim"><span>${date}</span><span>${hour}</span></div>
        </div>
        <div class="dz-bill-rule"></div>
        <ul class="dz-bill-lines">
          ${lines
            .map(
              ([k, v, c], i) =>
                `<li class="${c ?? ''}" style="--i:${i}"><span class="dz-bl-k">${k}</span><span class="dz-bl-dots"></span><span class="dz-bl-v">${v}</span></li>`,
            )
            .join('')}
        </ul>
        <div class="dz-bill-rule dz-double"></div>
        <div class="dz-bill-total" style="--i:${lines.length}">
          <div class="dz-bt-row"><span class="dz-caps">Total</span><span class="dz-bt-score">${fmtInt(r.score)}</span></div>
          <div class="dz-bt-row dz-dim"><span>Score de Service demandé</span><span>${fmtInt(r.quota)}</span></div>
          <div class="dz-bt-bar"><i style="--w:${Math.min(100, ratio * 100).toFixed(1)}%"></i><b style="left:${Math.min(100, (1 / Math.max(1, ratio)) * 100).toFixed(1)}%"></b></div>
        </div>
        ${r.success ? '' : `<div class="dz-bill-inkrow"><div class="dz-stamp-ink"><span class="dz-caps">Service manqué</span><small>à reprendre</small></div></div>`}
        <div class="dz-bill-thanks dz-script">${r.success ? 'Merci de votre élégance' : 'La Duchesse compte sur vous'}</div>
        <div class="dz-bill-insta">@laduchesse.31</div>
      </article>
        ${
          r.success
            ? `<div class="dz-bill-stamp"><div class="dz-stamp-seal">${waxSeal('SERVICE RÉUSSI · LA DUCHESSE · TOULOUSE · ', 'gold', 'D')}</div><div class="dz-stamp-label dz-script">${verdict}</div></div>`
            : ''
        }
      </div>
      <div class="dz-btn-row dz-bill-actions"><button class="dz-btn dz-primary" data-nav>Continuer <span class="dz-key">E</span></button></div>
    </div>
  </div>`);

  return new Promise<void>((resolve) => {
    let done = false;
    const btn = $(el, '.dz-bill-actions .dz-btn');
    const close = () => {
      if (done) return;
      done = true;
      void ctx.stack.remove(screen);
      resolve();
    };
    btn.addEventListener('click', close);
    const screen: Screen = { el, focus: () => btn };
    ctx.stack.push(screen);
  });
}

export function showFailCard(ctx: UiCtx, r: ServiceResult): Promise<'retry' | 'quit'> {
  let bubbles = '';
  // Mousse : grappes de bulles crème.
  const seed = [
    [40, 70, 22],
    [70, 58, 26],
    [104, 66, 24],
    [132, 56, 20],
    [160, 68, 22],
    [56, 86, 18],
    [92, 84, 20],
    [128, 82, 19],
    [150, 88, 16],
    [24, 88, 14],
    [176, 86, 14],
    [84, 44, 14],
    [118, 40, 12],
  ];
  for (const [x, y, rr] of seed) bubbles += `<circle cx="${x}" cy="${y}" r="${rr}"/>`;
  const el = html(`<div class="dz-fail">
    <div class="dz-backdrop dz-foamy"></div>
    <div class="dz-fail-card dz-paper dz-frame">
      ${corners()}
      <svg class="dz-fail-art" viewBox="0 0 200 110" aria-hidden="true">
        <g fill="url(#dzg-foam)" stroke="#dcc3a0" stroke-width="1.2">${bubbles}</g>
        <g fill="#fff" opacity=".8"><circle cx="64" cy="50" r="4"/><circle cx="98" cy="58" r="3.4"/><circle cx="126" cy="48" r="3"/><circle cx="35" cy="64" r="3"/></g>
        <path d="M86 30c-3-6 2-10 6-8 2-6 10-6 12 0 5-2 9 3 6 8" fill="#fffaf2" stroke="#dcc3a0"/>
        <path d="M30 104h140" stroke="#c9a24a" stroke-width="1.2"/>
      </svg>
      <div class="dz-h-eyebrow">Service n°&nbsp;${r.level} · ${MODE_NAME[r.mode]}</div>
      <h2 class="dz-fail-title">Le service a été englouti par la mousse…</h2>
      <p class="dz-h-sub">Le cappuccino a débordé avant que le Score de Service ne soit atteint.</p>
      <div class="dz-fleuron-wrap">${fleuron()}</div>
      <div class="dz-fail-score"><span class="dz-caps">Score</span><b>${fmtInt(r.score)}</b><span class="dz-fail-q">/ ${fmtInt(r.quota)}</span></div>
      <div class="dz-fail-stats">
        <span><b>${fmtInt(r.served)}</b> plats servis</span><span class="dz-dot">·</span>
        <span><b>${fmtInt(r.expired)}</b> commandes perdues</span><span class="dz-dot">·</span>
        <span><b>${fmtInt(r.crashes)}</b> plateaux renversés</span>
      </div>
      <div class="dz-btn-row">
        <button class="dz-btn dz-primary" data-nav data-a="retry">Rejouer le service</button>
        <button class="dz-btn dz-ghost" data-nav data-a="quit">Quitter vers le titre</button>
      </div>
    </div>
  </div>`);
  return new Promise((resolve) => {
    let done = false;
    const end = (v: 'retry' | 'quit') => {
      if (done) return;
      done = true;
      void ctx.stack.remove(screen);
      resolve(v);
    };
    el.querySelectorAll<HTMLElement>('[data-a]').forEach((b) => b.addEventListener('click', () => end(b.dataset.a as 'retry' | 'quit')));
    const screen: Screen = { el, focus: () => el.querySelector<HTMLElement>('[data-a="retry"]') };
    ctx.stack.push(screen);
  });
}

export function showFinaleCard(ctx: UiCtx, mode: GameMode): Promise<void> {
  let petals = '';
  const colors = ['#f3d9d6', '#e8b4b8', '#d98c95', '#f7e4a6', '#d4a537', '#b5c9b0', '#fffaf2'];
  for (let i = 0; i < 46; i++) {
    const c = colors[i % colors.length];
    const left = (i * 37.3) % 100;
    const delay = ((i * 0.618) % 1) * 6;
    const dur = 5 + ((i * 1.7) % 4);
    const size = 0.7 + ((i * 0.37) % 1) * 0.9;
    const round = i % 3 === 0 ? '50%' : '60% 0 60% 0';
    petals += `<i style="left:${left.toFixed(1)}%;background:${c};animation-delay:-${delay.toFixed(2)}s;animation-duration:${dur.toFixed(2)}s;--s:${size.toFixed(2)};border-radius:${round}"></i>`;
  }
  const el = html(`<div class="dz-finale">
    <div class="dz-backdrop"></div>
    <div class="dz-petals">${petals}</div>
    <div class="dz-finale-card dz-paper dz-frame">
      ${corners()}
      <div class="dz-finale-crest">
        <span class="dz-fl dz-l">${laurel('', 9)}</span>
        <span class="dz-finale-crown">${crown()}</span>
        <span class="dz-fl dz-r">${laurel('', 9)}</span>
      </div>
      <div class="dz-h-eyebrow">${MODE_NAME[mode]} · ${LEVEL_COUNT} services sur ${LEVEL_COUNT}</div>
      <h2 class="dz-finale-title"><span class="dz-caps">Les 1001 Services</span><span class="dz-script">sont accomplis</span></h2>
      <div class="dz-fleuron-wrap">${fleuron()}</div>
      <p class="dz-finale-text">Cent services, mille sourires et pas une tasse renversée de trop. Le Tout-Toulouse ne parle plus que de vous&nbsp;: la Duchesse vous remet, avec sa gratitude, les clés de la Grande Galerie.</p>
      <p class="dz-finale-sign dz-script">— La Duchesse</p>
      <div class="dz-finale-badge"><span class="dz-ico">${ICON.sparkle}</span> Maître d’Hôtel de la Couronne <span class="dz-ico">${ICON.sparkle}</span></div>
      <div class="dz-btn-row"><button class="dz-btn dz-gold" data-nav>Retour au salon</button></div>
    </div>
  </div>`);
  return new Promise((resolve) => {
    let done = false;
    const btn = $(el, '.dz-finale-card .dz-btn');
    const end = () => {
      if (done) return;
      done = true;
      void ctx.stack.remove(screen);
      resolve();
    };
    btn.addEventListener('click', end);
    const screen: Screen = { el, focus: () => btn };
    ctx.stack.push(screen);
  });
}

