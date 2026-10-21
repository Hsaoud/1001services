/** Carte d'objet d'équipement (cadre aux couleurs du rang), partagée par le butin et la garde-robe. */
import type { Item } from '../types';
import { ITEMS, tierOf } from '../data/items';
import { esc } from './dom';
import { ICON, ITEM_SVG } from './icons';

export function comparisonHtml(item: Item, current: Item | undefined): string {
  if (!current) return `<div class="dz-cmp dz-up"><span class="dz-ico">${ICON.arrowUp}</span>Emplacement libre&nbsp;: il sera équipé</div>`;
  const def = ITEMS[item.type];
  if (item.level > current.level)
    return `<div class="dz-cmp dz-up"><span class="dz-ico">${ICON.arrowUp}</span>Mieux que votre niveau ${current.level} <small>(+${item.level - current.level})</small></div>
      <div class="dz-cmp-was">Actuellement&nbsp;: ${esc(def.format(current.level))}</div>`;
  if (item.level === current.level) return `<div class="dz-cmp dz-same">Identique à votre équipement (niveau ${current.level})</div>`;
  return `<div class="dz-cmp dz-same">Déjà mieux équipé <small>(niveau ${current.level})</small></div>`;
}

export function itemCardHtml(item: Item, opts: { current?: Item | undefined; compare?: boolean; cls?: string; style?: string } = {}): string {
  const def = ITEMS[item.type];
  const tier = tierOf(item.level);
  const royal = tier.min >= 80 ? ' dz-royal' : tier.min >= 60 ? ' dz-star' : '';
  return `<div class="dz-item${royal} ${opts.cls ?? ''}" style="--tier:${tier.color};${opts.style ?? ''}" data-type="${item.type}">
    <div class="dz-item-tier dz-caps">${esc(tier.name)}</div>
    <div class="dz-item-art"><span class="dz-item-halo"></span>${ITEM_SVG[item.type]}</div>
    <div class="dz-item-slot dz-caps">${esc(def.slot)}</div>
    <div class="dz-item-name">${esc(def.name)}</div>
    <div class="dz-item-level">Niveau <b>${item.level}</b></div>
    <div class="dz-item-stat">${esc(def.format(item.level))}</div>
    ${opts.compare ? `<div class="dz-item-cmp">${comparisonHtml(item, opts.current)}</div>` : ''}
    <div class="dz-item-stamp"></div>
  </div>`;
}
