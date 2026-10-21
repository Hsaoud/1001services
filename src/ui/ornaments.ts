/**
 * Ornements SVG en ligne : filets, fleurons, lauriers, couronne, cachet de cire, cloche d'argent…
 * Tout est dessiné à la main ; les dégradés partagés vivent dans DEFS_SVG (injecté une fois dans la racine).
 */

let uid = 0;
/** Identifiant unique (textPath, etc.). */
export const nextId = (p: string) => `${p}-${++uid}`;

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Dégradés & motifs partagés par toutes les icônes (référencés par url(#…)). */
export const DEFS_SVG = `<svg class="dz-defs" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden"><defs>
<linearGradient id="dzg-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7e4a6"/><stop offset=".32" stop-color="#d9ad45"/><stop offset=".58" stop-color="#b8862c"/><stop offset=".82" stop-color="#ecd38c"/><stop offset="1" stop-color="#a8792a"/></linearGradient>
<linearGradient id="dzg-gold-v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7e4a6"/><stop offset=".45" stop-color="#d4a537"/><stop offset="1" stop-color="#9c6f24"/></linearGradient>
<linearGradient id="dzg-silver" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#dfe3e8"/><stop offset=".55" stop-color="#a9b1bc"/><stop offset=".78" stop-color="#eef1f4"/><stop offset="1" stop-color="#8b94a0"/></linearGradient>
<linearGradient id="dzg-silver-v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#d3d8de"/><stop offset="1" stop-color="#8d96a2"/></linearGradient>
<linearGradient id="dzg-velvet" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="#a63c4f"/><stop offset=".5" stop-color="#76243a"/><stop offset="1" stop-color="#4a1422"/></linearGradient>
<linearGradient id="dzg-wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c08552"/><stop offset=".5" stop-color="#8f5534"/><stop offset="1" stop-color="#5f341e"/></linearGradient>
<linearGradient id="dzg-latte" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf3e6"/><stop offset=".35" stop-color="#f1dcc0"/><stop offset=".62" stop-color="#d9b58a"/><stop offset="1" stop-color="#7a4a2c"/></linearGradient>
<linearGradient id="dzg-mocktail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7b9cf"/><stop offset="1" stop-color="#d9608a"/></linearGradient>
<linearGradient id="dzg-rose" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbe9e7"/><stop offset="1" stop-color="#e3a7ae"/></linearGradient>
<radialGradient id="dzg-gem-rose" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff4f7"/><stop offset=".3" stop-color="#f5aac2"/><stop offset=".7" stop-color="#c94f78"/><stop offset="1" stop-color="#7d2244"/></radialGradient>
<radialGradient id="dzg-gem-blue" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#f0f7ff"/><stop offset=".3" stop-color="#8fb4ec"/><stop offset=".7" stop-color="#3a5fb0"/><stop offset="1" stop-color="#1b2f68"/></radialGradient>
<radialGradient id="dzg-gem-green" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#f0fbf2"/><stop offset=".3" stop-color="#9fd3a8"/><stop offset=".7" stop-color="#3f8a5a"/><stop offset="1" stop-color="#1f4f33"/></radialGradient>
<radialGradient id="dzg-gem-white" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#f1efff"/><stop offset=".75" stop-color="#c9d2ee"/><stop offset="1" stop-color="#97a3cc"/></radialGradient>
<radialGradient id="dzg-wax-gold" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#f3d77f"/><stop offset=".55" stop-color="#c99a35"/><stop offset="1" stop-color="#8a6220"/></radialGradient>
<radialGradient id="dzg-wax-red" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#c25a6b"/><stop offset=".55" stop-color="#8a2e3e"/><stop offset="1" stop-color="#561522"/></radialGradient>
<radialGradient id="dzg-foam" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#f6ead8"/><stop offset="1" stop-color="#dcc3a0"/></radialGradient>
<pattern id="dzp-waffle" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#e6b35c"/><path d="M0 0H5M0 0V5" stroke="#b5772f" stroke-width="1.5"/></pattern>
</defs></svg>`;

/** Filet décoratif horizontal avec fleuron central. */
export function fleuron(cls = ''): string {
  const half = `
    <path d="M128 12c5 0 7-5.6 11.6-5.6 3.6 0 4.6 3.6 2.2 4.6-1.6.6-3-.6-2.2-1.8" />
    <path d="M128 12c5 0 7 5.6 11.6 5.6 3.6 0 4.6-3.6 2.2-4.6-1.6-.6-3 .6-2.2 1.8" />
    <path d="M147 11.35 230 11.85v.3L147 12.65z" fill="currentColor" stroke="none"/>
    <circle cx="234" cy="12" r="1.3" fill="currentColor" stroke="none"/>
    <ellipse cx="151" cy="9.2" rx="2.6" ry="1" transform="rotate(-28 151 9.2)" fill="currentColor" stroke="none"/>
    <ellipse cx="151" cy="14.8" rx="2.6" ry="1" transform="rotate(28 151 14.8)" fill="currentColor" stroke="none"/>`;
  return `<svg class="dz-fleuron ${cls}" viewBox="0 0 240 24" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
    <g fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round">${half}
      <g transform="translate(240 0) scale(-1 1)">${half}</g>
      <path d="M120 5.5 126.5 12 120 18.5 113.5 12z" fill="currentColor" stroke="none"/>
      <path d="M120 9 123 12 120 15 117 12z" fill="#fbf3e8" stroke="none" opacity=".85"/>
    </g></svg>`;
}

/** Ornement d'angle (à placer en haut à gauche ; les autres angles sont obtenus par symétrie CSS). */
export function cornerSvg(): string {
  return `<svg viewBox="0 0 60 60" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round">
    <path d="M7 38C7 20 20 7 38 7" stroke-width="1.1"/>
    <path d="M7 52c0-8 2.4-12.6 6.4-14.6 3.6-1.8 7 .6 5.6 3.6-1 2.2-3.8 2-3.6.2" stroke-width="1.1"/>
    <path d="M52 7c-8 0-12.6 2.4-14.6 6.4-1.8 3.6.6 7 3.6 5.6 2.2-1 2-3.8.2-3.6" stroke-width="1.1"/>
    <path d="M14 14c4 4 9 6 15 6M14 14c4 4 6 9 6 15" stroke-width=".9" opacity=".8"/>
    <circle cx="13" cy="13" r="2.4" fill="currentColor" stroke="none"/>
    <circle cx="22.5" cy="22.5" r="1.2" fill="currentColor" stroke="none"/>
  </g></svg>`;
}

/** Quatre ornements d'angle pour un cadre (positionnés en CSS). */
export function corners(): string {
  const c = cornerSvg();
  return `<span class="dz-corner dz-c-tl">${c}</span><span class="dz-corner dz-c-tr">${c}</span><span class="dz-corner dz-c-bl">${c}</span><span class="dz-corner dz-c-br">${c}</span>`;
}

/** Branche de laurier (côté gauche ; miroir CSS pour le côté droit). */
export function laurel(cls = '', n = 8, fill = 'currentColor'): string {
  const cx = 46;
  const cy = 40;
  const R = 34;
  const a0 = (104 * Math.PI) / 180;
  const a1 = (252 * Math.PI) / 180;
  let leaves = '';
  for (let i = 0; i < n; i++) {
    const t = (i + 0.45) / n;
    const a = a0 + (a1 - a0) * t;
    const px = cx + R * Math.cos(a);
    const py = cy + R * Math.sin(a);
    const tang = Math.atan2(Math.cos(a), -Math.sin(a));
    const size = 1 - t * 0.38;
    for (const side of [-1, 1]) {
      const rot = tang + side * 0.68;
      const rx = 6.4 * size;
      const ry = 2.3 * size;
      const ox = px + Math.cos(rot) * rx * 0.92;
      const oy = py + Math.sin(rot) * rx * 0.92;
      leaves += `<ellipse cx="${r1(ox)}" cy="${r1(oy)}" rx="${r1(rx)}" ry="${r1(ry)}" transform="rotate(${r1((rot * 180) / Math.PI)} ${r1(ox)} ${r1(oy)})"/>`;
    }
  }
  const sx = r1(cx + R * Math.cos(a0));
  const sy = r1(cy + R * Math.sin(a0));
  const ex = r1(cx + R * Math.cos(a1));
  const ey = r1(cy + R * Math.sin(a1));
  const tipX = r1(ex + Math.cos(a1 + Math.PI / 2) * 4);
  const tipY = r1(ey + Math.sin(a1 + Math.PI / 2) * 4);
  return `<svg class="dz-laurel ${cls}" viewBox="0 0 44 80" aria-hidden="true"><g fill="${fill}">
    <path d="M${sx} ${sy}A${R} ${R} 0 0 1 ${ex} ${ey}" fill="none" stroke="${fill}" stroke-width="1.2" stroke-linecap="round"/>
    ${leaves}<ellipse cx="${tipX}" cy="${tipY}" rx="3.4" ry="1.7" transform="rotate(${r1((a1 * 180) / Math.PI + 90)} ${tipX} ${tipY})"/>
  </g></svg>`;
}

/** Petite couronne dorée. */
export function crown(cls = ''): string {
  return `<svg class="dz-crown ${cls}" viewBox="0 0 40 30" aria-hidden="true">
    <path d="M6 23 3.2 9.5l8.6 6.8L20 4.5l8.2 11.8 8.6-6.8L34 23z" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width="1" stroke-linejoin="round"/>
    <rect x="5.5" y="22.5" width="29" height="4.2" rx="1.2" fill="url(#dzg-gold-v)" stroke="#8a6420" stroke-width="1"/>
    <circle cx="3.2" cy="9.5" r="2" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width=".8"/>
    <circle cx="20" cy="4.5" r="2.3" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width=".8"/>
    <circle cx="36.8" cy="9.5" r="2" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width=".8"/>
    <circle cx="20" cy="17" r="2.1" fill="#c0506a"/><circle cx="12.5" cy="19" r="1.3" fill="#7fa58a"/><circle cx="27.5" cy="19" r="1.3" fill="#7fa58a"/>
  </svg>`;
}

/** Sonnette de comptoir (Cloche Royale). */
export function bellIcon(cls = ''): string {
  return `<svg class="dz-bell ${cls}" viewBox="0 0 32 32" aria-hidden="true">
    <ellipse cx="16" cy="6.2" rx="3.4" ry="1.4" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width=".7"/>
    <rect x="14.6" y="6.6" width="2.8" height="3.6" fill="url(#dzg-gold-v)"/>
    <path d="M5.6 24.5C5.6 15.4 10.2 10 16 10s10.4 5.4 10.4 14.5z" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width="1"/>
    <rect x="2.6" y="24" width="26.8" height="4.4" rx="1.6" fill="url(#dzg-gold-v)" stroke="#8a6420" stroke-width="1"/>
    <path d="M9.6 21.5c.4-4.4 2.6-7.4 5.6-8.4" stroke="#fff7da" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".85"/>
  </svg>`;
}

/** Cachet de cire (réussite dorée ou échec bordeaux). */
export function waxSeal(text: string, tone: 'gold' | 'red' = 'gold', center = 'D'): string {
  const pts: string[] = [];
  const N = 90;
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    const r = 61 + 2.6 * Math.sin(7 * th + 0.5) + 1.7 * Math.sin(13 * th + 1.3) + 1.1 * Math.sin(29 * th + 0.2);
    pts.push(`${r1(70 + r * Math.cos(th))} ${r1(70 + r * Math.sin(th))}`);
  }
  const id = nextId('dz-seal');
  const g = tone === 'gold' ? 'url(#dzg-wax-gold)' : 'url(#dzg-wax-red)';
  const dark = tone === 'gold' ? '#7a561c' : '#3f0f19';
  const light = tone === 'gold' ? '#fff3c4' : '#f0b7c0';
  return `<svg class="dz-seal dz-seal-${tone}" viewBox="0 0 140 140" aria-hidden="true">
    <defs><path id="${id}" d="M70 70m-49 0a49 49 0 1 1 98 0a49 49 0 1 1-98 0"/></defs>
    <path d="M${pts.join('L')}Z" fill="${g}" stroke="${dark}" stroke-width="1.2"/>
    <circle cx="70" cy="70" r="57" fill="none" stroke="${light}" stroke-width="1" opacity=".35"/>
    <circle cx="70" cy="70" r="41" fill="${g}" stroke="${dark}" stroke-width="2.2"/>
    <circle cx="70" cy="70" r="37.5" fill="none" stroke="${light}" stroke-width=".8" opacity=".55"/>
    <text font-family="Cormorant Garamond, serif" font-weight="700" font-size="10.5" letter-spacing="1.6" fill="${dark}" opacity=".9">
      <textPath href="#${id}" startOffset="0" textLength="300" lengthAdjust="spacing">${text}</textPath></text>
    <text x="70" y="88" text-anchor="middle" font-family="Great Vibes, cursive" font-size="44" fill="${dark}" opacity=".88">${center}</text>
    <g transform="translate(56 38) scale(.7)" opacity=".85"><path d="M6 23 3.2 9.5l8.6 6.8L20 4.5l8.2 11.8 8.6-6.8L34 23z" fill="${dark}"/><rect x="5.5" y="22.5" width="29" height="4.2" rx="1.2" fill="${dark}"/></g>
    <path d="M38 46c6-9 16-14 27-15" stroke="${light}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".45"/>
  </svg>`;
}

/** Grande cloche d'argent sur son plateau (révélation des objets). Le dôme est animable (.dz-cloche-dome). */
export function bigCloche(): string {
  return `<svg class="dz-bigcloche" viewBox="0 0 220 170" aria-hidden="true">
    <ellipse cx="110" cy="152" rx="102" ry="13" fill="url(#dzg-silver)" stroke="#7d8794" stroke-width="1.2"/>
    <ellipse cx="110" cy="150" rx="84" ry="8.5" fill="#f4f6f8" opacity=".8"/>
    <g class="dz-cloche-dome">
      <path d="M26 144C26 84 62 52 110 52s84 32 84 92z" fill="url(#dzg-silver)" stroke="#7d8794" stroke-width="1.4"/>
      <rect x="18" y="140" width="184" height="9" rx="4.5" fill="url(#dzg-silver-v)" stroke="#7d8794" stroke-width="1.2"/>
      <rect x="104" y="40" width="12" height="13" rx="2" fill="url(#dzg-silver-v)" stroke="#7d8794"/>
      <circle cx="110" cy="34" r="9.5" fill="url(#dzg-silver)" stroke="#7d8794" stroke-width="1.2"/>
      <path d="M50 126c2-30 22-52 50-60" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" opacity=".75"/>
      <path d="M160 122c-2-18-10-32-22-42" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".5"/>
      <path d="M60 134h100" stroke="#c9a24a" stroke-width="1.5" opacity=".7"/>
    </g>
  </svg>`;
}

/** Tasse de café, trait fin (décor). */
export function cupArt(cls = ''): string {
  return `<svg class="dz-art ${cls}" viewBox="0 0 80 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="40" cy="55" rx="30" ry="5"/><ellipse cx="40" cy="55" rx="18" ry="2.4" opacity=".6"/>
    <path d="M17 25h44c0 17-9 27-22 27S17 42 17 25z"/><ellipse cx="39" cy="25" rx="22" ry="3.6"/>
    <path d="M61 30c8 0 10 8 4 11-3 1.5-6 1-8 0"/>
    <path d="M35 21.5c-2.4-1.6-2.4-3.6 0-4.6 2.4 1 2.4 3 0 4.6z" fill="currentColor" opacity=".5"/>
    <path d="M32 16c-4-4 4-7 0-12M44 16c-4-4 4-7 0-12" opacity=".7"/>
  </g></svg>`;
}

/** Croissant, trait fin (décor). */
export function croissantArt(cls = ''): string {
  return `<svg class="dz-art ${cls}" viewBox="0 0 92 50" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 36c-3-11 6-21 18-23 8-7 32-7 40 0 12 2 21 12 18 23-6-4-13-4-17-2-8-7-34-7-42 0-4-2-11-2-17 2z"/>
    <path d="M26 13c4 6 4 15-2 21M66 13c-4 6-4 15 2 21M46 8c-3 8-3 17 0 22"/>
    <path d="M36 10c-2 7-2 15 1 21M56 10c2 7 2 15-1 21" opacity=".6"/>
  </g></svg>`;
}

/** Brin de fleur (décor d'angle du titre). */
export function sprigArt(cls = ''): string {
  return `<svg class="dz-art ${cls}" viewBox="0 0 60 90" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round">
    <path d="M30 88C30 60 26 40 34 14"/>
    <path d="M30 70c-8-2-14-8-15-15 7 0 13 5 15 15zM31 56c7-3 12-9 12-16-7 1-11 7-12 16zM31 40c-6-3-9-8-9-14 6 1 9 6 9 14z"/>
    <circle cx="34" cy="10" r="5"/><circle cx="34" cy="10" r="1.6" fill="currentColor"/>
    <path d="M34 5c2-3 6-3 6 1M39 10c3 1 3 5-1 6M29 10c-3 1-3 5 1 6M34 15c-1 3 1 5 3 4"/>
  </g></svg>`;
}
