import type { BiomeId, IntroId, LevelPlan, NpcKind, RoomEventKind, StationKind, TrapKind, ZoneKind } from '../types';
import { unlockedDishes } from './dishes';
import { INTROS, introLevel } from './bestiary';

export const LEVEL_COUNT = 100;

export const BIOME_ORDER: BiomeId[] = ['boudoir', 'jardin', 'terrasse', 'galerie'];

export const BIOME_NAMES: Record<BiomeId, string> = {
  boudoir: 'Le Boudoir Rose de Toulouse',
  jardin: "Le Jardin d'Hiver Fleuri",
  terrasse: 'La Terrasse Ensoleillée',
  galerie: 'La Grande Galerie Royale',
};

/** Les ambiances tournent par blocs de 5 niveaux. */
export function biomeOf(level: number): BiomeId {
  return BIOME_ORDER[Math.floor((level - 1) / 5) % BIOME_ORDER.length];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));

/** Largeur cible du salon (cases). 11 → 15 sur le tutoriel, puis jusqu'à ~52 au niveau 100. */
export function salonWidth(level: number): number {
  if (level <= 10) return Math.round(lerp(11, 15, (level - 1) / 9));
  return Math.round(15 + Math.pow(level - 10, 0.9) * 0.645);
}

/** Durée de référence (s) : 30 s → 45 s sur le tutoriel, ~14 min au niveau 100. */
export function serviceDuration(level: number): number {
  if (level <= 10) return Math.round(lerp(30, 45, (level - 1) / 9));
  return Math.round((45 + 0.58 * Math.pow(level - 10, 1.6)) / 5) * 5;
}

const STATION_UNLOCK: { station: StationKind; level: number }[] = [
  { station: 'croffle', level: 1 },
  { station: 'bar', level: 1 },
  { station: 'brioche', level: 3 },
  { station: 'tiramisu', level: 5 },
  { station: 'sale', level: 7 },
];

function counterCount(level: number): number {
  if (level <= 2) return 1;
  if (level <= 10) return 2;
  if (level <= 20) return 3;
  if (level <= 35) return 4;
  if (level <= 55) return 5;
  if (level <= 75) return 6;
  return level <= 90 ? 7 : 8;
}

function tableCount(level: number): number {
  if (level <= 10) return Math.round(lerp(3, 5, (level - 1) / 9));
  return Math.round(5 + (level - 10) * 0.3);
}

function zoneCount(level: number): number {
  if (level <= 10) return 1;
  if (level <= 20) return 2;
  if (level <= 40) return level % 2 === 0 ? 3 : 2;
  if (level <= 70) return level % 3 === 0 ? 4 : 3;
  return 4 + Math.min(2, Math.floor((level - 71) / 10));
}

const ZONE_FLAVOR: Record<BiomeId, ZoneKind[]> = {
  boudoir: ['boudoir', 'vip', 'terrasse', 'salon', 'jardin'],
  jardin: ['jardin', 'terrasse', 'vip', 'salon', 'boudoir'],
  terrasse: ['terrasse', 'jardin', 'vip', 'salon', 'galerie'],
  galerie: ['galerie', 'vip', 'boudoir', 'salon', 'jardin'],
};

/** Obstacles vivants : plafond par type, et rythme d'augmentation après leur introduction. */
const NPC_RULES: { kind: NpcKind; max: number; every: number }[] = [
  { kind: 'waiter', max: 6, every: 10 },
  { kind: 'chatty', max: 7, every: 9 },
  { kind: 'cart', max: 3, every: 18 },
  { kind: 'poodle', max: 3, every: 20 },
  { kind: 'influencer', max: 3, every: 18 },
  { kind: 'child', max: 2, every: 22 },
  { kind: 'polisher', max: 2, every: 20 },
  { kind: 'bride', max: 1, every: 99 },
  { kind: 'critic', max: 1, every: 99 },
  { kind: 'waltz', max: 2, every: 10 },
];

const TRAP_ORDER: TrapKind[] = ['chantilly', 'champagne', 'syrup', 'hungry_group', 'trapdoor', 'revolving', 'percolator'];
const EVENT_ORDER: RoomEventKind[] = ['chandelier', 'flambe'];

const TUTORIAL_TIPS: Record<number, string[]> = {
  1: [
    'Approchez-vous du comptoir et appuyez sur E pour prendre un plat.',
    'La bulle au-dessus d’une table indique sa commande : approchez-vous et appuyez sur E pour servir.',
    'Score de Service atteint ? Actionnez la Cloche Royale près de l’entrée (E).',
  ],
  2: [
    'Espace ou Maj : Pas Chassé (Dash), rapide et insaisissable.',
    'Le cercle doré autour d’une commande, c’est la patience : servir vite rapporte un gros pourboire.',
  ],
  3: ['Votre plateau porte plusieurs plats : groupez vos livraisons.', 'Les comptoirs qui brillent ont des plats prêts.'],
  4: ['Un Serveur Débordé traverse la salle : esquivez-le ou Dashez à travers lui.'],
  5: ['Chaque choc fait vaciller le plateau : à zéro d’équilibre, tout tombe !', 'Les effluves dorées vous guident vers les tables les plus pressées.'],
  6: ['Ouvrez les cloches en argent avec E… mais gare aux pièges roses !'],
  7: ['Le plat doré sert n’importe quelle table, et rapporte double.'],
  8: ['Après un service réussi, vous recevez toujours un objet d’équipement.'],
  9: ['Une chaise qui frémit va reculer : ne passez pas derrière.'],
  10: ['Enchaînez les livraisons rapides pour faire grimper le combo.'],
};

function round50(x: number): number {
  return Math.max(50, Math.round(x / 50) * 50);
}

/*
 * Calibrage des quotas : mesuré avec le maître d'hôtel automatique (tests/sim.ts, `CALIB=1 npx vitest run
 * tests/calib.test.ts`), équipé d'objets ~3 niveaux sous le niveau joué et qui esquive au Dash.
 * - secondes par livraison : ~5,5 s sur le tutoriel, ~5 s vers le niveau 40, ~6 s au niveau 100 (grands salons) ;
 * - points par livraison : ~150 au niveau 1 → ~440 au niveau 100 (pourboires de vitesse + Plateau Royal).
 * Le quota demande ensuite une fraction de ce que fait le bot (45 % sur le tutoriel → 62 % au niveau 100).
 */
function secPerDelivery(level: number): number {
  return 5.0 + 0.0003 * (level - 40) * (level - 40);
}

function pointsPerDelivery(level: number): number {
  return 150 + 2.9 * level;
}

function humanShare(level: number): number {
  if (level <= 10) return lerp(0.45, 0.5, (level - 1) / 9);
  return lerp(0.5, 0.62, (level - 10) / 90);
}

export function levelPlan(level: number): LevelPlan {
  const L = Math.max(1, Math.min(LEVEL_COUNT, Math.floor(level)));
  const biome = biomeOf(L);
  const width = salonWidth(L);
  const depth = Math.max(9, Math.round(width * 0.76));
  const area = width * depth;
  const duration = serviceDuration(L);
  const dishes = unlockedDishes(L);
  const stations = STATION_UNLOCK.filter((s) => s.level <= L).map((s) => s.station);
  const zc = zoneCount(L);
  const flavor = ZONE_FLAVOR[biome];
  const zoneKinds: ZoneKind[] = [];
  for (let i = 0; i < zc - 1; i++) {
    let k = flavor[i % flavor.length];
    if (k === 'vip' && L < 12) k = flavor[(i + 1) % flavor.length];
    zoneKinds.push(k);
  }
  // Sans zone VIP dédiée, le générateur pose l'estrade VIP dans le salon principal.
  const vipTables = L < 12 ? 0 : Math.min(6, 1 + Math.floor((L - 12) / 18));

  const npcs: { kind: NpcKind; count: number }[] = [];
  const areaCap = Math.max(1, Math.floor(area / 140));
  for (const r of NPC_RULES) {
    const li = introLevel(r.kind as IntroId);
    if (L < li) continue;
    const n = Math.min(r.max, areaCap + (r.kind === 'chatty' ? 2 : 0), 1 + Math.floor((L - li) / r.every));
    if (n > 0) npcs.push({ kind: r.kind, count: n });
  }

  const traps = TRAP_ORDER.filter((t) => L >= introLevel(t as IntroId));
  const events = EVENT_ORDER.filter((e) => L >= introLevel(e as IntroId));
  const clochesOn = L >= introLevel('cloches');

  const tables = tableCount(L);
  const quota = round50((duration / secPerDelivery(L)) * pointsPerDelivery(L) * humanShare(L));

  const intro = INTROS.find((i) => i.level === L && i.id !== 'chantilly')?.id ?? null;
  const tips = [...(TUTORIAL_TIPS[L] ?? [])];
  for (const i of INTROS) if (i.level === L) tips.push(i.tip);

  return {
    level: L,
    biome,
    width,
    depth,
    zoneCount: zc,
    zoneKinds,
    tables,
    vipTables,
    counters: counterCount(L),
    centralIsland: L >= 15,
    fountain: L >= 26 && (biome === 'jardin' || biome === 'galerie' || L >= 50),
    stations,
    dishes,
    duration,
    quota,
    patience: Math.round(23 - L * 0.07 + (width + depth) * 0.38),
    orderGap: lerp(4.5, 2.5, (L - 1) / 99),
    npcs,
    traps,
    events,
    clocheInterval: clochesOn ? lerp(20, 11, (L - 6) / 94) : Infinity,
    trapChance: clochesOn ? (L === 6 ? 0.5 : lerp(0.28, 0.5, (L - 7) / 93)) : 0,
    hazardScale: 1 + ((L - 1) / 99) * 0.6,
    intro,
    tips,
    pedestals: clochesOn ? Math.min(9, 2 + Math.floor(L / 14)) : 0,
  };
}
