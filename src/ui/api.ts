import type {
  BubbleState,
  DishId,
  Equipment,
  GameMode,
  HudState,
  IntroId,
  Item,
  ItemType,
  LevelPlan,
  MinimapState,
  ModeSave,
  PlayerStats,
  PopupSpec,
  ServiceResult,
  Settings,
} from '../types';
import type { WheelSegment } from '../data/items';

export interface TitleInfo {
  modes: Record<GameMode, ModeSave>;
  hasSave: boolean;
}

export interface TitleHandlers {
  /** Lance le niveau `current` du mode. */
  onPlay(mode: GameMode): void;
  /** Ouvre la carte des services (choix d'un niveau débloqué). */
  onLevelSelect(mode: GameMode): void;
  onWardrobe(mode: GameMode): void;
  onSettings(): void;
}

export interface IntroCard {
  mode: GameMode;
  plan: LevelPlan;
  salonName: string;
  biomeName: string;
  /** Nouveauté du niveau (carte illustrée), ou null. */
  intro: IntroId | null;
}

export interface PauseHandlers {
  onResume(): void;
  onRestart(): void;
  onSettings(): void;
  onQuit(): void;
}

export interface LootFlow {
  mode: GameMode;
  item: Item;
  /** Objet actuellement porté dans l'emplacement de ce type. */
  currentOf(type: ItemType): Item | undefined;
  wheel: WheelSegment[];
  /** Le joueur tente la Roue : renvoie le segment gagnant et le(s) objet(s) qui en résultent (1 ou 2). */
  spin(): { segment: number; items: Item[] };
  /** Le joueur valide : les objets (1 ou 2) sont équipés s'ils sont meilleurs. Renvoie pour chacun s'il a été équipé. */
  accept(items: Item[]): boolean[];
}

export type ToastKind = 'tip' | 'intro' | 'warn' | 'gold' | 'item';

export interface UiApi {
  readonly root: HTMLElement;

  /** Fournit les icônes de plats (data URL rendues en 3D). Peut renvoyer '' tant qu'elles ne sont pas prêtes. */
  setDishIconProvider(fn: (id: DishId) => string): void;

  // ── Menus
  showTitle(info: TitleInfo, h: TitleHandlers): void;
  hideTitle(): void;
  /** Carte des Services : 100 niveaux groupés par ambiance, comme une carte de menu. */
  showLevelSelect(mode: GameMode, save: ModeSave, onPick: (level: number) => void, onBack: () => void): void;
  showWardrobe(mode: GameMode, eq: Equipment, stats: PlayerStats, onClose: () => void): void;
  showSettings(s: Settings, onChange: (s: Settings) => void, onClose: () => void): void;

  // ── Service
  /** Carte d'ouverture du service ; se résout quand le joueur lance le service (E / Entrée / clic). */
  showIntro(card: IntroCard): Promise<void>;
  /** « 3, 2, 1… Service ! » */
  countdown(): Promise<void>;
  showHud(on: boolean): void;
  updateHud(s: HudState): void;
  syncBubbles(bubbles: readonly BubbleState[]): void;
  popup(p: PopupSpec): void;
  toast(text: string, kind?: ToastKind, seconds?: number): void;
  /** Grande annonce centrale (« Score atteint ! Sonnez la Cloche Royale »). */
  announce(title: string, subtitle?: string, tone?: 'gold' | 'rose' | 'cream'): void;
  /** Mini-carte en coin ; `expanded` = overlay transparent centré (Tab). `null` = masquée. */
  updateMinimap(m: MinimapState | null, expanded: boolean): void;
  /** Flash plein écran (flash photo, grâce…), 0..1. */
  screenFlash(color: string, strength: number): void;
  /** Vignette d'urgence (marée, fin de minuteur), 0..1. */
  setRush(amount: number): void;

  showPause(h: PauseHandlers): void;
  hidePause(): void;

  // ── Mobile & Tactile
  attachTouchInput?(input: import('../core/input').Input): void;
  updateTouch?(world: import('../game/world').World): void;
  onOrientationChange?(fn: (inPortrait: boolean) => void): void;

  // ── Fin de service
  /** L'addition : récapitulatif du service. Se résout sur « Continuer ». */
  showResults(r: ServiceResult): Promise<void>;
  /** Révélation de l'objet gagné + Roue de Dégustation optionnelle. Se résout quand tout est accepté. */
  showLoot(flow: LootFlow): Promise<void>;
  /** Échec (marée de mousse) : rejouer ou quitter. */
  showFail(r: ServiceResult): Promise<'retry' | 'quit'>;
  /** Fin des 100 services. */
  showFinale(mode: GameMode): Promise<void>;
}
