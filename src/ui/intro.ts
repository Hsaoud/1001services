/** Carte d'ouverture du service (« menu du jour ») et compte à rebours. */
import { audio } from '../audio';
import { INTRO_BY_ID } from '../data/bestiary';
import { DISHES } from '../data/dishes';
import type { IntroCard } from './api';
import { MODE_NAME, type UiCtx } from './ctx';
import { $, esc, fmtClock, fmtInt, html, wait } from './dom';
import { CATEGORY_ART, ICON, INTRO_ART } from './icons';
import { isConfirmKey, type Screen } from './nav';
import { corners, fleuron } from './ornaments';
import { controlText } from './control-text';

export function showIntroCard(ctx: UiCtx, card: IntroCard): Promise<void> {
  const p = card.plan;
  const intro = card.intro ? INTRO_BY_ID[card.intro] : null;
  const cdf = card.mode === 'coupdefeu';
  const dishes = p.dishes.filter((d) => d !== 'golden');

  const el = html(`<div class="dz-intro">
    <div class="dz-backdrop dz-soft"></div>
    <div class="dz-intro-wrap ${intro ? 'dz-has-novelty' : ''}">
      <article class="dz-intro-card dz-paper dz-frame">
        ${corners()}
        <div class="dz-h-eyebrow"><span class="dz-ico">${cdf ? ICON.fire : ICON.teacup}</span> ${MODE_NAME[card.mode]} <span class="dz-dot">·</span> ${esc(card.biomeName)}</div>
        <h2 class="dz-intro-title"><span class="dz-intro-svc dz-caps">Service</span><span class="dz-intro-no"><em>n°</em>&nbsp;${p.level}</span></h2>
        <div class="dz-intro-salon dz-script">${esc(card.salonName)}</div>
        <div class="dz-fleuron-wrap">${fleuron()}</div>
        <dl class="dz-intro-facts">
          <div><dt>Score de Service</dt><dd>${fmtInt(p.quota)}</dd></div>
          <div><dt>${cdf ? 'Minuteur' : 'Durée'}</dt><dd>${cdf ? fmtClock(p.duration) : '<em>Sans minuteur</em>'}</dd></div>
          <div><dt>Tables</dt><dd>${p.tables}${p.vipTables ? ` <small>· ${p.vipTables} VIP</small>` : ''}</dd></div>
        </dl>
        <p class="dz-intro-goal">${
          cdf
            ? 'Atteignez le score avant la fin du minuteur, puis sonnez la <b>Cloche Royale</b>… sinon, la mousse déborde&nbsp;!'
            : 'Atteignez le score à votre rythme, puis sonnez la <b>Cloche Royale</b> pour clore le service.'
        }</p>
        <div class="dz-intro-menu-h"><span></span><span class="dz-caps">Au menu aujourd’hui</span><span></span></div>
        <ul class="dz-intro-dishes">${dishes
          .map((d) => `<li>${ctx.icons.markup(d)}<span>${esc(DISHES[d].short)}</span></li>`)
          .join('')}</ul>
        <button class="dz-btn dz-primary dz-intro-go" data-nav>Commencer le service <span class="dz-key">E</span></button>
      </article>
      ${
        intro
          ? `<aside class="dz-novelty dz-paper">
        <div class="dz-nov-ribbon dz-caps">Nouveauté</div>
        <div class="dz-nov-art">${INTRO_ART[intro.id] ?? CATEGORY_ART[intro.category] ?? CATEGORY_ART['Mécanique']}</div>
        <div class="dz-nov-cat dz-caps">${esc(intro.category)}</div>
        <h3 class="dz-nov-title">${esc(intro.title)}</h3>
        <p class="dz-nov-text">${esc(intro.text)}</p>
        <div class="dz-nov-tip"><span class="dz-nov-tip-h dz-script">Le conseil du Maître</span><p>${esc(controlText(intro.tip))}</p></div>
      </aside>`
          : ''
      }
    </div>
  </div>`);

  return new Promise<void>((resolve) => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      void ctx.stack.remove(screen);
      resolve();
    };
    const btn = $(el, '.dz-intro-go');
    btn.addEventListener('click', go);
    const screen: Screen = {
      el,
      focus: () => btn,
      key(e) {
        if (isConfirmKey(e)) {
          if (!e.repeat) {
            btn.classList.add('dz-pressed');
            go();
          }
          return true;
        }
        return false;
      },
    };
    ctx.stack.push(screen);
  });
}

/** « 3 · 2 · 1 · Service ! » */
export async function runCountdown(layer: HTMLElement): Promise<void> {
  const box = html(`<div class="dz-countdown"></div>`);
  layer.appendChild(box);
  const steps = ['3', '2', '1'];
  for (const s of steps) {
    audio.sfx('countdown');
    const n = html(`<div class="dz-cd-step"><span class="dz-cd-ring"></span><span class="dz-cd-num">${s}</span></div>`);
    box.appendChild(n);
    await wait(780);
    n.classList.add('dz-out');
    setTimeout(() => n.remove(), 400);
  }
  audio.sfx('countdown', { pitch: 1.5 });
  const fin = html(`<div class="dz-cd-step dz-cd-final"><span class="dz-cd-word dz-script">Service&nbsp;!</span></div>`);
  box.appendChild(fin);
  await wait(450);
  setTimeout(() => {
    fin.classList.add('dz-out');
    setTimeout(() => box.remove(), 600);
  }, 450);
}
