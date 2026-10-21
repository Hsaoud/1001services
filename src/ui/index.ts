/**
 * Interface DOM de « Les 1001 Services de La Duchesse », façon carte de brasserie gastronomique.
 * Superposée au canvas du jeu (élément frère en dessous) ; les calques HUD ne captent pas la souris.
 */
// Sous-ensemble latin seulement : il couvre tout le français (é, ç, œ, ’…) et allège le build autonome.
import '@fontsource/cormorant-garamond/latin-400.css';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-600.css';
import '@fontsource/cormorant-garamond/latin-700.css';
import '@fontsource/cormorant-garamond/latin-400-italic.css';
import '@fontsource/great-vibes/latin-400.css';
import './ui.css';
import './hud.css';
import './menus.css';
import './service.css';

import type {
  BubbleState,
  DishId,
  Equipment,
  GameMode,
  HudState,
  MinimapState,
  ModeSave,
  PlayerStats,
  PopupSpec,
  ServiceResult,
  Settings,
} from '../types';
import type { IntroCard, LootFlow, PauseHandlers, TitleHandlers, TitleInfo, ToastKind, UiApi } from './api';
import { Bubbles } from './bubbles';
import type { UiCtx } from './ctx';
import { DishIcons } from './dishicons';
import { Announce, Overlays, Popups, Toasts } from './fx';
import { Hud } from './hud';
import { runCountdown, showIntroCard } from './intro';
import { createLevelSelect } from './levelselect';
import { showLootFlow } from './loot';
import { Minimap } from './minimap';
import { ScreenStack, type Screen } from './nav';
import { DEFS_SVG } from './ornaments';
import { createPause } from './pause';
import { showFailCard, showFinaleCard, showResultsCard } from './results';
import { createSettings } from './settings';
import { createTitle } from './title';
import { createWardrobe } from './wardrobe';

export class UI implements UiApi {
  readonly root: HTMLElement;

  private ctx: UiCtx;
  private stack: ScreenStack;
  private icons: DishIcons;
  private hud: Hud;
  private bubbles: Bubbles;
  private minimap: Minimap;
  private popups: Popups;
  private toasts: Toasts;
  private announcer: Announce;
  private overlays: Overlays;
  private countdownLayer: HTMLElement;

  private title: Screen | null = null;
  private levelSelect: Screen | null = null;
  private wardrobe: Screen | null = null;
  private settings: Screen | null = null;
  private pause: Screen | null = null;
  private hudOn = false;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'dz-root';
    this.root.setAttribute('lang', 'fr');
    this.root.innerHTML = DEFS_SVG;

    this.icons = new DishIcons(this.root);
    this.overlays = new Overlays();
    this.bubbles = new Bubbles(this.icons);
    this.popups = new Popups();
    this.hud = new Hud(this.icons);
    this.minimap = new Minimap();
    this.hud.topRight.appendChild(this.minimap.el);
    this.announcer = new Announce();
    this.toasts = new Toasts();
    this.countdownLayer = document.createElement('div');
    this.countdownLayer.className = 'dz-layer dz-countdown-layer';
    const screens = document.createElement('div');
    screens.className = 'dz-screens';

    this.hud.el.classList.add('dz-off');
    this.bubbles.el.classList.add('dz-off');
    this.root.append(
      this.overlays.rush,
      this.bubbles.el,
      this.popups.el,
      this.hud.el,
      this.announcer.el,
      this.toasts.el,
      this.countdownLayer,
      this.overlays.flash,
      screens,
    );
    container.appendChild(this.root);

    this.stack = new ScreenStack(screens);
    this.ctx = {
      root: this.root,
      stack: this.stack,
      icons: this.icons,
      titleInfo: null,
      titleHandlers: null,
      titleMode: 'salon',
    };
  }

  setDishIconProvider(fn: (id: DishId) => string): void {
    this.icons.setProvider(fn);
  }

  // ─────────────────────────────── Menus

  showTitle(info: TitleInfo, h: TitleHandlers): void {
    const first = !this.ctx.titleInfo;
    this.ctx.titleInfo = info;
    this.ctx.titleHandlers = h;
    if (first) {
      // Mode par défaut : celui où l'on a le plus progressé (Salon de Thé à égalité).
      const s = info.modes.salon;
      const c = info.modes.coupdefeu;
      this.ctx.titleMode = c.unlocked > s.unlocked ? 'coupdefeu' : 'salon';
    }
    const scr = createTitle(this.ctx, info, h);
    if (this.title && this.stack.has(this.title)) this.stack.replace(this.title, scr);
    else this.stack.push(scr, false);
    this.title = scr;
  }

  hideTitle(): void {
    if (!this.title) return;
    void this.stack.remove(this.title);
    this.title = null;
  }

  showLevelSelect(mode: GameMode, save: ModeSave, onPick: (level: number) => void, onBack: () => void): void {
    const scr = createLevelSelect(
      this.ctx,
      mode,
      save,
      (l) => {
        this.levelSelect = null;
        onPick(l);
      },
      () => {
        this.levelSelect = null;
        onBack();
      },
    );
    if (this.levelSelect && this.stack.has(this.levelSelect)) this.stack.replace(this.levelSelect, scr);
    else this.stack.push(scr);
    this.levelSelect = scr;
  }

  showWardrobe(mode: GameMode, eq: Equipment, stats: PlayerStats, onClose: () => void): void {
    const scr = createWardrobe(this.ctx, mode, eq, stats, () => {
      this.wardrobe = null;
      onClose();
    });
    if (this.wardrobe && this.stack.has(this.wardrobe)) this.stack.replace(this.wardrobe, scr);
    else this.stack.push(scr);
    this.wardrobe = scr;
  }

  showSettings(s: Settings, onChange: (s: Settings) => void, onClose: () => void): void {
    const scr = createSettings(this.ctx, s, onChange, () => {
      this.settings = null;
      onClose();
    });
    if (this.settings && this.stack.has(this.settings)) this.stack.replace(this.settings, scr);
    else this.stack.push(scr);
    this.settings = scr;
  }

  // ─────────────────────────────── Service

  showIntro(card: IntroCard): Promise<void> {
    return showIntroCard(this.ctx, card);
  }

  countdown(): Promise<void> {
    return runCountdown(this.countdownLayer);
  }

  showHud(on: boolean): void {
    if (on === this.hudOn) return;
    this.hudOn = on;
    this.hud.el.classList.toggle('dz-off', !on);
    this.bubbles.el.classList.toggle('dz-off', !on);
    if (on) this.hud.reset();
    else {
      this.bubbles.clear();
      this.minimap.update(null, false);
    }
  }

  updateHud(s: HudState): void {
    this.hud.update(s);
  }

  syncBubbles(bubbles: readonly BubbleState[]): void {
    this.bubbles.sync(bubbles);
  }

  popup(p: PopupSpec): void {
    this.popups.show(p);
  }

  toast(text: string, kind: ToastKind = 'tip', seconds = 4.5): void {
    this.toasts.show(text, kind, seconds);
  }

  announce(title: string, subtitle?: string, tone: 'gold' | 'rose' | 'cream' = 'gold'): void {
    this.announcer.show(title, subtitle, tone);
  }

  updateMinimap(m: MinimapState | null, expanded: boolean): void {
    this.minimap.update(m, expanded);
  }

  screenFlash(color: string, strength: number): void {
    this.overlays.screenFlash(color, strength);
  }

  setRush(amount: number): void {
    this.overlays.setRush(amount);
  }

  showPause(h: PauseHandlers): void {
    const wrapped: PauseHandlers = {
      onResume: () => {
        this.hidePause();
        h.onResume();
      },
      onRestart: () => {
        this.hidePause();
        h.onRestart();
      },
      onSettings: () => h.onSettings(),
      onQuit: () => {
        this.hidePause();
        h.onQuit();
      },
    };
    const scr = createPause(this.ctx, wrapped);
    if (this.pause && this.stack.has(this.pause)) this.stack.replace(this.pause, scr);
    else this.stack.push(scr);
    this.pause = scr;
  }

  hidePause(): void {
    if (this.settings && this.stack.has(this.settings) && this.pause && this.stack.has(this.pause)) {
      // Réglages ouverts par-dessus la pause : on les ferme aussi.
      void this.stack.remove(this.settings, false);
      this.settings = null;
    }
    if (!this.pause) return;
    void this.stack.remove(this.pause);
    this.pause = null;
  }

  // ─────────────────────────────── Fin de service

  showResults(r: ServiceResult): Promise<void> {
    return showResultsCard(this.ctx, r);
  }

  showLoot(flow: LootFlow): Promise<void> {
    return showLootFlow(this.ctx, flow);
  }

  showFail(r: ServiceResult): Promise<'retry' | 'quit'> {
    return showFailCard(this.ctx, r);
  }

  showFinale(mode: GameMode): Promise<void> {
    return showFinaleCard(this.ctx, mode);
  }
}
