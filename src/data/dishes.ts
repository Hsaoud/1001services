import type { DishDef, DishId, StationKind } from '../types';

/** La carte de La Duchesse : spécialités servies dans le jeu. */
export const DISHES: Record<DishId, DishDef> = {
  croffle: {
    id: 'croffle',
    name: 'Croffle chantilly',
    short: 'Croffle',
    station: 'croffle',
    sweet: true,
    value: 100,
    prepTime: 3.2,
    unlockLevel: 1,
    color: '#d9a441',
  },
  latte: {
    id: 'latte',
    name: 'Latte art',
    short: 'Latte',
    station: 'bar',
    sweet: false,
    value: 80,
    prepTime: 2.2,
    unlockLevel: 1,
    color: '#b98a64',
  },
  pancakes: {
    id: 'pancakes',
    name: 'Pancakes au sirop',
    short: 'Pancakes',
    station: 'brioche',
    sweet: true,
    value: 110,
    prepTime: 3.6,
    unlockLevel: 3,
    color: '#e0b36a',
  },
  tiramisu: {
    id: 'tiramisu',
    name: 'Tiramisu de la Duchesse',
    short: 'Tiramisu',
    station: 'tiramisu',
    sweet: true,
    value: 120,
    prepTime: 2.8,
    unlockLevel: 5,
    color: '#8a5a44',
  },
  avotoast: {
    id: 'avotoast',
    name: 'Toast avocat & œuf poché',
    short: 'Toast salé',
    station: 'sale',
    sweet: false,
    value: 130,
    prepTime: 4.2,
    unlockLevel: 7,
    color: '#8fae5a',
  },
  brioche: {
    id: 'brioche',
    name: 'Brioche perdue dorée',
    short: 'Brioche',
    station: 'brioche',
    sweet: true,
    value: 120,
    prepTime: 3.8,
    unlockLevel: 9,
    color: '#d68b3c',
  },
  mocktail: {
    id: 'mocktail',
    name: 'Mocktail givré',
    short: 'Mocktail',
    station: 'bar',
    sweet: false,
    value: 90,
    prepTime: 2.4,
    unlockLevel: 11,
    color: '#e58fb0',
  },
  golden: {
    id: 'golden',
    name: 'Plat doré de la Duchesse',
    short: 'Plat doré',
    station: null,
    sweet: false,
    value: 200,
    prepTime: 0,
    unlockLevel: 1,
    color: '#e9c46a',
  },
};

/** Plats commandables (hors plat doré), dans l'ordre de déblocage. */
export const MENU_ORDER: DishId[] = ['croffle', 'latte', 'pancakes', 'tiramisu', 'avotoast', 'brioche', 'mocktail'];

export const STATION_NAMES: Record<StationKind, string> = {
  croffle: 'Comptoir des Croffles',
  brioche: 'Passe des Brioches & Pancakes',
  tiramisu: 'Vitrine des Tiramisus',
  sale: 'Comptoir Salé',
  bar: 'Bar à Boissons',
};

export function dishesOfStation(station: StationKind, unlocked: DishId[]): DishId[] {
  return unlocked.filter((d) => DISHES[d].station === station);
}

export function unlockedDishes(level: number): DishId[] {
  return MENU_ORDER.filter((d) => DISHES[d].unlockLevel <= level);
}
