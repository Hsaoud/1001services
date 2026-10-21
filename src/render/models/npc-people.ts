/**
 * PNJ humains : serveur débordé, client bavard, influenceur, client affamé, petit marquis, cortège de la
 * mariée, critique gastronomique, valse des serveurs. Silhouettes `Figure` + accessoires, poses procédurales.
 */
import * as THREE from 'three';
import { PALETTE, chamferCylinder, glass, lathe, matte, mesh, roundedBox, sphere } from '../kit';
import {
  SATIN_GOLD,
  SATIN_SILVER,
  TAU,
  ball,
  bakeCached,
  instantiate,
  capsule,
  clamp01,
  easeOutBack,
  flatRing,
  flatTorus,
  glowTex,
  hash01,
  limb,
  pick,
  satin,
  smoothstep,
  stdMat,
  wobble,
} from './common';
import { type Figure, type FigureSpec, aimArm, buildFigure, compactFigure, resetPose, walkCycle } from './figure';
import { buildChair, chairLook } from './chair';
import { type NpcCtx, type NpcModel, markFx } from './npc-base';

// ─────────────────────────────────────────── Palettes

export const SKINS = ['#f6d7c3', '#eec5a8', '#dcaa86', '#c08a62', '#93603f', '#f3d3bf', '#6f4630'];
export const HAIRS = ['#3d2a22', '#6b4a3a', '#a8703f', '#e3c08d', '#2b2230', '#c4643f', '#e9e4dc', '#8a5a44'];
export const PASTELS = [PALETTE.rose, PALETTE.lavender, PALETTE.mint, PALETTE.sky, '#ffd2b5', PALETTE.sage, PALETTE.powder, '#f7e3a1'];

const damp = THREE.MathUtils.damp;
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();

/** Marche additive commune (rythme lié à la vitesse réelle). */
class Walker {
  phase = Math.random() * TAU;
  w = 0;
  step(f: Figure, c: NpcCtx, moving: boolean, rate = 1, swing = 1, bounce = 0.04): number {
    const target = moving ? clamp01(0.35 + c.spd / 2.5) : 0;
    this.w = damp(this.w, target, 9, c.dt);
    if (this.w > 0.01) this.phase += c.dt * TAU * (1.1 + 1.2 * clamp01(c.spd / 3)) * rate;
    walkCycle(f, this.phase, this.w, swing, bounce);
    return this.w;
  }
}

const moves = (c: NpcCtx): boolean => c.action === 'walk' || ((c.action === 'leave' || c.action === 'calmed') && c.spd > 0.25);

/**
 * Réactions communes : étourdi (étoiles + tête qui tourne), calmé (verre levé, sourire), départ (salut).
 * Renvoie vrai si l'action a été prise en charge. `glassArm` = bras qui tient le mocktail.
 */
function commonReact(f: Figure, c: NpcCtx, glassArm: 'L' | 'R' = 'R'): boolean {
  const t = c.time;
  if (c.action === 'stunned') {
    f.setExpr('dizzy');
    f.head.rotation.z += Math.sin(t * 5) * 0.25;
    f.head.rotation.x += Math.cos(t * 5) * 0.12;
    f.armL.rotation.z += 0.45 + Math.sin(t * 6) * 0.2;
    f.armR.rotation.z -= 0.45 + Math.sin(t * 6 + 1) * 0.2;
    f.hips.rotation.z += Math.sin(t * 3) * 0.06;
    return true;
  }
  if (c.action === 'calmed') {
    f.setExpr('happy');
    const k = smoothstep(0, 0.35, c.at);
    const arm = glassArm === 'R' ? f.armR : f.armL;
    const sd = glassArm === 'R' ? -1 : 1;
    _qa.copy(arm.quaternion);
    aimArm(arm, sd * 0.25, 0.25 + Math.sin(t * 2.2) * 0.08, 1);
    _qb.copy(arm.quaternion);
    arm.quaternion.slerpQuaternions(_qa, _qb, k);
    f.head.rotation.z += Math.sin(t * 2) * 0.08;
    f.hips.rotation.z += Math.sin(t * 2) * 0.04;
    f.hips.position.y += Math.abs(Math.sin(t * 4)) * 0.015;
    return true;
  }
  if (c.action === 'leave') {
    f.setExpr('smile');
    const k = smoothstep(0, 0.3, c.at);
    const other = glassArm === 'R' ? f.armL : f.armR;
    const sd = glassArm === 'R' ? 1 : -1;
    other.rotation.z += sd * k * (2.5 + Math.sin(t * 11) * 0.35);
    return false; // la marche reste gérée par l'appelant
  }
  return false;
}

/** Couverts : fourchette argentée (dans le repère de la main, pointe vers −Y du bras). */
function fork(): THREE.Group {
  const g = new THREE.Group();
  const m = satin(SATIN_SILVER, 0.6, 0.25);
  g.add(mesh(limb(0.006, 0.08, 6), m, 0, 0.0, 0));
  for (const x of [-0.008, 0, 0.008]) g.add(mesh(limb(0.0025, 0.03, 4), m, x, -0.085, 0));
  g.add(mesh(roundedBox(0.024, 0.008, 0.006, 0.002), m, 0, -0.082, 0));
  g.rotation.x = Math.PI;
  g.position.y = -0.02;
  return g;
}

// ─────────────────────────────────────────── Serveur débordé

function flute(): THREE.Group {
  const g = new THREE.Group();
  g.add(
    mesh(
      lathe(
        [
          [0.02, 0],
          [0.02, 0.004],
          [0.004, 0.007],
          [0.004, 0.045],
          [0.015, 0.058],
          [0.02, 0.1],
          [0.019, 0.112],
        ],
        14,
        'npc:flute',
      ),
      glass('#f2fbff', 0.45),
    ),
  );
  g.add(mesh(lathe([[0, 0.05], [0.013, 0.058], [0.017, 0.095], [0, 0.095]], 12, 'npc:champ'), stdMat('champagne', { color: '#f5d77e', roughness: 0.2, emissive: '#6b4a12', emissiveIntensity: 0.3 })));
  return g;
}

export function buildWaiter(v: number): NpcModel {
  const r = (k: number): number => hash01(v + 3, k);
  const f = buildFigure({
    outfit: 'apron',
    top: '#2f2730',
    velvetTop: false,
    sleeves: PALETTE.ivory,
    shirt: PALETTE.ivory,
    neck: 'bowtie',
    neckColor: PALETTE.bordeaux,
    hands: '#ffffff',
    bottom: '#2b2230',
    skin: pick(SKINS, r(1)),
    hairStyle: pick(['slick', 'short', 'quiff', 'bun', 'ponytail'] as const, r(2)),
    hair: pick(HAIRS, r(3)),
  });
  compactFigure(f);
  const group = new THREE.Group();
  group.add(f.root);
  // plateau de flûtes au-dessus de la tête
  const tray = new THREE.Group();
  tray.position.set(-0.17, f.torsoH + f.headC + f.headR + 0.17, 0.04);
  f.hips.add(tray);
  tray.add(mesh(chamferCylinder(0.17, 0.16, 0.014, 0.005, 28), satin(SATIN_SILVER, 0.45, 0.25), 0, -0.014, 0));
  tray.add(mesh(flatTorus(0.165, 0.007, 5, 32), satin(SATIN_SILVER, 0.45, 0.25)));
  const flutes: THREE.Group[] = [];
  for (const [x, z] of [
    [0.06, 0.05],
    [-0.065, 0.045],
    [0.0, -0.07],
    [0.075, -0.06],
  ]) {
    const fl = flute();
    fl.scale.setScalar(1.35);
    fl.position.set(x, 0, z);
    tray.add(fl);
    flutes.push(fl);
  }
  // goutte de sueur
  const sweat = mesh(sphere(0.022, 10, 8), stdMat('sweat', { color: '#bfe6ff', roughness: 0.1, emissive: '#3a6f9a', emissiveIntensity: 0.2 }), 0.17, f.headC + 0.08, 0.05);
  sweat.scale.set(0.8, 1.2, 0.8);
  f.head.add(sweat);
  // traînées de vitesse (glissade)
  const streaks = markFx(new THREE.Group());
  const streakMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
  const lines: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const l = new THREE.Mesh(capsule(0.012, 1, 6), streakMat);
    l.rotation.x = Math.PI / 2;
    l.position.set((i - 2) * 0.13, 0.25 + ((i * 37) % 5) * 0.16, -0.5);
    streaks.add(l);
    lines.push(l);
  }
  group.add(streaks);
  const walk = new Walker();
  let slideW = 0;

  return {
    group,
    top: f.height + 0.25,
    hand: f.handL,
    nominalSpeed: 3,
    update(c) {
      const t = c.time;
      resetPose(f);
      f.setExpr('worried');
      const sliding = c.action === 'slide';
      slideW = damp(slideW, sliding ? 1 : 0, 10, c.dt);
      walk.step(f, c, moves(c), 1.35, 0.4, 0.05);
      // bras porteur : main sous le plateau
      aimArm(f.armR, tray.position.x + 0.05 - f.armR.position.x, tray.position.y - 0.03 - f.armR.position.y, tray.position.z - 0.02);
      let wob = 0.05;
      if (!commonReact(f, c, 'L')) {
        if (sliding || slideW > 0.02) {
          const k = slideW;
          f.hips.rotation.x += 0.3 * k;
          f.legL.rotation.x += -0.55 * k;
          f.legR.rotation.x += 0.5 * k;
          f.legR.rotation.z += -0.08 * k;
          f.armL.rotation.x += k * (1.0 + Math.sin(t * 13) * 0.6);
          f.armL.rotation.z += k * (0.5 + Math.sin(t * 9) * 0.3);
          f.hips.position.y += Math.sin(t * 31) * 0.004 * k;
          f.head.rotation.x -= 0.15 * k;
          wob = 0.22 * k + 0.05;
        } else if (c.action === 'idle' || c.action === 'sit') {
          f.head.rotation.y += Math.sin(t * 2.6) * 0.5;
          f.hips.position.y += Math.abs(Math.sin(t * 6)) * 0.012;
          f.armL.rotation.z += 0.2 + Math.sin(t * 3) * 0.1;
          wob = 0.08;
        } else wob = 0.12;
      } else if (c.action === 'stunned') wob = 0.3;
      if (c.action === 'calmed') wob = 0.02;
      tray.rotation.set(Math.sin(t * 7.1) * wob * 0.5, 0, Math.sin(t * 5.3 + 1) * wob * 0.6);
      flutes.forEach((fl, i) => fl.rotation.set(Math.sin(t * 11 + i * 1.7) * wob, 0, Math.cos(t * 9 + i) * wob));
      sweat.visible = c.action !== 'calmed';
      sweat.position.y = f.headC + 0.08 - ((t * 0.6) % 1) * 0.06;
      // traînées
      const sk = sliding ? clamp01(0.3 + c.spd / 3) : c.action === 'walk' ? 0.25 * clamp01(c.spd / 2) : 0;
      streakMat.opacity = damp(streakMat.opacity, sk * 0.55 * c.fade, 10, c.dt);
      streaks.visible = streakMat.opacity > 0.01;
      lines.forEach((l, i) => {
        const len = 0.3 + sk * (0.6 + 0.3 * Math.sin(t * 17 + i * 2));
        l.scale.set(1, len, 1);
        l.position.z = -0.32 - len / 2;
      });
    },
  };
}

// ─────────────────────────────────────────── Client bavard (sur sa chaise)

export function buildChatty(v: number): NpcModel {
  const r = (k: number): number => hash01(v + 17, k);
  const top = pick(PASTELS, r(1));
  const f = buildFigure({
    seated: true,
    outfit: r(2) < 0.5 ? 'suit' : 'plain',
    top,
    bottom: r(2) < 0.5 ? '#3b3340' : top,
    shirt: PALETTE.ivory,
    neck: pick(['pearls', 'bowtie', 'scarf', 'none'] as const, r(3)),
    neckColor: pick([PALETTE.bordeaux, PALETTE.gold, PALETTE.sageDeep], r(4)),
    skin: pick(SKINS, r(5)),
    hair: pick(HAIRS, r(6)),
    hairStyle: pick(['bob', 'curly', 'bun', 'short', 'long', 'quiff'] as const, r(7)),
    hat: r(8) < 0.3 ? 'beret' : 'none',
    hatColor: PALETTE.bordeaux,
    glasses: r(9) < 0.3 ? 'round' : 'none',
  });
  compactFigure(f);
  const group = new THREE.Group();
  const seat = new THREE.Group(); // chaise + client (reculent ensemble)
  group.add(seat);
  const cl = chairLook(r(10), r(11), false);
  seat.add(instantiate(bakeCached(`chair:lpv:${cl.style}:${cl.frame}:${cl.fabric}`, () => buildChair(cl, true))));
  seat.add(f.root);
  // bulle de conversation « … »
  const bubble = new THREE.Group();
  bubble.position.set(0.28, f.height + 0.12, 0);
  const bm = matte('#ffffff');
  const b0 = mesh(sphere(0.1, 14, 10), bm);
  b0.scale.set(1.35, 0.8, 0.5);
  bubble.add(b0);
  bubble.add(mesh(ball(0.03, 8, 6), bm, -0.1, -0.09, 0));
  for (let i = 0; i < 3; i++) bubble.add(mesh(ball(0.017, 8, 6), matte(PALETTE.roseDeep), (i - 1) * 0.045, 0, 0.05));
  group.add(bubble);
  let push = 0;
  let pushV = 0;

  return {
    group,
    top: f.height + 0.1,
    hand: f.handR,
    nominalSpeed: 1,
    update(c) {
      const t = c.time;
      resetPose(f);
      // recul de chaise (aux = 0..1, ou progression de l'action)
      const target = c.action === 'push' ? clamp01(c.aux > 0 ? c.aux : easeOutBack(clamp01(c.at / 0.35))) : 0;
      const a = (target - push) * 220 - pushV * 18;
      pushV += a * c.dt;
      push += pushV * c.dt;
      seat.position.z = -push * 0.7;
      const jolt = clamp01(Math.abs(pushV) * 0.3);
      seat.rotation.x = -0.1 * jolt;
      if (commonReact(f, c, 'R')) {
        bubble.visible = false;
        return;
      }
      if (c.action === 'push') {
        // grand éclat de rire, renversé en arrière
        const k = clamp01(push);
        f.setExpr('laugh');
        f.hips.rotation.x -= 0.32 * k;
        f.head.rotation.x -= 0.25 * k;
        f.armL.rotation.z += 1.6 * k + Math.sin(t * 9) * 0.15;
        f.armR.rotation.z -= 1.6 * k + Math.sin(t * 9 + 1) * 0.15;
        f.hips.position.y += Math.abs(Math.sin(t * 12)) * 0.015;
        bubble.visible = false;
        return;
      }
      // bavardage : gestes amples, tête tournée vers le voisin, bouche qui s'agite
      f.setExpr(Math.sin(t * 13) > 0.1 ? 'open' : 'smile');
      f.head.rotation.y += 0.45 + Math.sin(t * 0.9) * 0.25;
      f.head.rotation.x += Math.sin(t * 4.3) * 0.06;
      f.hips.rotation.y += 0.2;
      aimArm(f.armL, 0.4 + Math.sin(t * 3.1) * 0.3, -0.2 + Math.sin(t * 5.2) * 0.35, 0.8);
      aimArm(f.armR, -0.3 + Math.sin(t * 2.3) * 0.2, -0.6 + Math.sin(t * 4.1 + 1) * 0.3, 0.7);
      const ph = (t * 0.45) % 1;
      bubble.visible = ph < 0.55;
      bubble.scale.setScalar(Math.max(0.001, easeOutBack(clamp01(ph / 0.12)) * (1 - smoothstep(0.45, 0.55, ph))));
      bubble.children.forEach((ch, i) => {
        if (i >= 2) ch.position.y = Math.max(0, Math.sin(t * 8 - i)) * 0.02;
      });
    },
  };
}

// ─────────────────────────────────────────── Influenceur

export function buildInfluencer(v: number): NpcModel {
  const r = (k: number): number => hash01(v + 29, k);
  const f = buildFigure({
    outfit: 'suit',
    velvetTop: false,
    top: pick([PALETTE.lavender, PALETTE.mint, '#ffc9de', PALETTE.sky, '#ffe08a'], r(1)),
    shirt: '#ffffff',
    bottom: pick(['#efe3d3', '#2b2230', '#ffffff', '#c9b6e4'], r(2)),
    shoes: '#ffffff',
    neck: 'chain',
    glasses: 'sun',
    hairStyle: pick(['long', 'ponytail', 'bob', 'bun'] as const, r(3)),
    hair: pick(['#e8c78a', '#f2a7c3', '#b98ee0', '#3d2a22', '#9fd3c7'], r(4)),
    hat: pick(['bucket', 'cap', 'none'] as const, r(5)),
    hatColor: pick(['#ffffff', '#2b2230', '#f49ac1', '#cfe3d0'], r(6)),
    hatTrim: '#2b2230',
    skin: pick(SKINS, r(7)),
  });
  // petit sac à chaîne
  const bag = mesh(roundedBox(0.09, 0.07, 0.04, 0.015), stdMat('bag', { color: '#2b2230', roughness: 0.35 }), 0.21, 0.02, 0.05);
  f.hips.add(bag);
  bag.add(mesh(ball(0.008), satin(SATIN_GOLD), 0, 0.01, 0.022));
  compactFigure(f);
  const group = new THREE.Group();
  group.add(f.root);
  // téléphone (repère de la main : bras = −Y, dos du téléphone vers −Y quand le bras vise devant)
  const phone = new THREE.Group();
  phone.position.y = -0.03;
  phone.scale.setScalar(1.45);
  f.handR.add(phone);
  phone.add(mesh(roundedBox(0.06, 0.012, 0.11, 0.008), stdMat('phonecase', { color: '#f49ac1', roughness: 0.4 })));
  phone.add(mesh(roundedBox(0.05, 0.004, 0.098, 0.004), stdMat('phonescreen', { color: '#2a2433', roughness: 0.15, emissive: '#5a4a8a', emissiveIntensity: 0.4 }), 0, 0.006, 0));
  phone.add(mesh(ball(0.009, 8, 6), stdMat('lens', { color: '#1d1820', roughness: 0.1 }), 0.015, -0.007, 0.035));
  const rec = mesh(ball(0.007, 8, 6), stdMat('rec', { color: '#ff3b4f', emissive: '#ff2040', emissiveIntensity: 2.2 }), -0.016, -0.007, 0.04);
  phone.add(rec);
  // flash : halo + cône de lumière
  const flash = markFx(new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#fffbe8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })));
  flash.position.set(0.015, -0.03, 0.035);
  phone.add(flash);
  const coneMat = new THREE.MeshBasicMaterial({ color: '#fff3cf', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const coneGeo = new THREE.ConeGeometry(0.75, 1.8, 24, 1, true);
  coneGeo.rotateX(-Math.PI / 2);
  coneGeo.translate(0, 0, 0.9);
  const cone = markFx(new THREE.Mesh(coneGeo, coneMat));
  cone.position.set(0, 0.95, 0.3);
  cone.visible = false;
  group.add(cone);
  const walk = new Walker();

  return {
    group,
    top: f.height + 0.08,
    hand: f.handL,
    nominalSpeed: 2,
    update(c) {
      const t = c.time;
      resetPose(f);
      f.setExpr('smile');
      walk.step(f, c, moves(c), 1, 0.5, 0.035);
      let flashK = 0;
      let blink = Math.sin(t * 4) > 0;
      if (!commonReact(f, c, 'L')) {
        if (c.action === 'aim') {
          // téléphone à bout de bras, cadrage
          const k = smoothstep(0, 0.25, c.at);
          aimArm(f.armR, 0.12, 0.75 * k - 0.6 * (1 - k), 1);
          aimArm(f.armL, -0.3, 0.7 * k - 0.6 * (1 - k), 1);
          f.hips.rotation.x -= 0.08 * k;
          f.head.rotation.x += 0.08 * k;
          f.legL.rotation.z += 0.08;
          f.legR.rotation.z -= 0.08;
          f.setExpr('flat');
          blink = Math.sin(t * TAU * (2 + 10 * c.t)) > 0;
        } else if (c.action === 'flash') {
          aimArm(f.armR, 0.12, 0.75, 1);
          aimArm(f.armL, -0.3, 0.7, 1);
          f.hips.rotation.x -= 0.12;
          f.setExpr('happy');
          flashK = Math.max(0, 1 - c.at / 0.45) * (c.at < 0.05 ? c.at / 0.05 : 1);
          blink = true;
        } else if (c.action === 'walk' || c.action === 'leave') {
          // défilé : hanches chaloupées, regard sur l'écran
          f.hips.rotation.z += Math.sin(walk.phase) * 0.07 * walk.w;
          aimArm(f.armR, -0.15, -0.45, 0.9);
          f.head.rotation.x += 0.25;
          f.head.rotation.y -= 0.15;
        } else {
          // selfie : bras levé, signe V de l'autre main, tête penchée
          aimArm(f.armR, -0.45, 0.55, 0.75);
          f.armL.rotation.x -= 2.2;
          f.armL.rotation.z += 0.3;
          f.head.rotation.z += 0.18 + Math.sin(t * 1.5) * 0.06;
          f.head.rotation.y -= 0.35;
          f.hips.rotation.z += Math.sin(t * 1.5) * 0.04;
          f.setExpr(Math.sin(t * 0.8) > 0.6 ? 'o' : 'smile');
        }
      }
      rec.visible = blink && (c.action === 'aim' || c.action === 'flash' || c.action === 'idle');
      (flash.material as THREE.SpriteMaterial).opacity = Math.min(1, flashK * 1.2) * c.fade;
      flash.scale.setScalar(0.15 + flashK * 0.9);
      flash.visible = flashK > 0.01;
      coneMat.opacity = flashK * 0.3 * c.fade;
      cone.visible = flashK > 0.01;
    },
  };
}

// ─────────────────────────────────────────── Client affamé

export function buildHungry(v: number): NpcModel {
  const r = (k: number): number => hash01(v + 41, k);
  const outfit = pick(['suit', 'dress', 'plain', 'longcoat'] as const, r(1));
  const spec: FigureSpec = {
    outfit,
    top: pick([...PASTELS, PALETTE.bordeaux, '#5a6b8a'], r(2)),
    bottom: pick(['#3b3340', '#6b4a3a', '#efe3d3', '#5a6b8a'], r(3)),
    shirt: PALETTE.ivory,
    skin: pick(SKINS, r(4)),
    hair: pick(HAIRS, r(5)),
    hairStyle: pick(['short', 'bob', 'curly', 'bun', 'quiff', 'ponytail', 'bald', 'long'] as const, r(6)),
    hat: pick(['none', 'none', 'beret', 'bowler', 'sunhat', 'flower', 'tophat'] as const, r(7)),
    hatColor: pick([PALETTE.bordeaux, '#2b2230', '#fff4e6', PALETTE.sage], r(8)),
    hatTrim: pick([PALETTE.rose, PALETTE.gold, PALETTE.lavender], r(9)),
    glasses: pick(['none', 'none', 'round'] as const, r(10)),
    neck: pick(['none', 'pearls', 'bowtie'] as const, r(11)),
    girth: [0.95, 1.05, 1.15][Math.floor(r(12) * 3)], // quantifié : géométries partagées
    hipY: [0.28, 0.31, 0.34][Math.floor(r(13) * 3)],
  };
  const f = buildFigure(spec);
  const group = new THREE.Group();
  group.add(f.root);
  // serviette nouée autour du cou (bavoir)
  const bib = mesh(sphere(0.12, 12, 8), matte('#ffffff'), 0, f.torsoH * 0.66, 0.165);
  bib.scale.set(1.05, 1.25, 0.42);
  f.hips.add(bib);
  for (const sd of [1, -1]) {
    const k = mesh(ball(0.025, 8, 6), matte('#ffffff'), sd * 0.04, f.torsoH * 0.93, 0.13);
    k.scale.set(1.2, 0.7, 0.7);
    f.hips.add(k);
  }
  compactFigure(f);
  const fk = fork();
  fk.scale.setScalar(1.6);
  f.handR.add(fk);
  const walk = new Walker();
  const seed = r(14) * 10;

  return {
    group,
    top: f.height + 0.05,
    hand: f.handL,
    nominalSpeed: 2.2,
    update(c) {
      const t = c.time + seed;
      resetPose(f);
      walk.step(f, c, moves(c), 1.25, 0.2, 0.05);
      // une main sur le ventre
      aimArm(f.armL, -0.6, -0.55, 0.75);
      if (commonReact(f, c, 'L')) return;
      if (c.action === 'sit') {
        // table trouvée : petit bond de joie
        f.setExpr('happy');
        f.hips.position.y += Math.abs(Math.sin(t * 7)) * 0.05;
        f.armR.rotation.z -= 2.3;
        f.armL.rotation.z += 0.3;
        return;
      }
      if (c.action === 'walk' || c.action === 'leave') {
        f.setExpr('o');
        aimArm(f.armR, 0.55, -0.5, 0.75);
        f.hips.rotation.x += 0.08;
        return;
      }
      // piétinement impatient, fourchette brandie
      f.setExpr(Math.sin(t * 2.3) > 0 ? 'open' : 'o');
      const hop = Math.abs(Math.sin(t * 7));
      f.hips.position.y += hop * 0.022;
      f.legL.position.y += hop * 0.022;
      f.legR.position.y += hop * 0.022;
      f.legL.rotation.x -= Math.max(0, Math.sin(t * 7)) * 0.25;
      f.head.rotation.y += wobble(t * 1.6, v) * 0.6;
      aimArm(f.armR, -0.35, 0.65 + Math.sin(t * 9) * 0.15, 0.55);
      f.hips.scale.x = 1 + Math.max(0, Math.sin(t * 1.3)) ** 8 * 0.06; // gargouillis
    },
  };
}

// ─────────────────────────────────────────── Petit marquis

export function buildChild(v: number): NpcModel {
  const r = (k: number): number => hash01(v + 53, k);
  const wig = v % 2 === 0;
  const f = buildFigure({
    outfit: 'frock',
    headR: 0.2,
    hipY: 0.22,
    torsoH: 0.36,
    girth: 0.82,
    armLen: 0.17,
    top: pick(['#9ec5e0', PALETTE.rose, '#b9d9b0', PALETTE.lavender, '#f7d48a'], r(1)),
    shirt: PALETTE.ivory,
    neck: 'jabot',
    bottom: '#fbf3e8',
    shoes: '#2b2230',
    hairStyle: wig ? 'wig' : 'curly',
    hair: wig ? '#f4f1ea' : pick(['#e3c08d', '#a8703f', '#6b4a3a'], r(2)),
    hat: wig ? 'none' : 'crown',
    skin: pick(SKINS, r(3)),
  });
  f.root.scale.setScalar(0.8);
  // boucles dorées des souliers
  f.legL.children[1]?.add(mesh(ball(0.016, 6, 4), satin(SATIN_GOLD), 0, 0.02, 0.07));
  f.legR.children[1]?.add(mesh(ball(0.016, 6, 4), satin(SATIN_GOLD), 0, 0.02, 0.07));
  compactFigure(f);
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  body.add(f.root);
  // sucette tourbillon dans la main gauche
  const lolly = new THREE.Group();
  lolly.add(mesh(limb(0.006, 0.12, 6), matte('#ffffff'), 0, 0.12, 0));
  const candy = mesh(chamferCylinder(0.05, 0.05, 0.016, 0.006, 20), stdMat('lolly', { color: '#ff9ec4', roughness: 0.25 }), 0, 0.17, 0);
  candy.rotation.x = Math.PI / 2;
  lolly.add(candy);
  lolly.add(mesh(flatTorus(0.03, 0.007, 5, 16), matte('#ffffff'), 0, 0.17, 0.01).rotateX(Math.PI / 2));
  lolly.rotation.x = Math.PI;
  f.handL.add(lolly);
  const walk = new Walker();
  let headSp = 0;
  let headV = 0;

  return {
    group,
    top: f.height * 0.8 + 0.05,
    hand: f.handR,
    nominalSpeed: 3.5,
    update(c) {
      const t = c.time;
      resetPose(f);
      body.scale.set(1, 1, 1);
      body.rotation.set(0, 0, 0);
      body.position.set(0, 0, 0);
      f.setExpr('open');
      const w = walk.step(f, c, moves(c), 1.7, 1.8, 0.0);
      // course exagérée : bonds, étirement, bras qui pompent
      if (w > 0.01) {
        const s = Math.abs(Math.sin(walk.phase));
        body.position.y = s * 0.09 * w;
        const st = (s - 0.5) * 0.22 * w;
        body.scale.set(1 - st * 0.5, 1 + st, 1 - st * 0.5);
        f.hips.rotation.x += 0.22 * w;
        body.rotation.z = THREE.MathUtils.clamp(-c.turn * 0.07, -0.35, 0.35) * w;
        f.legL.rotation.x *= 1.4;
        f.legR.rotation.x *= 1.4;
      }
      // tête qui ballotte (ressort)
      const a = (body.position.y * 6 - headSp) * 120 - headV * 8;
      headV += a * c.dt;
      headSp += headV * c.dt;
      f.head.rotation.x += headSp * 0.5;
      if (commonReact(f, c, 'R')) return;
      if (c.action === 'idle' || c.action === 'sit') {
        // sautille sur place, espiègle
        f.setExpr(Math.sin(t * 3) > 0 ? 'happy' : 'laugh');
        const hop = Math.abs(Math.sin(t * 6));
        body.position.y = hop * 0.06;
        body.scale.set(1 + (1 - hop) * 0.06, 1 - (1 - hop) * 0.1, 1 + (1 - hop) * 0.06);
        f.head.rotation.y += Math.sin(t * 1.7) * 0.5;
        f.armL.rotation.x -= 1.2 + Math.sin(t * 6) * 0.3;
        f.armR.rotation.z -= 0.6 + Math.sin(t * 6) * 0.4;
      }
    },
  };
}

// ─────────────────────────────────────────── Cortège de la mariée

const GUESTS: FigureSpec[] = [
  { outfit: 'dress', top: PALETTE.lavender, hat: 'fascinator', hatColor: PALETTE.violet, hatTrim: '#ffffff', hairStyle: 'bun', neck: 'pearls' },
  { outfit: 'suit', top: PALETTE.sage, neck: 'bowtie', neckColor: PALETTE.rose, hairStyle: 'short', lapels: '#d9e6cf' },
  { outfit: 'dress', top: '#ffd2b5', hat: 'sunhat', hatColor: '#fff4e6', hatTrim: '#f2a7b5', hairStyle: 'long' },
  { outfit: 'suit', top: PALETTE.sky, hat: 'tophat', hatColor: '#4a4a5e', hatTrim: PALETTE.sky, neck: 'bowtie', neckColor: PALETTE.gold },
  { outfit: 'dress', top: PALETTE.rose, hat: 'flower', hatColor: '#ffffff', hairStyle: 'curly' },
  { outfit: 'suit', top: PALETTE.mint, hat: 'bowler', hatColor: '#3b3340', neck: 'bowtie', neckColor: PALETTE.lavender, hairStyle: 'quiff' },
];

function bouquet(): THREE.Group {
  const g = new THREE.Group();
  const cols = ['#ffffff', '#f7c6d3', '#ffd9c2', '#f2a7b5', '#fffaf2', '#e8b4d8'];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    const rr = i === 0 ? 0 : 0.045;
    g.add(mesh(ball(0.032, 10, 8), matte(cols[i % cols.length]), Math.cos(a) * rr, 0.03 + (i === 0 ? 0.015 : 0), Math.sin(a) * rr));
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3;
    const l = mesh(sphere(0.02, 8, 6), matte(PALETTE.leaf), Math.cos(a) * 0.075, 0.0, Math.sin(a) * 0.075);
    l.scale.set(1.4, 0.4, 0.8);
    l.rotation.y = -a;
    g.add(l);
  }
  g.add(mesh(chamferCylinder(0.02, 0.014, 0.08, 0.004, 10), matte('#fffaf2'), 0, -0.08, 0));
  return g;
}

export function buildBride(v: number): NpcModel {
  const group = new THREE.Group();
  let f: Figure | null = null;
  let idx = -1;
  let veil: THREE.Object3D | null = null;
  let bq: THREE.Object3D | null = null;
  let top = 1.25;
  let hand: THREE.Object3D | null = null;
  const walk = new Walker();
  let veilA = 0;
  let veilV = 0;
  const holder = { adopt: null as ((o: THREE.Object3D) => void) | null };

  const build = (i: number): void => {
    if (f) {
      f.root.removeFromParent();
      f.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
      });
    }
    const r = (k: number): number => hash01(v * 13 + i + 7, k);
    if (i === 0) {
      f = buildFigure({
        outfit: 'gown',
        velvetTop: false,
        top: '#fffaf4',
        sleeves: '#fffaf4',
        hands: '#fffaf4',
        shirt: '#fffaf4',
        hairStyle: 'updo',
        hair: pick(['#6b4a3a', '#e3c08d', '#3d2a22', '#a8703f'], r(1)),
        hat: 'tiara',
        neck: 'pearls',
        skin: pick(SKINS, r(2)),
      });
      compactFigure(f);
      // voile translucide du chignon jusqu'au sol
      const vg = new THREE.Group();
      vg.position.set(0, f.torsoH + f.headC + f.headR * 0.7, -f.headR * 0.55);
      const vh = f.hipY + f.torsoH + f.headC + f.headR * 0.7 - 0.02;
      const arc = Math.PI * 0.9;
      const geo = new THREE.LatheGeometry(
        [new THREE.Vector2(0.07, 0), new THREE.Vector2(0.16, -vh * 0.35), new THREE.Vector2(0.3, -vh * 0.75), new THREE.Vector2(0.46, -vh)],
        18,
        Math.PI - arc / 2,
        arc,
      );
      const vm = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#fff4f8', roughness: 0.5, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false, emissive: '#3a2a30', emissiveIntensity: 0.15 }));
      vm.castShadow = false;
      vg.add(vm);
      // ourlet de dentelle (opaque, lisible de loin)
      const hem = mesh(new THREE.TorusGeometry(0.46, 0.012, 5, 24, arc), matte('#ffffff'), 0, -vh, 0);
      hem.geometry.rotateX(Math.PI / 2);
      hem.rotation.y = arc / 2 + Math.PI / 2;
      vg.add(hem);
      f.hips.add(vg);
      veil = vg;
      const b = bouquet();
      b.position.set(0, -0.04, 0.02);
      b.rotation.x = Math.PI;
      f.handR.add(b);
      bq = b;
      hand = f.handL;
    } else {
      const look = GUESTS[(i - 1 + v) % GUESTS.length];
      f = buildFigure({
        ...look,
        velvetTop: look.outfit !== 'dress',
        skin: pick(SKINS, r(3)),
        hair: pick(HAIRS, r(4)),
        bottom: look.outfit === 'suit' ? '#4a4252' : '#3b3340',
        hairStyle: look.hairStyle ?? pick(['short', 'bob', 'curly'] as const, r(5)),
      });
      compactFigure(f);
      veil = null;
      bq = null;
      hand = f.handR;
    }
    top = f.height + 0.05;
    group.add(f.root);
    holder.adopt?.(f.root);
    idx = i;
  };

  const model: NpcModel & { bindAdopt(fn: (o: THREE.Object3D) => void): void } = {
    group,
    get top() {
      return top;
    },
    get hand() {
      return hand;
    },
    nominalSpeed: 1.6,
    bindAdopt(fn) {
      holder.adopt = fn;
    },
    update(c) {
      const want = Math.max(0, Math.round(c.aux));
      if (want !== idx) build(want);
      const fig = f!;
      const t = c.time;
      resetPose(fig);
      fig.setExpr('happy');
      const dancing = c.action === 'dance' || c.action === 'walk';
      walk.step(fig, c, c.action === 'walk' || (c.action === 'leave' && c.spd > 0.25), 1, 0.3, 0.03);
      if (!commonReact(fig, c, idx === 0 ? 'L' : 'R')) {
        if (dancing) {
          // farandole : 1-2-3-hop ! (décalée selon le rang)
          const beat = t * 2.2 - idx * 0.5;
          const s = Math.sin(Math.PI * beat);
          const hop = Math.abs(s) * (c.action === 'dance' ? 0.07 : 0.03);
          fig.hips.position.y += hop;
          fig.legL.position.y += hop;
          fig.legR.position.y += hop;
          fig.hips.rotation.z += s * 0.12;
          const kick = Math.max(0, Math.sin((Math.PI * beat) / 2)) ** 6;
          const kl = Math.floor(beat / 2) % 2 === 0 ? fig.legL : fig.legR;
          kl.rotation.x -= kick * 0.9;
          if (idx === 0) {
            // la mariée mène en agitant son bouquet
            aimArm(fig.armR, -0.3, 0.9, 0.3 + Math.sin(t * 6) * 0.25);
            fig.armL.rotation.z += 0.6 + s * 0.2;
          } else {
            // mains sur les épaules de celui de devant
            aimArm(fig.armL, 0.12, 0.22 + s * 0.05, 1);
            aimArm(fig.armR, -0.12, 0.22 + s * 0.05, 1);
          }
          fig.head.rotation.z += s * 0.1;
        } else {
          // en attente : balancement et applaudissements
          fig.hips.rotation.z += Math.sin(t * 2.4) * 0.05;
          if (idx === 0) aimArm(fig.armR, -0.15, -0.2, 1);
          else {
            const clap = Math.abs(Math.sin(t * 7));
            aimArm(fig.armL, -0.35 - clap * 0.25, -0.1, 1);
            aimArm(fig.armR, 0.35 + clap * 0.25, -0.1, 1);
          }
        }
      }
      if (veil) {
        // voile : traîne qui flotte
        const target = dancing ? 0.25 + Math.abs(Math.sin(Math.PI * t * 2.2)) * 0.2 : 0.06;
        veilV += ((target - veilA) * 60 - veilV * 6) * c.dt;
        veilA += veilV * c.dt;
        veil.rotation.x = -veilA;
        veil.rotation.z = Math.sin(t * 2.2) * 0.08;
      }
      if (bq) bq.rotation.z = Math.sin(t * 5) * 0.1;
    },
  };
  return model;
}

// ─────────────────────────────────────────── Critique gastronomique

export function buildCritic(v: number): NpcModel {
  const r = (k: number): number => hash01(v + 71, k);
  const f = buildFigure({
    outfit: 'longcoat',
    top: pick(['#3a3238', '#2f3440', '#4a3a32'], r(1)),
    bottom: '#2b2230',
    shoes: '#1d171b',
    shirt: '#efe3d3',
    neck: 'scarf',
    neckColor: PALETTE.bordeaux,
    hat: 'beret',
    hatColor: '#262026',
    glasses: 'monocle',
    nose: 'long',
    mustache: true,
    hair: pick(['#3d2a22', '#9a9090', '#2b2230'], r(2)),
    hairStyle: 'short',
    hipY: 0.42,
    torsoH: 0.5,
    girth: 0.8,
    armLen: 0.26,
    skin: pick(SKINS, r(3)),
    blush: false,
  });
  compactFigure(f);
  const group = new THREE.Group();
  group.add(f.root);
  // carnet et stylo
  const pad = new THREE.Group();
  pad.position.set(0, -0.04, 0.0);
  pad.add(mesh(roundedBox(0.075, 0.016, 0.1, 0.004), matte(PALETTE.bordeauxDeep)));
  pad.add(mesh(roundedBox(0.066, 0.006, 0.09, 0.002), matte('#fffaf2'), 0, 0.01, 0));
  pad.add(mesh(capsule(0.004, 0.06, 4), satin(SATIN_GOLD), 0, 0.012, 0.05).rotateZ(Math.PI / 2));
  f.handL.add(pad);
  const pen = mesh(limb(0.006, 0.085, 6), satin(SATIN_GOLD), 0, 0.0, 0);
  pen.rotation.x = Math.PI;
  pen.position.y = -0.01;
  f.handR.add(pen);
  // aura discrète : anneau d'encre qui pulse
  const auraMat = new THREE.MeshBasicMaterial({ color: '#6b3f6b', transparent: true, opacity: 0.22, depthWrite: false });
  const aura = markFx(new THREE.Mesh(flatRing(0.42, 0.5, 40), auraMat));
  aura.position.y = 0.015;
  group.add(aura);
  const walk = new Walker();

  return {
    group,
    top: f.height + 0.05,
    hand: f.handR,
    nominalSpeed: 1.2,
    update(c) {
      const t = c.time;
      resetPose(f);
      f.setExpr('flat');
      walk.step(f, c, moves(c), 0.7, 0.15, 0.025);
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
      aura.scale.setScalar(1 + pulse * 0.12);
      auraMat.opacity = (0.12 + pulse * 0.16) * c.fade;
      if (commonReact(f, c, 'R')) return;
      // carnet tenu devant la poitrine
      aimArm(f.armL, -0.55, -0.35, 0.75);
      if (c.action === 'walk' || c.action === 'leave') {
        // pas lents, nez en l'air
        f.head.rotation.x -= 0.18;
        aimArm(f.armR, 0.05, -0.9, 0.3);
        f.legL.rotation.x *= 1.3;
        f.legR.rotation.x *= 1.3;
      } else {
        // écrit : tête penchée sur le carnet, stylo qui griffonne ; lève parfois les yeux, sceptique
        const look = Math.sin(t * 0.7) > 0.75;
        f.head.rotation.x += look ? -0.1 : 0.3;
        f.head.rotation.y += look ? Math.sin(t * 2) * 0.4 : -0.15;
        aimArm(f.armR, 0.5 + Math.sin(t * 17) * 0.05, -0.3 + Math.sin(t * 23) * 0.04, 0.8);
        f.setExpr(look ? 'angry' : 'flat');
      }
    },
  };
}

// ─────────────────────────────────────────── Valse des serveurs

export function buildWaltz(v: number): NpcModel {
  const r = (k: number): number => hash01(v + 89, k);
  const lead = buildFigure({
    outfit: 'apron',
    top: '#2f2730',
    velvetTop: false,
    sleeves: PALETTE.ivory,
    shirt: PALETTE.ivory,
    neck: 'bowtie',
    neckColor: PALETTE.bordeaux,
    hands: '#ffffff',
    hairStyle: pick(['slick', 'quiff', 'short'] as const, r(1)),
    hair: pick(HAIRS, r(2)),
    skin: pick(SKINS, r(3)),
  });
  const partner = buildFigure({
    outfit: 'dress',
    velvetTop: false,
    top: pick([PALETTE.roseDeep, '#2f2730', PALETTE.lavender], r(4)),
    sleeves: PALETTE.ivory,
    hands: '#ffffff',
    hairStyle: pick(['bun', 'updo', 'bob'] as const, r(5)),
    hair: pick(HAIRS, r(6)),
    hat: 'flower',
    hatColor: '#ffffff',
    neck: 'pearls',
    skin: pick(SKINS, r(7)),
  });
  // tablier blanc de la serveuse
  const ap = mesh(roundedBox(0.24, 0.24, 0.02, 0.008), matte(PALETTE.ivory), 0, -0.05, 0.25);
  ap.rotation.x = -0.25;
  partner.hips.add(ap);
  compactFigure(lead);
  compactFigure(partner);
  const group = new THREE.Group();
  const couple = new THREE.Group();
  group.add(couple);
  const A = new THREE.Group();
  A.position.x = -0.24;
  A.rotation.y = Math.PI / 2;
  A.add(lead.root);
  const B = new THREE.Group();
  B.position.x = 0.24;
  B.rotation.y = -Math.PI / 2;
  B.add(partner.root);
  couple.add(A, B);
  let spin = r(8) * TAU;
  let omega = 0;

  return {
    group,
    top: Math.max(lead.height, partner.height) + 0.05,
    hand: lead.handR,
    nominalSpeed: 1.6,
    update(c) {
      const t = c.time;
      resetPose(lead);
      resetPose(partner);
      const target = c.action === 'dance' ? 3.0 : c.action === 'walk' ? 1.8 : c.action === 'stunned' ? 0 : 0.35;
      omega = damp(omega, target, 3, c.dt);
      spin += omega * c.dt;
      couple.rotation.y = spin;
      // 1-2-3 : plié sur le premier temps, élévation sur les suivants
      const beat = t * 2.4;
      const bar = (beat % 3) / 3;
      const lift = Math.sin(bar * TAU - Math.PI / 2) * 0.03 * clamp01(omega / 2);
      for (const fg of [lead, partner]) {
        fg.hips.position.y += lift;
        fg.legL.position.y += lift;
        fg.legR.position.y += lift;
        const st = Math.sin(beat * Math.PI) * 0.35 * clamp01(omega / 2);
        fg.legL.rotation.x -= st;
        fg.legR.rotation.x += st;
        fg.setExpr('happy');
      }
      if (partner.skirt) {
        const fl = 1 + 0.2 * clamp01(omega / 3);
        partner.skirt.scale.set(fl, 1 - (fl - 1) * 0.5, fl);
      }
      // étreinte : main dans le dos, mains jointes tendues sur le côté
      aimArm(lead.armR, 0.25, -0.05, 1);
      aimArm(lead.armL, 0.6, 0.55, 0.85);
      aimArm(partner.armL, -0.2, 0.35, 1);
      aimArm(partner.armR, -0.6, 0.55, 0.85);
      lead.hips.rotation.x -= 0.06;
      partner.hips.rotation.x -= 0.1;
      partner.head.rotation.z += 0.15;
      lead.head.rotation.z -= 0.1;
      if (c.action === 'stunned') {
        for (const fg of [lead, partner]) {
          fg.setExpr('dizzy');
          fg.head.rotation.z += Math.sin(t * 5) * 0.25;
        }
      } else if (c.action === 'calmed') {
        aimArm(lead.armR, -0.3, 0.3, 1);
      } else if (c.action === 'leave') {
        aimArm(partner.armR, -0.4, 1, 0.1);
        partner.armR.rotation.z += Math.sin(t * 11) * 0.3;
      }
    },
  };
}
