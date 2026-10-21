import type * as THREE from 'three';
import type {
  BellViewState,
  ClocheViewState,
  CounterViewState,
  DishId,
  FxKind,
  FxOptions,
  NpcKind,
  NpcViewState,
  PlayerViewState,
  SalonLayout,
  Settings,
  TableViewState,
  Telegraph,
  TideViewState,
  Vec2,
} from '../types';

/**
 * Une vue 3D pilotée par un état de simulation. `update` est appelé à chaque image avec le dernier état
 * (la vue anime elle-même : interpolations, squash & stretch, oscillations…). `root` est déjà dans la scène
 * quand la vue est créée par le GameRenderer.
 */
export interface View<S> {
  readonly root: THREE.Object3D;
  update(state: S, dt: number): void;
  dispose(): void;
}

/** Le salon construit : une vue par table / comptoir / guéridon, dans le même ordre que dans le SalonLayout. */
export interface SalonView {
  readonly tables: View<TableViewState>[];
  readonly counters: View<CounterViewState>[];
  /** Une cloche (argent ou sonnette dorée) par guéridon, même ordre que layout.pedestals. */
  readonly cloches: View<ClocheViewState>[];
  readonly bell: View<BellViewState>;
  /** Animations d'ambiance (eau de fontaine, lustres, feuillages, flammes de bougies…). */
  update(dt: number, time: number): void;
  /** Événement « Lustre frémissant » : fait trembler les lustres (0 = calme, 1 = fort). */
  setChandelierShake(amount: number): void;
  dispose(): void;
}

export interface ScreenPoint {
  x: number; // px CSS depuis le bord gauche du canvas
  y: number;
  visible: boolean; // dans l'écran
}

/** Contrat du moteur de rendu (implémenté par src/render/renderer.ts). */
export interface GameRendererApi {
  readonly canvas: HTMLCanvasElement;

  /** Construit le salon (sol, murs coupés façon diorama, mobilier, décor) et applique l'ambiance du biome. */
  buildSalon(layout: SalonLayout): SalonView;
  /** Retire et libère le salon courant ainsi que toutes les vues créées (joueur, PNJ, FX…). */
  clearSalon(): void;

  createPlayer(): View<PlayerViewState>;
  createNpc(kind: NpcKind): View<NpcViewState>;
  /** Retire une vue de la scène et libère ses ressources. */
  removeView(view: View<unknown>): void;

  /** Synchronise les télégraphes au sol (rose / doré) avec la liste courante. */
  setTelegraphs(list: readonly Telegraph[]): void;
  /** Effet ponctuel (particules, éclats). */
  fx(kind: FxKind, x: number, z: number, opts?: FxOptions): void;
  /** Guidage : fines particules dorées (effluves de café, pétales) du joueur vers les cibles (tables pressées, comptoirs prêts). */
  setGuide(from: Vec2, targets: readonly Vec2[]): void;
  /** Marée de mousse de cappuccino (mode Coup de Feu). */
  setTide(state: TideViewState | null): void;

  /** La caméra suit ce point (lissé). `snap` = sans lissage (début de niveau). */
  cameraFollow(x: number, z: number, snap?: boolean): void;
  /** Secousse d'écran (0..1). */
  shake(amount: number): void;
  /** Mode vitrine de l'écran titre : caméra qui tourne lentement autour du salon. */
  setShowcase(on: boolean): void;

  /** Projette un point monde (y = hauteur) en coordonnées écran CSS. */
  worldToScreen(x: number, y: number, z: number, out?: ScreenPoint): ScreenPoint;

  /** Icône PNG (data URL, ~96 px, fond transparent) d'un plat, rendue depuis son modèle 3D. Mise en cache. */
  dishIcon(id: DishId): string;

  setQuality(q: Settings['quality']): void;
  /** Teinte de post-process d'urgence (0..1) : marée de mousse, fin de minuteur. */
  setRush(amount: number): void;
  resize(): void;
  render(dt: number, time: number): void;
}
