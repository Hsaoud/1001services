/**
 * Silhouette humaine « chibi » paramétrable (≈ 1,15 m, tête Ø 0,36) partagée par le joueur, les PNJ et
 * les clients attablés : jambes, buste tourné (lathe), tête avec visage expressif, cheveux, chapeaux,
 * lunettes, cols. Aucune ossature : chaque membre est un groupe pivot animé par transformations.
 *
 * Conventions : le personnage regarde +Z ; son côté gauche est +X (bras `armL`), son côté droit −X (`armR`).
 * Rotation x positive d'un membre pendant (jambe, bras) = vers l'arrière ; négative = vers l'avant.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE, ceramic, chamferCylinder, glass, gold, lathe, matte, mesh, roundedBox, sphere, torus, velvet } from '../kit';
import { TAU, ball, bakeInPlace, capsule, cgeo, flatTorus, limb, partSphere, stdMat } from './common';

export type HairStyle = 'short' | 'slick' | 'quiff' | 'bob' | 'bun' | 'updo' | 'long' | 'curly' | 'ponytail' | 'bald' | 'wig';
export type HatStyle =
  | 'none'
  | 'beret'
  | 'bowler'
  | 'tophat'
  | 'sunhat'
  | 'cap'
  | 'bucket'
  | 'fascinator'
  | 'crown'
  | 'tiara'
  | 'flower';
export type Outfit = 'suit' | 'dress' | 'gown' | 'apron' | 'longcoat' | 'frock' | 'plain';
export type NeckStyle = 'none' | 'bowtie' | 'pearls' | 'ruff' | 'chain' | 'scarf' | 'jabot';
export type GlassesStyle = 'none' | 'round' | 'sun' | 'monocle';
export type Expr = 'smile' | 'happy' | 'laugh' | 'open' | 'o' | 'worried' | 'angry' | 'dizzy' | 'flat' | 'calm';

export interface FigureSpec {
  skin?: string;
  hair?: string;
  hairStyle?: HairStyle;
  outfit?: Outfit;
  top?: string; // veste / robe
  sleeves?: string; // manches (défaut : top)
  bottom?: string; // pantalon / bas
  shoes?: string;
  shirt?: string; // plastron visible
  lapels?: string; // revers de veste (couleur), sinon aucun
  trim?: string; // boutons / galons
  hands?: string; // gants (défaut : peau)
  apron?: string;
  neck?: NeckStyle;
  neckColor?: string;
  hat?: HatStyle;
  hatColor?: string;
  hatTrim?: string;
  glasses?: GlassesStyle;
  glassesColor?: string;
  nose?: 'none' | 'button' | 'long';
  mustache?: boolean;
  blush?: boolean;
  hipY?: number; // hauteur des hanches (défaut 0.3)
  torsoH?: number; // hauteur du buste (défaut 0.46)
  girth?: number; // corpulence (défaut 1)
  headR?: number; // rayon de tête (défaut 0.18)
  armLen?: number; // (défaut 0.22)
  seated?: boolean; // jambes pliées (assise ≈ 0,32)
  lowPoly?: boolean; // moins de segments (instances nombreuses) — équivaut à detail = 0
  /** Niveau de détail : 0 = clients attablés (~1k triangles), 1 = PNJ (défaut), 2 = joueur. */
  detail?: 0 | 1 | 2;
  velvetTop?: boolean; // veste en velours (défaut vrai pour suit / longcoat / frock)
}

export interface Figure {
  readonly root: THREE.Group;
  readonly hips: THREE.Group;
  readonly legL: THREE.Group;
  readonly legR: THREE.Group;
  readonly head: THREE.Group;
  readonly armL: THREE.Group;
  readonly armR: THREE.Group;
  readonly handL: THREE.Object3D;
  readonly handR: THREE.Object3D;
  readonly torso: THREE.Mesh;
  readonly skirt: THREE.Mesh | null;
  /** Hauteur de repos des hanches (y racine). */
  readonly hipY: number;
  /** Hauteur du buste (cou, repère hanches). */
  readonly torsoH: number;
  /** Centre de la tête dans le repère `head` (y). */
  readonly headC: number;
  readonly headR: number;
  /** Hauteur totale approximative (sommet de la tête / chapeau), repère racine. */
  readonly height: number;
  readonly seated: boolean;
  readonly armLen: number;
  setExpr(e: Expr): void;
}

export const SEAT_HIP = 0.39;

const DEF = {
  skin: '#f3d3bf',
  hair: PALETTE.cocoa,
  hairStyle: 'short' as HairStyle,
  outfit: 'suit' as Outfit,
  top: PALETTE.bordeaux,
  bottom: PALETTE.ink,
  shoes: '#2e2428',
  shirt: PALETTE.ivory,
  trim: PALETTE.gold,
  apron: PALETTE.ivory,
  neck: 'none' as NeckStyle,
  neckColor: PALETTE.bordeauxDeep,
  hat: 'none' as HatStyle,
  hatColor: PALETTE.ink,
  hatTrim: PALETTE.rose,
  glasses: 'none' as GlassesStyle,
  glassesColor: PALETTE.gold,
  nose: 'none' as 'none' | 'button' | 'long',
  mustache: false,
  blush: true,
  hipY: 0.3,
  torsoH: 0.46,
  girth: 1,
  headR: 0.18,
  armLen: 0.22,
  seated: false,
  lowPoly: false,
};

const INK = '#2b2230';
const BLUSH = '#f4a3ad';
const MOUTH = '#8a3444';

// ─────────────────────────────────────────── Traits du visage (géométries fusionnées par paire)

const EYE_YAW = 0.37;
const EYE_PITCH = -0.04;

function headPoint(R: number, hc: number, yaw: number, pitch: number, out = 0): THREE.Vector3 {
  const r = R + out;
  return new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch) * r, hc + Math.sin(pitch) * r, Math.cos(yaw) * Math.cos(pitch) * r);
}

function faceMatrix(R: number, hc: number, yaw: number, pitch: number, out: number, sx = 1, sy = 1, sz = 1, roll = 0): THREE.Matrix4 {
  const p = headPoint(R, hc, yaw, pitch, out);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, yaw, roll, 'YXZ'));
  return new THREE.Matrix4().compose(p, q, new THREE.Vector3(sx, sy, sz));
}

/** Fusionne une géométrie de base copiée selon plusieurs matrices (paires d'yeux, sourcils…). */
function multiGeo(key: string, base: () => THREE.BufferGeometry, mats: THREE.Matrix4[]): THREE.BufferGeometry {
  return cgeo(key, () => {
    const b = base();
    const src = b.index ? b.toNonIndexed() : b;
    const parts = mats.map((m) => src.clone().applyMatrix4(m));
    const g = mergeGeometries(parts, false)!;
    for (const p of parts) p.dispose();
    b.dispose();
    return g;
  });
}

interface FaceGeos {
  eyes: THREE.BufferGeometry;
  happy: THREE.BufferGeometry;
  dizzy: THREE.BufferGeometry;
  wide: THREE.BufferGeometry;
  smile: THREE.BufferGeometry;
  open: THREE.BufferGeometry;
  o: THREE.BufferGeometry;
  flat: THREE.BufferGeometry;
  angry: THREE.BufferGeometry;
  worried: THREE.BufferGeometry;
  blush: THREE.BufferGeometry;
  /** Marque de colère (veine en croix sur la tempe) — clients fâchés. */
  fury: THREE.BufferGeometry;
}

/** Segments selon le niveau de détail (0 bas, 1 moyen, 2 haut). */
interface Quality {
  rad: number; // lathes du corps
  limbR: number; // segments radiaux des membres
  limbC: number; // segments des calottes
  hand: [number, number];
  head: [number, number];
  small: [number, number]; // billes (boutons, perles)
  mid: [number, number]; // sphères de coiffure, nœuds
  hair: [number, number]; // calotte de cheveux
  hat: number;
  patch: [number, number];
  ring: [number, number]; // tores (radial, tubulaire)
  face: { sph: [number, number]; tor: [number, number]; cap: [number, number] };
}

const QUALITY: Quality[] = [
  {
    rad: 10,
    limbR: 5,
    limbC: 1,
    hand: [6, 4],
    head: [10, 8],
    small: [4, 3],
    mid: [6, 4],
    hair: [10, 5],
    hat: 8,
    patch: [4, 3],
    ring: [3, 10],
    face: { sph: [6, 4], tor: [3, 6], cap: [4, 1] },
  },
  {
    rad: 16,
    limbR: 8,
    limbC: 3,
    hand: [8, 6],
    head: [18, 13],
    small: [6, 4],
    mid: [10, 7],
    hair: [16, 8],
    hat: 16,
    patch: [6, 4],
    ring: [4, 18],
    face: { sph: [8, 6], tor: [4, 10], cap: [5, 2] },
  },
  {
    rad: 22,
    limbR: 10,
    limbC: 4,
    hand: [12, 10],
    head: [24, 18],
    small: [8, 6],
    mid: [14, 10],
    hair: [20, 10],
    hat: 24,
    patch: [8, 6],
    ring: [5, 24],
    face: { sph: [10, 8], tor: [5, 12], cap: [6, 3] },
  },
];

function faceGeos(R: number, hc: number, d: number): FaceGeos {
  const k = R / 0.18;
  const key = `${R}:${hc}:${d}`;
  const sides = [1, -1];
  const { sph, tor, cap } = QUALITY[d].face;
  return {
    eyes: multiGeo(`f:eyes:${key}`, () => new THREE.SphereGeometry(0.027 * k, sph[0], sph[1]), sides.map((s) => faceMatrix(R, hc, s * EYE_YAW, EYE_PITCH, -0.004, 0.78, 1.2, 0.5))),
    wide: multiGeo(`f:wide:${key}`, () => new THREE.SphereGeometry(0.034 * k, sph[0], sph[1]), sides.map((s) => faceMatrix(R, hc, s * EYE_YAW, EYE_PITCH + 0.02, -0.004, 0.9, 1.15, 0.5))),
    happy: multiGeo(`f:happy:${key}`, () => new THREE.TorusGeometry(0.022 * k, 0.0065 * k, tor[0], tor[1], Math.PI), sides.map((s) => faceMatrix(R, hc, s * EYE_YAW, EYE_PITCH - 0.02, 0.0))),
    dizzy: multiGeo(`f:dizzy:${key}`, () => new THREE.TorusGeometry(0.02 * k, 0.0055 * k, tor[0], tor[1] + 4), sides.map((s) => faceMatrix(R, hc, s * EYE_YAW, EYE_PITCH, 0.0))),
    smile: multiGeo(`f:smile:${key}`, () => new THREE.TorusGeometry(0.03 * k, 0.0075 * k, tor[0], tor[1], Math.PI), [faceMatrix(R, hc, 0, -0.33, 0.0, 1, 1, 1, Math.PI)]),
    open: multiGeo(`f:open:${key}`, () => new THREE.SphereGeometry(0.034 * k, sph[0] + 2, sph[1], 0, TAU, Math.PI * 0.5, Math.PI * 0.5), [faceMatrix(R, hc, 0, -0.31, -0.012, 1.05, 1.25, 0.6)]),
    o: multiGeo(`f:o:${key}`, () => new THREE.TorusGeometry(0.014 * k, 0.0065 * k, tor[0], tor[1]), [faceMatrix(R, hc, 0, -0.35, 0.0)]),
    flat: multiGeo(`f:flat:${key}`, () => new THREE.CapsuleGeometry(0.0065 * k, 0.04 * k, cap[1], cap[0]), [faceMatrix(R, hc, 0, -0.34, 0.0, 1, 1, 1, Math.PI / 2)]),
    angry: multiGeo(`f:angry:${key}`, () => new THREE.CapsuleGeometry(0.009 * k, 0.045 * k, cap[1], cap[0]), sides.map((s) => faceMatrix(R, hc, s * 0.34, 0.24, 0.004, 1, 1, 1, Math.PI / 2 + s * 0.45))),
    worried: multiGeo(`f:worried:${key}`, () => new THREE.CapsuleGeometry(0.008 * k, 0.04 * k, cap[1], cap[0]), sides.map((s) => faceMatrix(R, hc, s * 0.36, 0.27, 0.004, 1, 1, 1, Math.PI / 2 - s * 0.4))),
    blush: multiGeo(`f:blush:${key}`, () => new THREE.SphereGeometry(0.034 * k, sph[0], sph[1]), sides.map((s) => faceMatrix(R, hc, s * 0.6, -0.24, -0.012, 1.25, 0.62, 0.35))),
    fury: multiGeo(
      `f:fury:${key}`,
      () => new THREE.CapsuleGeometry(0.008 * k, 0.034 * k, cap[1], cap[0]),
      [
        faceMatrix(R, hc, 0.66, 0.46, 0.006, 1, 1, 1, 0.55),
        faceMatrix(R, hc, 0.66, 0.46, 0.006, 1, 1, 1, -0.75),
        faceMatrix(R, hc, 0.86, 0.34, 0.006, 1, 1, 1, 0.45),
        faceMatrix(R, hc, 0.86, 0.34, 0.006, 1, 1, 1, -0.95),
      ],
    ),
  };
}

export type FaceEyes = 'eyes' | 'wide' | 'happy' | 'dizzy';
export type FaceMouth = 'smile' | 'open' | 'o' | 'flat';
export type FaceBrows = 'angry' | 'worried' | null;

const FACE_COLORS = {
  ink: new THREE.Color(INK),
  mouth: new THREE.Color(MOUTH),
  fury: new THREE.Color('#e8394d'),
  cheeks: new THREE.Color('#ff6f7d'),
};

/**
 * Visage complet (yeux + bouche + sourcils [+ marques de colère, joues empourprées]) en UNE géométrie à
 * couleurs de sommets, partagée par toutes les têtes identiques : à afficher avec `vcMat` (un seul draw
 * call ; changer d'expression = échanger la géométrie).
 */
export function faceGeometry(R: number, hc: number, d: 0 | 1 | 2, eyes: FaceEyes, mouth: FaceMouth, brows: FaceBrows, fury = false): THREE.BufferGeometry {
  return cgeo(`face:${R}:${hc}:${d}:${eyes}:${mouth}:${brows}:${fury}`, () => {
    const fg = faceGeos(R, hc, d);
    const parts: [THREE.BufferGeometry, THREE.Color][] = [
      [fg[eyes], FACE_COLORS.ink],
      [fg[mouth], FACE_COLORS.mouth],
    ];
    if (brows) parts.push([fg[brows], FACE_COLORS.ink]);
    if (fury) {
      parts.push([fg.fury, FACE_COLORS.fury]);
      // joues empourprées, légèrement en avant du fard habituel (pas de z-fighting)
      const ch = fg.blush.clone().translate(0, -hc, 0).scale(1.05, 1.05, 1.05).translate(0, hc, 0);
      parts.push([ch, FACE_COLORS.cheeks]);
    }
    const colored = parts.map(([g, c]) => {
      const x = g.index ? g.toNonIndexed() : g.clone();
      for (const a of Object.keys(x.attributes)) if (a !== 'position' && a !== 'normal') x.deleteAttribute(a);
      const n = x.getAttribute('position').count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      x.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return x;
    });
    const out = mergeGeometries(colored, false)!;
    for (const c of colored) c.dispose();
    out.computeBoundingSphere();
    return out;
  });
}

/**
 * Pièce de tissu épousant le buste (plastron, revers) : bande angulaire [a(y), b(y)] (radians depuis +Z)
 * entre y0 et y1, au rayon du buste × `out`. `radius(y)` donne le rayon du buste (repère hanches).
 */
function torsoPatch(
  key: string,
  radius: (y: number) => number,
  y0: number,
  y1: number,
  a: (y: number) => number,
  b: (y: number) => number,
  out: number,
  rows = 8,
  cols = 6,
): THREE.BufferGeometry {
  return cgeo(`tpatch:${key}:${rows}:${cols}`, () => {
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= rows; i++) {
      const y = y0 + ((y1 - y0) * i) / rows;
      const r = radius(y) * out;
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

// ─────────────────────────────────────────── Construction

export function buildFigure(spec: FigureSpec = {}): Figure {
  const s = { ...DEF, ...spec };
  const g = s.girth;
  const D: 0 | 1 | 2 = spec.detail ?? (s.lowPoly ? 0 : 1);
  const Q = QUALITY[D];
  const lp = D === 0;
  const R = s.headR;
  const T = s.torsoH;
  const seated = s.seated;
  const hipY = seated ? SEAT_HIP : s.hipY;
  const sleeves = s.sleeves ?? s.top;
  const hands = s.hands ?? s.skin;
  const velvetTop = s.velvetTop ?? (s.outfit === 'suit' || s.outfit === 'longcoat' || s.outfit === 'frock' || s.outfit === 'apron');
  const topMat = velvetTop ? velvet(s.top) : matte(s.top);
  const skinMat = matte(s.skin);
  // cheveux légèrement satinés (reflet doux, lisible de haut)
  const hairMat = new THREE.Color(s.hair).getHSL({ h: 0, s: 0, l: 0 }).l > 0.8 ? matte(s.hair) : stdMat(`hair:${s.hair}`, { color: s.hair, roughness: 0.42 });
  const rad = Q.rad;

  const root = new THREE.Group();
  root.name = 'figure';

  // ── Jambes
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  for (const [leg, side] of [
    [legL, 1],
    [legR, -1],
  ] as const) {
    leg.position.set(side * 0.085 * g, hipY, 0);
    if (!seated) {
      const len = hipY - 0.1;
      leg.add(mesh(limb(0.056, len, Q.limbR, Q.limbC), matte(s.bottom)));
      leg.add(shoe(s.shoes, D, -(hipY - 0.031), 0.03));
    } else {
      // cuisse horizontale vers l'avant, tibia vertical
      const thigh = mesh(limb(0.06, 0.2, Q.limbR, Q.limbC), matte(s.bottom));
      thigh.rotation.x = -Math.PI / 2;
      leg.add(thigh);
      const shin = mesh(limb(0.054, hipY - 0.1, Q.limbR, Q.limbC), matte(s.bottom), 0, 0, 0.2);
      leg.add(shin);
      leg.add(shoe(s.shoes, D, -(hipY - 0.031), 0.235));
    }
    root.add(leg);
  }

  // ── Buste
  const hips = new THREE.Group();
  hips.position.y = hipY;
  root.add(hips);
  const torsoProfile: [number, number][] = [
    [0, -0.075],
    [0.17 * g, -0.075],
    [0.203 * g, -0.04],
    [0.212 * g, 0.04],
    [0.2 * g, 0.15],
    [0.214 * g, T * 0.6],
    [0.205 * g, T * 0.8],
    [0.158 * g, T * 0.93],
    [0.08, T * 0.99],
    [0, T + 0.004],
  ];
  const torso = mesh(lathe(torsoProfile, rad, `torso:${g}:${T}:${rad}`), topMat);
  hips.add(torso);
  const zFront = (y: number): number => {
    // rayon approximatif du buste à la hauteur y (repère hanches)
    for (let i = 1; i < torsoProfile.length; i++) {
      const [r1, y1] = torsoProfile[i];
      const [r0, y0] = torsoProfile[i - 1];
      if (y <= y1 && y >= y0) return r0 + ((r1 - r0) * (y - y0)) / Math.max(1e-4, y1 - y0);
    }
    return 0.2 * g;
  };

  let skirt: THREE.Mesh | null = null;
  const trimMat = gold(s.trim);
  if (s.outfit === 'suit' || s.outfit === 'apron' || s.outfit === 'longcoat' || s.outfit === 'frock') {
    // plastron de chemise et boutons
    // plastron en V épousant le buste, revers de part et d'autre
    const vTop = T * 0.97;
    const vBot = T * 0.46;
    const key = `${g}:${T}`;
    const vw = (y: number): number => 0.5 * Math.max(0, (y - vBot) / (vTop - vBot)) ** 0.9;
    const [pr, pc] = Q.patch;
    const vOut = D === 0 ? 1.035 : 1.02; // peu de segments : décoller davantage du buste facetté
    hips.add(mesh(torsoPatch(`v:${key}`, zFront, vBot, vTop, (y) => -vw(y), (y) => vw(y), vOut, pr, pc), matte(s.shirt)));
    if (s.lapels) {
      const lm = velvet(s.lapels);
      hips.add(mesh(torsoPatch(`lapL:${key}`, zFront, vBot - 0.02, vTop, (y) => vw(y), (y) => vw(y) + 0.3, vOut + 0.01, pr, pc), lm));
      hips.add(mesh(torsoPatch(`lapR:${key}`, zFront, vBot - 0.02, vTop, (y) => -vw(y) - 0.3, (y) => -vw(y), vOut + 0.01, pr, pc), lm));
    }
    for (const y of [T * 0.4, T * 0.24]) hips.add(mesh(ball(0.014, Q.small[0], Q.small[1]), trimMat, 0, y, zFront(y) + 0.004));
  }
  if (s.outfit === 'apron') {
    // tablier épousant les hanches, légèrement évasé vers le bas
    const apR = (y: number): number => (0.214 + Math.max(0, -y) * 0.12) * g;
    const ap = mesh(torsoPatch(`apron:${g}`, apR, -0.27, 0.12, () => -0.85, () => 0.85, 1.04, Q.patch[0], Q.patch[1] + 2), matte(s.apron));
    hips.add(ap);
    hips.add(mesh(flatTorus(0.208 * g, 0.012, Q.ring[0], rad), matte(s.apron), 0, 0.12, 0));
  }
  if (s.outfit === 'dress') {
    skirt = mesh(
      lathe(
        [
          [0, -0.2],
          [0.27 * g, -0.2],
          [0.29 * g, -0.175],
          [0.25 * g, -0.05],
          [0.212 * g, 0.1],
          [0.2 * g, 0.15],
          [0, 0.15],
        ],
        rad,
        `skirt:${g}:${rad}`,
      ),
      topMat,
    );
    hips.add(skirt);
  }
  if (s.outfit === 'gown') {
    skirt = mesh(
      lathe(
        [
          [0, -hipY + 0.012],
          [0.37 * g, -hipY + 0.012],
          [0.38 * g, -hipY + 0.05],
          [0.31 * g, -0.12],
          [0.235 * g, 0.04],
          [0.2 * g, 0.15],
          [0, 0.15],
        ],
        rad + 6,
        `gown:${g}:${hipY}:${rad}`,
      ),
      topMat,
    );
    hips.add(skirt);
  }
  if (s.outfit === 'longcoat') {
    skirt = mesh(
      lathe(
        [
          [0, -hipY + 0.14],
          [0.25 * g, -hipY + 0.14],
          [0.262 * g, -hipY + 0.16],
          [0.225 * g, 0.02],
          [0.212 * g, 0.12],
          [0, 0.12],
        ],
        rad,
        `coat:${g}:${hipY}:${rad}`,
      ),
      topMat,
    );
    hips.add(skirt);
  }
  if (s.outfit === 'frock') {
    skirt = mesh(
      lathe(
        [
          [0, -0.13],
          [0.265 * g, -0.13],
          [0.27 * g, -0.11],
          [0.222 * g, 0.02],
          [0.21 * g, 0.1],
          [0, 0.1],
        ],
        rad,
        `frock:${g}:${rad}`,
      ),
      topMat,
    );
    hips.add(skirt);
    hips.add(mesh(flatTorus(0.262 * g, 0.012, Q.ring[0], rad), trimMat, 0, -0.12, 0));
  }

  // ── Cols
  const neckY = T - 0.035;
  if (s.neck === 'bowtie') {
    const m = matte(s.neckColor);
    for (const sd of [1, -1]) {
      const lobe = mesh(sphere(0.032, Q.mid[0], Q.mid[1]), m, sd * 0.032, neckY, zFront(neckY) + 0.012);
      lobe.scale.set(1.15, 0.8, 0.5);
      lobe.rotation.z = sd * 0.25;
      hips.add(lobe);
    }
    hips.add(mesh(ball(0.015, Q.small[0], Q.small[1]), m, 0, neckY, zFront(neckY) + 0.022));
  } else if (s.neck === 'pearls') {
    const pm = ceramic('#fbf6ee');
    // seule la moitié avant est visible : perles devant et sur les côtés
    const n = D === 0 ? 6 : 11;
    for (let i = 0; i < n; i++) {
      const a = -1.7 + (3.4 * i) / (n - 1);
      hips.add(mesh(ball(0.0145, Q.small[0] + 1, Q.small[1]), pm, Math.sin(a) * 0.1, neckY - 0.015 - Math.cos(a) * 0.02, Math.cos(a) * 0.095));
    }
  } else if (s.neck === 'ruff') {
    const wm = matte(PALETTE.ivory);
    const n = D === 0 ? 7 : 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      hips.add(mesh(ball(0.042, Q.mid[0], Q.mid[1]), wm, Math.sin(a) * 0.1, neckY + 0.012, Math.cos(a) * 0.1));
    }
  } else if (s.neck === 'jabot') {
    const wm = matte(PALETTE.ivory);
    hips.add(mesh(ball(0.036, Q.mid[0], Q.mid[1]), wm, 0, neckY - 0.01, 0.1));
    hips.add(mesh(ball(0.032, Q.mid[0], Q.mid[1]), wm, 0, neckY - 0.06, zFront(neckY - 0.06) - 0.012));
    hips.add(mesh(ball(0.027, Q.mid[0], Q.mid[1]), wm, 0, neckY - 0.105, zFront(neckY - 0.105) - 0.008));
  } else if (s.neck === 'chain') {
    const c = mesh(flatTorus(0.105, 0.007, Q.ring[0], Q.ring[1] + 4), trimMat, 0, neckY - 0.03, 0.01);
    c.rotation.x = 0.35;
    hips.add(c);
  } else if (s.neck === 'scarf') {
    const m = velvet(s.neckColor);
    hips.add(mesh(flatTorus(0.095, 0.032, Q.ring[0] + 2, Q.ring[1] + 2), m, 0, neckY + 0.005, 0));
    const tail = mesh(limb(0.026, 0.14, Q.limbR, Q.limbC), m, 0.05, neckY - 0.01, 0.11);
    tail.rotation.set(-0.2, 0, 0.12);
    hips.add(tail);
  }

  // ── Tête
  const head = new THREE.Group();
  head.position.y = T;
  hips.add(head);
  const hc = R + 0.008;
  head.add(mesh(sphere(R, Q.head[0], Q.head[1]), skinMat, 0, hc, 0));
  head.add(mesh(limb(0.06, 0.03, Q.limbR, Q.limbC), skinMat, 0, 0.04, 0)); // cou

  const fg = faceGeos(R, hc, D);
  const inkMat = ceramic(INK);
  const face: Record<string, THREE.Mesh> = {};
  const addFace = (name: keyof FaceGeos, mat: THREE.Material, visible: boolean): void => {
    const m = new THREE.Mesh(fg[name], mat);
    m.castShadow = false;
    m.userData.keep = true;
    m.userData.part = name;
    m.visible = visible;
    face[name] = m;
    head.add(m);
  };
  addFace('eyes', inkMat, true);
  addFace('wide', inkMat, false);
  addFace('happy', inkMat, false);
  addFace('dizzy', inkMat, false);
  addFace('smile', matte(MOUTH), true);
  addFace('open', matte(MOUTH), false);
  addFace('o', matte(MOUTH), false);
  addFace('flat', matte(MOUTH), false);
  addFace('angry', matte(s.hairStyle === 'wig' || s.hairStyle === 'bald' ? INK : s.hair), false);
  addFace('worried', matte(s.hairStyle === 'wig' || s.hairStyle === 'bald' ? INK : s.hair), false);
  if (s.blush) {
    const b = new THREE.Mesh(fg.blush, matte(BLUSH));
    b.castShadow = false;
    head.add(b);
  }
  if (s.nose === 'button') head.add(mesh(ball(0.02 * (R / 0.18), Q.small[0] + 2, Q.small[1] + 1), skinMat, 0, hc - 0.03, R * 0.98));
  if (s.nose === 'long') {
    const n = mesh(capsule(0.022, 0.06, Q.limbR, Q.limbC), skinMat, 0, hc - 0.015, R * 0.98 + 0.02);
    n.rotation.x = Math.PI / 2 - 0.35;
    head.add(n);
  }
  if (s.mustache) {
    const mm = matte(s.hair);
    for (const sd of [1, -1]) {
      const m = mesh(capsule(0.012, 0.05, Q.limbR, Q.limbC), mm, sd * 0.034, hc - 0.07, R * 0.95);
      m.rotation.set(0, sd * 0.3, Math.PI / 2 + sd * 0.35);
      head.add(m);
    }
  }

  buildHair(head, s.hairStyle, hairMat, R, hc, Q, lp);
  buildHat(head, s.hat, s.hatColor, s.hatTrim, R, hc, Q);
  buildGlasses(head, s.glasses, s.glassesColor, R, hc, Q);

  // ── Bras
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  const handL = new THREE.Object3D();
  const handR = new THREE.Object3D();
  const shY = T * 0.86;
  for (const [arm, hand, side] of [
    [armL, handL, 1],
    [armR, handR, -1],
  ] as const) {
    arm.position.set(side * (0.2 * g + 0.025), shY, 0);
    arm.add(mesh(limb(0.05, s.armLen, Q.limbR, Q.limbC), velvetTop ? velvet(sleeves) : matte(sleeves)));
    arm.add(mesh(ball(0.056, Q.hand[0], Q.hand[1]), matte(hands), 0, -s.armLen - 0.012, 0));
    hand.position.set(0, -s.armLen - 0.012, 0);
    arm.add(hand);
    arm.rotation.z = side * 0.12;
    hips.add(arm);
  }

  const hatExtra = s.hat === 'tophat' ? R * 1.3 : s.hat === 'none' ? (s.hairStyle === 'updo' || s.hairStyle === 'bun' ? R * 0.35 : R * 0.1) : R * 0.45;
  const height = hipY + T + hc + R + hatExtra;

  const fig: Figure = {
    root,
    hips,
    legL,
    legR,
    head,
    armL,
    armR,
    handL,
    handR,
    torso,
    skirt,
    hipY,
    torsoH: T,
    headC: hc,
    headR: R,
    height,
    seated,
    armLen: s.armLen,
    setExpr(e: Expr) {
      const eyes = e === 'happy' || e === 'laugh' || e === 'calm' ? 'happy' : e === 'dizzy' ? 'dizzy' : e === 'o' || e === 'worried' ? 'wide' : 'eyes';
      const mouth = e === 'laugh' || e === 'open' ? 'open' : e === 'o' || e === 'worried' || e === 'dizzy' ? 'o' : e === 'flat' || e === 'angry' ? 'flat' : 'smile';
      for (const k of ['eyes', 'wide', 'happy', 'dizzy'] as const) face[k].visible = k === eyes;
      for (const k of ['smile', 'open', 'o', 'flat'] as const) face[k].visible = k === mouth;
      face.angry.visible = e === 'angry';
      face.worried.visible = e === 'worried';
    },
  };
  return fig;
}

/** Chaussure : boîte arrondie (détail moyen / haut) ou ovoïde léger (détail bas). */
function shoe(color: string, d: number, y: number, z: number): THREE.Mesh {
  if (d === 0) {
    const m = mesh(sphere(0.07, 6, 3), ceramic(color), 0, y + 0.004, z);
    m.scale.set(0.72, 0.42, 1.18);
    return m;
  }
  return mesh(roundedBox(0.1, 0.062, 0.165, 0.026, d === 1 ? 1 : 2), ceramic(color), 0, y, z);
}

// ─────────────────────────────────────────── Cheveux

function cap(R: number, Q: Quality): THREE.BufferGeometry {
  return partSphere(R * 1.05, 0, TAU, 0, Math.PI * 0.53, Q.hair[0], Q.hair[1]);
}

function buildHair(head: THREE.Group, style: HairStyle, m: THREE.Material, R: number, hc: number, Q: Quality, lp: boolean): void {
  if (style === 'bald') return;
  const [mw, mh] = Q.mid;
  const addCap = (tilt = -0.6): void => {
    const c = mesh(cap(R, Q), m, 0, hc + R * 0.01, -R * 0.02);
    c.rotation.x = tilt;
    head.add(c);
  };
  switch (style) {
    case 'short':
      addCap();
      break;
    case 'slick': {
      addCap(-0.45);
      const part = mesh(sphere(R * 0.5, mw, mh), m, R * 0.28, hc + R * 0.8, R * 0.32);
      part.scale.set(1.3, 0.45, 1.05);
      part.rotation.z = -0.35;
      head.add(part);
      break;
    }
    case 'quiff': {
      addCap();
      const q = mesh(sphere(R * 0.52, mw + 2, mh + 1), m, R * 0.12, hc + R * 0.84, R * 0.42);
      q.scale.set(1.3, 0.62, 1.0);
      q.rotation.set(0.25, 0, -0.28);
      head.add(q);
      break;
    }
    case 'bob':
    case 'long': {
      addCap(-0.25);
      const sh = mesh(partSphere(R * 1.12, Math.PI / 2 + 0.78, TAU - 1.56, Math.PI * 0.3, Math.PI * 0.42, Q.hair[0], Math.max(3, Q.hair[1] - 2)), m, 0, hc, -R * 0.03);
      head.add(sh);
      const fr = mesh(sphere(R * 0.55, mw + 2, mh), m, 0, hc + R * 0.64, R * 0.6);
      fr.scale.set(1.45, 0.42, 0.75);
      fr.rotation.x = 0.55;
      head.add(fr);
      if (style === 'long') head.add(mesh(roundedBox(R * 1.75, R * 1.7, R * 0.55, R * 0.25, lp ? 1 : 2), m, 0, hc - R * 0.95, -R * 0.62));
      break;
    }
    case 'bun':
      addCap(-0.3);
      head.add(mesh(sphere(R * 0.45, mw + 2, mh + 1), m, 0, hc + R * 0.82, -R * 0.55));
      break;
    case 'updo':
      addCap(-0.3);
      head.add(mesh(sphere(R * 0.52, mw + 2, mh + 1), m, 0, hc + R * 1.02, -R * 0.28));
      head.add(mesh(sphere(R * 0.32, mw, mh), m, 0, hc + R * 1.32, -R * 0.2));
      break;
    case 'curly': {
      addCap(-0.3);
      const n = lp ? 5 : 10;
      for (let i = 0; i < n; i++) {
        const yaw = Math.PI + (i - (n - 1) / 2) * (lp ? 0.75 : 0.4);
        const pitch = 0.2 + (i % 3) * 0.32;
        const p = headPoint(R, hc, yaw, pitch, R * 0.04);
        head.add(mesh(sphere(R * (lp ? 0.36 : 0.32), mw, mh), m, p.x, p.y, p.z));
      }
      for (const sd of [1, -1]) {
        const p = headPoint(R, hc, sd * 0.95, 0.75, R * 0.02);
        head.add(mesh(sphere(R * 0.3, mw, mh), m, p.x, p.y, p.z));
      }
      break;
    }
    case 'ponytail': {
      addCap(-0.3);
      head.add(mesh(ball(R * 0.17, mw, mh), m, 0, hc + R * 0.45, -R * 0.98));
      const t = mesh(limb(R * 0.2, R * 0.85, Q.limbR, Q.limbC), m, 0, hc + R * 0.42, -R * 1.05);
      t.rotation.x = 0.55;
      head.add(t);
      break;
    }
    case 'wig': {
      addCap(-0.3);
      for (const sd of [1, -1]) {
        for (const [dy, dz] of [
          [-0.05, -0.18],
          [-0.42, -0.25],
        ]) {
          const roll = mesh(capsule(R * 0.19, R * 0.48, Q.limbR, Q.limbC), m, sd * R * 0.98, hc + R * dy, R * dz);
          roll.rotation.x = Math.PI / 2;
          head.add(roll);
        }
      }
      const q = mesh(limb(R * 0.16, R * 0.6, Q.limbR, Q.limbC), m, 0, hc - R * 0.2, -R * 1.02);
      q.rotation.x = 0.25;
      head.add(q);
      const bow = matte(INK);
      for (const sd of [1, -1]) {
        const b = mesh(sphere(R * 0.16, mw, mh), bow, sd * R * 0.15, hc - R * 0.2, -R * 1.1);
        b.scale.set(1.2, 0.8, 0.5);
        head.add(b);
      }
      break;
    }
  }
}

// ─────────────────────────────────────────── Chapeaux

function buildHat(head: THREE.Group, hat: HatStyle, color: string, trimC: string, R: number, hc: number, Q: Quality): void {
  if (hat === 'none') return;
  const m = velvet(color);
  const trim = matte(trimC);
  const rad = Q.hat;
  const [mw, mh] = Q.mid;
  const [sw, sh] = Q.small;
  const hRows = Math.max(3, Math.round(rad / 3));
  switch (hat) {
    case 'beret': {
      const b = mesh(sphere(R * 1.0, rad, Math.max(5, hRows + 2)), m, R * 0.06, hc + R * 0.8, -R * 0.03);
      b.scale.set(1.12, 0.32, 1.12);
      b.rotation.z = 0.22;
      head.add(b);
      head.add(mesh(limb(0.008, 0.02, Q.limbR, 1), m, R * 0.02, hc + R * 1.15, 0));
      break;
    }
    case 'bowler': {
      head.add(mesh(partSphere(R * 0.9, 0, TAU, 0, Math.PI / 2, rad, hRows), m, 0, hc + R * 0.5, 0));
      head.add(mesh(chamferCylinder(R * 1.32, R * 1.32, 0.016, 0.006, rad), m, 0, hc + R * 0.47, 0));
      head.add(mesh(chamferCylinder(R * 0.92, R * 0.92, R * 0.16, 0.004, rad), trim, 0, hc + R * 0.5, 0));
      break;
    }
    case 'tophat': {
      const g = new THREE.Group();
      g.position.set(0, hc + R * 0.6, 0);
      g.rotation.z = -0.08;
      g.add(mesh(chamferCylinder(R * 0.72, R * 0.68, R * 1.25, 0.012, rad), m));
      g.add(mesh(chamferCylinder(R * 1.22, R * 1.22, 0.016, 0.006, rad), m, 0, -0.005, 0));
      g.add(mesh(chamferCylinder(R * 0.705, R * 0.69, R * 0.22, 0.004, rad), trim, 0, R * 0.04, 0));
      head.add(g);
      break;
    }
    case 'sunhat': {
      const g = new THREE.Group();
      g.position.set(0, hc + R * 0.5, -R * 0.05);
      g.rotation.x = -0.14;
      g.add(mesh(chamferCylinder(R * 1.85, R * 1.85, 0.014, 0.006, rad + 4), m));
      g.add(mesh(partSphere(R * 0.92, 0, TAU, 0, Math.PI / 2, rad, hRows), m));
      g.add(mesh(chamferCylinder(R * 0.93, R * 0.93, R * 0.18, 0.004, rad), trim, 0, 0.004, 0));
      g.add(mesh(ball(R * 0.17, mw, mh), matte(PALETTE.roseDeep), R * 0.82, R * 0.14, R * 0.35));
      g.add(mesh(ball(R * 0.12, mw, mh), matte(PALETTE.blush), R * 0.72, R * 0.16, R * 0.55));
      head.add(g);
      break;
    }
    case 'cap': {
      const c = mesh(partSphere(R * 1.07, 0, TAU, 0, Math.PI * 0.5, rad, hRows), m, 0, hc + R * 0.12, -R * 0.02);
      c.rotation.x = -0.18;
      head.add(c);
      const v = mesh(roundedBox(R * 1.15, 0.016, R * 0.85, 0.007, rad < 12 ? 1 : 2), m, 0, hc + R * 0.4, R * 0.98);
      v.rotation.x = 0.12;
      head.add(v);
      head.add(mesh(ball(R * 0.1, sw, sh), trim, 0, hc + R * 1.18, 0));
      break;
    }
    case 'bucket': {
      head.add(mesh(chamferCylinder(R * 0.86, R * 1.02, R * 0.55, 0.02, rad), m, 0, hc + R * 0.28, 0));
      head.add(
        mesh(
          lathe(
            [
              [R * 0.98, R * 0.24],
              [R * 1.5, R * 0.02],
              [R * 1.52, R * 0.06],
              [R * 1.0, R * 0.3],
            ],
            rad,
            `bucketbrim:${R}:${rad}`,
          ),
          m,
          0,
          hc,
          0,
        ),
      );
      head.add(mesh(chamferCylinder(R * 0.875, R * 0.95, R * 0.12, 0.004, rad), trim, 0, hc + R * 0.36, 0));
      break;
    }
    case 'fascinator': {
      const g = new THREE.Group();
      g.position.set(R * 0.55, hc + R * 0.82, R * 0.12);
      g.rotation.set(0.2, 0, -0.55);
      g.add(mesh(chamferCylinder(R * 0.38, R * 0.38, 0.012, 0.005, rad), m));
      const f = mesh(sphere(0.02, mw, mh), trim, -R * 0.1, R * 0.32, -R * 0.15);
      f.scale.set(0.6, 4.2, 1.2);
      f.rotation.x = -0.4;
      g.add(f);
      g.add(mesh(ball(R * 0.15, mw, mh), trim, R * 0.12, 0.03, R * 0.1));
      head.add(g);
      break;
    }
    case 'crown': {
      const gm = gold();
      const g = new THREE.Group();
      g.position.set(0, hc + R * 0.82, 0);
      g.rotation.z = 0.12;
      g.add(mesh(chamferCylinder(R * 0.48, R * 0.42, R * 0.3, 0.006, rad), gm));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        g.add(mesh(ball(0.016, sw + 1, sh), gm, Math.sin(a) * R * 0.46, R * 0.38, Math.cos(a) * R * 0.46));
      }
      g.add(mesh(ball(0.02, sw + 1, sh), matte(PALETTE.roseDeep), 0, R * 0.15, R * 0.47));
      head.add(g);
      break;
    }
    case 'tiara': {
      const gm = gold();
      const t = mesh(torus(R * 0.8, 0.009, Q.ring[0], Q.ring[1], Math.PI), gm, 0, hc + R * 0.55, R * 0.12);
      t.rotation.x = -0.45;
      head.add(t);
      head.add(mesh(ball(0.022, sw + 1, sh), matte(PALETTE.rose), 0, hc + R * 1.25, R * 0.48));
      break;
    }
    case 'flower': {
      const g = new THREE.Group();
      g.position.copy(headPoint(R, hc, 0.85, 0.55, 0.01));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        g.add(mesh(ball(R * 0.12, sw + 1, sh), m, Math.cos(a) * R * 0.11, Math.sin(a) * R * 0.11, 0));
      }
      g.add(mesh(ball(R * 0.09, sw + 1, sh), gold(), 0, 0, R * 0.04));
      g.lookAt(headPoint(R, hc, 0.85, 0.55, 1));
      head.add(g);
      break;
    }
  }
}

// ─────────────────────────────────────────── Lunettes

function buildGlasses(head: THREE.Group, style: GlassesStyle, color: string, R: number, hc: number, Q: Quality): void {
  if (style === 'none') return;
  const k = R / 0.18;
  const [tr, tt] = Q.face.tor;
  const [ew, eh] = Q.face.sph;
  if (style === 'round') {
    const gm = gold(color);
    const geo = multiGeo(`gl:round:${R}:${hc}:${tt}`, () => new THREE.TorusGeometry(0.038 * k, 0.0055 * k, tr, tt + 6), [1, -1].map((sd) => faceMatrix(R, hc, sd * EYE_YAW, EYE_PITCH, 0.012)));
    head.add(new THREE.Mesh(geo, gm));
  } else if (style === 'sun') {
    const geo = multiGeo(`gl:sun:${R}:${hc}:${ew}`, () => new THREE.SphereGeometry(0.046 * k, ew + 2, eh + 1), [1, -1].map((sd) => faceMatrix(R, hc, sd * 0.36, EYE_PITCH + 0.02, 0.006, 1.25, 0.88, 0.32)));
    const m = new THREE.Mesh(geo, ceramic('#2a2230'));
    m.castShadow = false;
    head.add(m);
    const br = mesh(capsule(0.006 * k, 0.03 * k, 4, 1), gold(), 0, hc + Math.sin(EYE_PITCH + 0.06) * R, R * 1.02);
    br.rotation.z = Math.PI / 2;
    head.add(br);
  } else {
    // monocle sur l'œil droit (−X) + chaînette
    const p = headPoint(R, hc, -EYE_YAW, EYE_PITCH, 0.012);
    const ring = mesh(torus(0.04 * k, 0.006 * k, 6, 18), gold(color), p.x, p.y, p.z);
    ring.rotation.set(-EYE_PITCH, -EYE_YAW, 0, 'YXZ');
    head.add(ring);
    const lens = new THREE.Mesh(cgeo(`lens:${k}`, () => new THREE.CircleGeometry(0.038 * k, 16)), glass('#eaf6ff', 0.4));
    lens.position.copy(p);
    lens.rotation.copy(ring.rotation);
    head.add(lens);
    const ch = mesh(torus(0.07 * k, 0.003, 4, 16, Math.PI * 0.8), gold(color), p.x - 0.01, p.y - 0.07 * k, p.z - 0.02);
    ch.rotation.set(0, -EYE_YAW - 0.3, Math.PI * 0.75);
    head.add(ch);
  }
}

// ─────────────────────────────────────────── Compactage

/**
 * Fusionne les parties statiques de la silhouette (buste, tête, bras, jambes) en quelques meshes par pivot :
 * divise les draw calls par ~4. À appeler après avoir ajouté les accessoires statiques, avant les éléments
 * animés (plateaux, voiles…). Les objets marqués `userData.keep` (et les traits du visage) restent à part.
 */
export function compactFigure(f: Figure): void {
  const pivots = [f.head, f.armL, f.armR];
  f.handL.userData.keep = true;
  f.handR.userData.keep = true;
  if (f.skirt) f.skirt.userData.keep = true;
  for (const p of pivots) p.userData.keep = true;
  bakeInPlace(f.hips);
  for (const p of pivots) p.userData.keep = false;
  for (const p of [...pivots, f.legL, f.legR]) bakeInPlace(p);
}

// ─────────────────────────────────────────── Poses

/** Remet les pivots dans leur pose de repos (à appeler avant de composer une pose). */
export function resetPose(f: Figure): void {
  f.hips.position.set(0, f.hipY, 0);
  f.hips.rotation.set(0, 0, 0);
  f.hips.scale.set(1, 1, 1);
  f.head.rotation.set(0, 0, 0);
  f.armL.rotation.set(0, 0, 0.12);
  f.armR.rotation.set(0, 0, -0.12);
  f.legL.rotation.set(0, 0, 0);
  f.legR.rotation.set(0, 0, 0);
  f.legL.position.y = f.hipY;
  f.legR.position.y = f.hipY;
  if (f.skirt) f.skirt.scale.set(1, 1, 1);
}

/** Cycle de marche additif : jambes, balancier des bras, rebond, torsion des épaules. */
export function walkCycle(f: Figure, phase: number, amp: number, armSwing = 1, bounce = 0.035): void {
  if (amp <= 0.001) return;
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  if (!f.seated) {
    f.legL.rotation.x += -s * 0.62 * amp;
    f.legR.rotation.x += s * 0.62 * amp;
  }
  f.armL.rotation.x += s * 0.55 * amp * armSwing;
  f.armR.rotation.x += -s * 0.55 * amp * armSwing;
  const b = Math.abs(c) * bounce * amp;
  f.hips.position.y += b;
  f.legL.position.y += b;
  f.legR.position.y += b;
  f.hips.rotation.y += s * 0.09 * amp;
  f.hips.rotation.z += s * 0.035 * amp;
  f.head.rotation.y -= s * 0.06 * amp;
  if (f.skirt) f.skirt.rotation.y = s * 0.12 * amp;
}

const _v = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);

/** Oriente un bras (pivot à l'épaule) vers une direction locale au buste. */
export function aimArm(arm: THREE.Object3D, dx: number, dy: number, dz: number): void {
  _v.set(dx, dy, dz).normalize();
  arm.quaternion.setFromUnitVectors(_down, _v);
}

/** Lève les jambes pour une position assise (sans chaise) — utilisé par quelques PNJ. */
export function sitLegs(f: Figure, k: number): void {
  if (f.seated) return;
  f.legL.rotation.x -= 1.45 * k;
  f.legR.rotation.x -= 1.45 * k;
}
