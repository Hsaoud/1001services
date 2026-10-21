import type { Equipment, Item, ItemType, PlayerStats, RingId } from '../types';

export const MAX_ITEM_LEVEL = 100;

export interface ItemDef {
  type: ItemType;
  name: string;
  slot: string; // emplacement affiché (« Pieds », « Torse »…)
  stat: string; // libellé de la statistique
  description: string;
  ring?: RingId;
  /** Valeur de la stat à un niveau donné, formatée pour l'UI. */
  format: (level: number) => string;
}

// ── Formules (une seule statistique par type, croissante avec le niveau)

/** Mocassins : +% de vitesse. */
export const bootsSpeedPct = (lvl: number) => 4 + lvl * 0.4; // 4.4 % → 44 %
/** Veste : points d'équilibre en plus. */
export const vestBalance = (lvl: number) => Math.round(20 + lvl * 2.8); // +23 → +300
/** Plateau : +% de pourboire. */
export const trayTipPct = (lvl: number) => 5 + lvl * 1.45; // +6 % → +150 %
/** Plateau : capacité totale de portage. */
export const trayCapacity = (lvl: number) => 2 + (lvl >= 8 ? 1 : 0) + (lvl >= 30 ? 1 : 0) + (lvl >= 60 ? 1 : 0) + (lvl >= 90 ? 1 : 0);
/** Moulin : −% de recharge du dash. */
export const grinderPct = (lvl: number) => Math.min(60, 5 + lvl * 0.55); // 5.5 % → 60 %
/** Latte glacé : charges de dash en plus. */
export const latteCharges = (lvl: number) => 1 + Math.floor(lvl / 25); // +1 → +5
/** Passe-Partout : recharge (s) entre deux traversées. */
export const passkeyCooldown = (lvl: number) => Math.max(2.5, 12 - (lvl - 1) * 0.096); // 12 s → 2.5 s
/** Anneaux : recharge du pouvoir, 10 min → 3 min au niveau 100. */
export const ringCooldown = (lvl: number) => Math.round(600 - ((Math.min(lvl, MAX_ITEM_LEVEL) - 1) * 420) / 99);

const fmtSec = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')}` : `${s.toFixed(1)} s`);

export const RING_INFO: Record<RingId, { name: string; power: string; description: string; duration: number; key: string }> = {
  tournee: {
    name: 'Tournée Générale',
    power: 'Tournée Générale de Mocktails',
    description: 'Calme et fait disparaître tous les gêneurs présents, et remplit la patience de toutes les tables.',
    duration: 0,
    key: '1',
  },
  temps: {
    name: "L'Heure du Thé",
    power: 'Temps suspendu',
    description: 'Fige les obstacles, les pièges et la patience des tables pendant 8 secondes.',
    duration: 8,
    key: '2',
  },
  brigade: {
    name: 'La Brigade',
    power: 'Coup de main du Chef',
    description: 'Tous les comptoirs dressent instantanément les plats attendus ; +2 places sur le plateau pendant 20 s.',
    duration: 20,
    key: '3',
  },
  grace: {
    name: 'La Grâce Ducale',
    power: 'Grâce Ducale',
    description: 'Invulnérable, Dash illimité et +35 % de vitesse pendant 8 secondes.',
    duration: 8,
    key: '4',
  },
};

export const ITEMS: Record<ItemType, ItemDef> = {
  boots: {
    type: 'boots',
    name: 'Mocassins en Velours',
    slot: 'Pieds',
    stat: 'Vitesse',
    description: 'Un pas de velours, feutré et vif.',
    format: (l) => `+${bootsSpeedPct(l).toFixed(1)} % de vitesse`,
  },
  vest: {
    type: 'vest',
    name: "Veste de Maître d'Hôtel",
    slot: 'Torse',
    stat: 'Équilibre',
    description: 'Coupe impeccable : le plateau tient bon malgré les bousculades.',
    format: (l) => `+${vestBalance(l)} points d'équilibre`,
  },
  tray: {
    type: 'tray',
    name: 'Plateau Royal en Argent',
    slot: 'Plateau',
    stat: 'Pourboire',
    description: "Le service en argent impressionne : les clients sont plus généreux. Porte davantage à certains paliers (niv. 8, 30, 60, 90).",
    format: (l) => `+${trayTipPct(l).toFixed(0)} % de pourboire · ${trayCapacity(l)} plats`,
  },
  grinder: {
    type: 'grinder',
    name: 'Moulin à Espresso',
    slot: 'Ceinture',
    stat: 'Recharge du Dash',
    description: 'Un café serré, et le pas chassé revient plus vite.',
    format: (l) => `−${grinderPct(l).toFixed(1)} % de recharge du Dash`,
  },
  latte: {
    type: 'latte',
    name: 'Tasse de Latte Glacé',
    slot: 'Main gauche',
    stat: 'Charges de Dash',
    description: 'Fraîcheur et énergie : plusieurs pas chassés d’affilée.',
    format: (l) => `+${latteCharges(l)} charge${latteCharges(l) > 1 ? 's' : ''} de Dash`,
  },
  passkey: {
    type: 'passkey',
    name: 'Passe-Partout de la Duchesse',
    slot: 'Poche',
    stat: 'Traversée',
    description: 'Pendant un Dash, traversez tables et décor comme un courant d’air.',
    format: (l) => `Traverse le mobilier · recharge ${fmtSec(passkeyCooldown(l))}`,
  },
  ring_tournee: {
    type: 'ring_tournee',
    name: 'Anneau de la Tournée Générale',
    slot: 'Anneau I',
    stat: 'Pouvoir',
    ring: 'tournee',
    description: RING_INFO.tournee.description,
    format: (l) => `Tournée Générale · recharge ${fmtSec(ringCooldown(l))}`,
  },
  ring_temps: {
    type: 'ring_temps',
    name: "Anneau de l'Heure du Thé",
    slot: 'Anneau II',
    stat: 'Pouvoir',
    ring: 'temps',
    description: RING_INFO.temps.description,
    format: (l) => `Temps suspendu · recharge ${fmtSec(ringCooldown(l))}`,
  },
  ring_brigade: {
    type: 'ring_brigade',
    name: 'Anneau de la Brigade',
    slot: 'Anneau III',
    stat: 'Pouvoir',
    ring: 'brigade',
    description: RING_INFO.brigade.description,
    format: (l) => `Coup de main du Chef · recharge ${fmtSec(ringCooldown(l))}`,
  },
  ring_grace: {
    type: 'ring_grace',
    name: 'Anneau de la Grâce Ducale',
    slot: 'Anneau IV',
    stat: 'Pouvoir',
    ring: 'grace',
    description: RING_INFO.grace.description,
    format: (l) => `Grâce Ducale · recharge ${fmtSec(ringCooldown(l))}`,
  },
};

export const ITEM_TYPES: ItemType[] = [
  'boots',
  'vest',
  'tray',
  'grinder',
  'latte',
  'passkey',
  'ring_tournee',
  'ring_temps',
  'ring_brigade',
  'ring_grace',
];

export const RING_ITEM: Record<RingId, ItemType> = {
  tournee: 'ring_tournee',
  temps: 'ring_temps',
  brigade: 'ring_brigade',
  grace: 'ring_grace',
};

/** Rang de prestige selon le niveau de l'objet (couleur de cadre dans l'UI). */
export interface ItemTier {
  name: string;
  color: string;
  min: number;
}
export const TIERS: ItemTier[] = [
  { name: 'Commis', color: '#a9a29a', min: 1 },
  { name: 'Chef de Rang', color: '#7fa58a', min: 20 },
  { name: "Maître d'Hôtel", color: '#7c8fc4', min: 40 },
  { name: 'Étoilé', color: '#b77fc1', min: 60 },
  { name: 'Royal', color: '#d4a537', min: 80 },
];
export function tierOf(level: number): ItemTier {
  let t = TIERS[0];
  for (const tier of TIERS) if (level >= tier.min) t = tier;
  return t;
}

// ── Statistiques de base du joueur (sans équipement)

export const BASE = {
  speed: 4.3,
  balance: 100,
  capacity: 2,
  dashCooldown: 1.7,
  dashCharges: 1,
};

export function computeStats(eq: Equipment): PlayerStats {
  const lv = (t: ItemType) => eq[t]?.level ?? 0;
  const ringCd = (t: ItemType) => (eq[t] ? ringCooldown(lv(t)) : null);
  return {
    speed: BASE.speed * (1 + (eq.boots ? bootsSpeedPct(lv('boots')) / 100 : 0)),
    balanceMax: BASE.balance + (eq.vest ? vestBalance(lv('vest')) : 0),
    tipBonus: eq.tray ? trayTipPct(lv('tray')) / 100 : 0,
    capacity: eq.tray ? trayCapacity(lv('tray')) : BASE.capacity,
    dashCooldown: BASE.dashCooldown * (1 - (eq.grinder ? grinderPct(lv('grinder')) / 100 : 0)),
    dashCharges: BASE.dashCharges + (eq.latte ? latteCharges(lv('latte')) : 0),
    passkeyCooldown: eq.passkey ? passkeyCooldown(lv('passkey')) : null,
    rings: {
      tournee: ringCd('ring_tournee'),
      temps: ringCd('ring_temps'),
      brigade: ringCd('ring_brigade'),
      grace: ringCd('ring_grace'),
    },
  };
}

let uidCounter = 0;
export function makeItem(type: ItemType, level: number): Item {
  uidCounter = (uidCounter + 1) % 1e6;
  return {
    uid: `${type}-${level}-${Date.now().toString(36)}-${uidCounter.toString(36)}`,
    type,
    level: Math.max(1, Math.min(MAX_ITEM_LEVEL, Math.round(level))),
  };
}

/** Un objet est meilleur si son niveau est plus élevé (stat unique croissante). */
export function isUpgrade(eq: Equipment, item: Item): boolean {
  const cur = eq[item.type];
  return !cur || item.level > cur.level;
}

/**
 * Tirage du type d'objet de fin de service : favorise les emplacements vides ou en retard,
 * pour que l'équipement progresse de façon homogène.
 */
export function rollItemType(eq: Equipment, level: number, r: () => number): ItemType {
  const weights = ITEM_TYPES.map((t) => {
    const cur = eq[t];
    let w = cur ? 1 + Math.max(0, level - cur.level) / 6 : 3.2;
    if (t.startsWith('ring_')) w *= level < 12 ? 0.25 : 0.7; // les anneaux arrivent un peu plus tard
    if (t === 'passkey' && level < 6) w *= 0.3;
    return w;
  });
  let total = weights.reduce((a, b) => a + b, 0);
  let x = r() * total;
  for (let i = 0; i < ITEM_TYPES.length; i++) {
    x -= weights[i];
    if (x <= 0) return ITEM_TYPES[i];
  }
  return ITEM_TYPES[ITEM_TYPES.length - 1];
}

/** Segments de la Roue de Dégustation (jeu de hasard optionnel en fin de service). */
export type WheelOutcome =
  | { kind: 'level'; delta: number } // niveau de l'objet ±delta
  | { kind: 'double' } // un second objet du même niveau
  | { kind: 'reroll' } // change le type d'objet
  | { kind: 'keep' }; // rien ne change

export interface WheelSegment {
  label: string;
  outcome: WheelOutcome;
  weight: number;
  tone: 'gold' | 'rose' | 'cream' | 'sage';
}

export const WHEEL: WheelSegment[] = [
  { label: '+3 niveaux', outcome: { kind: 'level', delta: 3 }, weight: 20, tone: 'cream' },
  { label: 'Grand Cru +10', outcome: { kind: 'level', delta: 10 }, weight: 5, tone: 'gold' },
  { label: '−4 niveaux', outcome: { kind: 'level', delta: -4 }, weight: 16, tone: 'rose' },
  { label: 'Doublé !', outcome: { kind: 'double' }, weight: 9, tone: 'gold' },
  { label: '+6 niveaux', outcome: { kind: 'level', delta: 6 }, weight: 12, tone: 'sage' },
  { label: 'Autre plat…', outcome: { kind: 'reroll' }, weight: 16, tone: 'cream' },
  { label: '−8 niveaux', outcome: { kind: 'level', delta: -8 }, weight: 10, tone: 'rose' },
  { label: 'On garde', outcome: { kind: 'keep' }, weight: 12, tone: 'sage' },
];
