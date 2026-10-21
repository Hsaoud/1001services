/**
 * Clients attablés : chaise (bistrot / médaillon / VIP dorée) + client assis, variés par graine
 * (teint, coiffure, chapeaux, lunettes, tenues pastel ; VIP : perles, or, velours).
 *
 * Pensés pour être très nombreux (~130 au niveau 100) : ≈ 2 000 triangles et 5 draw calls par client.
 *  - corps = chaise + jambes + buste fusionnés (1 mesh), tête (1), visage (1), bras gauche (1), bras droit (1) ;
 *  - un unique matériau partagé à couleurs de sommets (métaux « peints ») ;
 *  - gabarits cuits et indexés, mis en cache par apparence ; expressions et fourchette = échange de géométrie ;
 *  - effets (cœur, vapeur de colère) créés à la demande seulement.
 */
import * as THREE from 'three';
import type { TableMood } from '../../types';
import { PALETTE, sphere } from '../kit';
import { bakeCached, bump, cgeo, clamp01, hash01, heartGeo, limb, pick, stdMat, vcMat, wobble } from './common';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type FaceBrows, type FaceEyes, type FaceMouth, type FigureSpec, type GlassesStyle, type HairStyle, type HatStyle, type NeckStyle, buildFigure, faceGeometry } from './figure';
import { buildChair, chairLook } from './chair';

export interface SeatedClientState {
  mood: TableMood;
  /** Recul de chaise 0..1 (client bavard). Le client recule avec sa chaise. */
  push: number;
  time: number;
}

/**
 * Client assis sur sa chaise (la chaise fait partie du modèle). Origine : centre de l'assise au sol,
 * le client regarde vers +Z (le GameRenderer l'oriente selon SeatSpec.angle).
 */
export interface SeatedClient {
  readonly root: THREE.Group;
  /** Affiche / masque le client (la chaise reste visible). */
  setPresent(present: boolean): void;
  update(dt: number, s: SeatedClientState): void;
}

// ─────────────────────────────────────────── Variantes

const SKINS = ['#f6d7c3', '#eec5a8', '#dcaa86', '#c08a62', '#93603f', '#f3d3bf', '#6f4630'];
const HAIRS = ['#3d2a22', '#6b4a3a', '#a8703f', '#e3c08d', '#2b2230', '#c4643f', '#e9e4dc', '#8a5a44', '#b98ee0'];
const TOPS = [PALETTE.rose, PALETTE.lavender, PALETTE.mint, PALETTE.sky, '#ffd2b5', PALETTE.sage, '#f7e3a1', '#e9b9a4', PALETTE.powder, '#b8cfe0'];
const VIP_TOPS = [PALETTE.bordeaux, '#2f4a6b', '#2f5a48', '#5b2f5a', PALETTE.ink];
const HAIR_STYLES: HairStyle[] = ['short', 'bob', 'curly', 'bun', 'quiff', 'ponytail', 'long', 'slick', 'updo', 'bald'];
const HATS: HatStyle[] = ['none', 'none', 'none', 'none', 'beret', 'sunhat', 'bowler', 'flower', 'cap', 'fascinator'];
const VIP_HATS: HatStyle[] = ['tophat', 'fascinator', 'tiara', 'none', 'bowler'];
const NECKS: NeckStyle[] = ['none', 'none', 'bowtie', 'pearls', 'scarf', 'chain'];
const GLASSES: GlassesStyle[] = ['none', 'none', 'none', 'round', 'sun'];

/** Rugosité unique du matériau partagé des clients. */
const ROUGH = 0.62;

interface ClientLook {
  spec: FigureSpec;
  key: string;
}

function clientLook(seed: number, vip: boolean): ClientLook {
  const r = (k: number): number => hash01(seed, k);
  const top = vip ? pick(VIP_TOPS, r(1)) : pick(TOPS, r(1));
  const suit = r(2) < 0.5;
  const spec: FigureSpec = {
    seated: true,
    detail: 0,
    skin: pick(SKINS, r(3)),
    hair: pick(HAIRS, r(4)),
    hairStyle: pick(HAIR_STYLES, r(5)),
    outfit: suit ? 'suit' : 'plain',
    top,
    bottom: suit ? pick(['#3b3340', '#4a4252', '#efe3d3', '#6b4a3a'], r(6)) : top,
    shirt: PALETTE.ivory,
    shoes: pick(['#2e2428', '#6b4a3a', '#fbf3e8'], r(7)),
    neck: vip ? (r(8) < 0.6 ? 'pearls' : 'bowtie') : pick(NECKS, r(8)),
    neckColor: vip ? PALETTE.gold : pick([PALETTE.bordeaux, PALETTE.sageDeep, PALETTE.roseDeep, PALETTE.gold], r(9)),
    hat: vip ? pick(VIP_HATS, r(10)) : pick(HATS, r(10)),
    hatColor: vip ? pick([PALETTE.ink, PALETTE.bordeauxDeep, PALETTE.violet], r(11)) : pick([PALETTE.bordeaux, '#fff4e6', PALETTE.sage, PALETTE.lavender, PALETTE.ink], r(11)),
    hatTrim: vip ? PALETTE.gold : pick([PALETTE.rose, PALETTE.gold, '#ffffff'], r(12)),
    glasses: pick(GLASSES, r(13)),
    glassesColor: vip ? PALETTE.gold : pick([PALETTE.gold, '#2b2230'], r(14)),
    lapels: vip && suit ? PALETTE.goldPale : undefined,
    // corpulence quantifiée : partage des géométries de buste entre apparences voisines
    girth: [0.92, 1.0, 1.08][Math.floor(r(15) * 3)],
    trim: PALETTE.gold,
  };
  return { spec, key: JSON.stringify(spec) };
}

// ─────────────────────────────────────────── Gabarits cuits (partagés)

interface ClientParts {
  body: THREE.BufferGeometry; // chaise + jambes + buste
  head: THREE.BufferGeometry; // tête + cheveux + chapeau + lunettes + fard
  armL: THREE.BufferGeometry;
  armR: THREE.BufferGeometry;
  /** Bras droit tenant la fourchette (cuit à la première utilisation). */
  armRFork: () => THREE.BufferGeometry;
  hipY: number;
  torsoH: number;
  headC: number;
  headR: number;
  shoulderL: THREE.Vector3;
  shoulderR: THREE.Vector3;
}

const partsCache = new Map<string, ClientParts>();

/** Une seule géométrie fusionnée (tout aplati en couleurs de sommets). */
function bakeOne(key: string, build: () => THREE.Object3D): THREE.BufferGeometry {
  const t = bakeCached(key, build, { flatten: ROUGH });
  if (t.parts.length === 1) return t.parts[0].geo;
  // matériaux non aplatissables (textures / verre) : rares chez les clients, on ne garde que la partie principale
  return t.parts.reduce((a, b) => (a.geo.getAttribute('position').count >= b.geo.getAttribute('position').count ? a : b)).geo;
}

function forkGeo(): THREE.Group {
  const g = new THREE.Group();
  const m = stdMat('client:fork', { color: '#cfd5dc', roughness: 0.35 });
  const h = new THREE.Mesh(limb(0.006, 0.075, 4, 1), m);
  g.add(h);
  const t = new THREE.Mesh(limb(0.012, 0.012, 4, 1), m);
  t.position.y = -0.08;
  g.add(t);
  return g;
}

function clientParts(look: ClientLook, chairKey: string, buildChairObj: () => THREE.Object3D): ClientParts {
  const key = `${look.key}|${chairKey}`;
  let p = partsCache.get(key);
  if (p) return p;
  const f = buildFigure(look.spec);
  // visage : géré à part (géométrie partagée par toutes les têtes)
  for (const c of [...f.head.children]) if (c.userData.part) f.head.remove(c);
  f.hips.remove(f.head);
  f.hips.remove(f.armL);
  f.hips.remove(f.armR);
  const shoulderL = f.armL.position.clone();
  const shoulderR = f.armR.position.clone();
  f.armL.position.set(0, 0, 0);
  f.armR.position.set(0, 0, 0);
  f.armL.rotation.set(0, 0, 0);
  f.armR.rotation.set(0, 0, 0);
  f.head.position.set(0, 0, 0);
  const lk = look.key;
  const body = bakeOne(`cl2:body:${key}`, () => {
    const g = new THREE.Group();
    g.add(buildChairObj());
    g.add(f.root);
    return g;
  });
  const head = bakeOne(`cl2:head:${lk}`, () => f.head);
  const armL = bakeOne(`cl2:armL:${lk}`, () => f.armL);
  const armR = bakeOne(`cl2:armR:${lk}`, () => f.armR);
  const armRObj = f.armR;
  const armLen = f.armLen;
  let forkArm: THREE.BufferGeometry | null = null;
  const armRFork = (): THREE.BufferGeometry =>
    (forkArm ??= bakeOne(`cl2:armRF:${lk}`, () => {
      const fk = forkGeo();
      fk.rotation.x = Math.PI;
      fk.position.y = -armLen - 0.03;
      armRObj.add(fk);
      return armRObj;
    }));
  p = { body, head, armL, armR, armRFork, hipY: f.hipY, torsoH: f.torsoH, headC: f.headC, headR: f.headR, shoulderL, shoulderR };
  partsCache.set(key, p);
  return p;
}

// ─────────────────────────────────────────── Effets d'humeur (créés à la demande, partagés)

function heartMat(): THREE.MeshStandardMaterial {
  return stdMat('client:heart', { color: '#ff7fa5', emissive: '#ff4f86', emissiveIntensity: 0.6, roughness: 0.35 });
}
function steamMat(): THREE.MeshStandardMaterial {
  return stdMat('client:steam', { color: '#f2808e', transparent: true, opacity: 0.8, depthWrite: false, roughness: 0.8, emissive: '#7a1f2a', emissiveIntensity: 0.25 });
}
/** Trois bouffées de vapeur fusionnées (un seul mesh). */
function steamGeo(): THREE.BufferGeometry {
  return cgeo('client:steamGeo', () => {
    const parts = [
      [-0.1, 0.0, 0.045],
      [0.1, 0.05, 0.04],
      [0.0, 0.14, 0.035],
    ].map(([x, y, r]) => sphere(r, 7, 5).clone().translate(x, y, 0));
    const g = mergeGeometries(parts, false)!;
    for (const q of parts) q.dispose();
    return g;
  });
}

// ─────────────────────────────────────────── Pose

type Face = { eyes: FaceEyes; mouth: FaceMouth; brows: FaceBrows; fury: boolean };

interface Pose {
  lean: number;
  hop: number;
  aLx: number;
  aLz: number;
  aRx: number;
  aRz: number;
  hX: number;
  hY: number;
}

const zeroPose = (): Pose => ({ lean: 0, hop: 0, aLx: -0.95, aLz: 0.05, aRx: -0.95, aRz: -0.05, hX: 0, hY: 0 });
const POSE_KEYS = Object.keys(zeroPose()) as (keyof Pose)[];

/** Pivot de bascule : pieds arrière de la chaise (le client rieur se renverse sur sa chaise). */
const TILT_Z = -0.17;

// ─────────────────────────────────────────── API

export function createSeatedClient(seed: number, vip: boolean): SeatedClient {
  const look = clientLook(seed, vip);
  const cl = chairLook(hash01(seed, 31), hash01(seed, 32), vip);
  const chairKey = `${cl.style}:${cl.frame}:${cl.fabric}`;
  const parts = clientParts(look, chairKey, () => buildChair(cl, true));
  const mat = vcMat(ROUGH);

  const root = new THREE.Group();
  root.name = 'seatedClient';
  const slide = new THREE.Group(); // recul de chaise
  root.add(slide);
  const tilt = new THREE.Group(); // bascule sur les pieds arrière
  tilt.position.z = TILT_Z;
  slide.add(tilt);
  const seat = new THREE.Group();
  seat.position.z = -TILT_Z;
  tilt.add(seat);

  const mk = (geo: THREE.BufferGeometry, parent: THREE.Object3D, cast = true): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  // chaise vide (client absent) : la chaise seule ; client présent : corps complet (chaise comprise)
  const emptyChair = bakeOne(`chair:lp:${chairKey}`, () => buildChair(cl, true));
  const bodyMesh = mk(parts.body, seat);

  const upper = new THREE.Group(); // tête + bras (penchés, sautillants)
  upper.position.y = parts.hipY;
  seat.add(upper);
  const head = new THREE.Group();
  head.position.y = parts.torsoH;
  upper.add(head);
  mk(parts.head, head);
  const faceMesh = mk(faceGeometry(parts.headR, parts.headC, 0, 'eyes', 'smile', null), head, false);
  const armL = new THREE.Group();
  armL.position.copy(parts.shoulderL);
  // bras : pas d'ombre portée (invisible à cette échelle, économise 2 draw calls d'ombre par client)
  mk(parts.armL, armL, false);
  const armR = new THREE.Group();
  armR.position.copy(parts.shoulderR);
  const armRMesh = mk(parts.armR, armR, false);
  upper.add(armL, armR);

  let face: Face = { eyes: 'eyes', mouth: 'smile', brows: null, fury: false };
  const setFace = (f: Face): void => {
    if (f.eyes === face.eyes && f.mouth === face.mouth && f.brows === face.brows && f.fury === face.fury) return;
    face = f;
    faceMesh.geometry = faceGeometry(parts.headR, parts.headC, 0, f.eyes, f.mouth, f.brows, f.fury);
  };

  const headTop = parts.hipY + parts.torsoH + parts.headC + parts.headR;
  let heart: THREE.Mesh | null = null;
  let steam: THREE.Mesh | null = null;

  const ph = hash01(seed, 77) * 100;
  const pose = zeroPose();
  const tp = zeroPose();
  let push = 0;
  let pushV = 0;
  let present = true;
  let happyT = 0;

  return {
    root,
    setPresent(p) {
      if (p === present) return;
      present = p;
      upper.visible = p;
      bodyMesh.geometry = p ? parts.body : emptyChair;
      if (!p) {
        if (heart) heart.visible = false;
        if (steam) steam.visible = false;
      }
    },
    update(dt, s) {
      // recul de chaise (ressort court pour l'à-coup)
      const target = clamp01(s.push);
      pushV += ((target - push) * 260 - pushV * 20) * dt;
      push += pushV * dt;
      slide.position.z = -push * 0.7;
      if (!present) {
        tilt.rotation.x = 0;
        return;
      }
      const t = s.time + ph;
      const mood = s.mood;
      const laughing = push > 0.12;
      // se renverse en riant sur les pieds arrière
      tilt.rotation.x = -0.16 * clamp01(push * 1.4) - 0.05 * clamp01(Math.abs(pushV) * 0.4);

      // pose cible selon l'humeur
      Object.assign(tp, zeroPose());
      let f: Face = { eyes: 'eyes', mouth: 'smile', brows: null, fury: false };
      tp.hY = wobble(t * 0.35, seed) * 0.45;
      tp.hX = 0.05;
      switch (mood) {
        case 'waiting': {
          tp.hY = wobble(t * 0.9, seed) * 0.8;
          tp.lean = 0.08;
          tp.aRx = -0.95 + Math.max(0, Math.sin(t * 15)) * 0.14; // pianote
          tp.aLx = -0.7;
          tp.aLz = 0.35;
          f = { eyes: 'eyes', mouth: Math.sin(t * 0.8) > 0.3 ? 'flat' : 'smile', brows: null, fury: false };
          break;
        }
        case 'eating': {
          const u = (t * 0.6) % 1;
          const k = smooth(0.1, 0.4, u) * (1 - smooth(0.6, 0.9, u));
          tp.aRx = -0.85 - k * 1.45;
          tp.aRz = -0.05 + k * 0.5;
          tp.hX = 0.18 - k * 0.2;
          tp.hY = 0;
          f = { eyes: k > 0.6 ? 'happy' : 'eyes', mouth: k > 0.7 ? 'open' : Math.sin(t * 14) > 0 ? 'smile' : 'flat', brows: null, fury: false };
          break;
        }
        case 'happy': {
          happyT += dt;
          tp.hop = Math.abs(Math.sin(t * 5)) * 0.025;
          tp.aLx = -2.5 + Math.sin(t * 5) * 0.2;
          tp.aLz = 0.35;
          tp.aRx = -2.5 + Math.sin(t * 5 + 1.5) * 0.2;
          tp.aRz = -0.35;
          tp.hX = -0.12;
          f = { eyes: 'happy', mouth: 'open', brows: null, fury: false };
          break;
        }
        case 'angry': {
          tp.aLx = -1.25;
          tp.aLz = -0.95;
          tp.aRx = -1.15;
          tp.aRz = 0.95;
          tp.lean = -0.06;
          tp.hY = Math.sin(t * 9) * 0.06 + 0.35;
          tp.hX = -0.05;
          f = { eyes: 'eyes', mouth: 'flat', brows: 'angry', fury: true };
          break;
        }
        default:
          break;
      }
      if (mood !== 'happy') happyT = 0;
      if (laughing) {
        const k = clamp01(push);
        tp.lean = -0.2 * k;
        tp.hX = -0.25 * k;
        tp.aLx = -1.2;
        tp.aLz = 0.9 * k + Math.sin(t * 9) * 0.1;
        tp.aRx = -1.2;
        tp.aRz = -0.9 * k - Math.sin(t * 9) * 0.1;
        tp.hop = Math.abs(Math.sin(t * 11)) * 0.012;
        f = { eyes: 'happy', mouth: 'open', brows: null, fury: false };
      }
      // amortissement de la pose
      const a = 1 - Math.exp(-9 * dt);
      for (const key of POSE_KEYS) pose[key] += (tp[key] - pose[key]) * a;
      upper.rotation.x = pose.lean;
      upper.position.y = parts.hipY + pose.hop + Math.sin(t * 2.1) * 0.004; // respiration
      armL.rotation.set(pose.aLx, 0, pose.aLz);
      armR.rotation.set(pose.aRx, 0, pose.aRz);
      head.rotation.set(pose.hX, pose.hY, mood === 'angry' ? 0 : Math.sin(t * 0.7) * 0.05);
      setFace(f);
      const eating = mood === 'eating';
      const armGeo = eating ? parts.armRFork() : parts.armR;
      if (armRMesh.geometry !== armGeo) armRMesh.geometry = armGeo;

      // effets (créés à la demande)
      if (mood === 'happy' && !heart) {
        heart = new THREE.Mesh(heartGeo(0.08, 0.02, 4, 1), heartMat());
        heart.castShadow = false;
        seat.add(heart);
      }
      if (heart) {
        heart.visible = mood === 'happy';
        if (heart.visible) {
          const u = (happyT * 0.8) % 1;
          heart.position.set(Math.sin(u * 6) * 0.06, headTop + 0.05 + u * 0.35, 0);
          heart.rotation.y = Math.sin(t * 2) * 0.6;
          heart.scale.setScalar(Math.max(0.001, bump(Math.min(1, u * 1.3))));
        }
      }
      if (mood === 'angry' && !steam) {
        steam = new THREE.Mesh(steamGeo(), steamMat());
        steam.castShadow = false;
        seat.add(steam);
      }
      if (steam) {
        steam.visible = mood === 'angry';
        if (steam.visible) {
          const u = (t * 0.9) % 1;
          steam.position.set(0, headTop + 0.03 + u * 0.12, -0.02);
          steam.scale.setScalar(Math.max(0.001, bump(u) * (0.9 + 0.2 * Math.sin(t * 7))));
          steam.rotation.y = t * 1.5;
        }
      }
    },
  };
}

function smooth(a: number, b: number, x: number): number {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
}
