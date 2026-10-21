/**
 * Contrat interne des modèles de PNJ : chaque espèce fournit un groupe, sa hauteur (pour les étoiles et
 * les cœurs), une main pour le verre de mocktail (Tournée Générale) et une fonction d'animation.
 * L'enveloppe commune (npcs.ts) gère position, cap, apparition / disparition, étoiles, cœurs, départ.
 */
import type * as THREE from 'three';
import type { NpcAction } from '../../types';

export interface NpcCtx {
  dt: number;
  time: number;
  action: NpcAction;
  /** Action précédente (transitions : atterrissage du caniche…). */
  prev: NpcAction;
  /** Secondes écoulées dans l'action courante. */
  at: number;
  /** actionT (0..1) fourni par la simulation. */
  t: number;
  speed01: number;
  /** Vitesse réelle (u/s) mesurée, ou estimée depuis speed01 si immobile. */
  spd: number;
  /** Paramètre libre (recul de chaise, rang dans la farandole…). */
  aux: number;
  /** Vitesse angulaire du cap (rad/s, lissée). */
  turn: number;
  /** Opacité / présence (1 = visible). */
  fade: number;
}

export interface NpcModel {
  readonly group: THREE.Object3D;
  /** Hauteur du sommet (y) : étoiles et cœurs au-dessus. */
  readonly top: number;
  /** Point d'attache du verre de mocktail quand le PNJ est calmé (null : pas de main). */
  readonly hand: THREE.Object3D | null;
  /** Vitesse nominale (u/s) quand speed01 = 1 (animation sur place dans le labo). */
  readonly nominalSpeed: number;
  /** Le modèle gère lui-même le départ (pas de pirouette générique). */
  readonly customLeave?: boolean;
  update(c: NpcCtx): void;
}

/** Marque un objet d'effet (matériau propre, opacité gérée par le modèle, exclu du fondu générique). */
export function markFx<T extends THREE.Object3D>(o: T): T {
  o.userData.fx = true;
  return o;
}

export function isFx(o: THREE.Object3D | null): boolean {
  for (let p = o; p; p = p.parent) if (p.userData.fx) return true;
  return false;
}

/** Compteurs de variantes par espèce (apparences différentes d'une instance à l'autre). */
const counters = new Map<string, number>();
export function nextVariant(kind: string): number {
  const n = counters.get(kind) ?? 0;
  counters.set(kind, n + 1);
  return n;
}
