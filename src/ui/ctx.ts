/** Contexte partagé entre les écrans de l'interface. */
import type { GameMode } from '../types';
import type { TitleHandlers, TitleInfo } from './api';
import type { DishIcons } from './dishicons';
import type { ScreenStack } from './nav';

export interface UiCtx {
  root: HTMLElement;
  stack: ScreenStack;
  icons: DishIcons;
  /** Dernières informations de l'écran-titre (sauvegardes des deux modes). */
  titleInfo: TitleInfo | null;
  /** Gestionnaires de l'écran-titre : permettent de basculer de mode depuis la Carte / la Garde-robe. */
  titleHandlers: TitleHandlers | null;
  /** Mode actuellement choisi sur l'écran-titre. */
  titleMode: GameMode;
  /** Fournisseur optionnel du portrait 3D de La Duchesse. */
  duchessPortrait?: () => string;
}

export const MODE_NAME: Record<GameMode, string> = {
  salon: 'Salon de Thé',
  coupdefeu: 'Coup de Feu',
};

export const otherMode = (m: GameMode): GameMode => (m === 'salon' ? 'coupdefeu' : 'salon');
