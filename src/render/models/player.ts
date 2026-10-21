/**
 * La Duchesse en personne : robe à crinoline plissée ivoire bordée de velours bordeaux et d'or,
 * corset royal à décolleté carré gansé d'or, manches ballons, chignon haut châtain couronné de son
 * diadème serti de rubis… et le grand plateau d'argent porté à hauteur d'épaule.
 * Animation 100 % procédurale pilotée par PlayerViewState :
 * marche élastique, inclinaison dans la vitesse, plateau qui penche et vacille, Pas Chassé (étirement,
 * fantômes), choc, étourdissement, glissade, chute dans la trappe, Passe-Partout, Grâce, cloche.
 */
import * as THREE from 'three';
import type { View } from '../api';
import type { DishId, PlayerViewState } from '../../types';
import { PALETTE, angleDelta, ceramic, chamferCylinder, disposeTree, mesh, roundedBox, sphere, spring, torus, velvet, matte } from '../kit';
import {
  InstanceMats,
  StarRing,
  TAU,
  Twinkles,
  ball,
  basicFx,
  bump,
  capsule,
  canvasTex,
  cgeo,
  clamp,
  clamp01,
  disc,
  easeInCubic,
  easeOutCubic,
  easeOutElastic,
  flatTorus,
  glowTex,
  partSphere,
  SATIN_GOLD,
  SATIN_SILVER,
  satin,
  smoothstep,
  stdMat,
  wobble,
} from './common';
import { type Figure, aimArm, buildFigure, compactFigure, resetPose, walkCycle } from './figure';
import { createDishMesh } from './dishes';

// ─────────────────────────────────────────── Silhouette de La Duchesse

const DUCHESS_BURGUNDY = '#581c34';
const DUCHESS_BURGUNDY_DEEP = '#3e1123';
const DUCHESS_RUBY = '#8c1d3b';
const DUCHESS_CREAM = '#f6eee0';
const DUCHESS_SKIN = '#f5d8c6';
const DUCHESS_HAIR = '#523022';

/** Jupe à crinoline plissée (profil cloche + godets verticaux tout autour). */
function pleatedSkirtGeo(hipY: number, yBotOff: number, yTop: number, rScale = 1, pleats = 20): THREE.BufferGeometry {
  const key = `duchess:skirt:${hipY}:${yBotOff}:${yTop}:${rScale}:${pleats}`;
  return cgeo(key, () => {
    const yBot = -hipY + yBotOff;
    const rows = 18;
    const cols = 80;
    const pos: number[] = [];
    const idx: number[] = [];
    const profileR = (t: number): number => {
      // t = 0 en bas (ourlet), t = 1 en haut (taille)
      const bell = 0.195 + (1 - t) * 0.185 + Math.sin((1 - t) * Math.PI * 0.82) * 0.042;
      return bell * rScale;
    };
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      const y = yBot + (yTop - yBot) * t;
      const baseR = profileR(t);
      const pleatAmp = 0.011 * (1 - t * 0.65) * rScale;
      for (let j = 0; j <= cols; j++) {
        const a = (j / cols) * TAU;
        // légère ampleur de crinoline sur les hanches et l'arrière
        const crinoline = 1 + 0.045 * Math.sin(a) * Math.sin(a) + (Math.cos(a) < 0 ? -0.025 * Math.cos(a) : 0);
        const flute = Math.cos(a * pleats) * pleatAmp;
        const r = baseR * crinoline + flute;
        pos.push(Math.sin(a) * r, y, Math.cos(a) * r);
      }
    }
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const p = i * (cols + 1) + j;
        const q = p + cols + 1;
        idx.push(p, p + 1, q, q, p + 1, q + 1);
      }
    }
    // fermeture du dessous de la jupe
    const botCenter = pos.length / 3;
    pos.push(0, yBot, 0);
    for (let j = 0; j < cols; j++) {
      idx.push(botCenter, j + 1, j);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  });
}

/** Bandeau annulaire épousant le bas de la jupe à crinoline (bordure bordeaux et galons dorés). */
function skirtBandGeo(hipY: number, y0Off: number, y1Off: number, rOut: number, pleats = 20): THREE.BufferGeometry {
  const key = `duchess:band:${hipY}:${y0Off}:${y1Off}:${rOut}:${pleats}`;
  return cgeo(key, () => {
    const yBot = -hipY + 0.014;
    const yTop = 0.14;
    const y0 = -hipY + y0Off;
    const y1 = -hipY + y1Off;
    const rows = 5;
    const cols = 80;
    const pos: number[] = [];
    const idx: number[] = [];
    const profileR = (t: number): number => 0.195 + (1 - t) * 0.185 + Math.sin((1 - t) * Math.PI * 0.82) * 0.042;
    for (let i = 0; i <= rows; i++) {
      const y = y0 + ((y1 - y0) * i) / rows;
      const t = clamp01((y - yBot) / (yTop - yBot));
      const baseR = profileR(t) * rOut;
      const pleatAmp = 0.011 * (1 - t * 0.65) * rOut;
      for (let j = 0; j <= cols; j++) {
        const a = (j / cols) * TAU;
        const crinoline = 1 + 0.045 * Math.sin(a) * Math.sin(a) + (Math.cos(a) < 0 ? -0.025 * Math.cos(a) : 0);
        const r = baseR * crinoline + Math.cos(a * pleats) * pleatAmp;
        pos.push(Math.sin(a) * r, y, Math.cos(a) * r);
      }
    }
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const p = i * (cols + 1) + j;
        const q = p + cols + 1;
        idx.push(p, p + 1, q, q, p + 1, q + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  });
}

/** Pièce épousant le buste entre y0 et y1 sur l'intervalle angulaire [a(y), b(y)]. */
function bustPatchGeo(
  key: string,
  T: number,
  y0: number,
  y1: number,
  a: (y: number) => number,
  b: (y: number) => number,
  out: number,
  rows = 10,
  cols = 10,
): THREE.BufferGeometry {
  return cgeo(`duchess:bpatch:${key}:${rows}:${cols}`, () => {
    const profile: [number, number][] = [
      [0, -0.075],
      [0.17, -0.075],
      [0.203, -0.04],
      [0.212, 0.04],
      [0.2, 0.15],
      [0.214, T * 0.6],
      [0.205, T * 0.8],
      [0.158, T * 0.93],
      [0.08, T * 0.99],
      [0, T + 0.004],
    ];
    const radiusAt = (y: number): number => {
      for (let i = 1; i < profile.length; i++) {
        const [r1, py1] = profile[i];
        const [r0, py0] = profile[i - 1];
        if (y <= py1 && y >= py0) return r0 + ((r1 - r0) * (y - py0)) / Math.max(1e-4, py1 - py0);
      }
      return 0.2;
    };
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= rows; i++) {
      const y = y0 + ((y1 - y0) * i) / rows;
      const r = radiusAt(y) * out;
      const pa = a(y);
      const pb = b(y);
      for (let j = 0; j <= cols; j++) {
        const ph = pa + ((pb - pa) * j) / cols;
        pos.push(Math.sin(ph) * r, y, Math.cos(ph) * r);
      }
    }
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const p = i * (cols + 1) + j;
        const q = p + cols + 1;
        idx.push(p, p + 1, q, q, p + 1, q + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  });
}

/**
 * Construit le modèle 3D complet de La Duchesse (utilisé en jeu et pour le portrait de la Garde-robe).
 */
export function buildDuchessFigure(): { fig: Figure; tails: THREE.Group[] } {
  const fig = buildFigure({
    outfit: 'plain',
    top: DUCHESS_BURGUNDY,
    velvetTop: true,
    sleeves: DUCHESS_SKIN,
    hands: DUCHESS_SKIN,
    bottom: '#fffaf2',
    shoes: DUCHESS_BURGUNDY_DEEP,
    hairStyle: 'bald',
    hair: DUCHESS_HAIR,
    skin: DUCHESS_SKIN,
    blush: true,
    nose: 'button',
    detail: 2,
    hipY: 0.31,
    torsoH: 0.45,
  });

  const f = fig;
  const T = f.torsoH;
  const R = f.headR;
  const hc = f.headC;
  const velvetBurgundy = velvet(DUCHESS_BURGUNDY);
  const velvetDeep = velvet(DUCHESS_BURGUNDY_DEEP);
  const rubyMat = ceramic(DUCHESS_RUBY);
  const creamMat = stdMat('duchess:cream', { color: DUCHESS_CREAM, roughness: 0.58 });
  const skinMat = matte(DUCHESS_SKIN);
  const goldMat = satin(SATIN_GOLD);
  const hairMat = stdMat('duchess:hair', { color: DUCHESS_HAIR, roughness: 0.38 });
  const hairDarkMat = stdMat('duchess:hairDark', { color: '#412418', roughness: 0.42 });

  // ── 1. Jupe royale plissée ivoire à bordure bordeaux et galons d'or
  const skirtGroup = new THREE.Mesh(pleatedSkirtGeo(f.hipY, 0.014, 0.14, 1, 20), creamMat);
  // Bande bordeaux en bas de la robe + double galon doré
  skirtGroup.add(mesh(skirtBandGeo(f.hipY, 0.015, 0.088, 1.006, 20), velvetBurgundy));
  skirtGroup.add(mesh(skirtBandGeo(f.hipY, 0.084, 0.104, 1.012, 20), goldMat));
  skirtGroup.add(mesh(skirtBandGeo(f.hipY, 0.014, 0.025, 1.012, 20), goldMat));
  skirtGroup.userData.keep = true;
  f.hips.add(skirtGroup);
  (f as { skirt: THREE.Mesh | null }).skirt = skirtGroup;

  // ── 2. Corset en velours bordeaux, décolleté carré/cœur et basque en pointe
  // Décolleté dévoilant le haut du buste (peau)
  const decBot = T * 0.58;
  const decTop = T * 0.99;
  const decAngle = (y: number): number => {
    const k = clamp01((y - decBot) / (decTop - decBot));
    return 0.36 + 0.18 * Math.sin(k * Math.PI * 0.65);
  };
  f.hips.add(mesh(bustPatchGeo('decollete', T, decBot, decTop, (y) => -decAngle(y), (y) => decAngle(y), 1.018, 10, 10), skinMat));
  // Galon d'or encadrant le décolleté (bord inférieur + bretelles)
  f.hips.add(
    mesh(
      bustPatchGeo(
        'decTrimBot',
        T,
        decBot - 0.028,
        decBot + 0.012,
        () => -0.44,
        () => 0.44,
        1.03,
        4,
        10,
      ),
      goldMat,
    ),
  );
  for (const sd of [1, -1]) {
    f.hips.add(
      mesh(
        bustPatchGeo(
          `decStrap:${sd}`,
          T,
          decBot - 0.01,
          decTop,
          (y) => (sd > 0 ? decAngle(y) - 0.04 : -decAngle(y) - 0.11),
          (y) => (sd > 0 ? decAngle(y) + 0.11 : -decAngle(y) + 0.04),
          1.028,
          8,
          4,
        ),
        goldMat,
      ),
    );
  }
  // Bijou de corsage (cabochon rubis serti d'or au creux du décolleté)
  f.hips.add(mesh(ball(0.022, 10, 8), goldMat, 0, decBot - 0.008, 0.218));
  f.hips.add(mesh(ball(0.015, 8, 6), rubyMat, 0, decBot - 0.008, 0.228));

  // Baleines dorées sur l'avant du corset et basque en pointe à la taille
  for (const sd of [1, -1]) {
    f.hips.add(
      mesh(
        bustPatchGeo(
          `corsetSeam:${sd}`,
          T,
          0.08,
          decBot - 0.02,
          () => sd * 0.22 - 0.03,
          () => sd * 0.22 + 0.03,
          1.024,
          6,
          3,
        ),
        goldMat,
      ),
    );
  }
  // Basque en V sur le devant de la taille
  const basque = new THREE.Group();
  basque.position.set(0, 0.11, 0.205);
  const bPlate = mesh(roundedBox(0.17, 0.16, 0.03, 0.012), velvetBurgundy, 0, 0, 0);
  bPlate.rotation.z = Math.PI / 4;
  bPlate.scale.set(0.82, 0.82, 1);
  basque.add(bPlate);
  const bGold = mesh(roundedBox(0.19, 0.18, 0.024, 0.012), goldMat, 0, -0.004, -0.003);
  bGold.rotation.z = Math.PI / 4;
  bGold.scale.set(0.82, 0.82, 1);
  basque.add(bGold);
  f.hips.add(basque);
  // Ceinture dorée soulignant la taille
  f.hips.add(mesh(flatTorus(0.206, 0.013, 6, 32), goldMat, 0, 0.135, 0));

  // ── 3. Pans drapés latéraux en velours bordeaux (animés par ressorts)
  const tails: THREE.Group[] = [];
  for (const sd of [1, -1]) {
    const tail = new THREE.Group();
    tail.position.set(sd * 0.2, 0.11, -0.02);
    // Pan drapé bouffant sur la hanche
    const puff = mesh(sphere(0.11, 14, 10), velvetBurgundy, sd * 0.045, -0.07, 0);
    puff.scale.set(0.68, 1.35, 1.15);
    puff.rotation.z = -sd * 0.26;
    tail.add(puff);
    // Pan tombant bordé d'or
    const drape = mesh(roundedBox(0.045, 0.25, 0.17, 0.018), velvetDeep, sd * 0.068, -0.15, -0.02);
    drape.rotation.z = -sd * 0.22;
    tail.add(drape);
    const goldEdge = mesh(roundedBox(0.05, 0.258, 0.18, 0.018), goldMat, sd * 0.064, -0.152, -0.02);
    goldEdge.rotation.z = -sd * 0.22;
    tail.add(goldEdge);
    // Rosette dorée à la taille
    tail.add(mesh(ball(0.022, 8, 6), goldMat, sd * 0.025, 0.01, 0.05));
    tail.userData.keep = true;
    f.hips.add(tail);
    tails.push(tail);
  }

  // ── 4. Manches ballons bordeaux & poignets dorés
  for (const [arm, sd] of [
    [f.armL, 1],
    [f.armR, -1],
  ] as const) {
    const puff = mesh(sphere(0.078, 14, 10), velvetBurgundy, sd * 0.008, -0.048, 0);
    puff.scale.set(1.06, 1.15, 1.06);
    arm.add(puff);
    // Galon doré au bas de la manche ballon
    arm.add(mesh(flatTorus(0.058, 0.011, 6, 20), goldMat, 0, -0.105, 0));
    // Fin bracelet d'or au poignet
    arm.add(mesh(flatTorus(0.048, 0.007, 5, 16), goldMat, 0, -f.armLen + 0.022, 0));
  }

  // ── 5. Coiffure châtain de La Duchesse & Diadème royal serti de rubis
  // Calotte crânienne et volume arrière
  const capMesh = mesh(partSphere(R * 1.08, 0, TAU, 0, Math.PI * 0.58, 22, 12), hairMat, 0, hc + R * 0.02, -R * 0.04);
  capMesh.rotation.x = -0.38;
  f.head.add(capMesh);

  // Volumes latéraux et nuque souple
  for (const sd of [1, -1]) {
    const sideLock = mesh(sphere(R * 0.48, 14, 10), hairMat, sd * R * 0.78, hc + R * 0.06, -R * 0.12);
    sideLock.scale.set(0.68, 0.95, 1.08);
    sideLock.rotation.z = sd * 0.18;
    f.head.add(sideLock);

    // Bandeaux bouffants séparés au milieu du front (signature de La Duchesse)
    const frontSweep = mesh(sphere(R * 0.46, 16, 12), hairMat, sd * R * 0.44, hc + R * 0.56, R * 0.62);
    frontSweep.scale.set(1.22, 0.62, 0.86);
    frontSweep.rotation.set(0.32, -sd * 0.28, -sd * 0.42);
    f.head.add(frontSweep);

    const templeWave = mesh(sphere(R * 0.36, 14, 10), hairDarkMat, sd * R * 0.78, hc + R * 0.24, R * 0.42);
    templeWave.scale.set(0.65, 0.88, 0.92);
    templeWave.rotation.set(0.2, 0, -sd * 0.25);
    f.head.add(templeWave);

    // Boucles d'oreilles royales (perle d'or et goutte rubis)
    f.head.add(mesh(ball(0.015, 8, 6), goldMat, sd * R * 0.98, hc - R * 0.14, R * 0.08));
    f.head.add(mesh(ball(0.018, 8, 6), rubyMat, sd * R * 0.99, hc - R * 0.25, R * 0.08));
  }
  // Rouleau de nuque
  const nape = mesh(sphere(R * 0.52, 14, 10), hairDarkMat, 0, hc - R * 0.26, -R * 0.72);
  nape.scale.set(1.35, 0.75, 0.82);
  f.head.add(nape);

  // Grand chignon haut côtelé au sommet de la tête
  const bunY = hc + R * 1.15;
  const bunZ = -R * 0.1;
  const bunCore = mesh(sphere(R * 0.56, 18, 14), hairMat, 0, bunY, bunZ);
  bunCore.scale.set(1.12, 0.88, 1.04);
  f.head.add(bunCore);
  // Côtes sculptées du chignon
  const ribCount = 8;
  for (let i = 0; i < ribCount; i++) {
    const a = (i / ribCount) * TAU;
    const rib = mesh(sphere(R * 0.28, 12, 8), i % 2 === 0 ? hairMat : hairDarkMat, Math.sin(a) * R * 0.36, bunY - R * 0.02, bunZ + Math.cos(a) * R * 0.32);
    rib.scale.set(0.85, 1.12, 0.85);
    f.head.add(rib);
  }
  // Tresse / torsade à la base du chignon
  f.head.add(mesh(flatTorus(R * 0.52, 0.024, 7, 24), hairDarkMat, 0, hc + R * 0.86, bunZ));

  // Diadème doré (Tiare de La Duchesse) posé devant le chignon
  const tiara = new THREE.Group();
  tiara.position.set(0, hc + R * 0.84, R * 0.04);
  tiara.rotation.x = 0.18;
  // Arceau d'or ciselé
  const band = mesh(torus(R * 0.64, 0.018, 8, 28, Math.PI * 1.16), goldMat, 0, 0, 0);
  band.rotation.set(Math.PI / 2, 0, -Math.PI * 0.08);
  tiara.add(band);
  const bandUpper = mesh(torus(R * 0.62, 0.011, 6, 24, Math.PI * 1.08), goldMat, 0, 0.022, 0);
  bandUpper.rotation.set(Math.PI / 2, 0, -Math.PI * 0.04);
  tiara.add(bandUpper);
  // 5 fleurons / pointes en or sertis de rubis et sommés de perles d'or
  const peakAngles = [-0.96, -0.48, 0, 0.48, 0.96];
  const peakHeights = [0.046, 0.068, 0.095, 0.068, 0.046];
  for (let i = 0; i < peakAngles.length; i++) {
    const a = peakAngles[i];
    const h = peakHeights[i];
    const pr = R * 0.63;
    const px = Math.sin(a) * pr;
    const pz = Math.cos(a) * pr;
    const peak = mesh(capsule(0.013, h, 8, 4), goldMat, px, h * 0.5 + 0.01, pz);
    peak.rotation.y = a;
    peak.rotation.x = -0.08;
    tiara.add(peak);
    // Perle d'or au sommet de la pointe
    tiara.add(mesh(ball(i === 2 ? 0.017 : 0.013, 8, 6), goldMat, px * 1.02, h + 0.02, pz * 1.02));
    // Cabochon rubis/bordeaux à la base de chaque fleuron
    if (i >= 1 && i <= 3) {
      const gemR = i === 2 ? 0.019 : 0.014;
      tiara.add(mesh(ball(gemR * 1.22, 8, 6), goldMat, px * 1.03, 0.024, pz * 1.03));
      tiara.add(mesh(ball(gemR, 8, 6), rubyMat, px * 1.06, 0.024, pz * 1.06));
    }
  }
  f.head.add(tiara);

  return { fig, tails };
}

// ─────────────────────────────────────────── Réglages

const TRAY_R = 0.3;
/** Position du centre du plateau dans le repère des hanches (y monde ≈ 0.86). */
const TRAY_POS = new THREE.Vector3(-0.47, 0.56, 0.12);

/** Emplacements des plats sur le plateau selon la capacité (x, z) + échelle. */
function traySlots(cap: number): { pts: [number, number][]; scale: number } {
  const ring = (n: number, r: number, a0 = 0): [number, number][] =>
    Array.from({ length: n }, (_, i) => [Math.cos(a0 + (i / n) * TAU) * r, Math.sin(a0 + (i / n) * TAU) * r] as [number, number]);
  switch (Math.max(1, Math.min(6, cap))) {
    case 1:
      return { pts: [[0, 0]], scale: 1 };
    case 2:
      return { pts: [[0.132, 0], [-0.132, 0]], scale: 0.95 };
    case 3:
      return { pts: ring(3, 0.152, Math.PI / 2), scale: 0.86 };
    case 4:
      return { pts: ring(4, 0.162, Math.PI / 4), scale: 0.78 };
    case 5: {
      const r = ring(4, 0.188, Math.PI / 4);
      return { pts: [[0, 0], r[0], r[2], r[1], r[3]], scale: 0.68 };
    }
    default: {
      const r = ring(5, 0.192, Math.PI / 2);
      return { pts: [[0, 0], r[0], r[2], r[4], r[1], r[3]], scale: 0.66 };
    }
  }
}

function laceTex(): THREE.CanvasTexture {
  return canvasTex('lace', 256, (c, s) => {
    const m = s / 2;
    c.clearRect(0, 0, s, s);
    c.fillStyle = '#ffffff';
    // bord festonné
    c.beginPath();
    const N = 28;
    for (let i = 0; i <= N * 8; i++) {
      const a = (i / (N * 8)) * TAU;
      const r = m * (0.9 + 0.08 * Math.abs(Math.sin((a * N) / 2)));
      const x = m + Math.cos(a) * r;
      const y = m + Math.sin(a) * r;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.fill();
    // ajours
    c.globalCompositeOperation = 'destination-out';
    for (let ring = 0; ring < 3; ring++) {
      const rr = m * (0.78 - ring * 0.17);
      const n = 24 - ring * 6;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + ring * 0.2;
        c.beginPath();
        c.arc(m + Math.cos(a) * rr, m + Math.sin(a) * rr, m * (0.045 - ring * 0.008), 0, TAU);
        c.fill();
      }
    }
    c.beginPath();
    c.arc(m, m, m * 0.3, 0, TAU);
    c.fill();
    c.globalCompositeOperation = 'source-over';
  });
}

interface TrayDish {
  id: DishId;
  pivot: THREE.Group;
  t: number; // temps depuis l'apparition
  removing: number; // < 0 : présent ; ≥ 0 : temps depuis le retrait
  x: number;
  z: number;
  y: number;
  phase: number;
}

interface Ghost {
  obj: THREE.Object3D;
  nodes: THREE.Object3D[];
  mat: THREE.MeshBasicMaterial;
  world: THREE.Matrix4;
  age: number;
}

const GHOST_LIFE = 0.26;
const _inv = new THREE.Matrix4();

class PlayerView implements View<PlayerViewState> {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group(); // cap
  private readonly sink = new THREE.Group(); // chute
  private readonly lean = new THREE.Group(); // inclinaisons (pivot aux pieds)
  private readonly squash = new THREE.Group(); // squash & stretch
  private readonly fig: Figure;
  private readonly tails: THREE.Group[] = [];
  private readonly trayG = new THREE.Group();
  private readonly trayTilt = new THREE.Group();
  private readonly dishesG = new THREE.Group();
  private readonly mats: InstanceMats;
  private readonly stars: StarRing;
  private readonly aura = new THREE.Group();
  private readonly auraDisc: THREE.Mesh;
  private readonly auraTw: Twinkles;
  private readonly ghosts: Ghost[] = [];
  private readonly srcNodes: THREE.Object3D[] = [];

  private time = 0;
  private first = true;
  private heading = 0;
  private phase = 0;
  private walkW = 0;
  private vxPrev = 0;
  private vzPrev = 0;
  private accF = 0;
  private accS = 0;
  private leanX = 0;
  private leanXv = { v: 0 };
  private leanZ = 0;
  private leanZv = { v: 0 };
  private sq = 0;
  private sqv = { v: 0 };
  private tiltX = 0;
  private tiltXv = { v: 0 };
  private tiltZ = 0;
  private tiltZv = { v: 0 };
  private trayY = 0;
  private trayYv = { v: 0 };
  private tailX = [0, 0];
  private tailXv = [{ v: 0 }, { v: 0 }];
  private tailZ = [0, 0];
  private tailZv = [{ v: 0 }, { v: 0 }];
  private wasDashing = false;
  private dashW = 0;
  private ghostTimer = 0;
  private ghostNext = 0;
  private hitPrev = 0;
  private graceW = 0;
  private phaseW = 0;
  private slipW = 0;
  private stunW = 0;
  private trayKey = '';
  private readonly items: TrayDish[] = [];
  private capacity = 1;

  constructor() {
    this.root.name = 'player';
    this.root.add(this.body);
    this.body.add(this.sink);
    this.sink.add(this.lean);
    this.lean.add(this.squash);

    // ── Personnage : La Duchesse
    const { fig, tails } = buildDuchessFigure();
    this.fig = fig;
    this.tails.push(...tails);
    const f = this.fig;
    this.squash.add(f.root);
    const g = satin(SATIN_GOLD);
    compactFigure(f);

    // ── Plateau d'argent (tenu sur la main droite)
    this.trayG.position.copy(TRAY_POS);
    f.hips.add(this.trayG);
    this.trayG.add(this.trayTilt);
    const t = this.trayTilt;
    t.add(mesh(chamferCylinder(TRAY_R, TRAY_R - 0.02, 0.02, 0.008, 44), satin(SATIN_SILVER, 0.6, 0.25), 0, -0.02, 0));
    t.add(mesh(flatTorus(TRAY_R - 0.006, 0.011, 6, 48), g, 0, 0.0, 0));
    t.add(mesh(flatTorus(0.215, 0.0028, 4, 40), g, 0, 0.0015, 0));
    const lace = new THREE.Mesh(disc(0.25, 40), stdMat('lace', { map: laceTex(), alphaTest: 0.5, roughness: 0.85, color: '#fffaf4' }));
    lace.position.y = 0.0012;
    lace.receiveShadow = true;
    t.add(lace);
    this.dishesG.position.y = 0.002;
    t.add(this.dishesG);

    // ── Étoiles d'étourdissement
    this.stars = new StarRing(4, 0.22);
    this.stars.group.position.y = f.headC + f.headR + 0.12;
    f.head.add(this.stars.group);

    // ── Fantômes du Pas Chassé (clones du personnage, pose figée)
    this.lean.traverse((o) => this.srcNodes.push(o));
    for (let i = 0; i < 3; i++) {
      const obj = this.lean.clone(true);
      const mat = new THREE.MeshBasicMaterial({ color: '#ffb8cf', transparent: true, opacity: 0, depthWrite: true });
      const nodes: THREE.Object3D[] = [];
      obj.traverse((o) => {
        nodes.push(o);
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.material = mat;
          m.castShadow = false;
          m.receiveShadow = false;
        }
      });
      obj.matrixAutoUpdate = false;
      obj.visible = false;
      this.root.add(obj);
      this.ghosts.push({ obj, nodes, mat, world: new THREE.Matrix4(), age: GHOST_LIFE });
    }

    // ── Aura de Grâce Ducale
    this.auraDisc = new THREE.Mesh(
      disc(0.75, 40),
      new THREE.MeshBasicMaterial({ color: '#ffcf5a', map: glowTex(), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    this.auraDisc.position.y = 0.02;
    this.auraDisc.renderOrder = 2;
    this.aura.add(this.auraDisc);
    const ringM = new THREE.Mesh(flatTorus(0.55, 0.012, 4, 48), basicFx('#ffe08a', 0.7, true));
    ringM.position.y = 0.03;
    this.aura.add(ringM);
    this.auraTw = new Twinkles(7, '#ffe7a0', 0.42, 1.3, 0.14);
    this.aura.add(this.auraTw.group);
    this.aura.visible = false;
    this.body.add(this.aura);

    // matériaux par instance (teinte de choc, translucidité)
    this.mats = new InstanceMats(this.lean, (o) => o === this.stars.group || this.stars.group.children.includes(o));
  }

  update(s: PlayerViewState, dtRaw: number): void {
    const dt = Math.min(0.05, Math.max(0, dtRaw));
    this.time += dt;
    const time = this.time;
    const f = this.fig;

    // ── Position, cap, accélération
    this.root.position.set(s.x, 0, s.z);
    if (this.first) {
      this.heading = s.heading;
      this.vxPrev = s.vx;
      this.vzPrev = s.vz;
      this.first = false;
    }
    this.heading += angleDelta(this.heading, s.heading) * (1 - Math.exp(-(s.dashing ? 30 : 16) * dt));
    this.body.rotation.y = this.heading;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    if (dt > 0) {
      const ax = (s.vx - this.vxPrev) / dt;
      const az = (s.vz - this.vzPrev) / dt;
      this.accF = THREE.MathUtils.damp(this.accF, clamp(ax * fx + az * fz, -40, 40), 10, dt);
      this.accS = THREE.MathUtils.damp(this.accS, clamp(ax * fz - az * fx, -40, 40), 10, dt);
    }
    this.vxPrev = s.vx;
    this.vzPrev = s.vz;

    // ── Poids des états
    const dashCurve = s.dashing ? bump(Math.min(1, s.dashT * 1.15)) : 0;
    this.dashW = THREE.MathUtils.damp(this.dashW, s.dashing ? 1 : 0, s.dashing ? 25 : 8, dt);
    this.slipW = THREE.MathUtils.damp(this.slipW, s.slipping ? 1 : 0, 8, dt);
    this.stunW = THREE.MathUtils.damp(this.stunW, s.stunned ? 1 : 0, 8, dt);
    this.graceW = THREE.MathUtils.damp(this.graceW, s.grace ? 1 : 0, 4, dt);
    this.phaseW = THREE.MathUtils.damp(this.phaseW, s.phasing ? 1 : 0, 10, dt);
    const moving = clamp01(s.speed01);
    this.walkW = THREE.MathUtils.damp(this.walkW, smoothstep(0.03, 0.3, moving) * (1 - this.dashW) * (1 - this.slipW * 0.7), 10, dt);

    // événements
    if (s.dashing && !this.wasDashing) {
      this.tiltXv.v -= 5;
      this.sqv.v += 1.5;
      this.ghostTimer = 0;
    }
    if (!s.dashing && this.wasDashing) {
      this.sqv.v -= 3.2; // atterrissage du chassé : squash élastique
      this.tiltXv.v += 4;
    }
    this.wasDashing = s.dashing;
    if (s.hitT > this.hitPrev + 0.2) {
      this.sqv.v -= 3;
      this.tiltXv.v += (Math.random() - 0.5) * 14;
      this.tiltZv.v += (Math.random() - 0.5) * 14;
      this.leanXv.v -= 4;
    }
    this.hitPrev = s.hitT;

    // ── Cycle de marche
    this.phase += dt * TAU * (1.25 + 1.35 * moving) * (this.walkW > 0.01 ? 1 : 0);
    resetPose(f);
    walkCycle(f, this.phase, this.walkW, 0.65, 0.045);
    // le bras porteur ne balance pas ; la serviette suit le bras libre
    f.armL.rotation.x += -0.3;

    // ── Inclinaisons (ressorts)
    const leanXT = clamp(moving * 0.1 + this.accF * 0.01, -0.18, 0.25) + dashCurve * 0.3 - s.hitT * 0.45 + this.stunW * Math.sin(time * 4.5) * 0.08;
    const leanZT = clamp(-s.turnRate * 0.06, -0.25, 0.25) + this.slipW * Math.sin(time * 7.3) * 0.22 + this.stunW * Math.cos(time * 4.5) * 0.08;
    this.leanX = spring(this.leanXv, this.leanX, leanXT, 140, 13, dt);
    this.leanZ = spring(this.leanZv, this.leanZ, leanZT, 140, 13, dt);
    this.lean.rotation.set(this.leanX, 0, this.leanZ);

    // ── Squash & stretch
    const walkSq = (Math.abs(Math.cos(this.phase)) - 0.6) * 0.07 * this.walkW;
    this.sq = spring(this.sqv, this.sq, walkSq, 220, 11, dt);
    const sy = 1 + this.sq - dashCurve * 0.14 - s.hitT * 0.06;
    const sz = 1 + dashCurve * 0.42;
    const sxz = 1 / Math.sqrt(Math.max(0.5, sy));
    const shimmer = this.phaseW * Math.sin(time * 23) * 0.03;
    this.squash.scale.set(sxz * (1 - dashCurve * 0.12) + shimmer, sy, sxz * sz - shimmer);

    // ── Pas Chassé : jambes en ciseaux, bras libre ouvert, pans qui tournoient
    if (this.dashW > 0.01) {
      const k = this.dashW;
      f.legL.rotation.x += -0.75 * k;
      f.legR.rotation.x += 0.65 * k;
      f.legL.rotation.z += 0.1 * k;
      f.armL.rotation.z += 1.1 * k;
      f.armL.rotation.x += 0.2 * k;
      f.hips.rotation.y += -0.25 * k;
      f.head.rotation.y += 0.2 * k;
    }

    // ── Glissade : bras qui moulinent, jambes en ciseaux
    if (this.slipW > 0.01) {
      const k = this.slipW;
      f.armL.rotation.z += k * (1.3 + Math.sin(time * 11) * 0.7);
      f.armL.rotation.x += k * Math.sin(time * 13) * 0.9;
      f.legL.rotation.x += k * Math.sin(time * 12) * 0.55;
      f.legR.rotation.x += -k * Math.sin(time * 12) * 0.55;
      f.legL.rotation.z += k * 0.2;
      f.legR.rotation.z -= k * 0.2;
      f.hips.rotation.y += k * Math.sin(time * 6) * 0.25;
    }

    // ── Étourdi : la tête dodeline
    if (this.stunW > 0.01) {
      f.head.rotation.z += Math.sin(time * 5) * 0.22 * this.stunW;
      f.head.rotation.x += Math.cos(time * 5) * 0.12 * this.stunW;
      f.armL.rotation.z += 0.25 * this.stunW;
    }

    // ── Cloche royale : lever le bras puis frapper
    if (s.bellRing > 0.001) {
      const tb = s.bellRing;
      const raise = smoothstep(0, 0.25, tb) * (1 - smoothstep(0.78, 1, tb));
      const strike = smoothstep(0.32, 0.42, tb) * (1 - smoothstep(0.48, 0.66, tb));
      f.armL.rotation.x += -1.9 * raise + 0.75 * strike;
      f.armL.rotation.z += -0.1 * raise;
      f.head.rotation.x += 0.18 * strike - 0.1 * raise;
      f.hips.position.y += strike * 0.02;
    }

    // ── Chute dans la trappe
    const fall = clamp01(s.fall01);
    if (fall > 0) {
      const k = easeInCubic(fall);
      this.sink.position.y = -k * 1.4;
      this.sink.rotation.y = fall * 2.2;
      this.sink.scale.setScalar(1 - 0.3 * fall);
      f.armL.rotation.z += 2.4 * smoothstep(0, 0.3, fall);
      f.legL.rotation.x -= 0.4 * fall;
      f.legR.rotation.x += 0.3 * fall;
    } else {
      this.sink.position.y = 0;
      this.sink.rotation.y = 0;
      this.sink.scale.setScalar(1);
    }

    // ── Respiration au repos & regard
    const idle = 1 - this.walkW;
    f.hips.scale.y = 1 + Math.sin(time * 2.1) * 0.012 * idle;
    f.head.rotation.y += wobble(time * 0.5, 3) * 0.25 * idle * (1 - this.stunW);
    f.head.rotation.x += Math.sin(time * 0.7) * 0.03 * idle - 0.06; // menton levé, élégant

    // ── Queue-de-pie (ressorts secondaires)
    for (let i = 0; i < 2; i++) {
      const sd = i === 0 ? 1 : -1;
      const tx = 0.12 + moving * 0.45 + this.dashW * 0.55 + Math.max(0, this.accF) * 0.012 + Math.abs(Math.sin(this.phase)) * 0.12 * this.walkW + fall * 0.8;
      const tz = sd * (0.05 + this.dashW * 0.25 * Math.sin(time * 18 + i)) - this.accS * 0.006 + this.slipW * Math.sin(time * 9 + i) * 0.3;
      this.tailX[i] = spring(this.tailXv[i], this.tailX[i], tx, 90, 7, dt);
      this.tailZ[i] = spring(this.tailZv[i], this.tailZ[i], tz, 90, 7, dt);
      this.tails[i].rotation.set(this.tailX[i], this.dashW * Math.sin(time * 20 + i * 2) * 0.35, this.tailZ[i]);
    }

    // ── Plateau : inclinaison (virages, accélérations, dash) + vacillement selon l'équilibre
    const bal = clamp01(s.balance01);
    const shaky = Math.pow(1 - bal, 1.4);
    const wAmp = shaky * 0.26 + this.slipW * 0.2 + s.hitT * 0.15;
    const wobX = wAmp * (Math.sin(time * 7.3) * 0.6 + Math.sin(time * 11.7 + 1.3) * 0.4);
    const wobZ = wAmp * (Math.sin(time * 6.1 + 2) * 0.6 + Math.sin(time * 12.9) * 0.4);
    const txT = clamp(-this.accF * 0.022, -0.3, 0.3) - dashCurve * 0.32 + wobX;
    const tzT = clamp(s.turnRate * 0.09 + this.accS * 0.01, -0.32, 0.32) + wobZ;
    this.tiltX = spring(this.tiltXv, this.tiltX, txT, 95, 8, dt);
    this.tiltZ = spring(this.tiltZv, this.tiltZ, tzT, 95, 8, dt);
    this.trayY = spring(this.trayYv, this.trayY, 0, 160, 10, dt);
    this.trayTilt.rotation.set(this.tiltX, 0, this.tiltZ);
    // le plateau garde son cap malgré la torsion des épaules
    this.trayG.rotation.y = -f.hips.rotation.y * 0.7;
    this.trayG.position.set(TRAY_POS.x, TRAY_POS.y + this.trayY + Math.sin(time * 1.6) * 0.006 * idle, TRAY_POS.z);
    if (fall > 0) this.trayG.position.y += 0.25 * smoothstep(0, 0.4, fall);
    // bras porteur : la main reste sous le plateau
    aimArm(f.armR, this.trayG.position.x + 0.07 - f.armR.position.x, this.trayG.position.y - 0.045 - f.armR.position.y, this.trayG.position.z - 0.02);

    this.syncTray(s, dt, time, shaky + this.slipW * 0.6);

    // ── Expression
    const expr =
      fall > 0.05 || s.hitT > 0.35
        ? 'o'
        : this.stunW > 0.5
          ? 'dizzy'
          : this.slipW > 0.5 || bal < 0.3
            ? 'worried'
            : s.bellRing > 0.05 || this.graceW > 0.5
              ? 'happy'
              : 'smile';
    f.setExpr(expr);

    // ── Effets
    this.stars.update(dt, time, s.stunned);
    this.updateGhosts(s, dt);
    this.aura.visible = this.graceW > 0.02;
    if (this.aura.visible) {
      this.auraDisc.scale.setScalar(0.9 + 0.1 * Math.sin(time * 3));
      (this.auraDisc.material as THREE.MeshBasicMaterial).opacity = 0.55 * this.graceW;
      this.aura.rotation.y = time * 0.6;
    }
    this.auraTw.update(dt, time, s.grace);

    // teinte & translucidité
    const blink = s.invulnerable ? 0.55 + 0.45 * (0.5 + 0.5 * Math.cos(time * TAU * 4)) : 1;
    const opacity = (1 - this.phaseW * 0.58) * blink;
    this.mats.setOpacity(opacity);
    const hitK = s.hitT > 0 ? s.hitT * (0.55 + 0.45 * Math.sign(Math.sin(s.hitT * 40))) : 0;
    if (hitK > 0.01) this.mats.setTint('#ffd6e2', hitK * 0.9);
    else if (this.phaseW > 0.01) this.mats.setTint('#b9a2f0', this.phaseW * (0.25 + 0.12 * Math.sin(time * 9)));
    else if (this.graceW > 0.01) this.mats.setTint('#ffc95a', this.graceW * (0.06 + 0.03 * Math.sin(time * 5)));
    else this.mats.setTint('#000000', 0);
  }

  // ─────────────────────────────────────────── Plats sur le plateau

  private syncTray(s: PlayerViewState, dt: number, time: number, shaky: number): void {
    const key = `${s.capacity}|${s.tray.join(',')}`;
    if (key !== this.trayKey) {
      this.trayKey = key;
      this.capacity = s.capacity;
      // appariement : les plats déjà présents restent, les nouveaux apparaissent, les autres partent
      const pool = this.items.filter((d) => d.removing < 0);
      const next: TrayDish[] = [];
      for (const id of s.tray) {
        const idx = pool.findIndex((d) => d.id === id);
        if (idx >= 0) {
          next.push(pool[idx]);
          pool.splice(idx, 1);
        } else {
          const pivot = new THREE.Group();
          pivot.add(createDishMesh(id));
          pivot.scale.setScalar(0.001);
          this.dishesG.add(pivot);
          const d: TrayDish = { id, pivot, t: 0, removing: -1, x: 0, z: 0, y: 0, phase: Math.random() * TAU };
          next.push(d);
          this.items.push(d);
          this.trayYv.v -= 0.9;
          this.tiltXv.v += (Math.random() - 0.5) * 3;
          this.tiltZv.v += (Math.random() - 0.5) * 3;
        }
      }
      for (const d of pool) d.removing = 0;
      // ordre : présents d'abord (ordre d'empilement), puis ceux qui partent
      const leaving = this.items.filter((d) => d.removing >= 0);
      this.items.length = 0;
      this.items.push(...next, ...leaving);
      if (pool.length) this.trayYv.v += 0.6;
    }
    const { pts, scale } = traySlots(this.capacity);
    let slot = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const d = this.items[i];
      if (d.removing >= 0) {
        d.removing += dt;
        const k = d.removing / 0.2;
        if (k >= 1) {
          d.pivot.removeFromParent();
          this.items.splice(i, 1);
          continue;
        }
        d.pivot.scale.setScalar(Math.max(0.001, scale * (1 - easeInCubic(k)) * (1 + 0.25 * bump(k))));
        d.pivot.position.y = d.y + k * 0.18;
      }
    }
    for (const d of this.items) {
      if (d.removing >= 0) continue;
      const p = pts[slot % pts.length];
      const stack = Math.floor(slot / pts.length) * 0.09;
      slot++;
      d.t += dt;
      const kx = 1 - Math.exp(-14 * dt);
      if (d.t <= dt * 1.01) {
        d.x = p[0];
        d.z = p[1];
      }
      d.x += (p[0] - d.x) * kx;
      d.z += (p[1] - d.z) * kx;
      const drop = (1 - easeOutCubic(Math.min(1, d.t / 0.22))) * 0.22;
      d.y = stack + drop;
      const jig = shaky * 0.06;
      const hop = Math.max(0, Math.sin(time * 15 + d.phase)) * shaky * 0.025;
      d.pivot.position.set(d.x, d.y + hop, d.z);
      d.pivot.rotation.set(Math.sin(time * 13 + d.phase) * jig, d.phase * 0.3, Math.cos(time * 11 + d.phase) * jig);
      d.pivot.scale.setScalar(Math.max(0.001, scale * easeOutElastic(Math.min(1, d.t / 0.55))));
    }
  }

  // ─────────────────────────────────────────── Fantômes du Pas Chassé

  private updateGhosts(s: PlayerViewState, dt: number): void {
    if (s.dashing) {
      this.ghostTimer -= dt;
      if (this.ghostTimer <= 0) {
        this.ghostTimer = 0.045;
        const gh = this.ghosts[this.ghostNext];
        this.ghostNext = (this.ghostNext + 1) % this.ghosts.length;
        this.root.updateMatrixWorld(true);
        gh.world.copy(this.lean.matrixWorld);
        for (let i = 0; i < gh.nodes.length && i < this.srcNodes.length; i++) {
          const a = this.srcNodes[i];
          const b = gh.nodes[i];
          if (i > 0) {
            b.position.copy(a.position);
            b.quaternion.copy(a.quaternion);
            b.scale.copy(a.scale);
          }
          b.visible = a.visible;
        }
        gh.age = 0;
      }
    }
    let inv: THREE.Matrix4 | null = null;
    for (const gh of this.ghosts) {
      gh.age += dt;
      const k = gh.age / GHOST_LIFE;
      gh.obj.visible = k < 1;
      if (!gh.obj.visible) continue;
      gh.mat.opacity = 0.55 * Math.pow(1 - k, 1.3);
      if (!inv) {
        // repère monde figé → repère local de la racine (qui suit le joueur, éventuellement surélevée)
        this.root.updateWorldMatrix(true, false);
        inv = _inv.copy(this.root.matrixWorld).invert();
      }
      gh.obj.matrix.multiplyMatrices(inv, gh.world);
      gh.obj.matrixWorldNeedsUpdate = true;
    }
  }

  dispose(): void {
    for (const gh of this.ghosts) gh.mat.dispose();
    disposeTree(this.root);
  }
}

export function createPlayerView(): View<PlayerViewState> {
  return new PlayerView();
}
