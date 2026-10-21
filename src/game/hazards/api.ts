import type { View } from '../../render/api';
import type { Rng } from '../../core/rng';
import type { SfxOptions } from '../../audio/api';
import type {
  DishId,
  FxKind,
  FxOptions,
  LevelPlan,
  NpcKind,
  NpcViewState,
  SalonLayout,
  SfxId,
  TelegraphShape,
  TelegraphTone,
  TrapKind,
  Vec2,
} from '../../types';

/** Vue en lecture seule du joueur pour les obstacles. */
export interface HazardPlayer {
  readonly x: number;
  readonly z: number;
  readonly vx: number;
  readonly vz: number;
  readonly radius: number; // ~0.32
  /** En Dash (invulnérable pendant le dash) ou sous Grâce Ducale : les chocs sont ignorés. */
  readonly invulnerable: boolean;
  readonly dashing: boolean;
  readonly tray: readonly DishId[];
  /** Porte au moins un plat sucré (Croffle, Brioche, Pancakes, Tiramisu) : attire les caniches. */
  readonly carryingSweet: boolean;
  /** En train de tomber dans une trappe / téléporté / étourdi : ne plus cibler. */
  readonly busy: boolean;
}

/** Télégraphe vivant : l'obstacle fait évoluer `progress` (0 → 1) puis `active`, et le retire quand c'est fini. */
export interface TelegraphHandle {
  readonly id: number;
  shape: TelegraphShape;
  tone: TelegraphTone;
  progress: number;
  active: boolean;
  persistent?: boolean;
}

export interface HitSpec {
  /** Points d'équilibre retirés (avant multiplicateur de niveau, appliqué par le monde). */
  damage: number;
  /** Origine du choc (pour la direction du recul). */
  fromX: number;
  fromZ: number;
  /** Vitesse de recul (u/s), défaut 5. */
  knockback?: number;
  /** Étourdissement (s), défaut 0. */
  stun?: number;
  /** Identifiant de la source (anti-répétition : une même source ne frappe pas deux fois en 0,8 s). */
  source: string;
}

/**
 * Le monde vu par les obstacles et pièges (implémenté par src/game/world.ts).
 * Tous les effets sur le joueur passent par ici : le monde gère invulnérabilité, équilibre, feedbacks.
 */
export interface HazardWorld {
  readonly layout: SalonLayout;
  readonly plan: LevelPlan;
  readonly rng: Rng;
  /** Temps de jeu écoulé (s), figé pendant « l'Heure du Thé ». */
  readonly time: number;
  readonly player: HazardPlayer;

  // ── Effets sur le joueur (renvoient false si ignoré : invulnérable, déjà touché par la même source…)
  hitPlayer(hit: HitSpec): boolean;
  /** Étourdit (flash d'influenceur : écran blanc + étoiles). */
  stunPlayer(seconds: number, kind: 'flash' | 'dizzy', source: string): boolean;
  /** Chute dans une trappe : le plateau est perdu, le joueur remonte à l'entrée. */
  dropPlayer(source: string): boolean;
  /** Téléporte le joueur (passe-plat tournant). */
  teleportPlayer(x: number, z: number, source: string): boolean;

  // ── Terrain
  /** Vrai si un cercle de rayon `radius` centré en (x, z) ne touche ni mur ni mobilier. */
  isFree(x: number, z: number, radius: number): boolean;
  /** Distance jusqu'au premier mur (ou bord du salon) le long d'un rayon (mobilier ignoré). */
  castRay(x: number, z: number, dirX: number, dirZ: number, maxDist: number): number;
  /** Chemin praticable (points de passage en centres de cases, sans le départ) ou null. */
  findPath(ax: number, az: number, bx: number, bz: number): Vec2[] | null;
  /** Point de sol libre au hasard, éventuellement entre minDist et maxDist de `near`. */
  randomFreePoint(near?: Vec2, minDist?: number, maxDist?: number): Vec2 | null;
  /**
   * Déplace un cercle avec glissement contre murs et mobilier. Modifie `pos`.
   * Renvoie la normale de collision si un obstacle a été touché (pour rebondir), sinon null.
   */
  moveCircle(pos: { x: number; z: number }, dx: number, dz: number, radius: number): Vec2 | null;

  // ── Retours visuels / sonores
  addTelegraph(shape: TelegraphShape, tone: TelegraphTone, persistent?: boolean): TelegraphHandle;
  removeTelegraph(t: TelegraphHandle): void;
  fx(kind: FxKind, x: number, z: number, opts?: FxOptions): void;
  sfx(id: SfxId, opts?: SfxOptions): void;
  shake(amount: number): void;

  // ── Vues
  createNpcView(kind: NpcKind): View<NpcViewState>;
  removeView(view: View<NpcViewState>): void;
  /** Recul de chaise (client bavard) : 0 = rangée, 1 = reculée au maximum (~0.7 u). */
  setChairPush(tableId: number, seat: number, amount: number): void;
  /** Fait trembler les lustres du salon (événement « Lustre frémissant »), 0..1. */
  setChandelierShake(amount: number): void;
  /** Un client est-il assis sur ce siège ? (les clients bavards n'agissent que sur un siège occupé) */
  seatOccupied?(tableId: number, seat: number): boolean;
}

/** Le chef d'orchestre des obstacles d'un niveau (implémenté par src/game/hazards/index.ts). */
export interface HazardDirector {
  /** Avance la simulation (non appelé pendant « l'Heure du Thé »). */
  update(dt: number): void;
  /** Une cloche piégée vient d'être ouverte en (x, z). */
  triggerTrap(kind: TrapKind, x: number, z: number): void;
  /** Tournée Générale : tous les gêneurs présents sont calmés et s'effacent (ils reviennent progressivement ensuite). */
  calmAll(): void;
  /** Positions des PNJ (mini-carte). */
  positions(): Vec2[];
  /** Le sol est-il glissant en (x, z) ? (sirop, cire du robot) */
  slipperyAt(x: number, z: number): boolean;
  /** Multiplicateur d'impatience d'une table en (x, z) (critique gastronomique à proximité → 2). */
  patienceDrainAt(x: number, z: number): number;
  /** Synchronise les vues (appelé à chaque image, même en pause de simulation). */
  syncViews(dt: number): void;
  dispose(): void;
}

export type CreateHazards = (world: HazardWorld) => HazardDirector;
