/**
 * Hygiène de scène, appliquée périodiquement par le GameRenderer (les vues créent des objets en cours de jeu) :
 *
 * 1. Mélange additif « sans alpha » : la scène est rendue sur fond transparent puis composée sur le dégradé
 *    du biome (post.ts). Le mode AdditiveBlending de three ajoute aussi à l'alpha, si bien qu'une lueur posée
 *    hors du salon devenait un carré noir opaque. On garde l'addition de couleur mais on laisse l'alpha intact.
 * 2. Ombres des petits objets : boutons, couverts, plats, visages… projettent une ombre invisible depuis la
 *    caméra de jeu mais coûtent chacun un appel de dessin dans la passe d'ombre.
 */
import * as THREE from 'three';

/** Rayon (m) sous lequel un mesh ne projette plus d'ombre. */
const TINY_CASTER = 0.14;

const fixedMats = new WeakSet<THREE.Material>();
const checkedMeshes = new WeakSet<THREE.Object3D>();
const _scale = new THREE.Vector3();

function fixMaterial(m: THREE.Material): void {
  if (fixedMats.has(m)) return;
  fixedMats.add(m);
  if (m.blending !== THREE.AdditiveBlending) return;
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.SrcAlphaFactor;
  m.blendDst = THREE.OneFactor;
  m.blendEquationAlpha = THREE.AddEquation;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneFactor;
  m.needsUpdate = true;
}

function trimCaster(o: THREE.Object3D): void {
  if (checkedMeshes.has(o)) return;
  checkedMeshes.add(o);
  const m = o as THREE.Mesh;
  if (!m.isMesh || !m.castShadow || !m.geometry) return;
  const g = m.geometry;
  if (!g.boundingSphere) g.computeBoundingSphere();
  if (!g.boundingSphere) return;
  // échelle locale seulement : les parents s'animent (apparition « pop » depuis 0), ce qui fausserait la mesure
  _scale.copy(m.scale);
  if (g.boundingSphere.radius * Math.max(_scale.x, _scale.y, _scale.z) < TINY_CASTER) m.castShadow = false;
}

/** Corrige les matériaux additifs et les petites ombres d'un sous-arbre (idempotent, peu coûteux). */
export function fixAdditiveBlending(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    if (Array.isArray(mat)) for (const m of mat) fixMaterial(m);
    else fixMaterial(mat);
    trimCaster(o);
  });
}
