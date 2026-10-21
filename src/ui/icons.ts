/**
 * Icônes SVG de l'interface : plats (secours tant que les icônes 3D ne sont pas prêtes),
 * équipement (10 objets), anneaux, petits pictogrammes du HUD.
 */
import type { DishId, ItemType, RingId } from '../types';
import { RING_ITEM } from '../data/items';

const INK = '#5b1f2a';

// ─────────────────────────────────────────── Plats (viewBox 48)

export const DISH_SVG: Record<DishId, string> = {
  croffle: `<svg viewBox="0 0 48 48" aria-hidden="true">
    <ellipse cx="24" cy="40" rx="19" ry="3.6" fill="#fffaf2" stroke="#d8c6ad" stroke-width="1"/>
    <path d="M4.5 32C4.5 21 13.5 14.5 24 14.5S43.5 21 43.5 32c0 4-3.4 5.4-6.4 3.2C34 30 29.4 27.6 24 27.6S14 30 10.9 35.2c-3 2.2-6.4.8-6.4-3.2z" fill="url(#dzp-waffle)" stroke="#8a5a2b" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M8 30c2-7 8-11.5 16-11.5S38 23 40 30" fill="none" stroke="#f6d38c" stroke-width="1.2" opacity=".7"/>
    <path d="M16.5 23.5c0-5 3.6-7.6 7.5-11.5 3.9 3.9 7.5 6.5 7.5 11.5-3 2.4-12 2.4-15 0z" fill="#fffdf7" stroke="#dccbb3" stroke-width="1"/>
    <path d="M19 21.5c2.5 1 7.5 1 10 0M21 17.5c1.8.7 4.2.7 6 0" fill="none" stroke="#e5d6c0" stroke-width=".9"/>
    <circle cx="27.5" cy="11.6" r="2.7" fill="#c8323f" stroke="#8a1f2a" stroke-width=".8"/><circle cx="26.7" cy="10.8" r=".7" fill="#fff" opacity=".8"/>
  </svg>`,
  brioche: `<svg viewBox="0 0 48 48" aria-hidden="true">
    <ellipse cx="24" cy="41" rx="19" ry="3.6" fill="#fffaf2" stroke="#d8c6ad" stroke-width="1"/>
    <path d="M9 38V21.5C9 13.5 15 9 21 10c1.6-2.4 4.4-2.4 6 0 6-1 12 3.5 12 11.5V38c0 1.8-1.4 2.6-3 2.6H12c-1.6 0-3-.8-3-2.6z" fill="#c9782f" stroke="#6e3d16" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M12.4 37V22c0-6 4.6-9 8.8-8.3 1.4.2 2.4-1.5 2.8-1.5s1.4 1.7 2.8 1.5c4.2-.7 8.8 2.3 8.8 8.3v15z" fill="#f2c47a"/>
    <path d="M13.5 22.5c3 2 6 .5 9 2s6.5 1 11.5-1.5" fill="none" stroke="#d68b3c" stroke-width="2.2" stroke-linecap="round" opacity=".75"/>
    <g fill="#fff" opacity=".9"><circle cx="17" cy="28" r=".9"/><circle cx="22" cy="31" r=".7"/><circle cx="28" cy="27" r=".9"/><circle cx="31" cy="32" r=".7"/><circle cx="19" cy="34" r=".7"/><circle cx="25" cy="35" r=".9"/></g>
    <circle cx="33" cy="15.5" r="3" fill="#c8323f" stroke="#8a1f2a" stroke-width=".8"/><circle cx="29" cy="13.2" r="2.4" fill="#4a3f8a" stroke="#2c2560" stroke-width=".8"/>
    <path d="M35 11c2-1.6 4.6-1 5 .6-2 .4-3.6.2-5-.6z" fill="#7fa58a"/>
  </svg>`,
  pancakes: `<svg viewBox="0 0 48 48" aria-hidden="true">
    <ellipse cx="24" cy="40.5" rx="20" ry="4.2" fill="#fffaf2" stroke="#d8c6ad" stroke-width="1"/>
    <path d="M6.5 34c0-3.6 35-3.6 35 0v3c0 4.4-35 4.4-35 0z" fill="#d79a4f" stroke="#8a5a2b" stroke-width="1.2"/>
    <ellipse cx="24" cy="34" rx="17.5" ry="3.6" fill="#efc884"/>
    <path d="M7.5 28.5c0-3.6 33-3.6 33 0v3c0 4.4-33 4.4-33 0z" fill="#d79a4f" stroke="#8a5a2b" stroke-width="1.2"/>
    <ellipse cx="24" cy="28.5" rx="16.5" ry="3.5" fill="#efc884"/>
    <path d="M8.5 23c0-3.6 31-3.6 31 0v3c0 4.4-31 4.4-31 0z" fill="#d79a4f" stroke="#8a5a2b" stroke-width="1.2"/>
    <ellipse cx="24" cy="23" rx="15.5" ry="3.4" fill="#f3d394"/>
    <path d="M12 22.4c3 2.6 18 2.8 24-.2.8 1.6.6 3.6.4 5.6-.1 1.4-1.6 1.4-1.7 0l-.1-2.2c-1.6 1-3.8 1.2-5.4 1.2-.1 2.2-.3 4.6-.5 5.8-.2 1.4-1.8 1.4-1.9 0l-.3-5.6c-4 .2-9-.4-12.2-1.8-.1 1.2-.4 2.6-.6 3.2-.4 1-1.6.8-1.6-.2z" fill="#a8581a" opacity=".85"/>
    <rect x="20" y="16.6" width="8" height="4.6" rx="1.2" fill="#fff1b5" stroke="#d6b85a" stroke-width=".9"/>
    <path d="M21 17.6h4" stroke="#fff" stroke-width=".9" stroke-linecap="round"/>
  </svg>`,
  tiramisu: `<svg viewBox="0 0 48 48" aria-hidden="true">
    <ellipse cx="24" cy="42.5" rx="15" ry="2.8" fill="#000" opacity=".08"/>
    <path d="M12.6 13.5h22.8l-1.7 25.6c-.1 1.6-1.4 2.9-3 2.9H17.3c-1.6 0-2.9-1.3-3-2.9z" fill="#f8ecdc"/>
    <path d="M14.2 31.5h19.6l-.5 7.4c-.1 1.2-1 2.1-2.2 2.1H16.9c-1.2 0-2.1-.9-2.2-2.1z" fill="#8a5a44"/>
    <path d="M13.9 27h20.2l-.2 2.6H14.1z" fill="#6e4330"/>
    <path d="M13.3 18.2h21.4l-.2 2.4H13.5z" fill="#7a4c36" opacity=".85"/>
    <path d="M12.8 14.2h22.4l-.2 2.6H13z" fill="#5a3422"/>
    <g fill="#3e2416" opacity=".55"><circle cx="17" cy="15.2" r=".6"/><circle cx="21" cy="15.6" r=".5"/><circle cx="25" cy="15" r=".6"/><circle cx="29" cy="15.5" r=".5"/><circle cx="32.5" cy="15.1" r=".6"/></g>
    <path d="M12 12.5h24l-2.6 27c-.2 2-1.8 3.5-3.8 3.5H18.4c-2 0-3.6-1.5-3.8-3.5z" fill="none" stroke="#8a5a44" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M15.5 16v22" stroke="#fff" stroke-width="1.4" opacity=".55" stroke-linecap="round"/>
    <path d="M24 12.4c1-3.6 4.6-5 7.4-4-1 3-4 4.4-7.4 4z" fill="#7fa58a" stroke="#4f7a5a" stroke-width=".8"/>
  </svg>`,
  avotoast: `<svg viewBox="0 0 48 48" aria-hidden="true">
    <ellipse cx="24" cy="42" rx="19" ry="3.4" fill="#fffaf2" stroke="#d8c6ad" stroke-width="1"/>
    <path d="M8 40V18.5C8 12 13 8.6 19 9.6c2-2.8 8-2.8 10 0 6-1 11 2.4 11 8.9V40z" fill="#c98e47" stroke="#7a4f22" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M11 38V19.2c0-4.8 3.8-7.4 8.4-6.4 1.4-2.2 7.8-2.2 9.2 0 4.6-1 8.4 1.6 8.4 6.4V38z" fill="#f0d39a"/>
    <g stroke="#4f6f2c" stroke-width=".9">
      <ellipse cx="17" cy="31" rx="7.5" ry="3.2" transform="rotate(-30 17 31)" fill="#9cc069"/>
      <ellipse cx="21" cy="33.5" rx="7.5" ry="3.2" transform="rotate(-12 21 33.5)" fill="#a9c977"/>
      <ellipse cx="26" cy="34.5" rx="7.5" ry="3.2" transform="rotate(4 26 34.5)" fill="#9cc069"/>
    </g>
    <path d="M18.5 22c0-5 4-7.5 8.5-7.2 5 .3 7.6 3.6 7 7.4-.5 3.4-4.8 5.6-9 5.2-4.4-.4-6.5-2.6-6.5-5.4z" fill="#fffef8" stroke="#e2d8c4" stroke-width=".9"/>
    <circle cx="26.5" cy="21" r="3.6" fill="#f3b52f" stroke="#d48d12" stroke-width=".8"/><circle cx="25.4" cy="19.8" r="1" fill="#fff" opacity=".7"/>
    <g fill="#3a2a20"><circle cx="15" cy="25" r=".55"/><circle cx="33" cy="29" r=".55"/><circle cx="31" cy="35" r=".55"/><circle cx="14" cy="36" r=".55"/></g>
    <path d="M35 26.5l2-1M14.5 28.5l-1.6 1.2" stroke="#c0303f" stroke-width="1.2" stroke-linecap="round"/>
  </svg>`,
  mocktail: `<svg viewBox="0 0 48 48" aria-hidden="true">
    <ellipse cx="24" cy="43" rx="9" ry="2.2" fill="#e7eef2" stroke="#9aa6b0" stroke-width="1"/>
    <path d="M24 29v13" stroke="#9aa6b0" stroke-width="1.8"/>
    <path d="M15 4.5l7 18" stroke="#e8b4b8" stroke-width="2.4" stroke-linecap="round"/><path d="M15.8 6.6l.9 2.4M17.4 10.8l.9 2.4M19 15l.9 2.4" stroke="#fff" stroke-width="2.4"/>
    <path d="M7.5 13h33c0 9.4-7.4 16.4-16.5 16.4S7.5 22.4 7.5 13z" fill="url(#dzg-mocktail)"/>
    <path d="M6.5 11.5h35c0 10.4-7.8 18.4-17.5 18.4S6.5 21.9 6.5 11.5z" fill="none" stroke="#9a4363" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M7 11.5h34" stroke="#fff" stroke-width="1.8" opacity=".9"/>
    <g fill="#fff" opacity=".7"><circle cx="18" cy="19" r="1.1"/><circle cx="27" cy="22" r=".9"/><circle cx="31" cy="17" r="1.2"/></g>
    <circle cx="38" cy="11" r="5.6" fill="#f7e08a" stroke="#cfa62e" stroke-width="1.1"/>
    <path d="M38 6.4v9.2M33.4 11h9.2M34.8 7.8l6.4 6.4M41.2 7.8l-6.4 6.4" stroke="#e9c75a" stroke-width=".8"/>
    <path d="M10.5 16c1.5 4.6 5 8 9.5 9.5" stroke="#fff" stroke-width="1.4" fill="none" opacity=".55" stroke-linecap="round"/>
  </svg>`,
  latte: `<svg viewBox="0 0 48 48" aria-hidden="true">
    <ellipse cx="24" cy="40.5" rx="19" ry="4.4" fill="#fffaf2" stroke="#c9b293" stroke-width="1.1"/>
    <ellipse cx="24" cy="40" rx="10" ry="1.8" fill="#efe2cd"/>
    <path d="M38 22.5c6.4-.4 7 7.6.6 9" fill="none" stroke="#8a6a50" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M8.5 19.5h31c0 10.6-5.8 18.2-15.5 18.2S8.5 30.1 8.5 19.5z" fill="#fffaf2" stroke="#8a6a50" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M10 24.5h28" stroke="#c9a24a" stroke-width="1.2" opacity=".85"/>
    <ellipse cx="24" cy="19.5" rx="15.5" ry="4.2" fill="#b98a64" stroke="#8a6a50" stroke-width="1.2"/>
    <path d="M24 22.6c-4.6-2.2-4.2-4.8-2.2-5 1.1-.1 1.8.5 2.2 1.2.4-.7 1.1-1.3 2.2-1.2 2 .2 2.4 2.8-2.2 5z" fill="#fbf1e2"/>
    <path d="M24 22.6v1.2" stroke="#fbf1e2" stroke-width=".8"/>
    <path d="M19 13c-2.4-2.4 2.4-4.2 0-7.2M28 13c-2.4-2.4 2.4-4.2 0-7.2" stroke="#b9a48e" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".7"/>
  </svg>`,
  golden: `<svg viewBox="0 0 48 48" aria-hidden="true">
    <ellipse cx="24" cy="39" rx="20" ry="4.4" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width="1"/>
    <path d="M7 37c0-12 7.6-20 17-20s17 8 17 20z" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width="1.3"/>
    <rect x="5" y="35.5" width="38" height="3.4" rx="1.7" fill="url(#dzg-gold-v)" stroke="#8a6420" stroke-width=".9"/>
    <circle cx="24" cy="14.8" r="2.8" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width=".9"/>
    <path d="M12.5 32c.6-6 4-10 8.6-11.6" stroke="#fff7d6" stroke-width="2" fill="none" stroke-linecap="round" opacity=".9"/>
    <path d="M39 4.5c.5 3.6 1.5 4.6 5 5-3.5.5-4.5 1.5-5 5-.5-3.5-1.5-4.5-5-5 3.5-.4 4.5-1.4 5-5z" fill="#f3d77f"/>
    <path d="M8 6c.4 2.4 1 3 3.4 3.4C9 9.8 8.4 10.4 8 12.8c-.4-2.4-1-3-3.4-3.4C7 9 7.6 8.4 8 6z" fill="#f3d77f"/>
  </svg>`,
};

// ─────────────────────────────────────────── Équipement (viewBox 64)

const ringSvg = (gem: string, cut: 'round' | 'oval' | 'emerald' | 'marquise', accent: string) => {
  const gemShape =
    cut === 'round'
      ? `<circle cx="32" cy="20" r="9" fill="${gem}" stroke="${accent}" stroke-width="1.1"/><path d="M32 11v18M23 20h18M25.6 13.6l12.8 12.8M38.4 13.6 25.6 26.4" stroke="#fff" stroke-width=".6" opacity=".45"/><circle cx="32" cy="20" r="4" fill="none" stroke="#fff" stroke-width=".7" opacity=".6"/>`
      : cut === 'oval'
        ? `<ellipse cx="32" cy="20" rx="7.6" ry="10" fill="${gem}" stroke="${accent}" stroke-width="1.1"/><ellipse cx="32" cy="20" rx="3.4" ry="5" fill="none" stroke="#fff" stroke-width=".7" opacity=".55"/><path d="M32 10v20M24.4 20h15.2" stroke="#fff" stroke-width=".5" opacity=".4"/>`
        : cut === 'emerald'
          ? `<path d="M26 11h12l4 4v10l-4 4H26l-4-4V15z" fill="${gem}" stroke="${accent}" stroke-width="1.1"/><path d="M28 14h8l2.5 2.5v7L36 26h-8l-2.5-2.5v-7z" fill="none" stroke="#fff" stroke-width=".7" opacity=".55"/><path d="M26 11l2 3M38 11l-2 3M26 29l2-3M38 29l-2-3" stroke="#fff" stroke-width=".5" opacity=".5"/>`
          : `<path d="M32 8c5 4 7.4 8 7.4 12S37 28 32 32c-5-4-7.4-8-7.4-12S27 12 32 8z" fill="${gem}" stroke="${accent}" stroke-width="1.1"/><path d="M32 8v24M24.6 20h14.8M28 13l8 14M36 13l-8 14" stroke="#fff" stroke-width=".55" opacity=".5"/>`;
  return `<svg viewBox="0 0 64 64" aria-hidden="true">
    <ellipse cx="32" cy="58" rx="16" ry="2.6" fill="#000" opacity=".08"/>
    <path fill-rule="evenodd" d="M32 28.5c-10.5 0-18 7.6-18 14.2S21.5 56 32 56s18-6.7 18-13.3S42.5 28.5 32 28.5zm0 4.6c-7.6 0-13 4.8-13 9.6s5.4 8.6 13 8.6 13-3.8 13-8.6-5.4-9.6-13-9.6z" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width="1.1"/>
    <path d="M17.5 45c1.6 4.6 7 7.6 14.5 7.6" stroke="#fff6d2" stroke-width="1.4" fill="none" opacity=".75" stroke-linecap="round"/>
    <path d="M25 31.5l3-5h8l3 5" fill="url(#dzg-gold-v)" stroke="#8a6420" stroke-width="1"/>
    <path d="M25.5 25.6l-1.6 2.8M38.5 25.6l1.6 2.8" stroke="#8a6420" stroke-width="1.3" stroke-linecap="round"/>
    ${gemShape}
    <path d="M28 15.6c1-1.6 2.4-2.6 4-3" stroke="#fff" stroke-width="1.3" fill="none" stroke-linecap="round" opacity=".85"/>
    <path d="M47 9.5c.4 2.6 1.2 3.4 3.8 3.8-2.6.4-3.4 1.2-3.8 3.8-.4-2.6-1.2-3.4-3.8-3.8 2.6-.4 3.4-1.2 3.8-3.8z" fill="#fff" opacity=".9"/>
  </svg>`;
};

export const ITEM_SVG: Record<ItemType, string> = {
  boots: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <ellipse cx="33" cy="54.5" rx="26" ry="2.6" fill="#000" opacity=".1"/>
    <path d="M10.5 50.5h44.6c2.2 0 3.6-1.2 3.4-2.8l-.2-1.2H8.2l.2 1.6c.2 1.4.9 2.4 2.1 2.4z" fill="#3c1019" stroke="#2a0a10" stroke-width=".8"/>
    <path d="M9 51h7.5v3.2c0 .6-.5 1-1 1H10c-.6 0-1-.4-1-1z" fill="#2a0a10"/>
    <path d="M8.4 46.6c-1.6-5-1-11.6 1.4-15.6 4.6 1.8 11.4 2 17.2.6 3.8-.9 6.4-2.7 9.2-3.1 9.2-1.2 17.4 4.4 20.8 11.4 1.4 2.8 1 5.6-1 6.7z" fill="url(#dzg-velvet)" stroke="#3c1019" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M10 31.2c4.8 2.6 11.6 2.8 17 1.2 3.6-1 5.6-2.4 8.4-2.8" fill="none" stroke="#e8b4b8" stroke-width="1" opacity=".55"/>
    <path d="M30.5 33c2.6-1.8 8-2.8 13.4-.6" fill="none" stroke="#3c1019" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>
    <path d="M31 34.2c3.6-2.8 9.4-2.8 13-.2" fill="none" stroke="url(#dzg-gold)" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="31" cy="34.6" r="2" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width=".7"/>
    <circle cx="44.2" cy="34.4" r="2" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width=".7"/>
    <path d="M14 42c6 1.8 18 2 30 .6" fill="none" stroke="#c0606f" stroke-width="1" opacity=".5"/>
    <path d="M44 37c4 .8 8 3.2 10 6" fill="none" stroke="#f3c9cf" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>
  </svg>`,
  vest: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <ellipse cx="32" cy="60" rx="18" ry="2.2" fill="#000" opacity=".08"/>
    <path d="M23 6.5 32 4l9 2.5L33.6 30H30.4z" fill="#fffaf2" stroke="#c9b293" stroke-width="1"/>
    <path d="M28.6 8.6 32 10.4l3.4-1.8v4.8L32 11.6l-3.4 1.8z" fill="#7a2e3a" stroke="#4a1520" stroke-width=".7"/>
    <path d="M23.4 6.6l7.5 24.4V55l-11.6 3-5.4-6.4V30.4c3.4-3.2 4.4-7.4 4-12.4-.3-5.2 2.4-9.6 5.5-11.4z" fill="url(#dzg-velvet)" stroke="#3c1019" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M40.6 6.6 33.1 31V55l11.6 3 5.4-6.4V30.4c-3.4-3.2-4.4-7.4-4-12.4.3-5.2-2.4-9.6-5.5-11.4z" fill="url(#dzg-velvet)" stroke="#3c1019" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M23.4 6.6 31 31M40.6 6.6 33 31" stroke="url(#dzg-gold)" stroke-width="1.6" fill="none"/>
    <g fill="url(#dzg-gold)" stroke="#8a6420" stroke-width=".6"><circle cx="32" cy="35.5" r="1.7"/><circle cx="32" cy="42" r="1.7"/><circle cx="32" cy="48.5" r="1.7"/></g>
    <path d="M19 44.5h7.6M37.4 44.5H45" stroke="url(#dzg-gold)" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M38.6 22.5c1.4.6 2.4 2.4 2.2 4" stroke="#c9a24a" stroke-width="1" fill="none"/><path d="M40.6 26.4l1 6" stroke="#c9a24a" stroke-width=".8"/>
    <path d="M17.6 32c-.2 6 0 14 .4 18" stroke="#c0606f" stroke-width="1.2" fill="none" opacity=".5"/>
  </svg>`,
  tray: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <ellipse cx="32" cy="50" rx="29" ry="8.4" fill="url(#dzg-silver)" stroke="#6f7884" stroke-width="1.2"/>
    <ellipse cx="32" cy="48.6" rx="24" ry="5.8" fill="#eef1f4" stroke="#a9b1bc" stroke-width=".8"/>
    <path d="M2.5 49c-1.6-1.6-.6-4 1.6-3.6M61.5 49c1.6-1.6.6-4-1.6-3.6" stroke="#6f7884" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <path d="M12 48c0-12.6 9-21 20-21s20 8.4 20 21z" fill="url(#dzg-silver)" stroke="#6f7884" stroke-width="1.2"/>
    <rect x="9.5" y="46.2" width="45" height="3.4" rx="1.7" fill="url(#dzg-silver-v)" stroke="#6f7884" stroke-width=".9"/>
    <rect x="29.6" y="21.6" width="4.8" height="5.8" rx="1" fill="url(#dzg-silver-v)" stroke="#6f7884" stroke-width=".8"/>
    <circle cx="32" cy="19.6" r="3.6" fill="url(#dzg-silver)" stroke="#6f7884" stroke-width=".9"/>
    <path d="M17.6 43c.6-7 4.6-11.6 10-13.2" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".9"/>
    <path d="M23 46.6h18" stroke="#c9a24a" stroke-width="1.2" opacity=".8"/>
    <path d="M28 38.6l4-3 4 3-4 3z" fill="url(#dzg-gold)" opacity=".9"/>
  </svg>`,
  grinder: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <ellipse cx="32" cy="58.5" rx="19" ry="2.4" fill="#000" opacity=".1"/>
    <rect x="16" y="33" width="32" height="24" rx="2.4" fill="url(#dzg-wood)" stroke="#4a2814" stroke-width="1.2"/>
    <rect x="21" y="44" width="22" height="9" rx="1.4" fill="#7a4628" stroke="#4a2814" stroke-width="1"/>
    <circle cx="32" cy="48.5" r="1.8" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width=".6"/>
    <path d="M16 37.5h32" stroke="#c9a24a" stroke-width="1.2"/>
    <path d="M19 33l3.2-8.4h19.6L45 33z" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width="1.1" stroke-linejoin="round"/>
    <ellipse cx="32" cy="24.6" rx="9.8" ry="2.4" fill="#d9ad45" stroke="#8a6420" stroke-width="1"/>
    <path d="M32 24.4V17" stroke="#6f5a2a" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M32 17.6c4-3.4 9.4-4.8 14.4-3.2" stroke="url(#dzg-gold)" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <circle cx="32" cy="17.6" r="2.2" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width=".8"/>
    <ellipse cx="48.4" cy="10.8" rx="2.8" ry="4.4" fill="url(#dzg-velvet)" stroke="#3c1019" stroke-width="1"/>
    <path d="M23.6 29.6c1-2 2.2-3 4-3.6" stroke="#fff6d2" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <g fill="#5a3422" stroke="#3a2015" stroke-width=".6"><ellipse cx="9" cy="55" rx="3" ry="2.1" transform="rotate(-24 9 55)"/><ellipse cx="55" cy="54.4" rx="3" ry="2.1" transform="rotate(20 55 54.4)"/></g>
    <path d="M7.6 55.6c1-.8 2-1.2 3-1.2M53.6 55.2c1-.6 2-.8 3-.6" stroke="#a87a52" stroke-width=".7"/>
  </svg>`,
  latte: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <ellipse cx="32" cy="59" rx="13" ry="2.2" fill="#000" opacity=".1"/>
    <path d="M37 2.8 33.4 24" stroke="#e8b4b8" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M36.6 5.4l-.5 2.8M35.6 11.2l-.5 2.8M34.6 17l-.5 2.8" stroke="#fff" stroke-width="3.2"/>
    <path d="M20.6 18.5h22.8l-2.6 37.2c-.1 1.4-1.3 2.5-2.7 2.5h-12.2c-1.4 0-2.6-1.1-2.7-2.5z" fill="url(#dzg-latte)"/>
    <g fill="#fff" fill-opacity=".55" stroke="#fff" stroke-width=".8"><rect x="23.4" y="21" width="7.4" height="7.4" rx="1.4" transform="rotate(-14 27 24.6)"/><rect x="31.6" y="25" width="7" height="7" rx="1.4" transform="rotate(12 35 28.5)"/><rect x="25.4" y="30.6" width="6.6" height="6.6" rx="1.4" transform="rotate(8 28.6 34)"/></g>
    <path d="M19 12h26l-3.6 43.8c-.2 2.2-2 3.8-4.2 3.8H26.8c-2.2 0-4-1.6-4.2-3.8z" fill="#fff" fill-opacity=".22" stroke="#8a6a50" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M19 12h26" stroke="#8a6a50" stroke-width="1.6"/>
    <path d="M22.6 16l2.6 38" stroke="#fff" stroke-width="1.8" opacity=".75" stroke-linecap="round"/>
    <path d="M44 9.8c2.6-3.6 7.6-3.6 9 0-3.4 1.2-6.4 1-9 0z" fill="#7fa58a" stroke="#4f7a5a" stroke-width=".8"/>
  </svg>`,
  passkey: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <g transform="rotate(-38 32 32)">
      <path d="M26.5 30.2h29.2v3.6H26.5z" fill="url(#dzg-gold-v)" stroke="#8a6420" stroke-width="1"/>
      <path d="M47 33.8v6.6h3v-3.2h2.2v3.2h3.4v-6.6z" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width="1" stroke-linejoin="round"/>
      <rect x="27.5" y="28.6" width="3" height="6.8" rx="1" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width=".8"/>
      <rect x="32" y="29.2" width="2" height="5.6" rx=".8" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width=".7"/>
      <circle cx="15" cy="32" r="9.6" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width="1.1"/>
      <circle cx="15" cy="22.6" r="3.8" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width="1"/>
      <circle cx="15" cy="41.4" r="3.8" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width="1"/>
      <circle cx="5.6" cy="32" r="3.8" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width="1"/>
      <circle cx="15" cy="32" r="5" fill="#fbf3e8" stroke="#8a6420" stroke-width="1"/>
      <path d="M15 28.6c-1.8 1.6-1.8 3.6 0 5.6 1.8-2 1.8-4 0-5.6z" fill="#c0506a"/>
      <path d="M9.4 27c1.2-1.8 3-2.8 5-3" stroke="#fff6d2" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    </g>
    <path d="M14 40.6c-1.4 4-1 9 1.4 12.6" stroke="#c0606f" stroke-width="1.4" fill="none"/>
    <path d="M13.6 52c-1.8 2-2 5-1 7.4h5.2c.8-2.4.6-5.4-1.2-7.4z" fill="#d98c95" stroke="#7a2e3a" stroke-width=".9"/>
    <path d="M13.6 55v4.4M15.2 55v4.4M16.8 55v4.4" stroke="#7a2e3a" stroke-width=".5" opacity=".7"/>
  </svg>`,
  ring_tournee: ringSvg('url(#dzg-gem-rose)', 'round', '#7d2244'),
  ring_temps: ringSvg('url(#dzg-gem-blue)', 'oval', '#1b2f68'),
  ring_brigade: ringSvg('url(#dzg-gem-green)', 'emerald', '#1f4f33'),
  ring_grace: ringSvg('url(#dzg-gem-white)', 'marquise', '#6a76a6'),
};

export const ringIcon = (id: RingId) => ITEM_SVG[RING_ITEM[id]];

/** Couleur dominante de chaque anneau (lueur active). */
export const RING_COLOR: Record<RingId, string> = {
  tournee: '#e58fb0',
  temps: '#7fa3e0',
  brigade: '#7fbf8c',
  grace: '#f3e6c4',
};

// ─────────────────────────────────────────── Pictogrammes

export const ICON = {
  key: `<svg viewBox="0 0 32 32" aria-hidden="true"><g transform="rotate(-40 16 16)"><circle cx="8" cy="16" r="5.4" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width="1"/><circle cx="8" cy="16" r="2.2" fill="#fbf3e8" stroke="#8a6420" stroke-width=".7"/><path d="M13 14.6h15v2.8H13z" fill="url(#dzg-gold-v)" stroke="#8a6420" stroke-width=".8"/><path d="M23 17.4v3.4h1.8V19h1.4v1.8H28v-3.4z" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width=".8"/></g></svg>`,
  watch: `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="18" r="11" fill="#fffaf2" stroke="url(#dzg-gold)" stroke-width="2.6"/><circle cx="16" cy="18" r="8.4" fill="none" stroke="#c9a24a" stroke-width=".6"/><rect x="14" y="3" width="4" height="3.6" rx="1" fill="url(#dzg-gold)"/><circle cx="16" cy="3" r="1.8" fill="none" stroke="#c9a24a" stroke-width="1.2"/><path d="M16 18V11.6M16 18l4.4 2.6" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/><circle cx="16" cy="18" r="1.2" fill="${INK}"/><g fill="${INK}"><circle cx="16" cy="9.8" r=".7"/><circle cx="24.2" cy="18" r=".7"/><circle cx="16" cy="26.2" r=".7"/><circle cx="7.8" cy="18" r=".7"/></g></svg>`,
  lock: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="5" y="10.5" width="14" height="10" rx="2" fill="currentColor"/><circle cx="12" cy="15" r="1.4" fill="#fbf3e8"/><path d="M12 15.6v2.2" stroke="#fbf3e8" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  sparkle: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5c.7 6.2 2.6 8.3 9 10.5-6.4 1.9-8.3 4-9 10.5-.7-6.5-2.6-8.6-9-10.5 6.4-2.2 8.3-4.3 9-10.5z" fill="currentColor"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.4 4.4L19 7.4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  arrowUp: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l7 8h-4.4v8H9.4v-8H5z" fill="currentColor"/></svg>`,
  coin: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width="1"/><circle cx="12" cy="12" r="6.8" fill="none" stroke="#8a6420" stroke-width=".7" opacity=".7"/><text x="12" y="16.2" text-anchor="middle" font-family="Great Vibes, cursive" font-size="12" fill="#7a561c">D</text></svg>`,
  plate: `<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="14" rx="10" ry="5" fill="#fffaf2" stroke="#c9b293"/><ellipse cx="12" cy="13.4" rx="6" ry="2.6" fill="none" stroke="#c9a24a" stroke-width=".8"/><path d="M4 6l2 5M20 6l-2 5" stroke="#a9b1bc" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  fire: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 6 6.4 6 12a6 6 0 0 1-12 0c0-3 1.6-5 3-6 0 2 1 3.4 2.2 3.6C10.6 8.6 11 5 12 2z" fill="currentColor"/><path d="M12 13c.6 2 3 3 3 5.4a3 3 0 0 1-6 0c0-1.6 1-2.6 1.8-3 .1 1 .6 1.6 1.2 1.6-.4-1.4-.4-2.8 0-4z" fill="#fff4d6" opacity=".85"/></svg>`,
  teacup: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 9.5h14c0 5.4-3 8.6-7 8.6s-7-3.2-7-8.6z" fill="currentColor"/><path d="M17.2 11c3 0 3.4 4 .2 4.6" fill="none" stroke="currentColor" stroke-width="1.6"/><ellipse cx="10.5" cy="20.4" rx="8.4" ry="1.6" fill="currentColor" opacity=".6"/><path d="M8.6 7c-1.2-1.2 1.2-2.2 0-3.8M12.4 7c-1.2-1.2 1.2-2.2 0-3.8" stroke="currentColor" fill="none" stroke-width="1.1" stroke-linecap="round" opacity=".7"/></svg>`,
  hanger: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.4V7.2c1.6-.4 2.4-1.4 2.4-2.6A2.4 2.4 0 0 0 12 2.2c-1.2 0-2.2.8-2.4 2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M12 8.4 2.6 15.6c-.8.6-.4 1.9.6 1.9h17.6c1 0 1.4-1.3.6-1.9z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2.5" width="14" height="19" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4.6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M12 4.6l.7 1.2-.7 1.2-.7-1.2z" fill="currentColor"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6.5h14M5 12h14M5 17.5h14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="9" cy="6.5" r="2.2" fill="#fbf3e8" stroke="currentColor" stroke-width="1.4"/><circle cx="15.5" cy="12" r="2.2" fill="#fbf3e8" stroke="currentColor" stroke-width="1.4"/><circle cx="7.5" cy="17.5" r="2.2" fill="#fbf3e8" stroke="currentColor" stroke-width="1.4"/></svg>`,
};

/** Illustrations des catégories de nouveautés (carte « Nouveauté »). */
export const CATEGORY_ART: Record<string, string> = {
  Mécanique: `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="34" r="20" fill="#fffaf2" stroke="url(#dzg-gold)" stroke-width="3.4"/><circle cx="32" cy="34" r="15.5" fill="none" stroke="#c9a24a" stroke-width=".8"/><rect x="28.5" y="8" width="7" height="6" rx="1.6" fill="url(#dzg-gold)"/><circle cx="32" cy="7" r="3" fill="none" stroke="#c9a24a" stroke-width="1.6"/><path d="M32 34V22.5M32 34l8 4.6" stroke="${INK}" stroke-width="2" stroke-linecap="round"/><circle cx="32" cy="34" r="1.8" fill="${INK}"/><g fill="${INK}"><circle cx="32" cy="19.8" r="1"/><circle cx="46.2" cy="34" r="1"/><circle cx="32" cy="48.2" r="1"/><circle cx="17.8" cy="34" r="1"/></g><path d="M14 22c2-4 5-7 9-9" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" opacity=".6"/></svg>`,
  Client: `<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="32" rx="22" ry="27" fill="url(#dzg-rose)" stroke="url(#dzg-gold)" stroke-width="3"/><ellipse cx="32" cy="32" rx="17.6" ry="22.6" fill="none" stroke="#c9a24a" stroke-width=".8"/><path d="M27 50c-1-5 1.4-7.4 2-9.4-2.4-.4-4.4-1.4-4.6-2.8-.2-1 .8-1.6.4-2.6-.4-1-1.6-1.2-1.4-2.4.2-1 2-2.4 2.4-3.6.2-1.2-.4-2.4-.2-4 .6-5 5-8.4 10.6-8 6 .4 9.6 5.4 9 11.2-.4 4.4-3 7.6-3.4 10.4-.4 3.2 1.4 6 1.4 11.2z" fill="${INK}" opacity=".88"/><path d="M33 17.2c4 .4 6.4 3.4 6.6 6.6" stroke="#f3d9d6" stroke-width="1.2" fill="none" opacity=".6"/></svg>`,
  'Piège de cloche': `<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="52" rx="27" ry="5" fill="url(#dzg-silver)" stroke="#6f7884"/><path d="M9 50c0-16 10-27 23-27s23 11 23 27z" fill="url(#dzg-silver)" stroke="#6f7884" stroke-width="1.3"/><circle cx="32" cy="19.6" r="3.6" fill="url(#dzg-silver)" stroke="#6f7884"/><path d="M15 45c.6-8 5-14 11-16" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".85"/><circle cx="32" cy="38" r="8.4" fill="#d98c95" stroke="#7a2e3a" stroke-width="1.2"/><path d="M32 33v6" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="32" cy="42.6" r="1.4" fill="#fff"/></svg>`,
  'Événement de salle': `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 4v10" stroke="#8a6420" stroke-width="1.4"/><path d="M14 26c0 6 8 9 18 9s18-3 18-9" fill="none" stroke="url(#dzg-gold)" stroke-width="2.6"/><path d="M20 22c0 4 5 6 12 6s12-2 12-6" fill="none" stroke="url(#dzg-gold)" stroke-width="2"/><path d="M32 14c-3 0-5 3-5 6s2 5 5 5 5-2 5-5-2-6-5-6z" fill="url(#dzg-gold)" stroke="#8a6420"/><g fill="#fff" stroke="#9fb3c8" stroke-width=".8"><path d="M14 30l2.4 5-2.4 4-2.4-4z"/><path d="M50 30l2.4 5-2.4 4-2.4-4z"/><path d="M32 36l2.6 6-2.6 5-2.6-5z"/><path d="M23 33l2 4.4-2 3.4-2-3.4z"/><path d="M41 33l2 4.4-2 3.4-2-3.4z"/></g><g fill="#f3d77f"><circle cx="14" cy="24" r="1.6"/><circle cx="50" cy="24" r="1.6"/><circle cx="20" cy="20" r="1.3"/><circle cx="44" cy="20" r="1.3"/></g><path d="M22 54c3-2 7-2 10 0s7 2 10 0" stroke="#d98c95" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".7"/></svg>`,
};

/** Illustrations propres à certaines nouveautés (sinon : illustration de la catégorie). */
export const INTRO_ART: Partial<Record<string, string>> = {
  cloches: `<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="52" rx="27" ry="5" fill="url(#dzg-silver)" stroke="#6f7884"/><path d="M9 50c0-16 10-27 23-27s23 11 23 27z" fill="url(#dzg-silver)" stroke="#6f7884" stroke-width="1.3"/><rect x="7" y="48" width="50" height="4" rx="2" fill="url(#dzg-silver-v)" stroke="#6f7884" stroke-width=".8"/><circle cx="32" cy="19.6" r="3.6" fill="url(#dzg-silver)" stroke="#6f7884"/><path d="M15 45c.6-8 5-14 11-16" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".85"/><path d="M50 8c.6 4 1.8 5.2 5.8 5.8-4 .6-5.2 1.8-5.8 5.8-.6-4-1.8-5.2-5.8-5.8 4-.6 5.2-1.8 5.8-5.8z" fill="#f3d77f"/><path d="M12 12c.4 2.6 1.2 3.4 3.8 3.8-2.6.4-3.4 1.2-3.8 3.8-.4-2.6-1.2-3.4-3.8-3.8 2.6-.4 3.4-1.2 3.8-3.8z" fill="#f3d77f"/></svg>`,
  dash: ITEM_SVG.boots,
  vip: `<svg viewBox="0 0 40 30" aria-hidden="true"><path d="M6 23 3.2 9.5l8.6 6.8L20 4.5l8.2 11.8 8.6-6.8L34 23z" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width="1" stroke-linejoin="round"/><rect x="5.5" y="22.5" width="29" height="4.2" rx="1.2" fill="url(#dzg-gold-v)" stroke="#8a6420" stroke-width="1"/><circle cx="3.2" cy="9.5" r="2" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width=".8"/><circle cx="20" cy="4.5" r="2.3" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width=".8"/><circle cx="36.8" cy="9.5" r="2" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width=".8"/><circle cx="20" cy="17" r="2.1" fill="#c0506a"/><circle cx="12.5" cy="19" r="1.3" fill="#7fa58a"/><circle cx="27.5" cy="19" r="1.3" fill="#7fa58a"/></svg>`,
  radar: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6 58 32 32 58 6 32z" fill="#fbf3e8" stroke="#7a2e3a" stroke-width="3" stroke-linejoin="round"/><path d="M32 13 51 32 32 51 13 32z" fill="#f5dcd8"/><path d="M32 32 51 32 32 51z" fill="#e5eedf"/><circle cx="26" cy="26" r="3" fill="#d9a441" stroke="#5b1f2a"/><circle cx="38" cy="24" r="3" fill="#e58fb0" stroke="#5b1f2a"/><circle cx="35" cy="40" r="3" fill="#8fae5a" stroke="#5b1f2a"/><path d="M27 36l7 2-6 4z" fill="#7a2e3a" stroke="#d4a537" stroke-width=".8"/><path d="M44 30l1.6 3.4 3.4 1.6-3.4 1.6L44 40l-1.6-3.4-3.4-1.6 3.4-1.6z" fill="#d4a537"/></svg>`,
};
