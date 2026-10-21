/**
 * Base commune des obstacles vivants : un « agent » possède 0..n corps (vues de PNJ),
 * gère son apparition en fondu, l'état « calmé » (Tournée Générale), ses télégraphes et les chocs au contact.
 */
import type { View } from '../../../render/api';
import type { NpcAction, NpcKind, NpcViewState } from '../../../types';
import type { HazardCtx } from '../context';
import { TelegraphSet } from '../context';
import { clamp01, headingOf, segProject, smoothstep, turnToward } from '../util';

/** Un corps de PNJ : état de simulation + vue associée. */
export interface Body {
  view: View<NpcViewState> | null;
  x: number;
  z: number;
  /** Position au début du pas (contact balayé, pas de « tunnel » à grande vitesse). */
  px: number;
  pz: number;
  heading: number;
  speed01: number;
  action: NpcAction;
  actionT: number;
  fade: number;
  aux?: number;
  /** Rayon de collision (contact avec le joueur). */
  radius: number;
}

export type AgentPhase = 'spawning' | 'active' | 'calmed' | 'dead';

/** Durée du fondu d'apparition (s). */
export const FADE_IN = 0.8;
/** Durée de l'effacement « calmé » (s). */
export const CALM_TIME = 1.2;

/** Déplace un corps vers (tx, tz) avec glissement contre le décor ; renvoie la distance restante. */
export function moveBody(ctx: HazardCtx, b: Body, tx: number, tz: number, speed: number, dt: number, turnRate = 10): number {
  const dx = tx - b.x;
  const dz = tz - b.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-4) return 0;
  const step = Math.min(d, speed * dt);
  ctx.world.moveCircle(b, (dx / d) * step, (dz / d) * step, b.radius);
  b.heading = turnToward(b.heading, headingOf(dx, dz), turnRate * dt);
  return Math.hypot(tx - b.x, tz - b.z);
}

export abstract class Agent {
  readonly id: number;
  readonly kind: NpcKind;
  /** Réapparaît après une Tournée Générale (PNJ du plan) ; faux pour les affamés du piège. */
  readonly regular: boolean;
  /** Identifiant de source des chocs (anti-répétition du monde). */
  readonly source: string;
  phase: AgentPhase = 'spawning';
  readonly bodies: Body[] = [];
  /** Visible sur la mini-carte. */
  showOnMap = true;

  protected readonly ctx: HazardCtx;
  protected readonly tg: TelegraphSet;
  /** Attente invisible avant le fondu (ex. télégraphe d'apparition des affamés). */
  protected spawnDelay = 0;
  protected fadeIn = FADE_IN;
  /** Temps écoulé dans la phase courante. */
  protected phaseT = 0;
  private fadeAtCalm: number[] = [];

  constructor(ctx: HazardCtx, kind: NpcKind, regular: boolean) {
    this.ctx = ctx;
    this.kind = kind;
    this.regular = regular;
    this.id = ctx.uid();
    this.source = `${kind}:${this.id}`;
    this.tg = new TelegraphSet(ctx.world);
  }

  /** Crée un corps (vue comprise), invisible jusqu'au fondu d'apparition. */
  protected addBody(x: number, z: number, radius: number, heading = 0, aux?: number): Body {
    const b: Body = {
      view: this.ctx.world.createNpcView(this.kind),
      x,
      z,
      px: x,
      pz: z,
      heading,
      speed01: 0,
      action: 'idle',
      actionT: 0,
      fade: 0,
      radius,
    };
    if (aux !== undefined) b.aux = aux;
    this.bodies.push(b);
    return b;
  }

  get alive(): boolean {
    return this.phase !== 'dead';
  }

  /** Dangereux (ni en apparition, ni calmé). */
  get hostile(): boolean {
    return this.phase === 'active';
  }

  update(dt: number): void {
    for (const b of this.bodies) {
      b.px = b.x;
      b.pz = b.z;
    }
    this.phaseT += dt;
    switch (this.phase) {
      case 'spawning': {
        if (this.phaseT < this.spawnDelay) {
          for (const b of this.bodies) b.fade = 0;
          this.onSpawnDelay(this.phaseT / this.spawnDelay);
          return;
        }
        const f = clamp01((this.phaseT - this.spawnDelay) / this.fadeIn);
        for (const b of this.bodies) b.fade = f;
        this.onFading(dt, f);
        if (f >= 1) {
          this.phase = 'active';
          this.phaseT = 0;
          this.onActive();
        }
        return;
      }
      case 'active':
        this.think(dt);
        return;
      case 'calmed': {
        const k = clamp01(this.phaseT / CALM_TIME);
        this.bodies.forEach((b, i) => {
          b.action = 'calmed';
          b.actionT = k;
          b.speed01 = 0;
          b.fade = (this.fadeAtCalm[i] ?? 1) * (1 - smoothstep(0.35, 1, k));
        });
        this.onCalmedUpdate(dt, k);
        if (k >= 1) this.phase = 'dead';
        return;
      }
      case 'dead':
        return;
    }
  }

  /** Tournée Générale : sourit, verre à la main, et s'efface. Renvoie false si déjà calmé / retiré. */
  calm(): boolean {
    if (this.phase === 'calmed' || this.phase === 'dead') return false;
    this.tg.clear();
    this.fadeAtCalm = this.bodies.map((b) => b.fade);
    this.phase = 'calmed';
    this.phaseT = 0;
    this.onCalm();
    return true;
  }

  /** Écrit un état de vue neuf pour chaque corps. */
  sync(dt: number): void {
    for (const b of this.bodies) {
      if (!b.view) continue;
      const s: NpcViewState = {
        x: b.x,
        z: b.z,
        heading: b.heading,
        speed01: b.speed01,
        action: b.action,
        actionT: b.actionT,
        fade: b.fade,
      };
      if (b.aux !== undefined) s.aux = b.aux;
      b.view.update(s, dt);
    }
  }

  dispose(): void {
    this.tg.clear();
    for (const b of this.bodies)
      if (b.view) {
        this.ctx.world.removeView(b.view);
        b.view = null;
      }
    this.onDispose();
    this.phase = 'dead';
  }

  /**
   * Choc au contact (balayé sur le déplacement du pas). (kdx, kdz) = direction de recul,
   * par défaut radiale depuis le corps. Renvoie true si le monde a accepté le choc.
   */
  protected touch(b: Body, damage: number, knockback: number, kdx?: number, kdz?: number, stun?: number): boolean {
    const p = this.ctx.player;
    const reach = b.radius + p.radius;
    if (Math.abs(p.x - b.x) > reach + 2 || Math.abs(p.z - b.z) > reach + 2) return false;
    if (segProject(p.x, p.z, b.px, b.pz, b.x, b.z).d > reach) return false;
    const kx = kdx ?? p.x - b.x;
    const kz = kdz ?? p.z - b.z;
    return this.ctx.hit(damage, knockback, this.source, kx, kz, stun);
  }

  /** Logique de comportement (phase active uniquement). */
  protected abstract think(dt: number): void;
  protected onSpawnDelay(_p: number): void {}
  protected onFading(_dt: number, _f: number): void {}
  protected onActive(): void {}
  protected onCalm(): void {}
  protected onCalmedUpdate(_dt: number, _k: number): void {}
  protected onDispose(): void {}
}
