/**
 * PNJ non humains : chariot à pâtisseries, caniche royal, robot cireur.
 */
import * as THREE from 'three';
import { PALETTE, ceramic, chamferCylinder, cylinder, glow, lathe, matte, mesh, roundedBox, sphere, torus, velvet } from '../kit';
import {
  SATIN_GOLD,
  SATIN_SILVER,
  TAU,
  Twinkles,
  ball,
  bakeCached,
  bakeInPlace,
  box,
  capsule,
  clamp,
  clamp01,
  flatTorus,
  hash01,
  heartGeo,
  instantiate,
  limb,
  pick,
  puffGeo,
  satin,
  smoothstep,
  stdMat,
} from './common';
import type { NpcCtx, NpcModel } from './npc-base';

const damp = THREE.MathUtils.damp;

// ─────────────────────────────────────────── Chariot à pâtisseries

function macaron(g: THREE.Object3D, x: number, y: number, z: number, color: string, s = 1): void {
  const m = matte(color);
  g.add(mesh(chamferCylinder(0.032 * s, 0.03 * s, 0.016 * s, 0.007 * s, 8), m, x, y, z));
  g.add(mesh(cylinder(0.027 * s, 0.027 * s, 0.01 * s, 8), matte('#fff6ea'), x, y + 0.012 * s, z));
  g.add(mesh(chamferCylinder(0.03 * s, 0.032 * s, 0.016 * s, 0.007 * s, 8), m, x, y + 0.022 * s, z));
}

const MAC_COLORS = ['#f7b7c8', '#c9e4b4', '#d9c6ee', '#ffe1a8', '#bfe0f0', '#f6c9a8'];

function cartTop(): THREE.Group {
  const g = new THREE.Group();
  // gâteau à étages
  const cake = new THREE.Group();
  cake.position.set(0, 0, 0.21);
  cake.add(mesh(chamferCylinder(0.15, 0.15, 0.11, 0.02, 20), matte('#f5c3cf')));
  cake.add(mesh(flatTorus(0.148, 0.016, 4, 20), matte('#fffaf2'), 0, 0.11, 0));
  cake.add(mesh(chamferCylinder(0.1, 0.1, 0.085, 0.018, 16), matte('#fff4e6'), 0, 0.11, 0));
  cake.add(mesh(flatTorus(0.098, 0.013, 4, 16), matte('#f5c3cf'), 0, 0.195, 0));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    const b = mesh(ball(0.022, 7, 5), stdMat('strawberry', { color: '#e2435a', roughness: 0.4 }), Math.cos(a) * 0.045, 0.21, Math.sin(a) * 0.045);
    b.scale.set(1, 1.25, 1);
    cake.add(b);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    cake.add(mesh(ball(0.018, 6, 4), matte('#fffaf2'), Math.cos(a) * 0.14, 0.012, Math.sin(a) * 0.14));
  }
  g.add(cake);
  // pyramide de macarons
  const tower = new THREE.Group();
  tower.position.set(0.02, 0, -0.08);
  let y = 0;
  [5, 4, 2, 1].forEach((n, li) => {
    const rr = [0.075, 0.06, 0.038, 0][li];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + li * 0.5;
      macaron(tower, Math.cos(a) * rr, y, Math.sin(a) * rr, MAC_COLORS[(i + li * 2) % MAC_COLORS.length]);
    }
    y += 0.045;
  });
  g.add(tower);
  return g;
}

function cartLow(): THREE.Group {
  const g = new THREE.Group();
  // tartelettes
  const fruits = ['#e2435a', '#f2b33a', '#7cb35a'];
  for (let i = 0; i < 3; i++) {
    const z = -0.3 + i * 0.2;
    g.add(mesh(lathe([[0, 0], [0.065, 0], [0.072, 0.02], [0.068, 0.026], [0.055, 0.02], [0, 0.02]], 12, 'npc:tart'), matte('#d9a05b'), 0.12, 0, z));
    g.add(mesh(cylinder(0.056, 0.056, 0.012, 12), stdMat(`fruit:${i}`, { color: fruits[i], roughness: 0.3 }), 0.12, 0.016, z));
  }
  // pile d'assiettes et macarons
  for (let i = 0; i < 3; i++) g.add(mesh(chamferCylinder(0.1, 0.09, 0.014, 0.005, 14), ceramic(PALETTE.ivory), -0.13, i * 0.016, 0.22));
  for (let i = 0; i < 4; i++) macaron(g, -0.13, 0, -0.22 + i * 0.07, MAC_COLORS[i], 0.9);
  return g;
}

function cartFrame(): THREE.Group {
  const g = new THREE.Group();
  const gold = satin(SATIN_GOLD);
  g.add(mesh(roundedBox(0.58, 0.035, 0.95, 0.014, 1), ceramic('#fbf3e8'), 0, 0.8, 0));
  g.add(mesh(roundedBox(0.56, 0.03, 0.9, 0.012, 1), ceramic(PALETTE.powder), 0, 0.36, 0));
  // jupe de velours festonnée sous le plateau
  const vel = velvet(PALETTE.roseDeep);
  g.add(mesh(box(0.6, 0.07, 0.02), vel, 0, 0.75, 0.47));
  g.add(mesh(box(0.6, 0.07, 0.02), vel, 0, 0.75, -0.47));
  g.add(mesh(box(0.02, 0.07, 0.95), vel, 0.295, 0.75, 0));
  g.add(mesh(box(0.02, 0.07, 0.95), vel, -0.295, 0.75, 0));
  for (let i = 0; i < 8; i++) {
    g.add(mesh(ball(0.022, 6, 4), vel, -0.26 + i * 0.075, 0.71, 0.475));
    g.add(mesh(ball(0.022, 6, 4), vel, -0.26 + i * 0.075, 0.71, -0.475));
  }
  // montants et pommeaux dorés
  for (const [x, z] of [
    [0.27, 0.44],
    [-0.27, 0.44],
    [0.27, -0.44],
    [-0.27, -0.44],
  ]) {
    g.add(mesh(cylinder(0.016, 0.016, 0.74, 8), gold, x, 0.1, z));
    g.add(mesh(ball(0.028, 8, 6), gold, x, 0.86, z));
    g.add(mesh(chamferCylinder(0.03, 0.035, 0.05, 0.01, 8), gold, x, 0.07, z));
  }
  // galerie dorée autour du plateau
  for (const sd of [1, -1]) {
    const rail = mesh(capsule(0.008, 0.86, 5, 1), gold, sd * 0.27, 0.86, 0);
    rail.rotation.x = Math.PI / 2;
    g.add(rail);
  }
  // poignée de poussée (arrière)
  const bar = mesh(capsule(0.017, 0.46, 6, 2), gold, 0, 0.95, -0.55);
  bar.rotation.z = Math.PI / 2;
  g.add(bar);
  for (const sd of [1, -1]) {
    const s = mesh(limb(0.012, 0.13, 5, 1), gold, sd * 0.25, 0.95, -0.55);
    s.rotation.x = -0.75;
    g.add(s);
  }
  return g;
}

export function buildCart(v: number): NpcModel {
  void v;
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  instantiate(bakeCached('npc:cartFrame', cartFrame), body);
  const top = new THREE.Group();
  top.position.y = 0.818;
  instantiate(bakeCached('npc:cartTop', cartTop), top);
  body.add(top);
  // cloche d'argent (couvercle qui tressaute)
  const lid = new THREE.Group();
  lid.position.set(-0.03, 0.818, -0.33);
  lid.add(mesh(lathe([[0, 0], [0.11, 0], [0.105, 0.03], [0.08, 0.075], [0.04, 0.1], [0, 0.105]], 16, 'npc:cloche'), satin(SATIN_SILVER, 0.4, 0.22)));
  lid.add(mesh(ball(0.016, 10, 8), satin(SATIN_GOLD), 0, 0.115, 0));
  body.add(lid);
  body.add(mesh(chamferCylinder(0.12, 0.12, 0.006, 0.002, 22), satin(SATIN_SILVER), -0.03, 0.815, -0.33));
  const low = new THREE.Group();
  low.position.y = 0.375;
  instantiate(bakeCached('npc:cartLow', cartLow), low);
  body.add(low);
  // roues (axe X, roulent selon Z)
  const wheels: THREE.Group[] = [];
  for (const [x, z] of [
    [0.27, 0.4],
    [-0.27, 0.4],
    [0.27, -0.4],
    [-0.27, -0.4],
  ]) {
    const w = new THREE.Group();
    w.position.set(x, 0.07, z);
    const tire = mesh(torus(0.052, 0.018, 5, 12), matte('#3d2a22'));
    tire.rotation.y = Math.PI / 2;
    w.add(tire);
    const hub = mesh(cylinder(0.04, 0.04, 0.02, 10), satin(SATIN_GOLD), 0, 0, 0);
    hub.rotation.z = Math.PI / 2;
    hub.position.x = -0.01;
    w.add(hub);
    for (let i = 0; i < 3; i++) {
      const sp = mesh(box(0.012, 0.075, 0.012), satin(SATIN_GOLD), 0.012, 0, 0);
      sp.rotation.x = (i / 3) * Math.PI;
      w.add(sp);
    }
    bakeInPlace(w);
    group.add(w);
    wheels.push(w);
  }
  let roll = 0;
  let lidHop = 0;
  let lidV = 0;

  return {
    group,
    top: 1.05,
    hand: null,
    nominalSpeed: 2.2,
    update(c: NpcCtx) {
      const t = c.time;
      const moving = c.action === 'roll' || c.action === 'walk' || c.action === 'leave' || c.action === 'calmed';
      const spd = moving ? c.spd : 0;
      roll += (spd * c.dt) / 0.07;
      for (const w of wheels) w.rotation.x = roll;
      const k = clamp01(spd / 2.5);
      // cliquetis : petites secousses, plateaux qui vibrent
      body.position.y = Math.abs(Math.sin(t * 19)) * 0.01 * k;
      body.rotation.z = Math.sin(t * 13) * 0.012 * k + (c.action === 'stunned' ? Math.sin(t * 9) * 0.05 : 0);
      body.rotation.x = Math.sin(t * 7.3) * 0.008 * k - clamp(c.turn * 0.01, -0.05, 0.05);
      top.rotation.y = Math.sin(t * 11) * 0.01 * k;
      top.position.x = Math.sin(t * 15) * 0.004 * k;
      low.position.x = Math.sin(t * 13 + 1) * 0.003 * k;
      // le couvercle tressaute sur les pavés
      if (k > 0.1 && Math.sin(t * 6.1) > 0.97) lidV += 1.2 * k;
      lidV += (-lidHop * 300 - lidV * 12) * c.dt;
      lidHop = Math.max(0, lidHop + lidV * c.dt);
      lid.position.y = 0.818 + lidHop;
      lid.rotation.z = lidHop * 2;
    },
  };
}

// ─────────────────────────────────────────── Caniche royal

const FURS = [
  ['#fbf5ee', '#f3e3da', PALETTE.rose],
  ['#f2cfa6', '#e6bb92', PALETTE.rose],
  ['#d8d3cf', '#c9c3bf', PALETTE.lavender],
  ['#3b3338', '#4a4046', '#f49ac1'],
] as const;

export function buildPoodle(v: number): NpcModel {
  const [fur, skin, bowC] = FURS[v % FURS.length];
  const furM = matte(fur);
  const skinM = matte(skin);
  const group = new THREE.Group();
  const lift = new THREE.Group(); // saut (hauteur)
  group.add(lift);
  const stretch = new THREE.Group(); // étirement / tangage autour du centre du corps
  stretch.position.y = 0.3;
  lift.add(stretch);
  const body = new THREE.Group();
  body.position.y = -0.3;
  stretch.add(body);

  // corps fin, crinière, pompons de hanches
  const torsoM = mesh(capsule(0.06, 0.2, 10), skinM, 0, 0.3, 0);
  torsoM.rotation.x = Math.PI / 2;
  body.add(torsoM);
  body.add(mesh(puffGeo(0.125, 7, 1), furM, 0, 0.33, 0.08));
  for (const sd of [1, -1]) body.add(mesh(puffGeo(0.07, 5, 2), furM, sd * 0.05, 0.32, -0.13));
  // pattes : pivots aux épaules / hanches
  const legs: THREE.Group[] = [];
  for (const [x, z] of [
    [0.055, 0.1],
    [-0.055, 0.1],
    [0.055, -0.12],
    [-0.055, -0.12],
  ]) {
    const l = new THREE.Group();
    l.position.set(x, 0.27, z);
    l.add(mesh(limb(0.019, 0.2, 6), skinM));
    l.add(mesh(puffGeo(0.042, 5, 3), furM, 0, -0.17, 0));
    l.add(mesh(ball(0.026, 8, 6), furM, 0, -0.235, 0.012));
    body.add(l);
    legs.push(l);
  }
  // queue à pompon
  const tail = new THREE.Group();
  tail.position.set(0, 0.35, -0.16);
  const tl = mesh(limb(0.013, 0.08, 6), skinM);
  tl.rotation.x = Math.PI * 0.78;
  tail.add(tl);
  tail.add(mesh(puffGeo(0.05, 5, 4), furM, 0, 0.075, -0.055));
  body.add(tail);
  // cou et tête
  const head = new THREE.Group();
  head.position.set(0, 0.36, 0.12);
  body.add(head);
  const neck = mesh(limb(0.04, 0.08, 8), furM, 0, 0.08, 0.0);
  head.add(neck);
  const hd = new THREE.Group();
  hd.position.set(0, 0.11, 0.02);
  head.add(hd);
  hd.add(mesh(sphere(0.07, 16, 12), skinM));
  hd.add(mesh(puffGeo(0.07, 6, 5), furM, 0, 0.075, -0.01));
  const snout = mesh(capsule(0.03, 0.05, 8), skinM, 0, -0.018, 0.075);
  snout.rotation.x = Math.PI / 2 - 0.15;
  hd.add(snout);
  hd.add(mesh(ball(0.017, 8, 6), ceramic('#2b2230'), 0, -0.01, 0.125));
  const eyes = new THREE.Group();
  for (const sd of [1, -1]) eyes.add(mesh(ball(0.012, 8, 6), ceramic('#2b2230'), sd * 0.034, 0.018, 0.058));
  hd.add(eyes);
  const tongue = mesh(sphere(0.016, 8, 6), matte('#f28aa0'), 0, -0.045, 0.1);
  tongue.scale.set(1, 0.5, 1.4);
  hd.add(tongue);
  const ears: THREE.Group[] = [];
  for (const sd of [1, -1]) {
    const e = new THREE.Group();
    e.position.set(sd * 0.062, 0.03, -0.005);
    const ep = mesh(puffGeo(0.048, 5, 6 + (sd > 0 ? 0 : 1)), furM, 0, -0.055, 0);
    ep.scale.set(0.75, 1.25, 0.85);
    e.add(ep);
    hd.add(e);
    ears.push(e);
  }
  // nœud rose et collier doré
  const bow = new THREE.Group();
  bow.position.set(0, 0.13, 0.0);
  bow.rotation.z = 0.2;
  const bm = matte(bowC);
  for (const sd of [1, -1]) {
    const lobe = mesh(sphere(0.03, 10, 8), bm, sd * 0.03, 0, 0);
    lobe.scale.set(1.2, 0.8, 0.5);
    lobe.rotation.z = sd * 0.3;
    bow.add(lobe);
  }
  bow.add(mesh(ball(0.014), bm));
  hd.add(bow);
  const collar = mesh(flatTorus(0.045, 0.011, 6, 20), satin(SATIN_GOLD), 0, 0.03, 0.01);
  collar.rotation.x = 0.4;
  head.add(collar);
  const medal = mesh(chamferCylinder(0.016, 0.016, 0.006, 0.002, 12), satin(SATIN_GOLD), 0, 0.005, 0.055);
  medal.rotation.x = Math.PI / 2 - 0.3;
  head.add(medal);

  let phase = 0;
  let walkW = 0;
  let land = 0;
  let landV = 0;
  const earA = [0, 0];
  const earV = [0, 0];
  let prevLift = 0;

  return {
    group,
    top: 0.62,
    hand: null,
    nominalSpeed: 2.6,
    update(c: NpcCtx) {
      const t = c.time;
      const moving = c.action === 'walk' || ((c.action === 'leave' || c.action === 'calmed') && c.spd > 0.25);
      walkW = damp(walkW, moving ? 1 : 0, 9, c.dt);
      if (walkW > 0.01) phase += c.dt * TAU * (1.6 + 1.6 * clamp01(c.spd / 3));
      // réinitialisation
      for (const l of legs) l.rotation.set(0, 0, 0);
      body.rotation.set(0, 0, 0);
      body.position.set(0, -0.3, 0);
      stretch.rotation.set(0, 0, 0);
      stretch.scale.set(1, 1, 1);
      head.rotation.set(0, 0, 0);
      hd.rotation.set(0, 0, 0);
      lift.position.y = 0;
      tongue.visible = false;
      eyes.scale.set(1, 1, 1);
      let wag = Math.sin(t * 9) * 0.35;
      // trot (paires diagonales)
      const s = Math.sin(phase);
      legs[0].rotation.x = -s * 0.55 * walkW;
      legs[3].rotation.x = -s * 0.55 * walkW;
      legs[1].rotation.x = s * 0.55 * walkW;
      legs[2].rotation.x = s * 0.55 * walkW;
      lift.position.y += Math.abs(Math.cos(phase)) * 0.03 * walkW;
      head.rotation.x += Math.cos(phase * 2) * 0.05 * walkW;
      if (walkW > 0.3) wag = Math.sin(t * 16) * 0.45;

      switch (c.action) {
        case 'crouch': {
          // se ramasse, arrière-train qui frétille
          const k = smoothstep(0, 0.4, c.at) * (0.7 + 0.3 * c.t);
          stretch.scale.set(1 + 0.08 * k, 1 - 0.22 * k, 1 + 0.05 * k);
          stretch.rotation.x = 0.18 * k;
          body.rotation.y = Math.sin(t * 22) * 0.12 * k;
          legs[0].rotation.x = -0.5 * k;
          legs[1].rotation.x = -0.5 * k;
          legs[2].rotation.x = 0.35 * k;
          legs[3].rotation.x = 0.35 * k;
          head.rotation.x = 0.25 * k;
          wag = Math.sin(t * 30) * 0.6;
          eyes.scale.set(1, 0.6, 1);
          break;
        }
        case 'leap': {
          // bond en arc (hauteur selon actionT), étiré dans l'élan
          const u = clamp01(c.t);
          lift.position.y = 4 * 0.5 * u * (1 - u);
          stretch.rotation.x = THREE.MathUtils.lerp(-0.5, 0.45, u);
          const st = Math.sin(Math.PI * u);
          stretch.scale.set(1 - 0.1 * st, 1 - 0.12 * st, 1 + 0.3 * st);
          legs[0].rotation.x = -1.0 * st;
          legs[1].rotation.x = -1.0 * st;
          legs[2].rotation.x = 0.9 * st;
          legs[3].rotation.x = 0.9 * st;
          tongue.visible = true;
          wag = 0.6;
          break;
        }
        case 'stunned':
        case 'calmed':
        case 'idle':
        case 'sit': {
          if (moving) break;
          // assis : arrière-train au sol, poitrail dressé
          const k = smoothstep(0, 0.3, c.at);
          stretch.rotation.x = -0.42 * k;
          body.position.y = -0.3 - 0.06 * k;
          legs[0].rotation.x = 0.42 * k;
          legs[1].rotation.x = 0.42 * k;
          legs[2].rotation.x = -1.1 * k;
          legs[3].rotation.x = -1.1 * k;
          head.rotation.x = 0.3 * k;
          if (c.action === 'stunned') {
            hd.rotation.z = Math.sin(t * 5) * 0.3;
            hd.rotation.x = Math.cos(t * 5) * 0.15;
            eyes.scale.set(1.2, 0.3, 1);
            wag = 0;
          } else if (c.action === 'calmed') {
            tongue.visible = true;
            wag = Math.sin(t * 20) * 0.55;
            hd.rotation.z = Math.sin(t * 2) * 0.15;
          } else {
            // curiosité : tête penchée, reniflements
            hd.rotation.z = Math.sin(t * 0.9) * 0.25;
            head.rotation.y = Math.sin(t * 0.6) * 0.4;
            hd.position.z = 0.02 + Math.max(0, Math.sin(t * 9)) * 0.004;
          }
          break;
        }
      }
      // atterrissage : squash élastique
      if (c.prev === 'leap' && c.at < c.dt * 1.5) landV -= 3.5;
      landV += (-land * 260 - landV * 12) * c.dt;
      land += landV * c.dt;
      stretch.scale.y *= 1 + land;
      stretch.scale.x *= 1 - land * 0.5;
      stretch.scale.z *= 1 - land * 0.5;
      tail.rotation.z = wag;
      tail.rotation.x = c.action === 'leave' ? -0.3 : 0;
      // oreilles à ressort (suivent la vitesse verticale)
      const vy = c.dt > 0 ? (lift.position.y - prevLift) / c.dt : 0;
      prevLift = lift.position.y;
      for (let i = 0; i < 2; i++) {
        const target = clamp(vy * 0.5, -0.9, 0.9) + (c.action === 'leap' ? 0.6 : 0) + walkW * Math.sin(phase * 2 + i) * 0.15;
        earV[i] += ((target - earA[i]) * 140 - earV[i] * 9) * c.dt;
        earA[i] += earV[i] * c.dt;
        ears[i].rotation.x = earA[i];
        ears[i].rotation.z = (i === 0 ? 1 : -1) * (0.1 + Math.abs(earA[i]) * 0.3);
      }
    },
  };
}

// ─────────────────────────────────────────── Robot cireur

export function buildPolisher(v: number): NpcModel {
  const shell = pick([PALETTE.cream, PALETTE.blush, PALETTE.mint], hash01(v, 3));
  const group = new THREE.Group();
  const bodyG = new THREE.Group();
  group.add(bodyG);
  // disque brosse (tourne)
  const brush = new THREE.Group();
  brush.position.y = 0.012;
  brush.add(mesh(chamferCylinder(0.31, 0.31, 0.034, 0.01, 32), matte(PALETTE.sage)));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const n = mesh(roundedBox(0.05, 0.028, 0.03, 0.008), matte(i % 2 ? '#e9e1d4' : PALETTE.sageDeep), Math.cos(a) * 0.3, 0.017, Math.sin(a) * 0.3);
    n.rotation.y = -a;
    brush.add(n);
  }
  group.add(brush);
  // coque bombée, pare-chocs, bandeau doré
  bodyG.add(
    mesh(
      lathe(
        [
          [0, 0.05],
          [0.28, 0.05],
          [0.295, 0.08],
          [0.285, 0.15],
          [0.24, 0.225],
          [0.15, 0.27],
          [0, 0.285],
        ],
        32,
        'npc:polisher',
      ),
      ceramic(shell),
    ),
  );
  bodyG.add(mesh(flatTorus(0.285, 0.03, 8, 36), matte(PALETTE.roseDeep), 0, 0.08, 0));
  bodyG.add(mesh(flatTorus(0.284, 0.011, 5, 40), satin(SATIN_GOLD), 0, 0.15, 0));
  // visière et yeux lumineux
  const visor = mesh(sphere(0.12, 18, 12), ceramic('#2a2433'), 0, 0.205, 0.19);
  visor.scale.set(1.35, 0.6, 0.5);
  visor.rotation.x = -0.55;
  bodyG.add(visor);
  const face = new THREE.Group();
  face.position.set(0, 0.238, 0.246);
  face.rotation.x = -0.55;
  bodyG.add(face);
  const eyeM = glow('#8ff0d4', 1.6);
  const eyes = new THREE.Group();
  for (const sd of [1, -1]) {
    const e = mesh(capsule(0.016, 0.02, 6), eyeM, sd * 0.05, 0, 0);
    e.castShadow = false;
    eyes.add(e);
  }
  face.add(eyes);
  const hearts = new THREE.Group();
  for (const sd of [1, -1]) {
    const h = mesh(heartGeo(0.05, 0.012), glow('#ff8fb1', 1.4), sd * 0.05, 0, 0.004);
    h.castShadow = false;
    hearts.add(h);
  }
  hearts.visible = false;
  face.add(hearts);
  const dizzy = new THREE.Group();
  for (const sd of [1, -1]) dizzy.add(mesh(torus(0.018, 0.006, 5, 14), eyeM, sd * 0.05, 0, 0.003));
  dizzy.visible = false;
  face.add(dizzy);
  // antenne à ressort + voyant
  const ant = new THREE.Group();
  ant.position.set(0, 0.28, -0.06);
  const stick = mesh(limb(0.008, 0.12, 6), satin(SATIN_GOLD));
  stick.rotation.x = Math.PI;
  ant.add(stick);
  const bulbOn = mesh(ball(0.026, 10, 8), glow('#ff6f91', 2.2), 0, 0.13, 0);
  const bulbOff = mesh(ball(0.026, 10, 8), matte('#b85a70'), 0, 0.13, 0);
  ant.add(bulbOn, bulbOff);
  bodyG.add(ant);
  // éclats de cire brillante
  const shine = new Twinkles(4, '#ffffff', 0.34, 0.1, 0.09);
  group.add(shine.group);

  let spin = 0;
  let antX = 0;
  let antXv = 0;
  let antZ = 0;
  let antZv = 0;
  let sq = 0;
  let sqv = 0;
  let prevTurn = 0;

  return {
    group,
    top: 0.5,
    hand: null,
    nominalSpeed: 2.4,
    update(c: NpcCtx) {
      const t = c.time;
      const moving = c.action !== 'idle' && c.action !== 'stunned' && c.action !== 'sit';
      const k = moving ? clamp01(c.spd / 2.4) : 0;
      spin += c.dt * (c.action === 'stunned' ? 2 : 6 + 16 * k);
      brush.rotation.y = spin;
      bodyG.position.y = Math.abs(Math.sin(t * 21)) * 0.006 * (0.3 + k);
      bodyG.rotation.x = 0.07 * k;
      // rebond : virage brusque → squash + antenne qui fouette
      const dTurn = Math.abs(c.turn - prevTurn);
      prevTurn = c.turn;
      if (dTurn > 6) {
        sqv -= 2.2;
        antZv += (Math.random() - 0.5) * 30;
      }
      sqv += (-sq * 300 - sqv * 12) * c.dt;
      sq += sqv * c.dt;
      bodyG.scale.set(1 - sq * 0.6, 1 + sq, 1 - sq * 0.6);
      antXv += ((-0.35 * k - antX) * 120 - antXv * 6) * c.dt;
      antX += antXv * c.dt;
      antZv += ((clamp(c.turn * 0.05, -0.4, 0.4) - antZ) * 120 - antZv * 6) * c.dt;
      antZ += antZv * c.dt;
      ant.rotation.set(antX + Math.sin(t * 7) * 0.04, 0, antZ);
      const on = Math.sin(t * TAU * (c.action === 'stunned' ? 6 : 1.4)) > 0;
      bulbOn.visible = on;
      bulbOff.visible = !on;
      // expressions
      eyes.visible = c.action !== 'calmed' && c.action !== 'stunned';
      hearts.visible = c.action === 'calmed';
      dizzy.visible = c.action === 'stunned';
      dizzy.rotation.z = t * 8;
      const blink = (t % 3.2) < 0.12 ? 0.15 : 1;
      eyes.scale.set(1, blink, 1);
      hearts.scale.setScalar(1 + Math.sin(t * 8) * 0.12);
      if (c.action === 'stunned') {
        bodyG.rotation.z = Math.sin(t * 6) * 0.08;
        bodyG.rotation.x = Math.cos(t * 6) * 0.06;
      } else bodyG.rotation.z = 0;
      shine.update(c.dt, t, moving && k > 0.2);
    },
  };
}
