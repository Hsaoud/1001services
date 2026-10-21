/**
 * Boîte à outils partagée des modèles 3D : palette de La Duchesse, matériaux mis en cache et
 * géométries « adoucies » (boîtes arrondies, cylindres chanfreinés, tours).
 * Tout est procédural : aucun modèle externe.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// ─────────────────────────────────────────── Palette

export const PALETTE = {
  // Rose & poudré (boudoir)
  powder: '#f3d9d6',
  rose: '#e8b4b8',
  roseDeep: '#d48a95',
  blush: '#f7e6e1',
  brick: '#c98b7d',
  // Crèmes & neutres
  cream: '#fbf3e8',
  ivory: '#fffaf2',
  linen: '#efe3d3',
  taupe: '#b9a89a',
  cocoa: '#6b4a3a',
  espresso: '#3d2a22',
  // Verts (jardin d'hiver)
  sage: '#a8b89a',
  sageDeep: '#7d9474',
  leaf: '#6f9a5e',
  leafDark: '#4f7a48',
  mint: '#cfe3d0',
  // Terrasse
  stone: '#e9e1d4',
  terracotta: '#d08c60',
  lavender: '#c9b6e4',
  violet: '#9f86c0',
  sky: '#cfe6f2',
  // Galerie royale
  marble: '#f6f3ee',
  bordeaux: '#7a2e3a',
  bordeauxDeep: '#5b1f2a',
  // Métaux
  gold: '#d4a537',
  goldPale: '#e9c46a',
  brass: '#c9a24a',
  silver: '#cfd3d8',
  // Divers
  white: '#ffffff',
  ink: '#2b2230',
} as const;

// ─────────────────────────────────────────── Matériaux (mis en cache par clé)

const matCache = new Map<string, THREE.Material>();

function cached<T extends THREE.Material>(key: string, make: () => T): T {
  let m = matCache.get(key);
  if (!m) {
    m = make();
    m.userData.shared = true; // ne pas disposer avec les meshes
    matCache.set(key, m);
  }
  return m as T;
}

/** Velours / tissu mat (banquettes, vestes). */
export function velvet(color: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
  return cached(`velvet:${new THREE.Color(color).getHexString()}`, () =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 }),
  );
}

/** Mat doux (murs, bois peint, céramique mate) — roughness 0.7. */
export function matte(color: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
  return cached(`matte:${new THREE.Color(color).getHexString()}`, () =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0 }),
  );
}

/** Céramique émaillée, un peu plus brillante (assiettes, tasses). */
export function ceramic(color: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
  return cached(`ceramic:${new THREE.Color(color).getHexString()}`, () =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0 }),
  );
}

/** Laiton / or brillant (cloches, plateaux, lustres) — metalness 0.8, roughness 0.2. */
export function gold(color: THREE.ColorRepresentation = PALETTE.gold): THREE.MeshStandardMaterial {
  return cached(`gold:${new THREE.Color(color).getHexString()}`, () =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.2, metalness: 0.8 }),
  );
}

/** Argent poli (cloches en argent, couverts). */
export function silver(color: THREE.ColorRepresentation = PALETTE.silver): THREE.MeshStandardMaterial {
  return cached(`silver:${new THREE.Color(color).getHexString()}`, () =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.18, metalness: 0.9 }),
  );
}

/** Verre (verrière, verres à mocktail). */
export function glass(color: THREE.ColorRepresentation = '#e8f4f8', opacity = 0.35): THREE.MeshStandardMaterial {
  return cached(`glass:${new THREE.Color(color).getHexString()}:${opacity}`, () =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.08, metalness: 0.1, transparent: true, opacity, depthWrite: false }),
  );
}

/** Matériau émissif (lueurs, ampoules, bougies). */
export function glow(color: THREE.ColorRepresentation, intensity = 1.5): THREE.MeshStandardMaterial {
  return cached(`glow:${new THREE.Color(color).getHexString()}:${intensity}`, () =>
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.5 }),
  );
}

/** Matériau non partagé (à modifier librement par instance, ex. opacité animée). */
export function unique(params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial(params);
}

// ─────────────────────────────────────────── Géométries adoucies (mises en cache par paramètres)

const geoCache = new Map<string, THREE.BufferGeometry>();

function cachedGeo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    g.userData.shared = true;
    geoCache.set(key, g);
  }
  return g;
}

/** Boîte aux arêtes arrondies, centrée à l'origine. */
export function roundedBox(w: number, h: number, d: number, radius = 0.04, segments = 2): THREE.BufferGeometry {
  const r = Math.min(radius, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  return cachedGeo(`rbox:${w}:${h}:${d}:${r}:${segments}`, () => new RoundedBoxGeometry(w, h, d, segments, Math.max(0.001, r)));
}

/**
 * Cylindre chanfreiné (arêtes haut et bas biseautées), base à y = 0, sommet à y = h.
 * `rTop` / `rBottom` permettent les formes coniques (pieds de table, pots).
 */
export function chamferCylinder(rTop: number, rBottom: number, h: number, chamfer = 0.02, radial = 28): THREE.BufferGeometry {
  return cachedGeo(`ccyl:${rTop}:${rBottom}:${h}:${chamfer}:${radial}`, () => {
    const c = Math.min(chamfer, h / 2, rTop * 0.9, rBottom * 0.9);
    const pts = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(rBottom - c, 0),
      new THREE.Vector2(rBottom, c),
      new THREE.Vector2(rTop, h - c),
      new THREE.Vector2(rTop - c, h),
      new THREE.Vector2(0, h),
    ];
    const g = new THREE.LatheGeometry(pts, radial);
    g.computeVertexNormals();
    return g;
  });
}

/** Solide de révolution depuis un profil [rayon, hauteur][] (de bas en haut). */
export function lathe(profile: readonly [number, number][], radial = 28, key?: string): THREE.BufferGeometry {
  const make = () => {
    const g = new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)),
      radial,
    );
    g.computeVertexNormals();
    return g;
  };
  return key ? cachedGeo(`lathe:${key}:${radial}`, make) : make();
}

export function sphere(r: number, w = 20, h = 14): THREE.BufferGeometry {
  return cachedGeo(`sph:${r}:${w}:${h}`, () => new THREE.SphereGeometry(r, w, h));
}

export function torus(r: number, tube: number, radial = 10, tubular = 32, arc = Math.PI * 2): THREE.BufferGeometry {
  return cachedGeo(`tor:${r}:${tube}:${radial}:${tubular}:${arc}`, () => new THREE.TorusGeometry(r, tube, radial, tubular, arc));
}

export function cylinder(rTop: number, rBottom: number, h: number, radial = 20): THREE.BufferGeometry {
  return cachedGeo(`cyl:${rTop}:${rBottom}:${h}:${radial}`, () => {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, radial);
    g.translate(0, h / 2, 0); // base à y = 0
    return g;
  });
}

// ─────────────────────────────────────────── Aides

/** Crée un mesh qui projette et reçoit les ombres. */
export function mesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  opts: { cast?: boolean; receive?: boolean } = {},
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? true;
  return m;
}

/** Libère les géométries / matériaux non partagés d'un sous-arbre. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats) if (!mat.userData.shared) mat.dispose();
  });
}

/** Amorti exponentiel indépendant du framerate. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return target + (current - target) * Math.exp(-lambda * dt);
}

/** Angle le plus court de a vers b. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Ressort amorti (rebond élastique) : renvoie la nouvelle position, met à jour la vitesse dans `state`. */
export function spring(state: { v: number }, x: number, target: number, stiffness: number, damping: number, dt: number): number {
  const a = (target - x) * stiffness - state.v * damping;
  state.v += a * dt;
  return x + state.v * dt;
}
