/**
 * Le service en cours : simulation complète d'un niveau (joueur, tables, comptoirs, cloches, obstacles,
 * score, minuteur, marée de mousse, anneaux) et synchronisation des vues, du HUD et des bulles.
 */
import type { GameRendererApi, SalonView, View } from '../render/api';
import type { UiApi } from '../ui/api';
import type { AudioApi, SfxOptions } from '../audio/api';
import type { HazardDirector, HazardWorld, HitSpec, TelegraphHandle } from './hazards/api';
import type {
  BellViewState,
  BubbleState,
  ClocheViewState,
  CounterViewState,
  DishId,
  FxKind,
  FxOptions,
  GameMode,
  HudState,
  LevelPlan,
  MinimapState,
  ModeSave,
  NpcKind,
  NpcViewState,
  PlayerViewState,
  PopupSpec,
  RingId,
  SalonLayout,
  ServiceResult,
  Settings,
  SfxId,
  TableViewState,
  TelegraphShape,
  TelegraphTone,
  TideViewState,
  TrapKind,
  Vec2,
} from '../types';
import { Rng } from '../core/rng';
import { DISHES } from '../data/dishes';
import { BIOME_NAMES } from '../data/progression';
import { ITEMS, RING_INFO, computeStats, isUpgrade, makeItem, rollItemType } from '../data/items';
import { CollisionWorld } from './collision';
import { Player, emptyPlayerView } from './player';
import { Service, type CounterState, type TableState } from './service';
import { Cloches, type Cloche } from './cloches';
import { createHazards } from './hazards';

export type WorldStatus = 'playing' | 'won' | 'failed';

export interface WorldContext {
  renderer: GameRendererApi;
  ui: UiApi;
  audio: AudioApi;
  settings: Settings;
  /** Sauvegarde du mode courant (équipement, recharges d'anneaux) — modifiée en place. */
  save: ModeSave;
  /** Persiste la sauvegarde (après un objet trouvé en cours de service). */
  persist(): void;
}

export interface FrameInput {
  move: { x: number; y: number };
  interact: boolean;
  dash: boolean;
  radar: boolean;
  rings: [boolean, boolean, boolean, boolean];
}

const RING_ORDER: RingId[] = ['tournee', 'temps', 'brigade', 'grace'];
const COMBO_WINDOW = 7;

type Focus =
  | { kind: 'table'; t: TableState; ok: boolean }
  | { kind: 'counter'; c: CounterState; ok: boolean }
  | { kind: 'cloche'; c: Cloche }
  | { kind: 'bell' };

export class World implements HazardWorld {
  readonly rng: Rng;
  time = 0;
  status: WorldStatus = 'playing';

  readonly player: Player;
  private col: CollisionWorld;
  private service: Service;
  private cloches: Cloches;
  private hazards: HazardDirector;
  private salon: SalonView;
  private playerView: View<PlayerViewState>;
  private npcViews = new Set<View<NpcViewState>>();
  private telegraphs: TelegraphHandle[] = [];
  private telegraphSeq = 1;
  private lastHit = new Map<string, number>();

  // Score & statistiques
  score = 0;
  private served = 0;
  private tips = 0;
  private combo = 0;
  private bestCombo = 0;
  private lastServe = -99;
  private expired = 0;
  private crashes = 0;
  quotaReached = false;

  // Minuteur & marée (Coup de Feu)
  private timeLeft: number | null;
  private lastCountdown = 99;
  private tide: { radius: number; t: number } | null = null;
  private endTimer = -1;

  // Pouvoirs
  private frozen = 0;
  private brigade = 0;
  private ringActive: Record<RingId, number> = { tournee: 0, temps: 0, brigade: 0, grace: 0 };

  // UI
  private radarExpanded = false;
  private focus: Focus | null = null;
  private tipQueue: { at: number; text: string }[] = [];
  private stepAcc = 0;
  private bellRingT = 0;

  // États réutilisés (pas d'allocation par image)
  private pvs = emptyPlayerView();
  private tvs: TableViewState = { mood: 'empty', clients: 0, served: [], chairPush: [], highlight: 0, vip: false };
  private cvs: CounterViewState = { ready: [], cooking: 0, cookingDish: null, glow: 0, highlight: 0 };
  private clvs: ClocheViewState = { state: 'hidden', t: 0, golden: false, highlight: 0 };
  private bvs: BellViewState = { lit: false, ring: 0, highlight: 0 };
  private bubbles: BubbleState[] = [];
  private minimap: MinimapState;
  private hud: HudState;

  constructor(
    readonly plan: LevelPlan,
    readonly layout: SalonLayout,
    readonly mode: GameMode,
    private ctx: WorldContext,
  ) {
    this.rng = new Rng(layout.seed ^ 0x5eed);
    this.col = new CollisionWorld(layout);
    const stats = computeStats(ctx.save.equipment);
    this.player = new Player(layout.playerStart, stats, {
      dash: (x, z, dx, dz) => {
        this.sfx('dash');
        this.fx('dash', x, z, { dirX: dx, dirZ: dz });
      },
      dashEmpty: () => this.sfx('dash_empty', { volume: 0.6 }),
      crash: (x, z, lost) => {
        if (!lost.length) return;
        this.crashes++;
        this.combo = 0;
        this.fx('crash', x, z, { count: lost.length });
        this.sfx('tray_crash');
        this.shake(0.45);
        this.popupAt(x, z, 'Patatras !', 'bad', true);
      },
      fallen: () => {
        this.sfx('fall');
        this.fx('splash', this.player.x, this.player.z);
      },
      respawned: (x, z) => {
        this.fx('teleport', x, z);
        ctx.renderer.cameraFollow(x, z);
      },
    });
    this.service = new Service(plan, layout, this.rng.fork(1), mode, {
      orderPlaced: () => this.sfx('order_new', { volume: 0.5 }),
      orderExpired: (t) => {
        this.expired++;
        this.combo = 0;
        this.sfx('order_expire');
        this.popupAt(t.spec.x, t.spec.z, 'Commande perdue…', 'bad');
      },
      dishReady: () => {},
    });
    this.cloches = new Cloches(plan, layout.pedestals, this.rng.fork(2));
    this.timeLeft = mode === 'coupdefeu' ? plan.duration : null;

    ctx.renderer.clearSalon();
    this.salon = ctx.renderer.buildSalon(layout);
    this.playerView = ctx.renderer.createPlayer();
    ctx.renderer.cameraFollow(this.player.x, this.player.z, true);
    ctx.renderer.setShowcase(false);
    ctx.renderer.setTide(null);
    this.hazards = createHazards(this);

    plan.tips.forEach((text, i) => this.tipQueue.push({ at: 1.5 + i * 8, text }));

    this.minimap = {
      width: layout.width,
      depth: layout.depth,
      cells: layout.cells,
      zoneOf: layout.zoneOf,
      player: { x: 0, z: 0, heading: 0 },
      tables: [],
      counters: [],
      cloches: [],
      npcs: [],
      bell: { x: layout.royalBell.x, z: layout.royalBell.z, lit: false },
      tide: null,
    };
    this.hud = {
      mode,
      level: plan.level,
      biome: plan.biome,
      salonName: layout.zones[0]?.name ?? BIOME_NAMES[plan.biome],
      score: 0,
      quota: plan.quota,
      quotaReached: false,
      timeLeft: this.timeLeft,
      rush: false,
      tray: [],
      capacity: stats.capacity,
      balance: stats.balanceMax,
      balanceMax: stats.balanceMax,
      dashCharges: stats.dashCharges,
      dashChargesMax: stats.dashCharges,
      dashRecharge01: 1,
      passkey01: stats.passkeyCooldown === null ? null : 1,
      rings: RING_ORDER.map((id) => ({ id, equipped: false, ready01: 1, remaining: 0, active: false })),
      combo: 0,
      served: 0,
    };
  }

  // ───────────────────────────────────────── Boucle

  get capacity(): number {
    return this.player.stats.capacity + (this.brigade > 0 ? 2 : 0);
  }

  update(dt: number, input: FrameInput): void {
    if (this.status !== 'playing') return;
    this.time += dt;
    const p = this.player;

    // Fin de service en cours (cloche sonnée / englouti) : on laisse jouer l'animation.
    if (this.endTimer >= 0) {
      this.endTimer -= dt;
      p.update(dt, { x: 0, y: 0 }, false, false, this.col);
      if (this.endTimer < 0) this.status = this.tide && !this.bellRingT ? 'failed' : 'won';
      return;
    }

    this.frozen = Math.max(0, this.frozen - dt);
    this.brigade = Math.max(0, this.brigade - dt);
    for (const id of RING_ORDER) this.ringActive[id] = Math.max(0, this.ringActive[id] - dt);
    this.tickRings(dt);

    const slippery = this.hazards.slipperyAt(p.x, p.z);
    p.update(dt, input.move, input.dash, slippery, this.col);
    if (input.radar) this.radarExpanded = !this.radarExpanded;

    // Pas feutrés
    const sp = Math.hypot(p.vx, p.vz);
    if (sp > 0.8 && !p.dashing && p.fall < 0) {
      this.stepAcc += dt * sp;
      if (this.stepAcc > 1.25) {
        this.stepAcc = 0;
        this.sfx('step', { volume: 0.25 });
      }
    }

    const frozen = this.frozen > 0;
    this.service.update(dt, frozen, (x, z) => this.hazards.patienceDrainAt(x, z), p.tray);
    this.cloches.update(frozen ? 0 : dt, this.time > 6);
    if (!frozen) this.hazards.update(dt);

    this.updateFocus();
    if (input.interact) this.interact();
    for (let i = 0; i < 4; i++) if (input.rings[i]) this.activateRing(RING_ORDER[i]);

    this.updateTimer(dt);
    this.updateTips();

    if (!this.quotaReached && this.score >= this.plan.quota) {
      this.quotaReached = true;
      this.sfx('quota_reached');
      this.ctx.ui.announce('Score de Service atteint !', 'Sonnez la Cloche Royale près de l’entrée', 'gold');
      this.fx('petals', this.layout.royalBell.x, this.layout.royalBell.z);
    }
  }

  private updateTimer(dt: number): void {
    if (this.timeLeft === null) return;
    if (this.timeLeft > 0) {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      const s = Math.ceil(this.timeLeft);
      if (s <= 10 && s < this.lastCountdown && this.timeLeft > 0) {
        this.lastCountdown = s;
        this.sfx('countdown', { volume: 0.5, pitch: s <= 3 ? 1.25 : 1 });
      }
      if (this.timeLeft === 0 && !this.quotaReached) {
        this.tide = { radius: 0.6, t: 0 };
        this.sfx('tide_rumble');
        this.shake(0.5);
        this.ctx.ui.announce('La mousse déborde !', 'Atteignez le score et sonnez la Cloche… vite !', 'rose');
      }
    }
    if (this.tide) {
      const tide = this.tide;
      tide.t += dt;
      const speed = Math.min(2.8, 0.85 + tide.t * 0.06);
      tide.radius += speed * dt;
      const o = this.layout.tideOrigin;
      if (Math.hypot(this.player.x - o.x, this.player.z - o.z) < tide.radius - 0.25) {
        this.sfx('level_fail');
        this.fx('foam', this.player.x, this.player.z, { scale: 1.6 });
        this.endTimer = 1.3;
        this.bellRingT = 0;
      }
    }
  }

  private updateTips(): void {
    while (this.tipQueue.length && this.tipQueue[0].at <= this.time) {
      const tip = this.tipQueue.shift()!;
      this.ctx.ui.toast(tip.text, 'tip', 7);
    }
  }

  // ───────────────────────────────────────── Interactions (E)

  private updateFocus(): void {
    const p = this.player;
    const tray = p.tray;
    let best: Focus | null = null;
    let bestScore = Infinity;
    const consider = (f: Focus, dist: number, prio: number) => {
      const s = prio * 10 + dist;
      if (s < bestScore) {
        bestScore = s;
        best = f;
      }
    };
    for (const t of this.service.tables) {
      const d = distToTable(p.x, p.z, t);
      const inRange = d <= 1.25;
      const ok = t.phase === 'waiting' && !!t.order && (tray.includes(t.order) || tray.includes('golden'));
      t.highlight = inRange && ok ? 1 : 0;
      if (inRange && t.phase === 'waiting') consider({ kind: 'table', t, ok }, d, ok ? 0 : 4);
    }
    for (const c of this.service.counters) {
      const s = c.spec;
      const d = distToBox(p.x, p.z, s.x - s.w / 2, s.z - s.d / 2, s.x + s.w / 2, s.z + s.d / 2);
      const inRange = d <= 1.0 || Math.hypot(p.x - s.front.x, p.z - s.front.z) <= 0.9;
      const ok = c.ready.length > 0 && tray.length < this.capacity;
      c.highlight = inRange && ok ? 1 : 0;
      if (inRange) consider({ kind: 'counter', c, ok }, d, ok ? 1 : 5);
    }
    for (const c of this.cloches.list) {
      c.highlight = 0;
      if (c.state !== 'idle') continue;
      const d = Math.hypot(p.x - c.pedestal.x, p.z - c.pedestal.z);
      if (d <= 1.15) {
        c.highlight = 1;
        consider({ kind: 'cloche', c }, d, 2);
      }
    }
    const b = this.layout.royalBell;
    const db = Math.min(Math.hypot(p.x - b.x, p.z - b.z) - 0.4, Math.hypot(p.x - b.front.x, p.z - b.front.z));
    this.bvs.highlight = db <= 1.1 && this.quotaReached ? 1 : 0;
    if (db <= 1.1) consider({ kind: 'bell' }, db, this.quotaReached ? 3 : 6);
    this.focus = best;
  }

  private interact(): void {
    const f = this.focus;
    const p = this.player;
    if (!f || p.busy) return;
    switch (f.kind) {
      case 'table': {
        if (!f.ok) {
          this.sfx('wrong');
          const want = f.t.order ? DISHES[f.t.order].short : '…';
          this.popupAt(f.t.spec.x, f.t.spec.z, `Ils attendent : ${want}`, 'cream');
          return;
        }
        this.serveTable(f.t);
        return;
      }
      case 'counter': {
        const c = f.c;
        if (p.tray.length >= this.capacity) {
          this.popupAt(c.spec.x, c.spec.z, 'Plateau plein', 'cream');
          this.sfx('dash_empty', { volume: 0.5 });
          return;
        }
        if (!c.ready.length) {
          this.popupAt(c.spec.x, c.spec.z, c.queue.length ? 'En préparation…' : 'Rien à envoyer', 'cream');
          return;
        }
        const taken = this.service.pickup(c, p.tray, this.capacity);
        if (taken.length) {
          this.sfx('pickup', { pitch: 1 + taken.length * 0.06 });
          this.fx('pickup', c.spec.x, c.spec.z, { y: 0.9 });
        }
        return;
      }
      case 'cloche':
        this.openCloche(f.c);
        return;
      case 'bell':
        if (!this.quotaReached) {
          this.popupAt(this.layout.royalBell.x, this.layout.royalBell.z, `Encore ${Math.ceil(this.plan.quota - this.score)} points`, 'cream');
          this.sfx('wrong', { volume: 0.5 });
          return;
        }
        this.ringBell();
        return;
    }
  }

  private serveTable(t: TableState): void {
    const p = this.player;
    const r = this.service.serve(t, p.tray);
    if (!r) return;
    const base = DISHES[r.order].value;
    const speedTip = base * 0.8 * r.patience01;
    const vip = t.spec.vip ? 1.5 : 1;
    const gold = r.golden ? 2 : 1;
    if (this.time - this.lastServe <= COMBO_WINDOW) this.combo++;
    else this.combo = 1;
    this.lastServe = this.time;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const comboBonus = Math.min(100, (this.combo - 1) * 10);
    const total = Math.round((base + speedTip) * (1 + p.stats.tipBonus) * vip * gold + comboBonus);
    this.score += total;
    this.served++;
    this.tips += Math.max(0, total - base);

    this.sfx('serve');
    if (r.patience01 > 0.55 || t.spec.vip) this.sfx('tip', { volume: 0.7 });
    this.fx('serve', t.spec.x, t.spec.z, { y: 0.7 });
    if (total - base > base * 0.5) this.fx('coins', t.spec.x, t.spec.z, { y: 0.8 });
    this.popupAt(t.spec.x, t.spec.z, `+${total}`, 'gold', true);
    if (r.golden) this.popupAt(t.spec.x, t.spec.z, '×2 Plat doré !', 'gold', false, 0.5);
    else if (t.spec.vip) this.popupAt(t.spec.x, t.spec.z, 'Pourboire royal !', 'rose', false, 0.5);
    else if (r.patience01 > 0.75) this.popupAt(t.spec.x, t.spec.z, 'Service éclair !', 'rose', false, 0.5);
    if (this.combo >= 3) this.popupAt(p.x, p.z, `Combo ×${this.combo}`, 'cream', false, 0.9);
  }

  private openCloche(c: Cloche): void {
    const content = this.cloches.open(c);
    if (!content) return;
    const { x, z } = c.pedestal;
    this.sfx('cloche_open');
    this.fx('cloche', x, z, { y: 0.8 });
    const p = this.player;
    switch (content.kind) {
      case 'trap':
        this.hazards.triggerTrap(content.trap as TrapKind, x, z);
        return;
      case 'golden':
        this.sfx('cloche_bonus');
        if (p.tray.length < this.capacity) {
          p.tray.push('golden');
          this.fx('golden', x, z, { y: 0.9 });
          this.popupAt(x, z, 'Plat doré !', 'gold', true);
        } else this.bonusTip(x, z, 'Plateau plein : pourboire doré');
        return;
      case 'item': {
        this.sfx('cloche_bonus');
        const eq = this.ctx.save.equipment;
        const item = makeItem(rollItemType(eq, this.plan.level, () => this.rng.next()), this.plan.level);
        const def = ITEMS[item.type];
        if (isUpgrade(eq, item)) {
          eq[item.type] = item;
          this.applyStats();
          this.ctx.persist();
          this.ctx.ui.toast(`${def.name} (niv. ${item.level}) — équipé ! ${def.format(item.level)}`, 'item', 6);
          this.popupAt(x, z, def.name, 'gold');
        } else this.bonusTip(x, z, `${def.name} : déjà mieux équipé, revendu`);
        return;
      }
      case 'tip':
        this.sfx('cloche_bonus', { volume: 0.7 });
        this.bonusTip(x, z, 'Pourboire de la Duchesse');
        return;
      case 'patience':
        this.sfx('cloche_bonus', { volume: 0.7 });
        this.service.refillPatience(0.4);
        this.fx('petals', x, z);
        this.popupAt(x, z, 'Mignardises offertes : les tables patientent', 'rose');
        return;
      case 'dash':
        this.sfx('cloche_bonus', { volume: 0.7 });
        p.refillDash();
        this.popupAt(x, z, 'Espresso serré : Dash rechargé', 'cream');
        return;
    }
  }

  private bonusTip(x: number, z: number, label: string): void {
    const v = Math.round((60 + this.plan.level * 4) / 10) * 10;
    this.score += v;
    this.tips += v;
    this.sfx('tip');
    this.fx('coins', x, z, { y: 0.8 });
    this.popupAt(x, z, `+${v} · ${label}`, 'gold');
  }

  private ringBell(): void {
    this.player.bellRing = 1;
    this.bellRingT = 1;
    this.sfx('royal_bell');
    const b = this.layout.royalBell;
    this.fx('confetti', b.x, b.z, { y: 1.2 });
    this.fx('petals', this.player.x, this.player.z);
    this.endTimer = 1.6;
  }

  private applyStats(): void {
    const stats = computeStats(this.ctx.save.equipment);
    this.player.setStats(stats);
  }

  // ───────────────────────────────────────── Anneaux

  private tickRings(dt: number): void {
    const cds = this.ctx.save.ringCooldowns;
    for (const id of RING_ORDER) {
      const r = cds[id];
      if (r && r > 0) cds[id] = Math.max(0, r - dt);
    }
  }

  private activateRing(id: RingId): void {
    const cd = this.player.stats.rings[id];
    const info = RING_INFO[id];
    if (cd === null) {
      this.ctx.ui.toast(`Anneau ${['I', 'II', 'III', 'IV'][RING_ORDER.indexOf(id)]} : aucun anneau équipé`, 'warn', 2.5);
      return;
    }
    const remaining = this.ctx.save.ringCooldowns[id] ?? 0;
    if (remaining > 0) {
      this.sfx('dash_empty');
      return;
    }
    this.ctx.save.ringCooldowns[id] = cd;
    this.sfx('ring_power');
    const p = this.player;
    this.fx('ring', p.x, p.z);
    this.ctx.ui.announce(info.power, info.description, 'gold');
    this.ctx.ui.screenFlash('#f3d58a', 0.45);
    this.ringActive[id] = Math.max(1.2, info.duration);
    switch (id) {
      case 'tournee':
        this.hazards.calmAll();
        this.cloches.defuse();
        for (const t of [...this.telegraphs]) if (!t.persistent) this.removeTelegraph(t);
        this.service.refillPatience(1);
        this.fx('petals', p.x, p.z, { scale: 2 });
        break;
      case 'temps':
        this.frozen = info.duration;
        break;
      case 'brigade':
        this.service.instantCook();
        this.brigade = info.duration;
        for (const c of this.service.counters) this.fx('steam', c.spec.x, c.spec.z, { y: 1 });
        break;
      case 'grace':
        p.grace = info.duration;
        p.refillDash();
        break;
    }
  }

  // ───────────────────────────────────────── HazardWorld

  hitPlayer(hit: HitSpec): boolean {
    const p = this.player;
    if (p.invulnerable || this.endTimer >= 0) return false;
    if (!this.debounce(hit.source, 0.8)) return false;
    const crashed = p.hit(hit.damage * this.plan.hazardScale, hit.fromX, hit.fromZ, hit.knockback ?? 5, hit.stun ?? 0);
    if (!crashed) {
      this.sfx('hit');
      if (p.balance < p.stats.balanceMax * 0.35 && p.tray.length) this.sfx('tray_wobble');
      this.shake(0.25);
      this.fx('dust', p.x, p.z);
    }
    return true;
  }

  stunPlayer(seconds: number, kind: 'flash' | 'dizzy', source: string): boolean {
    const p = this.player;
    if (p.invulnerable || this.endTimer >= 0) return false;
    if (!this.debounce(source, 0.8)) return false;
    p.stunFor(seconds);
    this.fx('stun', p.x, p.z, { y: 1.3 });
    if (kind === 'flash') {
      this.ctx.ui.screenFlash('#ffffff', 0.85);
      if (p.tray.length) p.hit(10 * this.plan.hazardScale, p.x - p.vx, p.z - p.vz, 0, seconds);
    }
    return true;
  }

  dropPlayer(source: string): boolean {
    const p = this.player;
    if (p.invulnerable || this.endTimer >= 0) return false;
    if (!this.debounce(source, 1.5)) return false;
    p.drop(this.layout.playerStart);
    return true;
  }

  teleportPlayer(x: number, z: number, source: string): boolean {
    const p = this.player;
    if (p.invulnerable || this.endTimer >= 0) return false;
    if (!this.debounce(source, 1.0)) return false;
    this.fx('teleport', p.x, p.z);
    p.teleport(x, z);
    this.fx('teleport', x, z);
    this.ctx.renderer.cameraFollow(x, z);
    return true;
  }

  private debounce(source: string, window: number): boolean {
    const last = this.lastHit.get(source);
    if (last !== undefined && this.time - last < window) return false;
    this.lastHit.set(source, this.time);
    return true;
  }

  isFree(x: number, z: number, radius: number): boolean {
    return this.col.isFree(x, z, radius);
  }
  castRay(x: number, z: number, dirX: number, dirZ: number, maxDist: number): number {
    return this.col.castRay(x, z, dirX, dirZ, maxDist);
  }
  findPath(ax: number, az: number, bx: number, bz: number): Vec2[] | null {
    return this.col.findPath(ax, az, bx, bz);
  }
  randomFreePoint(near?: Vec2, minDist?: number, maxDist?: number): Vec2 | null {
    return this.col.randomFreePoint(this.rng, near, minDist ?? 0, maxDist ?? Infinity);
  }
  moveCircle(pos: { x: number; z: number }, dx: number, dz: number, radius: number): Vec2 | null {
    return this.col.moveCircle(pos, dx, dz, radius);
  }

  addTelegraph(shape: TelegraphShape, tone: TelegraphTone, persistent = false): TelegraphHandle {
    const t: TelegraphHandle = { id: this.telegraphSeq++, shape, tone, progress: 0, active: false, persistent };
    this.telegraphs.push(t);
    return t;
  }
  removeTelegraph(t: TelegraphHandle): void {
    const i = this.telegraphs.indexOf(t);
    if (i >= 0) this.telegraphs.splice(i, 1);
  }

  fx(kind: FxKind, x: number, z: number, opts?: FxOptions): void {
    this.ctx.renderer.fx(kind, x, z, opts);
  }
  sfx(id: SfxId, opts?: SfxOptions): void {
    this.ctx.audio.sfx(id, opts);
  }
  shake(amount: number): void {
    if (this.ctx.settings.shake) this.ctx.renderer.shake(amount);
  }

  createNpcView(kind: NpcKind): View<NpcViewState> {
    const v = this.ctx.renderer.createNpc(kind);
    this.npcViews.add(v);
    return v;
  }
  removeView(view: View<NpcViewState>): void {
    this.npcViews.delete(view);
    this.ctx.renderer.removeView(view as View<unknown>);
  }
  setChairPush(tableId: number, seat: number, amount: number): void {
    const t = this.service.tables.find((x) => x.spec.id === tableId);
    if (t && seat >= 0 && seat < t.chairPush.length) t.chairPush[seat] = Math.max(0, Math.min(1, amount));
  }
  setChandelierShake(amount: number): void {
    this.salon.setChandelierShake(amount);
  }
  seatOccupied(tableId: number, seat: number): boolean {
    const t = this.service.tables.find((x) => x.spec.id === tableId);
    return !!t && (t.phase === 'thinking' || t.phase === 'waiting' || t.phase === 'eating') && seat < t.clients;
  }

  // ───────────────────────────────────────── Rendu / UI (chaque image, même en pause)

  sync(dt: number): void {
    const r = this.ctx.renderer;
    const ui = this.ctx.ui;
    const p = this.player;

    this.playerView.update(p.viewState(this.capacity, this.pvs), dt);
    this.hazards.syncViews(dt);
    for (let i = 0; i < this.service.tables.length; i++)
      this.salon.tables[i]?.update(this.service.tableView(this.service.tables[i], this.tvs), dt);
    for (let i = 0; i < this.service.counters.length; i++)
      this.salon.counters[i]?.update(this.service.counterView(this.service.counters[i], this.cvs), dt);
    for (let i = 0; i < this.cloches.list.length; i++) this.salon.cloches[i]?.update(this.cloches.view(this.cloches.list[i], this.clvs), dt);
    this.bvs.lit = this.quotaReached;
    this.bvs.ring = this.bellRingT > 0 ? 1 - Math.max(0, this.endTimer) / 1.6 : 0;
    this.salon.bell.update(this.bvs, dt);
    this.salon.update(dt, this.time);

    r.setTelegraphs(this.telegraphs);
    r.cameraFollow(p.x, p.z);
    r.setGuide(p, this.guideTargets());
    const tideState: TideViewState | null = this.tide ? { active: true, origin: this.layout.tideOrigin, radius: this.tide.radius, t: this.tide.t } : null;
    r.setTide(tideState);
    const rush = this.tide ? 0.85 : this.timeLeft !== null && this.timeLeft < 12 ? (12 - this.timeLeft) / 24 : 0;
    r.setRush(rush);
    ui.setRush(rush);
    this.ctx.audio.setIntensity(this.tide ? 1 : rush * 1.4);

    this.syncBubbles();
    this.syncHud();
    if (this.plan.level >= 11) ui.updateMinimap(this.syncMinimap(), this.radarExpanded);
    else ui.updateMinimap(null, false);
  }

  private guideTargets(): Vec2[] {
    const p = this.player;
    const out: Vec2[] = [];
    if (this.quotaReached) out.push(this.layout.royalBell);
    const waiting = this.service.tables.filter((t) => t.phase === 'waiting' && t.order);
    waiting.sort((a, b) => a.patience / a.patienceMax - b.patience / b.patienceMax);
    if (p.tray.length) {
      const hasGold = p.tray.includes('golden');
      for (const t of waiting) {
        if (out.length >= 3) break;
        if (hasGold || p.tray.includes(t.order!)) out.push(t.spec);
      }
    }
    if (out.length < 2 && p.tray.length < this.capacity) {
      for (const t of waiting) {
        if (out.length >= 3) break;
        const c = this.service.counters.find((c) => c.ready.includes(t.order!));
        if (c && !out.includes(c.spec.front)) out.push(c.spec.front);
      }
    }
    return out;
  }

  private syncBubbles(): void {
    const r = this.ctx.renderer;
    const p = this.player;
    let n = 0;
    for (const t of this.service.tables) {
      if (t.phase !== 'waiting' || !t.order) continue;
      const sp = r.worldToScreen(t.spec.x, 1.65, t.spec.z);
      let b = this.bubbles[n];
      if (!b) {
        b = { key: '', sx: 0, sy: 0, visible: false, dish: t.order, patience01: 1, vip: false, urgent: false, inRange: false, matching: false };
        this.bubbles[n] = b;
      }
      const p01 = t.patience / t.patienceMax;
      b.key = `t${t.spec.id}`;
      b.sx = sp.x;
      b.sy = sp.y;
      b.visible = sp.visible;
      b.dish = t.order;
      b.patience01 = p01;
      b.vip = t.spec.vip;
      b.urgent = p01 < 0.3;
      b.matching = p.tray.includes(t.order) || p.tray.includes('golden');
      b.inRange = b.matching && distToTable(p.x, p.z, t) <= 1.25;
      n++;
    }
    this.bubbles.length = n;
    this.ctx.ui.syncBubbles(this.bubbles);
  }

  private syncHud(): void {
    const h = this.hud;
    const p = this.player;
    const st = p.stats;
    h.score = Math.floor(this.score);
    h.quotaReached = this.quotaReached;
    h.timeLeft = this.timeLeft;
    h.rush = !!this.tide;
    h.tray = p.tray;
    h.capacity = this.capacity;
    h.balance = Math.max(0, p.balance);
    h.balanceMax = st.balanceMax;
    h.dashCharges = p.dashCharges;
    h.dashChargesMax = st.dashCharges;
    h.dashRecharge01 = p.dashRecharge01();
    h.passkey01 = st.passkeyCooldown === null ? null : 1 - p.passkeyReady / st.passkeyCooldown;
    for (let i = 0; i < 4; i++) {
      const id = RING_ORDER[i];
      const cd = st.rings[id];
      const rem = this.ctx.save.ringCooldowns[id] ?? 0;
      const ring = h.rings[i];
      ring.equipped = cd !== null;
      ring.remaining = rem;
      ring.ready01 = cd ? 1 - rem / cd : 0;
      ring.active = this.ringActive[id] > 0;
    }
    h.combo = this.time - this.lastServe <= COMBO_WINDOW ? this.combo : 0;
    h.served = this.served;
    this.ctx.ui.updateHud(h);
  }

  private syncMinimap(): MinimapState {
    const m = this.minimap;
    const p = this.player;
    m.player.x = p.x;
    m.player.z = p.z;
    m.player.heading = p.heading;
    m.tables.length = 0;
    for (const t of this.service.tables)
      m.tables.push({
        x: t.spec.x,
        z: t.spec.z,
        dish: t.phase === 'waiting' ? t.order : null,
        urgent: t.phase === 'waiting' && t.patience / t.patienceMax < 0.3,
        vip: t.spec.vip,
      });
    m.counters.length = 0;
    for (const c of this.service.counters) m.counters.push({ x: c.spec.x, z: c.spec.z, station: c.spec.station, ready: c.ready.length });
    m.cloches.length = 0;
    for (const c of this.cloches.list) if (c.state === 'idle' || c.state === 'appearing') m.cloches.push(c.pedestal);
    m.npcs = this.hazards.positions();
    m.bell.lit = this.quotaReached;
    m.tide = this.tide ? { origin: this.layout.tideOrigin, radius: this.tide.radius } : null;
    return m;
  }

  private popupAt(x: number, z: number, text: string, tone: PopupSpec['tone'], big = false, lift = 0): void {
    const sp = this.ctx.renderer.worldToScreen(x, 1.9 + lift, z);
    if (!sp.visible) return;
    this.ctx.ui.popup({ text, sx: sp.x, sy: sp.y, tone, big });
  }

  // ───────────────────────────────────────── Fin

  result(): ServiceResult {
    return {
      mode: this.mode,
      level: this.plan.level,
      success: this.status === 'won',
      score: Math.floor(this.score),
      quota: this.plan.quota,
      served: this.served,
      tips: Math.floor(this.tips),
      bestCombo: this.bestCombo,
      expired: this.expired,
      crashes: this.crashes,
      time: this.time,
    };
  }

  dispose(): void {
    this.hazards.dispose();
    for (const v of this.npcViews) this.ctx.renderer.removeView(v as View<unknown>);
    this.npcViews.clear();
    this.telegraphs.length = 0;
    this.ctx.renderer.setTelegraphs([]);
    this.ctx.renderer.setTide(null);
    this.ctx.renderer.setGuide({ x: 0, z: 0 }, []);
    this.ctx.ui.syncBubbles([]);
    this.ctx.ui.updateMinimap(null, false);
  }
}

function distToBox(x: number, z: number, minX: number, minZ: number, maxX: number, maxZ: number): number {
  const dx = Math.max(minX - x, 0, x - maxX);
  const dz = Math.max(minZ - z, 0, z - maxZ);
  return Math.hypot(dx, dz);
}

/** Distance du joueur au bord du plateau de la table (approximation par emprise). */
function distToTable(x: number, z: number, t: TableState): number {
  const s = t.spec;
  if (s.shape === 'round') return Math.max(0, Math.hypot(x - s.x, z - s.z) - s.w / 2);
  const w = s.rot % 2 === 1 ? s.d : s.w;
  const d = s.rot % 2 === 1 ? s.w : s.d;
  return distToBox(x, z, s.x - w / 2, s.z - d / 2, s.x + w / 2, s.z + d / 2);
}

export { RING_ORDER };
