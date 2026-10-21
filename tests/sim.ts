/**
 * Banc d'essai sans rendu : un « maître d'hôtel automatique » joue un service complet via le vrai World
 * (rendu, UI et audio simulés). Sert à vérifier la boucle de jeu et à calibrer les quotas.
 */
import type { GameRendererApi, SalonView, ScreenPoint, View } from '../src/render/api';
import type { UiApi } from '../src/ui/api';
import type { AudioApi } from '../src/audio/api';
import type { GameMode, ModeSave, Vec2 } from '../src/types';
import { World, type FrameInput } from '../src/game/world';
import { levelPlan } from '../src/data/progression';
import { levelSeed } from '../src/core/rng';
import { generateSalon } from '../src/gen';
import { makeItem } from '../src/data/items';

const noopView = <S>(): View<S> => ({ root: {} as never, update() {}, dispose() {} });

export function mockRenderer(): GameRendererApi {
  const salon = (n: { t: number; c: number; p: number }): SalonView => ({
    tables: Array.from({ length: n.t }, () => noopView()),
    counters: Array.from({ length: n.c }, () => noopView()),
    cloches: Array.from({ length: n.p }, () => noopView()),
    bell: noopView(),
    update() {},
    setChandelierShake() {},
    dispose() {},
  });
  return {
    canvas: {} as HTMLCanvasElement,
    buildSalon: (l) => salon({ t: l.tables.length, c: l.counters.length, p: l.pedestals.length }),
    clearSalon() {},
    createPlayer: () => noopView(),
    createNpc: () => noopView(),
    removeView() {},
    setTelegraphs() {},
    fx() {},
    setGuide() {},
    setTide() {},
    cameraFollow() {},
    shake() {},
    setShowcase() {},
    worldToScreen: (_x, _y, _z, out?: ScreenPoint) => out ?? { x: 0, y: 0, visible: true },
    dishIcon: () => '',
    setQuality() {},
    setRush() {},
    resize() {},
    render() {},
  };
}

export function mockUi(log?: string[]): UiApi {
  const noop = () => {};
  return {
    root: {} as HTMLElement,
    setDishIconProvider: noop,
    showTitle: noop,
    hideTitle: noop,
    showLevelSelect: noop,
    showWardrobe: noop,
    showSettings: noop,
    showIntro: async () => {},
    countdown: async () => {},
    showHud: noop,
    updateHud: noop,
    syncBubbles: noop,
    popup: (p) => log?.push(`popup ${p.text}`),
    toast: (t) => log?.push(`toast ${t}`),
    announce: (t) => log?.push(`announce ${t}`),
    updateMinimap: noop,
    screenFlash: noop,
    setRush: noop,
    showPause: noop,
    hidePause: noop,
    showResults: async () => {},
    showLoot: async () => {},
    showFail: async () => 'quit',
    showFinale: async () => {},
  };
}

export const mockAudio: AudioApi = {
  unlock() {},
  sfx() {},
  music() {},
  setVolumes() {},
  setIntensity() {},
  setPaused() {},
};

export function freshModeSave(): ModeSave {
  return { unlocked: 1, current: 1, equipment: {}, ringCooldowns: {}, best: {}, totalServed: 0 };
}

/** Entrée « écran » qui produit un déplacement monde dans la direction (dx, dz). */
function screenInput(dx: number, dz: number): { x: number; y: number } {
  const l = Math.hypot(dx, dz);
  if (l < 1e-6) return { x: 0, y: 0 };
  const wx = dx / l;
  const wz = dz / l;
  return { x: (wx - wz) * Math.SQRT1_2, y: (-wx - wz) * Math.SQRT1_2 };
}

export interface SimReport {
  level: number;
  quota: number;
  duration: number;
  scoreAtDuration: number;
  quotaTime: number | null;
  served: number;
  expired: number;
  crashes: number;
  status: string;
  log: string[];
}

/** Joue un service avec le bot. `ringBell` : sonne la cloche dès que possible (sinon continue jusqu'à `maxTime`). */
export function simulate(
  level: number,
  opts: { mode?: GameMode; maxTime?: number; save?: ModeSave; ringBell?: boolean; gear?: boolean; dodge?: boolean } = {},
): SimReport {
  const plan = levelPlan(level);
  const layout = generateSalon(plan, levelSeed(level));
  const log: string[] = [];
  const save = opts.save ?? freshModeSave();
  if (opts.gear !== false && !opts.save) {
    // Équipement typique d'un joueur arrivé à ce niveau : objets ~3 niveaux en dessous (sans anneaux).
    const gl = Math.max(1, level - 3);
    if (level > 1) for (const t of ['boots', 'vest', 'tray', 'grinder', 'latte'] as const) save.equipment[t] = makeItem(t, gl);
  }
  const world = new World(plan, layout, opts.mode ?? 'salon', {
    renderer: mockRenderer(),
    ui: mockUi(log),
    audio: mockAudio,
    settings: { master: 0, music: 0, sfx: 0, quality: 'low', shake: false },
    save,
    persist() {},
  });
  const dt = 1 / 30;
  const maxTime = opts.maxTime ?? plan.duration;
  let scoreAtDuration = 0;
  let quotaTime: number | null = null;
  let path: Vec2[] = [];
  let pathTarget = '';
  let repath = 0;
  // accès interne au service (test uniquement)
  const svc = (world as unknown as { service: import('../src/game/service').Service }).service;
  const hz = (world as unknown as { hazards: import('../src/game/hazards/api').HazardDirector }).hazards;

  for (let t = 0; t < maxTime && world.status === 'playing'; t += dt) {
    const p = world.player;
    let target: Vec2 | null = null;
    let key = '';
    let wantInteract = false;

    const waiting = svc.tables.filter((x) => x.phase === 'waiting' && x.order);
    waiting.sort((a, b) => a.patience / a.patienceMax - b.patience / b.patienceMax);
    if (world.quotaReached && opts.ringBell !== false) {
      target = layout.royalBell.front;
      key = 'bell';
    } else {
      const deliverable = waiting.find((x) => p.tray.includes(x.order!) || p.tray.includes('golden'));
      if (deliverable && (p.tray.length >= world.capacity || !svc.counters.some((c) => c.ready.some((d) => waiting.some((w) => w.order === d) && !p.tray.includes(d))) || p.tray.length >= 2)) {
        const spots = deliverable.spec.serviceSpots;
        target = spots.reduce((a, b) => (Math.hypot(a.x - p.x, a.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? a : b), spots[0] ?? deliverable.spec);
        key = `t${deliverable.spec.id}`;
      } else {
        // Comptoir avec un plat utile prêt, sinon celui qui prépare la commande la plus pressée.
        const need = waiting.filter((w) => !p.tray.includes(w.order!));
        let counter = svc.counters.find((c) => c.ready.some((d) => need.some((w) => w.order === d)));
        if (!counter && need.length) counter = svc.counters.find((c) => c.spec.dishes.includes(need[0].order!));
        if (counter && p.tray.length < world.capacity) {
          target = counter.spec.front;
          key = `c${counter.spec.id}`;
        } else if (deliverable) {
          const spots = deliverable.spec.serviceSpots;
          target = spots[0] ?? deliverable.spec;
          key = `t${deliverable.spec.id}`;
        }
      }
    }

    let move = { x: 0, y: 0 };
    if (target) {
      if (key !== pathTarget || repath <= 0) {
        path = world.findPath(p.x, p.z, target.x, target.z) ?? [target];
        pathTarget = key;
        repath = 0.5;
      }
      repath -= dt;
      while (path.length > 1 && Math.hypot(path[0].x - p.x, path[0].z - p.z) < 0.45) path.shift();
      const wp = path[0] ?? target;
      const d = Math.hypot(target.x - p.x, target.z - p.z);
      if (d > 0.35) move = screenInput(wp.x - p.x, wp.z - p.z);
      wantInteract = d < 1.0;
    }
    // Esquive : un Pas Chassé quand un gêneur arrive tout près.
    let dash = false;
    if (opts.dodge !== false && (move.x || move.y) && p.dashCharges > 0 && !p.dashing) {
      for (const n of hz.positions()) {
        if (Math.hypot(n.x - p.x, n.z - p.z) < 1.4) {
          dash = true;
          break;
        }
      }
    }
    const fi: FrameInput = { move, interact: wantInteract, dash, radar: false, rings: [false, false, false, false] };
    world.update(dt, fi);
    world.sync(dt);
    if (quotaTime === null && world.quotaReached) quotaTime = t;
    if (t <= plan.duration) scoreAtDuration = world.score;
  }
  const r = world.result();
  world.dispose();
  return {
    level,
    quota: plan.quota,
    duration: plan.duration,
    scoreAtDuration: Math.floor(scoreAtDuration),
    quotaTime,
    served: r.served,
    expired: r.expired,
    crashes: r.crashes,
    status: world.status,
    log,
  };
}
