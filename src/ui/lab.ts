/**
 * Laboratoire de l'interface (ui-lab.html) : ouvre chaque écran avec des données factices,
 * anime un HUD complet (bulles, mini-carte, anneaux, ruée…) sur un faux salon pastel.
 */
import type {
  BubbleState,
  DishId,
  Equipment,
  GameMode,
  HudState,
  Item,
  ItemType,
  MinimapState,
  ModeSave,
  RingId,
  ServiceResult,
  Settings,
} from '../types';
import { CELL } from '../types';
import { ITEM_TYPES, RING_INFO, WHEEL, computeStats, isUpgrade, makeItem } from '../data/items';
import { BIOME_NAMES, levelPlan } from '../data/progression';
import type { LootFlow } from './api';
import { UI } from './index';

const app = document.getElementById('app') as HTMLElement;
const ui = new UI(app);
(window as unknown as { ui: UI }).ui = ui;

// ───────────────────────────── Données factices

const eqSalon: Equipment = {
  boots: makeItem('boots', 22),
  vest: makeItem('vest', 18),
  tray: makeItem('tray', 31),
  grinder: makeItem('grinder', 9),
  latte: makeItem('latte', 27),
  passkey: makeItem('passkey', 14),
  ring_tournee: makeItem('ring_tournee', 21),
  ring_brigade: makeItem('ring_brigade', 64),
};
const eqCdf: Equipment = { boots: makeItem('boots', 3), tray: makeItem('tray', 2) };

function fakeSave(unlocked: number, eq: Equipment): ModeSave {
  const best: Record<number, number> = {};
  for (let l = 1; l < unlocked; l++) best[l] = Math.round(levelPlan(l).quota * (0.95 + ((l * 37) % 60) / 100));
  best[unlocked] = Math.round(levelPlan(unlocked).quota * 0.7);
  return { unlocked, current: unlocked, equipment: eq, ringCooldowns: {}, best, totalServed: unlocked * 23 };
}
const saves: Record<GameMode, ModeSave> = { salon: fakeSave(23, eqSalon), coupdefeu: fakeSave(4, eqCdf) };
let settings: Settings = { master: 0.8, music: 0.6, sfx: 0.9, quality: 'high', shake: true };

const SALON_NAMES = ['Le Petit Salon Rose', 'La Verrière aux Glycines', 'La Terrasse des Capucins', 'La Galerie des Glaces Dorées'];

// ───────────────────────────── Faux salon (30 × 22) pour la mini-carte

const W = 30;
const D = 22;
const cells = new Uint8Array(W * D);
const zoneOf = new Int16Array(W * D).fill(-1);
for (let z = 0; z < D; z++)
  for (let x = 0; x < W; x++) {
    const i = z * W + x;
    const border = x === 0 || z === 0 || x === W - 1 || z === D - 1;
    let c: number = border ? CELL.WALL : CELL.FLOOR;
    let zone = 0;
    if (x < 12 && z > 14) zone = 1; // terrasse
    if (x > 20 && z < 9) zone = 2; // jardin d'hiver
    if (x > 21 && z > 14) zone = 3; // estrade VIP
    if (!border && z === 14 && x < 12 && (x < 4 || x > 6)) c = CELL.RAIL;
    if (!border && x === 20 && z < 9 && (z < 3 || z > 5)) c = CELL.GLASS;
    if (!border && x === 21 && z > 14 && z !== 17 && z !== 18) c = CELL.RAIL;
    if (!border && x >= 13 && x <= 15 && z >= 9 && z <= 11) c = CELL.WALL; // pilier central
    cells[i] = c;
    if (c === CELL.FLOOR) zoneOf[i] = zone;
  }
const TABLES = [
  { x: 4.5, z: 4.5 },
  { x: 9.5, z: 5 },
  { x: 5, z: 10 },
  { x: 17, z: 4 },
  { x: 24.5, z: 4.5 },
  { x: 4.5, z: 18.5 },
  { x: 9, z: 18 },
  { x: 18, z: 16 },
  { x: 25, z: 17.5 },
  { x: 25.5, z: 12 },
];
const DISH_POOL: DishId[] = ['croffle', 'latte', 'pancakes', 'tiramisu', 'avotoast', 'brioche', 'mocktail', 'golden'];

// ───────────────────────────── Démo HUD

interface Demo {
  mode: GameMode;
  level: number;
  t: number;
  score: number;
  quota: number;
  duration: number;
  rush: boolean;
  forceRush: boolean;
  tray: DishId[];
  combo: number;
  expanded: boolean;
  ringActive: Partial<Record<RingId, number>>;
  ringCd: Record<RingId, number>;
  dashUsed: number;
  lastDash: number;
  passkeyT: number;
}
let demo: Demo | null = null;
let raf = 0;
let last = 0;

function startDemo(mode: GameMode, level = 23): void {
  const p = levelPlan(level);
  demo = {
    mode,
    level,
    t: 0,
    score: 0,
    quota: p.quota,
    duration: mode === 'coupdefeu' ? 75 : 0,
    rush: false,
    forceRush: false,
    tray: ['croffle'],
    combo: 0,
    expanded: false,
    ringActive: {},
    ringCd: { tournee: 0, temps: 999, brigade: 95, grace: 0 },
    dashUsed: 0,
    lastDash: 0,
    passkeyT: 0,
  };
  ui.hideTitle();
  ui.showHud(true);
  cancelAnimationFrame(raf);
  last = performance.now();
  raf = requestAnimationFrame(tick);
}

function stopDemo(): void {
  demo = null;
  cancelAnimationFrame(raf);
  ui.syncBubbles([]);
  ui.updateMinimap(null, false);
  ui.setRush(0);
  ui.showHud(false);
}

let nextPopup = 0;
let nextServe = 2;
function tick(now: number): void {
  if (!demo) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const d = demo;
  d.t += dt;
  const stats = computeStats(d.mode === 'salon' ? eqSalon : eqCdf);

  // Score : livraisons régulières.
  if (d.t > nextServe) {
    nextServe = d.t + 1.4 + Math.random() * 1.6;
    const gain = 90 + Math.round(Math.random() * 160);
    d.score += gain;
    d.combo = Math.random() < 0.8 ? d.combo + 1 : 0;
    ui.popup({ text: `+${gain}`, sx: innerWidth * (0.3 + Math.random() * 0.4), sy: innerHeight * (0.35 + Math.random() * 0.3), tone: 'gold' });
    if (d.tray.length) d.tray = d.tray.slice(1);
    if (!d.rush && d.score >= d.quota && d.score - gain < d.quota) ui.announce('Score atteint !', 'Sonnez la Cloche Royale');
  }
  if (Math.random() < dt * 0.9 && d.tray.length < stats.capacity) d.tray = [...d.tray, DISH_POOL[Math.floor(Math.random() * 7)]];
  if (d.t > nextPopup) {
    nextPopup = d.t + 2.5 + Math.random() * 3;
    const choices = [
      { text: 'Pourboire royal !', tone: 'rose' as const },
      { text: '×2 Plat doré', tone: 'gold' as const, big: true },
      { text: 'Commande perdue', tone: 'bad' as const },
      { text: 'Parfait !', tone: 'cream' as const },
    ];
    const c = choices[Math.floor(Math.random() * choices.length)];
    ui.popup({ ...c, sx: innerWidth * (0.25 + Math.random() * 0.5), sy: innerHeight * (0.3 + Math.random() * 0.4) });
  }

  // Minuteur & ruée.
  let timeLeft: number | null = null;
  if (d.mode === 'coupdefeu') {
    timeLeft = Math.max(0, d.duration - d.t);
    if (timeLeft <= 0 && d.score < d.quota) d.rush = true;
  }
  const rush = d.rush || d.forceRush;
  ui.setRush(rush ? 0.75 + 0.25 * Math.sin(d.t * 3) : timeLeft !== null && timeLeft < 10 ? (10 - timeLeft) / 25 : 0);

  // Anneaux.
  const RCD = 180;
  const rings = (['tournee', 'temps', 'brigade', 'grace'] as RingId[]).map((id) => {
    const equipped = stats.rings[id] !== null || id === 'grace';
    d.ringCd[id] = Math.max(0, d.ringCd[id] - dt);
    const active = (d.ringActive[id] ?? 0) > d.t;
    return { id, equipped, ready01: 1 - d.ringCd[id] / RCD, remaining: d.ringCd[id], active };
  });

  // Dash : recharge.
  const dashMax = stats.dashCharges;
  const rechargeT = stats.dashCooldown;
  let charges = dashMax - d.dashUsed;
  let rech = 0;
  if (d.dashUsed > 0) {
    const since = d.t - d.lastDash;
    const regained = Math.floor(since / rechargeT);
    if (regained > 0) {
      d.dashUsed = Math.max(0, d.dashUsed - regained);
      d.lastDash += regained * rechargeT;
    }
    charges = dashMax - d.dashUsed;
    rech = ((d.t - d.lastDash) % rechargeT) / rechargeT;
  }
  const passCd = stats.passkeyCooldown ?? 8;
  const pass = Math.min(1, (d.t - d.passkeyT) / passCd);

  const hud: HudState = {
    mode: d.mode,
    level: d.level,
    biome: levelPlan(d.level).biome,
    salonName: SALON_NAMES[d.level % SALON_NAMES.length],
    score: d.score,
    quota: d.quota,
    quotaReached: d.score >= d.quota,
    timeLeft,
    rush,
    tray: d.tray,
    capacity: stats.capacity,
    balance: stats.balanceMax * (0.55 + 0.45 * Math.sin(d.t * 0.7)),
    balanceMax: stats.balanceMax,
    dashCharges: charges,
    dashChargesMax: dashMax,
    dashRecharge01: rech,
    passkey01: d.mode === 'salon' ? pass : null,
    rings,
    combo: d.combo,
    served: Math.floor(d.score / 120),
  };
  ui.updateHud(hud);

  // Bulles : une douzaine de tables qui « flottent » à l'écran.
  const bubbles: BubbleState[] = [];
  for (let i = 0; i < 12; i++) {
    const cx = innerWidth * (0.18 + 0.64 * ((i % 4) / 3));
    const cy = innerHeight * (0.3 + 0.2 * Math.floor(i / 4));
    const sx = cx + Math.sin(d.t * 0.6 + i) * 40;
    const sy = cy + Math.cos(d.t * 0.45 + i * 1.7) * 26;
    const period = 14 + (i % 5) * 3;
    const p = 1 - ((d.t + i * 2.3) % period) / period;
    const dish = DISH_POOL[i % DISH_POOL.length];
    bubbles.push({
      key: `t${i}`,
      sx,
      sy,
      visible: !(i === 11 && Math.sin(d.t * 0.5) > 0.6),
      dish,
      patience01: p,
      vip: i === 2 || i === 9,
      urgent: p < 0.3,
      inRange: i === 5,
      matching: d.tray.includes(dish),
    });
  }
  ui.syncBubbles(bubbles);

  // Mini-carte.
  const ang = d.t * 0.5;
  const tideR = rush ? Math.min(18, (d.t % 30) * 0.8) : 0;
  const mm: MinimapState = {
    width: W,
    depth: D,
    cells,
    zoneOf,
    player: { x: 15 + Math.cos(ang) * 7, z: 11 + Math.sin(ang) * 6, heading: Math.atan2(-Math.sin(ang) * 7, Math.cos(ang) * 6) },
    tables: TABLES.map((t, i) => ({
      ...t,
      dish: i % 3 === 2 ? null : DISH_POOL[i % 7],
      urgent: i === 1 || i === 6,
      vip: i >= 8,
    })),
    counters: [
      { x: 14, z: 1.5, station: 'croffle', ready: 2 },
      { x: 2, z: 13, station: 'bar', ready: 0 },
      { x: 18.5, z: 20.5, station: 'tiramisu', ready: 3 },
    ],
    cloches: [
      { x: 12, z: 7 },
      { x: 22, z: 11 },
    ],
    npcs: [0, 1, 2, 3].map((k) => ({ x: 15 + Math.cos(d.t * 0.8 + k * 1.6) * (4 + k * 2), z: 11 + Math.sin(d.t * 0.6 + k) * (3 + k) })),
    bell: { x: 27.5, z: 9.5, lit: d.score >= d.quota },
    tide: tideR > 0 ? { origin: { x: 14, z: 10 }, radius: tideR } : null,
  };
  ui.updateMinimap(mm, d.expanded);

  raf = requestAnimationFrame(tick);
}

// Touches de la démo (le jeu réel les gère lui-même) : seulement quand aucun menu n'est ouvert.
window.addEventListener('keydown', (e) => {
  if (!demo) return;
  const d = demo;
  if (e.code === 'Tab') {
    e.preventDefault();
    d.expanded = !d.expanded;
  } else if (e.code === 'Escape') openPause();
  else if (e.code === 'Space' || e.code === 'ShiftLeft') {
    const max = computeStats(d.mode === 'salon' ? eqSalon : eqCdf).dashCharges;
    if (d.dashUsed < max) {
      if (d.dashUsed === 0) d.lastDash = d.t;
      d.dashUsed++;
      d.passkeyT = d.t;
    }
    e.preventDefault();
  } else if (/^Digit[1-4]$/.test(e.code)) {
    const id = (['tournee', 'temps', 'brigade', 'grace'] as RingId[])[Number(e.code.slice(5)) - 1];
    if (d.ringCd[id] <= 0) {
      d.ringActive[id] = d.t + 4;
      d.ringCd[id] = 180;
      ui.screenFlash('#f7e4a6', 0.5);
    }
  } else if (e.code === 'KeyE') {
    ui.popup({ text: 'Servi !', sx: innerWidth / 2, sy: innerHeight / 2, tone: 'cream' });
  }
});

// ───────────────────────────── Écrans

function openTitle(): void {
  stopDemo();
  ui.showTitle(
    { modes: saves, hasSave: true },
    {
      onPlay: (m) => {
        ui.hideTitle();
        void playLevel(m, saves[m].current);
      },
      onLevelSelect: (m) => openLevelSelect(m),
      onWardrobe: (m) => openWardrobe(m),
      onSettings: () => openSettings(),
    },
  );
}

function openLevelSelect(m: GameMode): void {
  ui.showLevelSelect(
    m,
    saves[m],
    (l) => {
      ui.hideTitle();
      void playLevel(m, l);
    },
    () => console.log('[lab] retour de la carte'),
  );
}

function openWardrobe(m: GameMode): void {
  const eq = m === 'salon' ? eqSalon : eqCdf;
  ui.showWardrobe(m, eq, computeStats(eq), () => console.log('[lab] garde-robe fermée'));
}

function openSettings(): void {
  ui.showSettings(
    settings,
    (s) => {
      settings = s;
      console.log('[lab] réglages', s);
    },
    () => console.log('[lab] réglages fermés'),
  );
}

async function playLevel(m: GameMode, level: number, withIntro: boolean | null = null): Promise<void> {
  stopDemo();
  ui.hideTitle();
  const plan = levelPlan(level);
  await ui.showIntro({
    mode: m,
    plan,
    salonName: SALON_NAMES[level % SALON_NAMES.length],
    biomeName: BIOME_NAMES[plan.biome],
    intro: withIntro === false ? null : withIntro === true ? plan.intro ?? 'waiter' : plan.intro,
  });
  await ui.countdown();
  startDemo(m, level);
  for (const tip of plan.tips.slice(0, 2)) ui.toast(tip, 'tip', 6);
}

function openPause(): void {
  ui.showPause({
    onResume: () => console.log('[lab] reprise'),
    onRestart: () => void playLevel(demo?.mode ?? 'salon', demo?.level ?? 1),
    onSettings: () => openSettings(),
    onQuit: () => openTitle(),
  });
}

function fakeResult(success: boolean, mode: GameMode = 'salon'): ServiceResult {
  const quota = levelPlan(23).quota;
  return {
    mode,
    level: 23,
    success,
    score: success ? Math.round(quota * 1.27) : Math.round(quota * 0.71),
    quota,
    served: success ? 41 : 26,
    tips: success ? 2140 : 820,
    bestCombo: success ? 9 : 4,
    expired: success ? 1 : 6,
    crashes: success ? 0 : 2,
    time: success ? 412 : 300,
  };
}

function lootFlow(type?: ItemType, level = 23): LootFlow {
  const eq = eqSalon;
  const item = makeItem(type ?? ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)], level);
  return {
    mode: 'salon',
    item,
    currentOf: (t) => eq[t],
    wheel: WHEEL,
    spin() {
      const tot = WHEEL.reduce((s, x) => s + x.weight, 0);
      let r = Math.random() * tot;
      let segment = 0;
      for (let i = 0; i < WHEEL.length; i++) {
        r -= WHEEL[i].weight;
        if (r <= 0) {
          segment = i;
          break;
        }
      }
      const o = WHEEL[segment].outcome;
      let items: Item[] = [item];
      if (o.kind === 'level') items = [makeItem(item.type, item.level + o.delta)];
      else if (o.kind === 'double') items = [item, makeItem(item.type, item.level)];
      else if (o.kind === 'reroll') items = [makeItem(ITEM_TYPES.filter((t) => t !== item.type)[Math.floor(Math.random() * 9)], item.level)];
      return { segment, items };
    },
    accept(items) {
      return items.map((it) => {
        const up = isUpgrade(eq, it);
        if (up) eq[it.type] = it;
        return up;
      });
    },
  };
}

// ───────────────────────────── Panneau

const panel = document.getElementById('lab-panel') as HTMLElement;
const lab = document.getElementById('lab') as HTMLElement;
(document.getElementById('lab-toggle') as HTMLElement).onclick = () => lab.classList.toggle('closed');

const groups: [string, [string, () => void][]][] = [
  [
    'Menus',
    [
      ['Titre', openTitle],
      ['Carte · Salon de Thé', () => openLevelSelect('salon')],
      ['Carte · Coup de Feu', () => openLevelSelect('coupdefeu')],
      ['Garde-robe', () => openWardrobe('salon')],
      ['Garde-robe (presque vide)', () => openWardrobe('coupdefeu')],
      ['Réglages', openSettings],
    ],
  ],
  [
    'Service',
    [
      ['Intro simple (n° 23)', () => void playLevel('coupdefeu', 23, false)],
      ['Intro + nouveauté (n° 29)', () => void playLevel('salon', 29, true)],
      ['Intro nouveauté (n° 6)', () => void playLevel('coupdefeu', 6, true)],
      ['Compte à rebours', () => void ui.countdown()],
      ['HUD · Salon de Thé', () => startDemo('salon', 23)],
      ['HUD · Coup de Feu', () => startDemo('coupdefeu', 37)],
      ['Ruée (mousse) on/off', () => demo && (demo.forceRush = !demo.forceRush)],
      ['Mini-carte agrandie (Tab)', () => demo && (demo.expanded = !demo.expanded)],
      ['Score → quota', () => demo && (demo.score = demo.quota - 50)],
      ['Couper le HUD', stopDemo],
      ['Pause (Échap)', openPause],
    ],
  ],
  [
    'Effets',
    [
      ['Popups', () => {
        const list = [
          { text: '+142', tone: 'gold' as const },
          { text: 'Pourboire royal !', tone: 'rose' as const },
          { text: '×2 Plat doré', tone: 'gold' as const, big: true },
          { text: 'Plateau renversé…', tone: 'bad' as const },
          { text: 'Combo ×6', tone: 'cream' as const },
        ];
        list.forEach((p, i) => setTimeout(() => ui.popup({ ...p, sx: innerWidth * (0.3 + i * 0.1), sy: innerHeight * 0.5 }), i * 180));
      }],
      ['Toasts (tous)', () => {
        ui.toast('Approchez-vous du comptoir et appuyez sur E pour prendre un plat.', 'tip');
        setTimeout(() => ui.toast('Nouveauté : le Caniche Royal flaire le sucré !', 'intro'), 300);
        setTimeout(() => ui.toast('La mousse monte : sonnez vite la Cloche !', 'warn'), 600);
        setTimeout(() => ui.toast('Pourboire royal : +250', 'gold'), 900);
        setTimeout(() => ui.toast('Mocassins en Velours niv. 24 équipés', 'item'), 1200);
      }],
      ['Annonce or', () => ui.announce('Score de Service atteint !', 'Sonnez la Cloche Royale près de l’entrée', 'gold')],
      ['Annonce longue', () => ui.announce(RING_INFO.tournee.power, RING_INFO.tournee.description, 'gold')],
      ['Annonce rose', () => ui.announce('La mousse déborde !', 'Dépêchez-vous', 'rose')],
      ['Annonce crème', () => ui.announce('Service !', 'Le salon ouvre ses portes', 'cream')],
      ['Flash photo', () => ui.screenFlash('#ffffff', 0.9)],
      ['Flash or (pouvoir)', () => ui.screenFlash('#f7e4a6', 0.6)],
      ['Vignette 0 → 1', () => {
        let a = 0;
        const id = setInterval(() => {
          a += 0.05;
          ui.setRush(a > 1 ? 0 : a);
          if (a > 1.05) clearInterval(id);
        }, 60);
      }],
    ],
  ],
  [
    'Fin de service',
    [
      ['Addition réussie', () => void ui.showResults(fakeResult(true))],
      ['Addition manquée', () => void ui.showResults(fakeResult(false, 'coupdefeu'))],
      ['Échec (mousse)', () => void ui.showFail(fakeResult(false, 'coupdefeu')).then((r) => console.log('[lab] échec →', r))],
      ['Butin (au hasard)', () => void ui.showLoot(lootFlow()).then(() => console.log('[lab] butin terminé'))],
      ['Butin anneau royal (niv. 88)', () => void ui.showLoot(lootFlow('ring_grace', 88))],
      ['Butin moins bon (niv. 5)', () => void ui.showLoot(lootFlow('tray', 5))],
      ['Grand final', () => void ui.showFinale('salon')],
    ],
  ],
  [
    'Divers',
    [
      ['Icônes 3D simulées', () => {
        const cache = new Map<DishId, string>();
        let ready = false;
        setTimeout(() => (ready = true), 1500);
        ui.setDishIconProvider((id) => {
          if (!ready) return '';
          let u = cache.get(id);
          if (!u) {
            const c = document.createElement('canvas');
            c.width = c.height = 96;
            const g = c.getContext('2d') as CanvasRenderingContext2D;
            const grd = g.createRadialGradient(40, 36, 6, 48, 48, 44);
            grd.addColorStop(0, '#fff');
            grd.addColorStop(1, ['#d9a441', '#d68b3c', '#e0b36a', '#8a5a44', '#8fae5a', '#e58fb0', '#b98a64', '#e9c46a'][DISH_POOL.indexOf(id)]);
            g.fillStyle = grd;
            g.beginPath();
            g.arc(48, 52, 38, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = '#5b1f2a';
            g.font = 'bold 22px serif';
            g.textAlign = 'center';
            g.fillText(id.slice(0, 3).toUpperCase(), 48, 60);
            u = c.toDataURL();
            cache.set(id, u);
          }
          return u;
        });
      }],
    ],
  ],
];
for (const [title, btns] of groups) {
  const h = document.createElement('h4');
  h.textContent = title;
  panel.appendChild(h);
  for (const [label, fn] of btns) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.onclick = (e) => {
      (e.currentTarget as HTMLElement).blur();
      try {
        // Seuls les écrans sont rejoués après un rechargement (pas les bascules ni les effets).
        const toggle = /^(Ruée|Mini-carte|Score|Couper|Compte)/.test(label);
        if ((title === 'Menus' || title === 'Service' || title === 'Fin de service') && !toggle) sessionStorage.setItem('dz-lab-last', label);
      } catch {
        /* stockage indisponible */
      }
      fn();
    };
    panel.appendChild(b);
  }
}
// Aides d'inspection (console) : loupe sur une zone, touches simulées, clic sur un bouton du panneau.
const w = window as unknown as Record<string, unknown>;
w.mag = (x: number, y: number, s: number) => {
  app.style.transformOrigin = `${x}px ${y}px`;
  app.style.transform = s === 1 ? '' : `scale(${s})`;
  lab.style.display = s === 1 ? '' : 'none';
};
w.magAt = (x0: number, y0: number, s: number) => (w.mag as (x: number, y: number, s: number) => void)((x0 * s) / (s - 1), (y0 * s) / (s - 1), s);
w.key = (code: string, shift = false) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, shiftKey: shift, bubbles: true, cancelable: true }));
w.lab = (t: string) => ([...panel.querySelectorAll('button')].find((b) => b.textContent?.startsWith(t)) as HTMLElement | undefined)?.click();
w.hidePanel = (on = true) => {
  lab.style.display = on ? 'none' : '';
  try {
    sessionStorage.setItem('dz-lab-hide', on ? '1' : '');
  } catch {
    /* stockage indisponible */
  }
};

const hint = document.createElement('div');
hint.className = 'hint';
hint.textContent = 'Pendant le HUD : Tab carte, Espace dash, 1–4 anneaux, E servir, Échap pause.';
panel.appendChild(hint);

openTitle();

// Rechargement à chaud : on rejoue la dernière action du panneau pour itérer plus vite.
try {
  const lastAction = sessionStorage.getItem('dz-lab-last');
  if (sessionStorage.getItem('dz-lab-hide')) lab.style.display = 'none';
  if (lastAction && lastAction !== 'Titre') setTimeout(() => (w.lab as (t: string) => void)(lastAction), 250);
} catch {
  /* stockage indisponible */
}
