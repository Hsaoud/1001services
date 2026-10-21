/**
 * L'application : écrans (titre, carte des services, garde-robe, réglages), enchaînement des services,
 * boucle de jeu, sauvegarde et butin de fin de service.
 */
import { GameRenderer } from './render/renderer';
import type { GameRendererApi, SalonView } from './render/api';
import { UI } from './ui';
import type { UiApi } from './ui/api';
import { audio } from './audio';
import { Input } from './core/input';
import { loadSave, writeSave, hasSave } from './core/save';
import { levelSeed, Rng } from './core/rng';
import { generateSalon } from './gen';
import { levelPlan, BIOME_NAMES, LEVEL_COUNT } from './data/progression';
import { WHEEL, computeStats, isUpgrade, makeItem, rollItemType } from './data/items';
import { World, type FrameInput } from './game/world';
import { device, lockLandscape } from './core/device';
import type { GameMode, Item, ItemType, SalonLayout, SaveData, Settings } from './types';

type AppState = 'title' | 'menu' | 'intro' | 'playing' | 'paused' | 'end';

export class App {
  readonly renderer: GameRendererApi;
  readonly ui: UiApi;
  private input = new Input();
  private save: SaveData;
  private world: World | null = null;
  private state: AppState = 'title';
  private mode: GameMode = 'salon';
  private last = performance.now();
  private time = 0;
  private showcase: { layout: SalonLayout; view: SalonView; rng: Rng } | null = null;
  private serviceToken = 0;

  constructor(root: HTMLElement) {
    root.classList.add('duchesse-root');
    const gameLayer = document.createElement('div');
    gameLayer.className = 'game-layer';
    const uiLayer = document.createElement('div');
    uiLayer.className = 'ui-layer';
    root.append(gameLayer, uiLayer);

    this.save = loadSave();
    this.renderer = new GameRenderer(gameLayer);
    this.ui = new UI(uiLayer);
    this.ui.setDishIconProvider((id) => this.renderer.dishIcon(id));
    this.applySettings(this.save.settings);

    device.init();
    this.ui.attachTouchInput?.(this.input);
    this.ui.onOrientationChange?.((inPortrait) => {
      if (inPortrait && this.state === 'playing') {
        this.pause();
      }
    });

    const unlock = () => {
      audio.unlock();
      void lockLandscape();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('blur', () => {
      if (this.state === 'playing') this.pause();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });

    this.showTitle();
    requestAnimationFrame(this.frame);
  }

  // ───────────────────────────────────────── Écrans

  private showTitle(): void {
    this.serviceToken++;
    this.endWorld();
    this.state = 'title';
    this.input.capture = false;
    this.ui.showHud(false);
    // Vitrine : le salon le plus avancé atteint (au moins le 12e, pour montrer un beau salon).
    const furthest = Math.max(this.save.modes.salon.current, this.save.modes.coupdefeu.current);
    const lvl = Math.min(LEVEL_COUNT, Math.max(12, furthest));
    this.buildShowcase(lvl);
    audio.music('title');
    this.ui.showTitle(
      { modes: this.save.modes, hasSave: hasSave() },
      {
        onPlay: (mode) => this.startService(mode, this.save.modes[mode].current),
        onLevelSelect: (mode) => this.openLevelSelect(mode),
        onWardrobe: (mode) => this.openWardrobe(mode),
        onSettings: () => this.openSettings(() => this.showTitle()),
      },
    );
  }

  private openLevelSelect(mode: GameMode): void {
    this.state = 'menu';
    this.ui.hideTitle();
    this.ui.showLevelSelect(
      mode,
      this.save.modes[mode],
      (level) => this.startService(mode, level),
      () => this.showTitle(),
    );
  }

  private openWardrobe(mode: GameMode): void {
    this.state = 'menu';
    this.ui.hideTitle();
    const eq = this.save.modes[mode].equipment;
    this.ui.showWardrobe(mode, eq, computeStats(eq), () => this.showTitle());
  }

  private openSettings(onClose: () => void): void {
    if (this.state === 'title') this.ui.hideTitle();
    this.ui.showSettings(
      { ...this.save.settings },
      (s) => {
        this.save.settings = s;
        this.applySettings(s);
        writeSave(this.save);
      },
      onClose,
    );
  }

  private applySettings(s: Settings): void {
    audio.setVolumes(s.master, s.music, s.sfx);
    this.renderer.setQuality(s.quality);
  }

  private buildShowcase(level: number): void {
    const plan = levelPlan(level);
    const layout = generateSalon(plan, levelSeed(level));
    this.renderer.clearSalon();
    const view = this.renderer.buildSalon(layout);
    this.renderer.setShowcase(true);
    this.renderer.cameraFollow(layout.width / 2, layout.depth / 2, true);
    this.showcase = { layout, view, rng: new Rng(levelSeed(level, 7)) };
    // Un salon animé : tables occupées, comptoirs garnis.
    const rng = this.showcase.rng;
    layout.tables.forEach((t, i) => {
      const clients = rng.int(Math.min(1, t.seats.length), t.seats.length);
      view.tables[i]?.update(
        {
          mood: rng.chance(0.5) ? 'eating' : 'seated',
          clients,
          served: rng.chance(0.6) ? [rng.pick(plan.dishes)] : [],
          chairPush: t.seats.map(() => 0),
          highlight: 0,
          vip: t.vip,
        },
        0,
      );
    });
    layout.counters.forEach((c, i) => {
      view.counters[i]?.update({ ready: c.dishes.slice(0, 2), cooking: 0.4, cookingDish: c.dishes[0] ?? null, glow: 1, highlight: 0 }, 0);
    });
  }

  // ───────────────────────────────────────── Service

  private async startService(mode: GameMode, level: number): Promise<void> {
    const token = ++this.serviceToken;
    this.endWorld();
    this.mode = mode;
    this.state = 'intro';
    void lockLandscape();
    this.ui.hideTitle();
    this.ui.showHud(false);
    this.showcase = null;
    const ms = this.save.modes[mode];
    ms.current = level;
    writeSave(this.save);
    // Laisse le menu s'effacer avant la construction (jusqu'à ~1 s pour les grands salons).
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    if (token !== this.serviceToken) return;

    const plan = levelPlan(level);
    const layout = generateSalon(plan, levelSeed(level));
    this.world = new World(plan, layout, mode, {
      renderer: this.renderer,
      ui: this.ui,
      audio,
      settings: this.save.settings,
      save: ms,
      persist: () => writeSave(this.save),
    });
    audio.music('service');
    if (plan.intro && !this.save.seenIntros.includes(plan.intro)) {
      this.save.seenIntros.push(plan.intro);
      writeSave(this.save);
    }
    await this.ui.showIntro({
      mode,
      plan,
      salonName: layout.zones[0]?.name ?? BIOME_NAMES[plan.biome],
      biomeName: BIOME_NAMES[plan.biome],
      intro: plan.intro,
    });
    if (token !== this.serviceToken) return;
    this.ui.showHud(true);
    await this.ui.countdown();
    if (token !== this.serviceToken) return;
    this.input.clear();
    this.input.capture = true;
    this.state = 'playing';
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.capture = false;
    audio.setPaused(true);
    this.ui.showPause({
      onResume: () => this.resume(),
      onRestart: () => {
        this.ui.hidePause();
        audio.setPaused(false);
        if (this.world) void this.startService(this.mode, this.world.plan.level);
      },
      onSettings: () => this.openSettings(() => this.pauseMenuAgain()),
      onQuit: () => {
        this.ui.hidePause();
        audio.setPaused(false);
        this.showTitle();
      },
    });
  }

  private pauseMenuAgain(): void {
    this.state = 'playing';
    this.pause();
  }

  private resume(): void {
    if (this.state !== 'paused') return;
    this.ui.hidePause();
    audio.setPaused(false);
    this.input.clear();
    this.input.capture = true;
    this.state = 'playing';
  }

  private async endService(): Promise<void> {
    const world = this.world;
    if (!world) return;
    const token = this.serviceToken;
    this.state = 'end';
    this.input.capture = false;
    const result = world.result();
    const level = world.plan.level;
    const ms = this.save.modes[this.mode];
    this.ui.showHud(false);
    this.ui.syncBubbles([]);
    this.ui.updateMinimap(null, false);

    if (!result.success) {
      audio.music(null);
      const choice = await this.ui.showFail(result);
      if (token !== this.serviceToken) return;
      if (choice === 'retry') void this.startService(this.mode, level);
      else this.showTitle();
      return;
    }

    ms.best[level] = Math.max(ms.best[level] ?? 0, result.score);
    ms.totalServed += result.served;
    ms.unlocked = Math.max(ms.unlocked, Math.min(LEVEL_COUNT, level + 1));
    ms.current = Math.min(LEVEL_COUNT, level + 1);
    writeSave(this.save);

    audio.music('results');
    await this.ui.showResults(result);
    if (token !== this.serviceToken) return;

    // Butin : toujours un objet du niveau du service terminé.
    const eq = ms.equipment;
    const rnd = () => Math.random();
    const item = makeItem(rollItemType(eq, level, rnd), level);
    await this.ui.showLoot({
      mode: this.mode,
      item,
      currentOf: (type) => eq[type],
      wheel: WHEEL,
      spin: () => {
        const seg = weightedIndex(WHEEL.map((w) => w.weight), rnd);
        const o = WHEEL[seg].outcome;
        let items: Item[];
        switch (o.kind) {
          case 'level':
            items = [makeItem(item.type, item.level + o.delta)];
            break;
          case 'double':
            items = [item, makeItem(rollItemType(eq, level, rnd), level)];
            break;
          case 'reroll': {
            let type = rollItemType(eq, level, rnd);
            for (let i = 0; i < 6 && type === item.type; i++) type = rollItemType(eq, level, rnd);
            items = [makeItem(type, level)];
            break;
          }
          default:
            items = [item];
        }
        return { segment: seg, items };
      },
      accept: (items) => {
        const res = items.map((it) => {
          if (isUpgrade(eq, it)) {
            eq[it.type] = it;
            return true;
          }
          return false;
        });
        writeSave(this.save);
        return res;
      },
    });
    if (token !== this.serviceToken) return;
    if (level >= LEVEL_COUNT) {
      await this.ui.showFinale(this.mode);
      this.showTitle();
      return;
    }
    void this.startService(this.mode, level + 1);
  }

  private endWorld(): void {
    if (this.world) {
      this.world.dispose();
      this.world = null;
    }
  }

  // ───────────────────────────────────────── Outils de développement (console : duchesse.debug.*)

  readonly debug = {
    /** Lance directement un service. */
    play: (level: number, mode: GameMode = 'salon') => void this.startService(mode, level),
    /** Ajoute des points au service en cours. */
    score: (n = 1000) => {
      if (this.world) this.world.score += n;
    },
    /** Atteint le quota du service en cours. */
    quota: () => {
      if (this.world) this.world.score = Math.max(this.world.score, this.world.plan.quota);
    },
    /** Équipe un objet (ex. duchesse.debug.item('ring_tournee', 50)). */
    item: (type: ItemType, level: number, mode: GameMode = this.mode) => {
      this.save.modes[mode].equipment[type] = makeItem(type, level);
      writeSave(this.save);
    },
    /** Débloque les 100 services des deux modes. */
    unlockAll: () => {
      for (const m of ['salon', 'coupdefeu'] as GameMode[]) this.save.modes[m].unlocked = LEVEL_COUNT;
      writeSave(this.save);
    },
  };

  // ───────────────────────────────────────── Boucle

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.time += dt;
    this.input.poll();

    const w = this.world;
    if (w) {
      if (this.state === 'playing') {
        if (this.input.take('pause')) this.pause();
        else {
          const fi: FrameInput = {
            move: this.input.move(),
            interact: this.input.take('interact'),
            dash: this.input.take('dash'),
            radar: this.input.take('radar'),
            rings: [this.input.take('ring1'), this.input.take('ring2'), this.input.take('ring3'), this.input.take('ring4')],
          };
          w.update(dt, fi);
          this.ui.updateTouch?.(w);
          if (w.status !== 'playing') void this.endService();
        }
      } else if (this.state === 'paused' && this.input.take('pause')) {
        // Échap en pause : géré par l'UI (retour au jeu) ; on vide simplement la file.
      }
      w.sync(this.state === 'paused' ? 0 : dt);
    } else if (this.showcase) {
      this.showcase.view.update(dt, this.time);
    }
    if (this.state !== 'playing') this.input.clear();
    this.renderer.render(dt, this.time);
  };
}

function weightedIndex(weights: number[], r: () => number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r() * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i];
    if (x <= 0) return i;
  }
  return weights.length - 1;
}

