/**
 * Noms élégants des zones et revêtements de sol, selon le type de zone et l'ambiance.
 */
import type { BiomeId, FloorStyle, ZoneKind } from '../types';
import type { Rng } from '../core/rng';

const MAIN_NAMES: Record<BiomeId, string[]> = {
  boudoir: ['Le Salon Rose', 'Le Salon Poudré', 'Le Salon des Violettes', 'Le Grand Salon de la Duchesse', 'Le Salon Pompadour'],
  jardin: ['Le Salon des Camélias', 'Le Salon Vert Amande', 'Le Salon des Hortensias', 'Le Salon Fleuri', 'Le Salon des Pivoines'],
  terrasse: ['Le Salon Ensoleillé', 'Le Salon des Tournesols', 'Le Salon Méridien', 'Le Salon de la Garonne', 'Le Salon Brique'],
  galerie: ['Le Grand Salon Doré', 'Le Salon des Glaces', 'Le Salon Impérial', 'Le Salon des Lustres', 'Le Salon du Capitole'],
};

const KIND_NAMES: Record<ZoneKind, string[]> = {
  salon: ['Le Petit Salon', 'Le Salon de Musique', 'Le Salon Bleu Lavande', 'Le Salon des Marquises', 'Le Salon de Thé'],
  boudoir: ['Le Boudoir des Duchesses', 'Le Petit Boudoir', 'Le Boudoir de Velours', 'Le Boudoir Poudré', 'Le Boudoir aux Rubans'],
  jardin: ['La Verrière aux Glycines', "Le Jardin d'Hiver", 'La Serre aux Orchidées', 'La Verrière des Roses', 'La Serre des Violettes'],
  terrasse: [
    'La Terrasse des Capucines',
    'La Terrasse de la Garonne',
    'La Terrasse aux Lauriers',
    'La Terrasse du Capitole',
    'La Terrasse des Oliviers',
  ],
  galerie: ['La Galerie des Glaces', 'La Galerie Dorée', 'La Galerie des Portraits', 'La Galerie des Lustres', 'La Galerie des Muses'],
  vip: ["L'Estrade Royale", "L'Estrade des Marquises", 'Le Carré de la Duchesse', "L'Estrade d'Honneur", 'Le Balcon des Princesses'],
};

/** Choisit un nom inédit dans la salle (`used` est mis à jour). */
export function zoneName(kind: ZoneKind, main: boolean, biome: BiomeId, rng: Rng, used: Set<string>): string {
  const pool = main ? MAIN_NAMES[biome] : KIND_NAMES[kind];
  const free = pool.filter((n) => !used.has(n));
  const name = free.length > 0 ? rng.pick(free) : `${rng.pick(pool)} ${used.size + 1}`;
  used.add(name);
  return name;
}

/** Revêtement de sol d'une zone. */
export function zoneFloor(kind: ZoneKind, main: boolean, biome: BiomeId, rng: Rng): FloorStyle {
  if (main) {
    switch (biome) {
      case 'boudoir':
        return rng.weighted<FloorStyle>(['tiles_rose', 'parquet', 'carpet'], [4, 3, 1]);
      case 'jardin':
        return rng.weighted<FloorStyle>(['checker', 'terracotta', 'parquet'], [4, 2, 1]);
      case 'terrasse':
        return rng.weighted<FloorStyle>(['stone', 'terracotta'], [3, 2]);
      case 'galerie':
        return 'marble';
    }
  }
  switch (kind) {
    case 'salon':
      return rng.weighted<FloorStyle>(['parquet', 'carpet', 'tiles_rose'], [4, 2, 1]);
    case 'boudoir':
      return rng.weighted<FloorStyle>(['tiles_rose', 'carpet'], [3, 2]);
    case 'jardin':
      return rng.weighted<FloorStyle>(['checker', 'terracotta'], [3, 2]);
    case 'terrasse':
      return rng.weighted<FloorStyle>(['stone', 'terracotta'], [3, 2]);
    case 'galerie':
      return 'marble';
    case 'vip':
      return rng.weighted<FloorStyle>(['stage', 'carpet'], [3, 2]);
  }
}
