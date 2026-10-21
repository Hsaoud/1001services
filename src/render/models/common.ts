/**
 * Outils communs des modèles (personnages, plats) : géométries mises en cache, « cuisson » (fusion) de
 * sous-arbres statiques en quelques meshes, matériaux par instance (fondu, teinte), formes décoratives
 * (étoiles, cœurs, éclats), easings et petites textures procédurales.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ─────────────────────────────────────────── Maths & easings

export const TAU = Math.PI * 2;

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Dépassement élastique doux (apparitions « pop »). */
export function easeOutBack(t: number, s = 1.70158): number {
  const u = clamp01(t) - 1;
  return 1 + u * u * ((s + 1) * u + s);
}

/** Rebond élastique (pop-in des plats). */
export function easeOutElastic(t: number): number {
  const x = clamp01(t);
  if (x === 0 || x === 1) return x;
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
}

export const easeInCubic = (t: number): number => clamp01(t) ** 3;
export const easeOutCubic = (t: number): number => 1 - (1 - clamp01(t)) ** 3;

/** Bosse 0 → 1 → 0 sur [0, 1]. */
export const bump = (t: number): number => Math.sin(Math.PI * clamp01(t));

/** Pseudo-aléatoire déterministe dans [0, 1[ (hachage entier). */
export function hash01(a: number, b = 0): number {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function pick<T>(arr: readonly T[], r: number): T {
  return arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];
}

/** Bruit lisse 1D (somme de sinus) dans [−1, 1], pour les regards et oscillations « vivantes ». */
export function wobble(t: number, seed = 0): number {
  return (Math.sin(t * 1.13 + seed * 3.1) * 0.6 + Math.sin(t * 2.37 + seed * 1.7) * 0.3 + Math.sin(t * 4.71 + seed) * 0.1);
}

// ─────────────────────────────────────────── Géométries (cache local)

// la géométrie interne des sprites est partagée par tous les sprites : ne jamais la libérer
new THREE.Sprite().geometry.userData.shared = true;

const geoCache = new Map<string, THREE.BufferGeometry>();

/** Géométrie partagée mise en cache (marquée `shared` : jamais libérée par disposeTree). */
export function cgeo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    g.userData.shared = true;
    geoCache.set(key, g);
  }
  return g;
}

/** Membre (capsule) : centre de la sphère haute à y = 0, centre de la sphère basse à y = −len. */
export function limb(r: number, len: number, radial = 10, capSeg = 4): THREE.BufferGeometry {
  return cgeo(`limb:${r}:${len}:${radial}:${capSeg}`, () => {
    const g = new THREE.CapsuleGeometry(r, Math.max(0.0001, len), capSeg, radial);
    g.translate(0, -len / 2, 0);
    return g;
  });
}

/** Capsule centrée (axe Y). */
export function capsule(r: number, len: number, radial = 10, capSeg = 4): THREE.BufferGeometry {
  return cgeo(`caps:${r}:${len}:${radial}:${capSeg}`, () => new THREE.CapsuleGeometry(r, Math.max(0.0001, len), capSeg, radial));
}

/** Sphère partielle (cheveux, coquilles, dômes). Voir THREE.SphereGeometry pour les angles. */
export function partSphere(
  r: number,
  phiStart: number,
  phiLen: number,
  thetaStart: number,
  thetaLen: number,
  w = 18,
  h = 10,
): THREE.BufferGeometry {
  return cgeo(`psph:${r}:${phiStart.toFixed(3)}:${phiLen.toFixed(3)}:${thetaStart.toFixed(3)}:${thetaLen.toFixed(3)}:${w}:${h}`, () =>
    new THREE.SphereGeometry(r, w, h, phiStart, phiLen, thetaStart, thetaLen),
  );
}

/** Sphère à faible nombre de faces (petits détails). */
export function ball(r: number, w = 10, h = 8): THREE.BufferGeometry {
  return cgeo(`ball:${r}:${w}:${h}`, () => new THREE.SphereGeometry(r, w, h));
}

/** Disque horizontal (face vers +Y). */
export function disc(r: number, seg = 28): THREE.BufferGeometry {
  return cgeo(`disc:${r}:${seg}`, () => {
    const g = new THREE.CircleGeometry(r, seg);
    g.rotateX(-Math.PI / 2);
    return g;
  });
}

/** Anneau plat horizontal (face vers +Y). */
export function flatRing(r0: number, r1: number, seg = 40): THREE.BufferGeometry {
  return cgeo(`fring:${r0}:${r1}:${seg}`, () => {
    const g = new THREE.RingGeometry(r0, r1, seg);
    g.rotateX(-Math.PI / 2);
    return g;
  });
}

/** Tore couché à plat (dans le plan XZ). */
export function flatTorus(r: number, tube: number, radial = 8, tubular = 32, arc = TAU): THREE.BufferGeometry {
  return cgeo(`ftor:${r}:${tube}:${radial}:${tubular}:${arc}`, () => {
    const g = new THREE.TorusGeometry(r, tube, radial, tubular, arc);
    g.rotateX(Math.PI / 2);
    return g;
  });
}

/** Boîte simple (arêtes vives). */
export function box(w: number, h: number, d: number): THREE.BufferGeometry {
  return cgeo(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
}

/** Petit éclat irrégulier (pistache, chocolat, graines). */
export function chunk(r: number): THREE.BufferGeometry {
  return cgeo(`chunk:${r}`, () => new THREE.DodecahedronGeometry(r, 0));
}

/** Étoile à 5 branches extrudée, centrée, face vers +Z. */
export function starGeo(size = 0.06, depth = 0.018): THREE.BufferGeometry {
  return cgeo(`star:${size}:${depth}`, () => {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? size : size * 0.45;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    }
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, {
      depth,
      bevelEnabled: true,
      bevelThickness: depth * 0.4,
      bevelSize: size * 0.12,
      bevelSegments: 2,
    });
    g.center();
    return g;
  });
}

/** Cœur extrudé, centré, pointe vers −Y, face vers +Z. */
export function heartGeo(size = 0.08, depth = 0.025, curveSegments = 10, bevelSegments = 2): THREE.BufferGeometry {
  return cgeo(`heart:${size}:${depth}:${curveSegments}:${bevelSegments}`, () => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.5);
    s.bezierCurveTo(-0.1, -0.38, -0.55, -0.12, -0.55, 0.16);
    s.bezierCurveTo(-0.55, 0.42, -0.32, 0.55, -0.16, 0.55);
    s.bezierCurveTo(-0.06, 0.55, 0, 0.47, 0, 0.36);
    s.bezierCurveTo(0, 0.47, 0.06, 0.55, 0.16, 0.55);
    s.bezierCurveTo(0.32, 0.55, 0.55, 0.42, 0.55, 0.16);
    s.bezierCurveTo(0.55, -0.12, 0.1, -0.38, 0, -0.5);
    const g = new THREE.ExtrudeGeometry(s, {
      depth: depth / size,
      bevelEnabled: true,
      bevelThickness: 0.12,
      bevelSize: 0.09,
      bevelSegments,
      curveSegments,
    });
    g.center();
    g.scale(size, size, size);
    return g;
  });
}

/** Éclat plat à 4 branches (scintillement), face vers +Z. */
export function sparkleGeo(size = 0.05): THREE.BufferGeometry {
  return cgeo(`spark:${size}`, () => {
    const s = new THREE.Shape();
    const k = 0.22;
    s.moveTo(0, size);
    s.quadraticCurveTo(size * k, size * k, size, 0);
    s.quadraticCurveTo(size * k, -size * k, 0, -size);
    s.quadraticCurveTo(-size * k, -size * k, -size, 0);
    s.quadraticCurveTo(-size * k, size * k, 0, size);
    return new THREE.ShapeGeometry(s, 6);
  });
}

/**
 * Tourbillon de crème fouettée (douille cannelée) : dôme torsadé à `ridges` cannelures, base à y = 0.
 */
export function swirlGeo(r = 0.04, h = 0.05, ridges = 8, twist = 5, rings = 18, seg = 40): THREE.BufferGeometry {
  return cgeo(`swirl:${r}:${h}:${ridges}:${twist}:${rings}:${seg}`, () => {
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= rings; i++) {
      const v = i / rings;
      // profil : base bombée qui s'affine vers une pointe légèrement recourbée
      const R = r * Math.pow(1 - v, 0.75) * (1 + 0.25 * Math.sin(v * Math.PI * 3) * (1 - v));
      const y = h * (1 - Math.pow(1 - v, 1.6));
      for (let j = 0; j <= seg; j++) {
        const th = (j / seg) * TAU;
        const rr = R * (1 + 0.14 * Math.cos(ridges * th + twist * v * TAU * 0.3));
        pos.push(Math.cos(th) * rr + (v > 0.85 ? (v - 0.85) * r * 0.6 : 0), y, Math.sin(th) * rr);
      }
    }
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < seg; j++) {
        const a = i * (seg + 1) + j;
        const b = a + seg + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });
}

/** Petite boule « nuage » (pompons de caniche, fumée) : grappe de sphères fusionnées. */
export function puffGeo(r: number, lobes = 6, seed = 1): THREE.BufferGeometry {
  return cgeo(`puff:${r}:${lobes}:${seed}`, () => {
    const parts: THREE.BufferGeometry[] = [new THREE.SphereGeometry(r * 0.78, 10, 7)];
    for (let i = 0; i < lobes; i++) {
      const a = (i / lobes) * TAU + hash01(seed, i) * 0.6;
      const e = (hash01(seed, i + 40) - 0.35) * 1.2;
      const s = new THREE.SphereGeometry(r * (0.42 + hash01(seed, i + 9) * 0.12), 8, 5);
      s.translate(Math.cos(a) * Math.cos(e) * r * 0.5, Math.sin(e) * r * 0.5, Math.sin(a) * Math.cos(e) * r * 0.5);
      parts.push(s);
    }
    const g = mergeGeometries(parts.map((p) => p.toNonIndexed()), false)!;
    for (const p of parts) p.dispose();
    g.computeVertexNormals();
    return g;
  });
}

// ─────────────────────────────────────────── Matériaux spéciaux (cache local)

const matCache = new Map<string, THREE.Material>();

function cmat<T extends THREE.Material>(key: string, make: () => T): T {
  let m = matCache.get(key);
  if (!m) {
    m = make();
    m.userData.shared = true;
    matCache.set(key, m);
  }
  return m as T;
}

/** Matériau à couleurs de sommets (résultat de la cuisson), par niveau de rugosité. */
export function vcMat(rough: number): THREE.MeshStandardMaterial {
  return cmat(`vc:${rough}`, () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: 0 }));
}

/** Matériau non éclairé, translucide (traînées, auras, éclairs). */
export function basicFx(color: THREE.ColorRepresentation, opacity = 0.6, additive = false, side: THREE.Side = THREE.FrontSide): THREE.MeshBasicMaterial {
  return cmat(`bfx:${new THREE.Color(color).getHexString()}:${opacity}:${additive}:${side}`, () =>
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side,
      toneMapped: !additive,
    }),
  );
}

/** Matériau standard spécifique (clé libre), mis en cache. */
export function stdMat(key: string, params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return cmat(`std:${key}`, () => new THREE.MeshStandardMaterial(params));
}

/**
 * Métal satiné : lisible même sans carte d'environnement (diffus conservé), brillant avec.
 * Utilisé pour les petits ors / argents des personnages et du plateau.
 */
export function satin(color: THREE.ColorRepresentation, metal = 0.55, rough = 0.3): THREE.MeshStandardMaterial {
  return stdMat(`satin:${new THREE.Color(color).getHexString()}:${metal}:${rough}`, { color, metalness: metal, roughness: rough });
}

export const SATIN_GOLD = '#e0b24c';
export const SATIN_SILVER = '#e3e7ec';

/** Matériau de sprite (texture radiale), mis en cache. */
export function spriteMat(key: string, tex: THREE.Texture, color: THREE.ColorRepresentation = '#ffffff', additive = true): THREE.SpriteMaterial {
  return cmat(`spr:${key}`, () =>
    new THREE.SpriteMaterial({
      map: tex,
      color,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }),
  );
}

// ─────────────────────────────────────────── Textures procédurales (cache)

const texCache = new Map<string, THREE.Texture>();

export function canvasTex(key: string, size: number, draw: (c: CanvasRenderingContext2D, s: number) => void, srgb = true): THREE.CanvasTexture {
  let t = texCache.get(key) as THREE.CanvasTexture | undefined;
  if (!t) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d')!;
    draw(ctx, size);
    t = new THREE.CanvasTexture(cv);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    texCache.set(key, t);
  }
  return t;
}

/** Halo radial doux (sprites de flash, scintillements, auras). */
export function glowTex(): THREE.CanvasTexture {
  return canvasTex('glow', 128, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.65)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.15)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });
}

/** Scintillement à 4 branches avec halo (sprites). */
export function twinkleTex(): THREE.CanvasTexture {
  return canvasTex('twinkle', 128, (c, s) => {
    const m = s / 2;
    const g = c.createRadialGradient(m, m, 0, m, m, m * 0.5);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    c.fillStyle = 'rgba(255,255,255,1)';
    c.beginPath();
    const k = 0.09;
    c.moveTo(m, 2);
    c.quadraticCurveTo(m + s * k, m - s * k, s - 2, m);
    c.quadraticCurveTo(m + s * k, m + s * k, m, s - 2);
    c.quadraticCurveTo(m - s * k, m + s * k, 2, m);
    c.quadraticCurveTo(m - s * k, m - s * k, m, 2);
    c.fill();
  });
}

// ─────────────────────────────────────────── Cuisson (fusion de sous-arbres statiques)

export interface BakedPart {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  cast: boolean;
}

export interface BakedTemplate {
  parts: BakedPart[];
  /** Objets conservés tels quels (sprites, éléments animés marqués `userData.keep`). */
  keeps: { obj: THREE.Object3D; matrix: THREE.Matrix4 }[];
}

/** Niveaux de rugosité des matériaux fusionnés en couleurs de sommets. */
function roughBucket(r: number): number {
  return r < 0.5 ? 0.34 : 0.74;
}

function isBlack(c: THREE.Color): boolean {
  return c.r + c.g + c.b < 1e-4;
}

/** Extrait une plage de sommets d'une géométrie non indexée. */
function sliceGeo(src: THREE.BufferGeometry, start: number, count: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(src.attributes)) {
    const attr = a as THREE.BufferAttribute;
    const n = attr.itemSize;
    const arr = (attr.array as Float32Array).slice(start * n, (start + count) * n);
    g.setAttribute(name, new THREE.BufferAttribute(arr, n, attr.normalized));
  }
  return g;
}

export interface BakeOptions {
  /**
   * Aplatit tous les matériaux opaques sans texture (métaux, émissifs compris) en couleurs de sommets
   * d'un unique matériau de cette rugosité : un seul draw call (clients attablés, instances nombreuses).
   */
  flatten?: number;
}

/**
 * Fusionne tous les meshes d'un sous-arbre (dans le repère de `src`) en un mesh par « classe » de matériau :
 * les matériaux standards opaques simples deviennent des couleurs de sommets (un seul matériau par rugosité),
 * les autres (métal, verre, textures, émissifs) sont fusionnés par matériau. Divise fortement les draw calls.
 * La géométrie fusionnée reste indexée (mémoire réduite). Les objets marqués `userData.keep` (et les
 * non-meshes rendus, ex. sprites) sont conservés à part ; les meshes invisibles sont ignorés.
 */
export function bake(src: THREE.Object3D, opts: BakeOptions = {}): BakedTemplate {
  src.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(src.matrixWorld).invert();
  const keeps: BakedTemplate['keeps'] = [];
  const flat = opts.flatten;

  interface Piece {
    geo: THREE.BufferGeometry; // source (non transformée)
    m: THREE.Matrix4;
    color: THREE.Color | null; // couleur de sommet (classe « vc »)
    useVc: boolean; // multiplier par l'attribut color source
  }
  const groups = new Map<string, { mat: THREE.Material; vc: boolean; pieces: Piece[]; cast: boolean }>();

  const addPiece = (geo: THREE.BufferGeometry, m: THREE.Matrix4, mat: THREE.Material): void => {
    const std = mat as THREE.MeshStandardMaterial;
    const isStd = std.isMeshStandardMaterial === true;
    const simple =
      isStd &&
      !std.transparent &&
      !std.map &&
      !std.bumpMap &&
      std.side === THREE.FrontSide &&
      !mat.userData.noBake &&
      (flat !== undefined || (std.metalness < 0.5 && isBlack(std.emissive)));
    const rough = flat ?? roughBucket(isStd ? std.roughness : 0.7);
    const key = simple ? `vc:${rough}` : mat.uuid;
    let grp = groups.get(key);
    if (!grp) {
      grp = { mat: simple ? vcMat(rough) : mat, vc: simple, pieces: [], cast: !mat.transparent };
      groups.set(key, grp);
    }
    grp.pieces.push({ geo, m, color: simple ? std.color : null, useVc: !!std.vertexColors && !!geo.getAttribute('color') });
  };

  const visit = (o: THREE.Object3D): void => {
    if (o !== src && (o.userData.keep || (o as THREE.Sprite).isSprite)) {
      keeps.push({ obj: o, matrix: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld) });
      return;
    }
    if (!o.visible) return;
    const mm = o as THREE.Mesh;
    if (mm.isMesh) {
      const mtx = new THREE.Matrix4().multiplyMatrices(inv, mm.matrixWorld);
      if (Array.isArray(mm.material)) {
        // géométrie multi-matériaux (ex. extrusion : faces / flancs) : un morceau par groupe
        const whole = mm.geometry.index ? mm.geometry.toNonIndexed() : mm.geometry;
        for (const gr of whole.groups) {
          const mat = mm.material[gr.materialIndex ?? 0];
          if (mat) addPiece(sliceGeo(whole, gr.start, gr.count), mtx, mat);
        }
      } else addPiece(mm.geometry, mtx, mm.material);
    }
    for (const c of o.children) visit(c);
  };
  visit(src);

  const parts: BakedPart[] = [];
  const nm = new THREE.Matrix3();
  for (const grp of groups.values()) {
    // attributs communs
    const withUv = !grp.vc && grp.pieces.every((p) => p.geo.getAttribute('uv'));
    const withColor = grp.vc || grp.pieces.every((p) => p.useVc);
    let nv = 0;
    let ni = 0;
    for (const p of grp.pieces) {
      const c = p.geo.getAttribute('position').count;
      nv += c;
      ni += p.geo.index ? p.geo.index.count : c;
    }
    if (!nv) continue;
    const pos = new Float32Array(nv * 3);
    const nor = new Float32Array(nv * 3);
    const col = withColor ? new Float32Array(nv * 3) : null;
    const uv = withUv ? new Float32Array(nv * 2) : null;
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let vo = 0;
    let io = 0;
    for (const p of grp.pieces) {
      const e = p.m.elements;
      nm.getNormalMatrix(p.m);
      const n = nm.elements;
      const P = p.geo.getAttribute('position') as THREE.BufferAttribute;
      const N = p.geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
      const C = p.useVc ? (p.geo.getAttribute('color') as THREE.BufferAttribute) : undefined;
      const U = uv ? (p.geo.getAttribute('uv') as THREE.BufferAttribute) : undefined;
      const cnt = P.count;
      for (let i = 0; i < cnt; i++) {
        const x = P.getX(i);
        const y = P.getY(i);
        const z = P.getZ(i);
        const o3 = (vo + i) * 3;
        pos[o3] = e[0] * x + e[4] * y + e[8] * z + e[12];
        pos[o3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        pos[o3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        if (N) {
          const a = N.getX(i);
          const b = N.getY(i);
          const c = N.getZ(i);
          let nx = n[0] * a + n[3] * b + n[6] * c;
          let ny = n[1] * a + n[4] * b + n[7] * c;
          let nz = n[2] * a + n[5] * b + n[8] * c;
          const l = Math.hypot(nx, ny, nz) || 1;
          nx /= l;
          ny /= l;
          nz /= l;
          nor[o3] = nx;
          nor[o3 + 1] = ny;
          nor[o3 + 2] = nz;
        }
        if (col) {
          const r = p.color ? p.color.r : 1;
          const g = p.color ? p.color.g : 1;
          const b = p.color ? p.color.b : 1;
          col[o3] = r * (C ? C.getX(i) : 1);
          col[o3 + 1] = g * (C ? C.getY(i) : 1);
          col[o3 + 2] = b * (C ? C.getZ(i) : 1);
        }
        if (uv && U) {
          uv[(vo + i) * 2] = U.getX(i);
          uv[(vo + i) * 2 + 1] = U.getY(i);
        }
      }
      const flip = p.m.determinant() < 0;
      const I = p.geo.index;
      const ic = I ? I.count : cnt;
      for (let i = 0; i < ic; i += 3) {
        const a = I ? I.getX(i) : i;
        const b = I ? I.getX(i + 1) : i + 1;
        const c = I ? I.getX(i + 2) : i + 2;
        idx[io + i] = vo + a;
        idx[io + i + 1] = vo + (flip ? c : b);
        idx[io + i + 2] = vo + (flip ? b : c);
      }
      vo += cnt;
      io += ic;
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (col) merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (uv) merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    merged.setIndex(new THREE.BufferAttribute(idx, 1));
    merged.computeBoundingSphere();
    parts.push({ geo: merged, mat: grp.mat, cast: grp.cast });
  }
  return { parts, keeps };
}

const bakeCache = new Map<string, BakedTemplate>();

/** Cuisson mise en cache par clé : les géométries résultantes sont partagées entre instances. */
export function bakeCached(key: string, build: () => THREE.Object3D, opts?: BakeOptions): BakedTemplate {
  let t = bakeCache.get(key);
  if (!t) {
    t = bake(build(), opts);
    for (const p of t.parts) p.geo.userData.shared = true;
    bakeCache.set(key, t);
  }
  return t;
}

/** Instancie un gabarit cuit dans un groupe (géométries / matériaux partagés). */
export function instantiate(t: BakedTemplate, into: THREE.Object3D = new THREE.Group(), shadows = true): THREE.Object3D {
  for (const p of t.parts) {
    const m = new THREE.Mesh(p.geo, p.mat);
    m.castShadow = shadows && p.cast;
    m.receiveShadow = shadows;
    into.add(m);
  }
  for (const k of t.keeps) {
    const o = k.obj.clone();
    k.matrix.decompose(o.position, o.quaternion, o.scale);
    into.add(o);
  }
  return into;
}

/** Remplace en place les enfants statiques d'un groupe par leur version cuite (géométries propres à l'instance). */
export function bakeInPlace(group: THREE.Object3D): void {
  const t = bake(group);
  const old = [...group.children];
  for (const c of old) {
    if (c.userData.keep || (c as THREE.Sprite).isSprite) continue;
    group.remove(c);
  }
  for (const p of t.parts) {
    const m = new THREE.Mesh(p.geo, p.mat);
    m.castShadow = p.cast;
    m.receiveShadow = true;
    group.add(m);
  }
  // les objets « keep » imbriqués plus profondément sont rattachés directement au groupe
  for (const k of t.keeps) {
    if (k.obj.parent === group) continue;
    k.obj.removeFromParent();
    k.matrix.decompose(k.obj.position, k.obj.quaternion, k.obj.scale);
    group.add(k.obj);
  }
}

// ─────────────────────────────────────────── Matériaux par instance (fondu, teinte)

interface MatEntry {
  m: THREE.Material;
  op: number;
  tr: boolean;
  em: THREE.Color | null;
  ei: number;
}

/**
 * Clone les matériaux d'un sous-arbre (un jeu par instance) pour pouvoir animer opacité et teinte émissive
 * sans toucher aux matériaux partagés. Les clones sont libérés par disposeTree (non marqués `shared`).
 */
export class InstanceMats {
  private readonly list: MatEntry[] = [];
  private readonly map = new Map<THREE.Material, THREE.Material>();
  private fade = 1;
  private tintK = 0;
  private readonly tint = new THREE.Color();
  private readonly tmp = new THREE.Color();

  constructor(root: THREE.Object3D, skip?: (o: THREE.Object3D) => boolean) {
    this.adopt(root, skip);
  }

  /** Adopte (clone) les matériaux d'un sous-arbre supplémentaire. */
  adopt(root: THREE.Object3D, skip?: (o: THREE.Object3D) => boolean): void {
    root.traverse((o) => {
      if (skip?.(o)) return;
      const m = o as THREE.Mesh;
      if (!m.material) return;
      if (Array.isArray(m.material)) m.material = m.material.map((x) => this.get(x));
      else m.material = this.get(m.material);
    });
  }

  private get(src: THREE.Material): THREE.Material {
    let c = this.map.get(src);
    if (c) return c;
    if (this.list.some((e) => e.m === src)) return src; // déjà un clone
    c = src.clone();
    c.userData = {};
    const std = c as THREE.MeshStandardMaterial;
    this.list.push({
      m: c,
      op: c.opacity,
      tr: c.transparent,
      em: std.isMeshStandardMaterial ? std.emissive.clone() : null,
      ei: std.isMeshStandardMaterial ? std.emissiveIntensity : 0,
    });
    this.map.set(src, c);
    return c;
  }

  /** Opacité globale (1 = normal). Bascule en transparent seulement si nécessaire. */
  setOpacity(f: number): void {
    if (Math.abs(f - this.fade) < 0.002) return;
    this.fade = f;
    for (const e of this.list) {
      const t = e.tr || f < 0.995;
      if (e.m.transparent !== t) {
        e.m.transparent = t;
        e.m.needsUpdate = true;
      }
      e.m.opacity = e.op * f;
    }
  }

  /** Teinte émissive ajoutée (flash de choc, aura, fantôme). k = 0 : aucune. */
  setTint(color: THREE.ColorRepresentation, k: number): void {
    this.tmp.set(color);
    if (Math.abs(k - this.tintK) < 0.002 && this.tmp.equals(this.tint)) return;
    this.tintK = k;
    this.tint.copy(this.tmp);
    for (const e of this.list) {
      if (!e.em) continue;
      const s = e.m as THREE.MeshStandardMaterial;
      s.emissive.copy(e.em).multiplyScalar(e.ei);
      s.emissive.r += this.tint.r * k;
      s.emissive.g += this.tint.g * k;
      s.emissive.b += this.tint.b * k;
      s.emissiveIntensity = 1;
    }
  }
}

// ─────────────────────────────────────────── Effets décoratifs réutilisables

/** Couronne d'étoiles qui tournoient (étourdissement). */
export class StarRing {
  readonly group = new THREE.Group();
  private readonly stars: THREE.Mesh[] = [];
  private amount = 0;

  constructor(
    count = 3,
    private readonly radius = 0.2,
    color: THREE.ColorRepresentation = '#ffd25e',
  ) {
    const mat = stdMat(`star:${new THREE.Color(color).getHexString()}`, {
      color,
      emissive: color,
      emissiveIntensity: 0.9,
      roughness: 0.4,
      metalness: 0.2,
    });
    for (let i = 0; i < count; i++) {
      const s = new THREE.Mesh(starGeo(0.055, 0.016), mat);
      s.castShadow = false;
      this.stars.push(s);
      this.group.add(s);
    }
    this.group.visible = false;
  }

  update(dt: number, time: number, on: boolean): void {
    this.amount = THREE.MathUtils.damp(this.amount, on ? 1 : 0, on ? 10 : 7, dt);
    this.group.visible = this.amount > 0.02;
    if (!this.group.visible) return;
    const n = this.stars.length;
    for (let i = 0; i < n; i++) {
      const a = time * 4.2 + (i / n) * TAU;
      const s = this.stars[i];
      s.position.set(Math.cos(a) * this.radius, Math.sin(a * 2 + i) * 0.025, Math.sin(a) * this.radius);
      s.rotation.set(0, -a + Math.PI / 2, time * 3 + i);
      s.scale.setScalar(this.amount * (0.85 + 0.15 * Math.sin(time * 9 + i * 2)));
    }
  }
}

/** Petits cœurs qui montent en boucle (client charmé, PNJ calmé). */
export class HeartPuffs {
  readonly group = new THREE.Group();
  private readonly hearts: THREE.Mesh[] = [];
  private amount = 0;

  constructor(count = 3, color: THREE.ColorRepresentation = '#ff7fa5', size = 0.07) {
    const mat = stdMat(`heart:${new THREE.Color(color).getHexString()}`, {
      color,
      emissive: color,
      emissiveIntensity: 0.55,
      roughness: 0.35,
    });
    for (let i = 0; i < count; i++) {
      const h = new THREE.Mesh(heartGeo(size, size * 0.3), mat);
      h.castShadow = false;
      this.hearts.push(h);
      this.group.add(h);
    }
    this.group.visible = false;
  }

  update(dt: number, time: number, on: boolean): void {
    this.amount = THREE.MathUtils.damp(this.amount, on ? 1 : 0, 6, dt);
    this.group.visible = this.amount > 0.02;
    if (!this.group.visible) return;
    const n = this.hearts.length;
    for (let i = 0; i < n; i++) {
      const u = (time * 0.7 + i / n) % 1;
      const h = this.hearts[i];
      h.position.set(Math.sin(u * 7 + i * 2) * 0.09 + (i - (n - 1) / 2) * 0.1, u * 0.45, Math.cos(i * 1.7) * 0.05);
      h.rotation.set(0, Math.sin(time * 2 + i) * 0.5, Math.sin(u * 9 + i) * 0.25);
      h.scale.setScalar(this.amount * bump(Math.min(1, u * 1.4)) * 1.1 + 0.001);
    }
  }
}

/** Scintillements dorés en orbite / en pluie (aura, calme, plat doré). */
export class Twinkles {
  readonly group = new THREE.Group();
  private readonly sprites: THREE.Sprite[] = [];
  private amount = 0;

  constructor(
    count = 5,
    color: THREE.ColorRepresentation = '#ffe08a',
    private readonly radius = 0.35,
    private readonly height = 1.0,
    private readonly size = 0.12,
  ) {
    const mat = spriteMat(`tw:${new THREE.Color(color).getHexString()}`, twinkleTex(), color, true);
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(mat);
      this.sprites.push(s);
      this.group.add(s);
    }
    this.group.visible = false;
  }

  update(dt: number, time: number, on: boolean): void {
    this.amount = THREE.MathUtils.damp(this.amount, on ? 1 : 0, 6, dt);
    this.group.visible = this.amount > 0.02;
    if (!this.group.visible) return;
    const n = this.sprites.length;
    for (let i = 0; i < n; i++) {
      const u = (time * 0.45 + i / n + hash01(i, 7) * 0.3) % 1;
      const a = i * 2.4 + time * 0.8;
      const r = this.radius * (0.75 + 0.25 * Math.sin(i * 3.3));
      const s = this.sprites[i];
      s.position.set(Math.cos(a) * r, 0.1 + u * this.height, Math.sin(a) * r);
      const k = bump(u) * this.amount * (0.7 + 0.3 * Math.sin(time * 11 + i * 5));
      s.scale.setScalar(this.size * k + 0.0001);
    }
  }
}
