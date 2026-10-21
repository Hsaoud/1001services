/**
 * Révélation de l'objet gagné (la cloche d'argent se soulève), comparaison avec l'équipement porté,
 * puis Roue de Dégustation optionnelle (une seule fois) et validation.
 */
import { audio } from '../audio';
import type { Item } from '../types';
import type { WheelOutcome } from '../data/items';
import { ITEMS } from '../data/items';
import type { LootFlow } from './api';
import type { UiCtx } from './ctx';
import { $, esc, html, wait } from './dom';
import { ICON } from './icons';
import { itemCardHtml } from './itemcard';
import { isConfirmKey, type Screen } from './nav';
import { bigCloche, fleuron } from './ornaments';
import { Wheel } from './wheel';

function outcomeText(o: WheelOutcome): string {
  switch (o.kind) {
    case 'level':
      return o.delta > 0 ? `Le niveau de l’objet grimpe de ${o.delta}&nbsp;!` : `Aïe… le niveau de l’objet baisse de ${-o.delta}.`;
    case 'double':
      return 'Doublé&nbsp;! Un second objet du même niveau vous est offert.';
    case 'reroll':
      return 'Un autre plat vous est servi… surprise du chef&nbsp;!';
    case 'keep':
      return 'On garde la même assiette.';
  }
}

export function showLootFlow(ctx: UiCtx, flow: LootFlow): Promise<void> {
  const el = html(`<div class="dz-loot">
    <div class="dz-backdrop"></div>
    <div class="dz-loot-stage">
      <div class="dz-h-eyebrow">Service n°&nbsp;${flow.item.level} réussi · un présent de la Duchesse</div>
      <h2 class="dz-h-title dz-loot-title">Votre récompense</h2>
      <div class="dz-loot-rule">${fleuron()}</div>
      <div class="dz-loot-main">
        <div class="dz-loot-reveal">
          <div class="dz-loot-rays"></div>
          <div class="dz-loot-cards"></div>
          <div class="dz-loot-cloche">${bigCloche()}</div>
        </div>
        <div class="dz-loot-wheel dz-hidden"></div>
      </div>
      <div class="dz-loot-note"></div>
      <div class="dz-btn-row dz-loot-actions"></div>
    </div>
  </div>`);
  const cards = $(el, '.dz-loot-cards');
  const reveal = $(el, '.dz-loot-reveal');
  const wheelBox = $(el, '.dz-loot-wheel');
  const note = $(el, '.dz-loot-note');
  const actions = $(el, '.dz-loot-actions');
  const title = $(el, '.dz-loot-title');

  let busy = true;
  let wheelUsed = false;
  let items: Item[] = [flow.item];

  const renderCards = (list: Item[]) => {
    cards.innerHTML = list.map((it, i) => itemCardHtml(it, { current: flow.currentOf(it.type), compare: true, cls: 'dz-reveal-card', style: `--d:${i * 0.18}s` })).join('');
    cards.classList.toggle('dz-two', list.length > 1);
  };

  const setActions = (btns: { label: string; cls?: string; act: () => void; key?: boolean }[]) => {
    actions.innerHTML = '';
    for (const b of btns) {
      const e = html<HTMLButtonElement>(`<button class="dz-btn ${b.cls ?? ''}" data-nav>${b.label}${b.key ? ' <span class="dz-key">E</span>' : ''}</button>`);
      e.addEventListener('click', () => {
        if (!busy) b.act();
      });
      actions.appendChild(e);
    }
    requestAnimationFrame(() => {
      const first = actions.firstElementChild as HTMLElement | null;
      if (first) ctx.stack.select(first);
    });
  };

  return new Promise<void>((resolve) => {
    const finish = () => {
      void ctx.stack.remove(screen);
      resolve();
    };

    const accept = () => {
      busy = true;
      wheelBox.classList.add('dz-hidden');
      reveal.classList.remove('dz-hidden');
      // Les comparaisons sont calculées avant l'équipement.
      renderCards(items);
      const res = flow.accept(items);
      cards.querySelectorAll<HTMLElement>('.dz-item').forEach((c, i) => {
        c.classList.remove('dz-reveal-card');
        const ok = res[i] ?? false;
        c.classList.add(ok ? 'dz-equipped' : 'dz-stored');
        const stamp = c.querySelector('.dz-item-stamp') as HTMLElement;
        stamp.innerHTML = ok ? `<span class="dz-ico">${ICON.check}</span> Équipé` : 'Non équipé';
        const cmp = c.querySelector('.dz-item-cmp');
        if (cmp && !ok) cmp.innerHTML = `<div class="dz-cmp dz-same">Vous portez déjà mieux&nbsp;: l’objet est rendu à la Duchesse.</div>`;
      });
      const any = res.some(Boolean);
      title.innerHTML = any ? 'Nouvelle tenue&nbsp;!' : 'Merci, Maître d’Hôtel';
      note.innerHTML = any ? '<em>La Garde-robe a été mise à jour.</em>' : '<em>Votre équipement actuel reste en place.</em>';
      setActions([{ label: 'Continuer', cls: 'dz-primary', act: finish, key: true }]);
      setTimeout(() => (busy = false), 350);
    };

    const offer = () => {
      busy = false;
      wheelBox.classList.add('dz-hidden');
      reveal.classList.remove('dz-hidden');
      const def = ITEMS[flow.item.type];
      note.innerHTML = `<em>${esc(def.description)}</em>`;
      const btns: { label: string; cls?: string; act: () => void; key?: boolean }[] = [{ label: 'Accepter', cls: 'dz-primary', act: accept, key: true }];
      if (!wheelUsed && flow.wheel.length) btns.push({ label: 'Tenter la Roue de Dégustation', cls: 'dz-gold', act: openWheel });
      setActions(btns);
    };

    let wheel: Wheel | null = null;
    const openWheel = () => {
      if (wheelUsed) return;
      reveal.classList.add('dz-hidden');
      wheelBox.classList.remove('dz-hidden');
      if (!wheel) {
        wheel = new Wheel(flow.wheel);
        wheelBox.innerHTML = '';
        const side = html(`<div class="dz-wheel-side">
          <div class="dz-ws-h dz-script">La Roue de Dégustation</div>
          <p>Tentez votre chance&nbsp;: le niveau de votre <b>${esc(ITEMS[flow.item.type].name)}</b> (niveau ${flow.item.level}) peut grimper… ou baisser. Une seule tentative.</p>
          <ul class="dz-ws-odds">${(() => {
            const tot = flow.wheel.reduce((s, x) => s + x.weight, 0) || 1;
            return flow.wheel
              .map((s) => `<li class="dz-tone-${s.tone}"><i></i><span>${esc(s.label)}</span><b>${Math.round((s.weight / tot) * 100)}&nbsp;%</b></li>`)
              .join('');
          })()}</ul>
        </div>`);
        wheelBox.append(wheel.el, side);
      }
      note.innerHTML = '';
      title.innerHTML = 'Roue de Dégustation';
      setActions([
        { label: 'Faire tourner la Roue', cls: 'dz-gold', act: spin, key: true },
        { label: 'Revenir', cls: 'dz-ghost', act: offer },
      ]);
    };

    const spin = async () => {
      if (wheelUsed || !wheel) return;
      wheelUsed = true;
      busy = true;
      actions.querySelectorAll('button').forEach((b) => b.setAttribute('aria-disabled', 'true'));
      const res = flow.spin();
      items = res.items.length ? res.items : [flow.item];
      await wheel.spin(res.segment);
      const seg = flow.wheel[res.segment];
      await wait(500);
      wheelBox.classList.add('dz-hidden');
      reveal.classList.remove('dz-hidden');
      reveal.classList.add('dz-open');
      title.innerHTML = esc(seg?.label ?? 'Résultat');
      note.innerHTML = seg ? `<em>${outcomeText(seg.outcome)}</em>` : '';
      renderCards(items);
      audio.sfx('loot_reveal');
      setActions([{ label: 'Accepter', cls: 'dz-primary', act: accept, key: true }]);
      setTimeout(() => (busy = false), 400);
    };

    const screen: Screen = {
      el,
      key(e) {
        if (busy && (isConfirmKey(e) || e.code.startsWith('Arrow'))) return true;
        if (e.code === 'Escape' || e.code === 'Backspace') {
          if (!wheelBox.classList.contains('dz-hidden') && !wheelUsed) offer();
          return true;
        }
        return false;
      },
    };
    ctx.stack.push(screen);

    // Révélation : la cloche se soulève.
    renderCards(items);
    (async () => {
      await wait(750);
      reveal.classList.add('dz-open');
      audio.sfx('loot_reveal');
      await wait(900);
      reveal.classList.add('dz-done');
      offer();
    })();
  });
}
