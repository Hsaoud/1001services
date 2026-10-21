/**
 * PNJ perturbateurs (« monstres ») : une enveloppe commune (position, cap lissé, apparition élastique et
 * fondu, étourdissement, calme avec mocktail et cœurs, départ en pirouette) autour d'un modèle par espèce.
 */
import * as THREE from 'three';
import type { View } from '../api';
import type { NpcAction, NpcKind, NpcViewState } from '../../types';
import { angleDelta, disposeTree } from '../kit';
import { HeartPuffs, InstanceMats, StarRing, TAU, Twinkles, clamp01, easeInCubic, easeOutBack } from './common';
import { createDishMesh } from './dishes';
import { type NpcCtx, type NpcModel, isFx, nextVariant } from './npc-base';
import { buildBride, buildChatty, buildChild, buildCritic, buildHungry, buildInfluencer, buildWaiter, buildWaltz } from './npc-people';
import { buildCart, buildPolisher, buildPoodle } from './npc-things';

const BUILDERS: Record<NpcKind, (variant: number) => NpcModel> = {
  waiter: buildWaiter,
  chatty: buildChatty,
  cart: buildCart,
  poodle: buildPoodle,
  influencer: buildInfluencer,
  hungry: buildHungry,
  child: buildChild,
  polisher: buildPolisher,
  bride: buildBride,
  critic: buildCritic,
  waltz: buildWaltz,
};

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

class NpcView implements View<NpcViewState> {
  readonly root = new THREE.Group();
  private readonly turnG = new THREE.Group();
  private readonly pop = new THREE.Group();
  private readonly model: NpcModel;
  private readonly stars = new StarRing(3, 0.2);
  private readonly hearts = new HeartPuffs(3);
  private readonly sparkles = new Twinkles(6, '#ffe7a0', 0.4, 1.1, 0.13);
  private readonly glass: THREE.Object3D | null;
  private readonly mats: InstanceMats;
  private time = 0;
  private first = true;
  private heading = 0;
  private action: NpcAction = 'idle';
  private prev: NpcAction = 'idle';
  private at = 0;
  private px = 0;
  private pz = 0;
  private spd = 0;
  private turn = 0;
  private lastFade = 1;
  private rising = false;
  private stunW = 0;
  private glassK = 0;
  private leaveSpin = 0;

  constructor(kind: NpcKind) {
    this.root.name = `npc:${kind}`;
    this.root.add(this.turnG);
    this.turnG.add(this.pop);
    this.model = BUILDERS[kind](nextVariant(kind));
    this.pop.add(this.model.group);
    this.pop.add(this.stars.group, this.hearts.group, this.sparkles.group);
    if (this.model.hand) {
      const g = createDishMesh('mocktail');
      g.scale.setScalar(0.85);
      g.position.set(0, -0.05, 0.02);
      g.visible = false;
      this.model.hand.add(g);
      this.glass = g;
    } else this.glass = null;
    const skip = (o: THREE.Object3D): boolean => isFx(o);
    this.mats = new InstanceMats(this.root, skip);
    const bindable = this.model as NpcModel & { bindAdopt?: (fn: (o: THREE.Object3D) => void) => void };
    bindable.bindAdopt?.((o) => this.mats.adopt(o, skip));
  }

  update(s: NpcViewState, dtRaw: number): void {
    const dt = Math.min(0.05, Math.max(0, dtRaw));
    this.time += dt;
    if (s.action !== this.action) {
      this.prev = this.action;
      this.action = s.action;
      this.at = 0;
    } else this.at += dt;

    // vitesse réelle et cap lissé
    if (this.first) {
      this.first = false;
      this.heading = s.heading;
      this.px = s.x;
      this.pz = s.z;
    }
    if (dt > 0) {
      const d = Math.hypot(s.x - this.px, s.z - this.pz);
      this.spd = THREE.MathUtils.damp(this.spd, d > 1.5 ? 0 : d / dt, 10, dt);
      const dh = angleDelta(this.heading, s.heading);
      const step = dh * (1 - Math.exp(-14 * dt));
      this.turn = THREE.MathUtils.damp(this.turn, step / dt, 8, dt);
      this.heading += step;
    }
    this.px = s.x;
    this.pz = s.z;
    const spd = this.spd > 0.08 ? this.spd : clamp01(s.speed01) * this.model.nominalSpeed;
    this.root.position.set(s.x, 0, s.z);

    // départ élégant : pirouette sur place (si le PNJ ne marche pas)
    if (s.action === 'leave' && !this.model.customLeave && spd < 0.3) this.leaveSpin += dt * TAU * (0.4 + 1.6 * easeInCubic(clamp01(this.at / 1.2)));
    else this.leaveSpin *= Math.exp(-6 * dt);
    this.turnG.rotation.y = this.heading + this.leaveSpin;

    // apparition élastique / fondu
    const f = clamp01(s.fade);
    if (Math.abs(f - this.lastFade) > 1e-4) this.rising = f > this.lastFade;
    this.lastFade = f;
    const sc = f >= 0.999 ? 1 : this.rising ? easeOutBack(f) : 0.4 + 0.6 * f;
    this.pop.scale.setScalar(Math.max(0.001, sc));
    this.pop.position.y = s.action === 'leave' ? (1 - f) * 0.25 : 0;
    this.root.visible = f > 0.004;
    this.mats.setOpacity(f);

    // étourdi : vacillement
    this.stunW = THREE.MathUtils.damp(this.stunW, s.action === 'stunned' ? 1 : 0, 8, dt);
    this.pop.rotation.set(Math.cos(this.time * 5) * 0.06 * this.stunW, 0, Math.sin(this.time * 5) * 0.08 * this.stunW);

    const ctx: NpcCtx = {
      dt,
      time: this.time,
      action: s.action,
      prev: this.prev,
      at: this.at,
      t: clamp01(s.actionT),
      speed01: clamp01(s.speed01),
      spd,
      aux: s.aux ?? 0,
      turn: this.turn,
      fade: f,
    };
    this.model.update(ctx);

    const top = this.model.top;
    this.stars.group.position.y = top + 0.08;
    this.hearts.group.position.y = top - 0.05;
    this.stars.update(dt, this.time, s.action === 'stunned');
    this.hearts.update(dt, this.time, s.action === 'calmed');
    this.sparkles.update(dt, this.time, s.action === 'calmed' || s.action === 'leave');

    // verre de mocktail (calmé), toujours droit
    if (this.glass) {
      this.glassK = THREE.MathUtils.damp(this.glassK, s.action === 'calmed' ? 1 : 0, 10, dt);
      this.glass.visible = this.glassK > 0.02;
      if (this.glass.visible) {
        this.glass.scale.setScalar(0.85 * easeOutBack(this.glassK));
        const parent = this.glass.parent;
        if (parent) {
          parent.updateWorldMatrix(true, false);
          parent.getWorldQuaternion(_q).invert();
          this.glass.quaternion.copy(_q).multiply(this.turnG.getWorldQuaternion(_q2));
        }
      }
    }
  }

  dispose(): void {
    disposeTree(this.root);
  }
}

/** Vue animée d'un PNJ (une apparence par espèce, variantes d'une instance à l'autre). */
export function createNpcView(kind: NpcKind): View<NpcViewState> {
  return new NpcView(kind);
}
