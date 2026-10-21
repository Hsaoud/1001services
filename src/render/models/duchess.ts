/** Blender-authored Duchess. The sculpt and materials are exported by
 * art/duchess/build_duchess.py. This adapter binds them to the game animation API.
 * The packed asset works synchronously, including in the offline HTML build.
 */
import * as THREE from 'three';
import packedMesh from '../../assets/duchess/duchess.mesh.json?raw';
import type { Expr, Figure } from './figure';

interface SculptMaterial {
  color: string; roughness: number; metalness: number; sheen: number; coat: number; vertexColors?: boolean;
}
interface SculptMesh {
  part: string; material: string; position: string; normal: string; color: string | null; index: string;
}
interface SculptAsset {
  generator: string; positionScale: number;
  pivots: Record<string, [number, number, number]>;
  materials: Record<string, SculptMaterial>;
  meshes: SculptMesh[];
}
interface SculptTemplate {
  asset: SculptAsset;
  meshes: { part: string; geometry: THREE.BufferGeometry; material: THREE.MeshPhysicalMaterial }[];
}
let template: SculptTemplate | undefined;

function bytes(base64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

function getTemplate(): SculptTemplate {
  if (template) return template;
  const asset = JSON.parse(packedMesh) as SculptAsset;
  const materials = new Map<string, THREE.MeshPhysicalMaterial>();
  for (const [name, spec] of Object.entries(asset.materials)) {
    const material = new THREE.MeshPhysicalMaterial({
      color: spec.vertexColors ? '#ffffff' : spec.color, roughness: spec.roughness, metalness: spec.metalness,
      sheen: spec.sheen, sheenColor: new THREE.Color(spec.color), sheenRoughness: 0.6,
      clearcoat: spec.coat, clearcoatRoughness: 0.22, vertexColors: !!spec.vertexColors,
    });
    material.name = name;
    material.userData.shared = material.userData.noBake = true;
    materials.set(name, material);
  }
  const meshes = asset.meshes.map(source => {
    const positions = new Int16Array(bytes(source.position).buffer);
    const normals = new Int16Array(bytes(source.normal).buffer);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(
      Float32Array.from(positions, v => v * asset.positionScale), 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(
      Float32Array.from(normals, v => v / 32767), 3));
    if (source.color) geometry.setAttribute('color', new THREE.Uint8BufferAttribute(bytes(source.color), 3, true));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(bytes(source.index).buffer), 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.userData.shared = true;
    const material = materials.get(source.material);
    if (!material) throw new Error(`Missing Duchess sculpt material: ${source.material}`);
    return { part: source.part, geometry, material };
  });
  template = { asset, meshes };
  return template;
}

export function buildDuchessFigure(): { fig: Figure; tails: THREE.Group[] } {
  const { asset, meshes } = getTemplate();
  const root = new THREE.Group();
  root.name = 'Duchess / Blender sculpt';
  root.userData.generator = asset.generator;
  const hips = new THREE.Group();
  hips.position.fromArray(asset.pivots.hips);
  root.add(hips);
  const parts = new Map<string, THREE.Object3D>([['hips', hips]]);
  const pivot = (part: string, parent: THREE.Object3D, parentPart: string): THREE.Group => {
    const group = new THREE.Group();
    group.name = `Duchess / ${part}`;
    group.position.fromArray(asset.pivots[part]).sub(new THREE.Vector3().fromArray(asset.pivots[parentPart]));
    group.userData.keep = true;
    parent.add(group);
    parts.set(part, group);
    return group;
  };
  const head = pivot('head', hips, 'hips');
  const armL = pivot('armL', hips, 'hips'), armR = pivot('armR', hips, 'hips');
  const legL = pivot('legL', hips, 'hips'), legR = pivot('legR', hips, 'hips');
  // resetPose/walkCycle place the leg pivots in root coordinates.
  for (const [leg, part] of [[legL, 'legL'], [legR, 'legR']] as const) {
    root.add(leg);
    leg.position.fromArray(asset.pivots[part]);
  }
  const tails = [pivot('tailL', hips, 'hips'), pivot('tailR', hips, 'hips')];
  const openEyes = pivot('eyes', head, 'head'), closedEyes = pivot('closedEyes', head, 'head');
  const mouth = pivot('mouth', head, 'head'), surprisedMouth = pivot('surprisedMouth', head, 'head');
  openEyes.name = 'Duchess / open eyes';
  closedEyes.name = 'Duchess / closed eyes';
  mouth.name = 'Duchess / resting lips';
  surprisedMouth.name = 'Duchess / surprised mouth';

  let skirt: THREE.Mesh | null = null, torso: THREE.Mesh | null = null;
  for (const source of meshes) {
    const mesh = new THREE.Mesh(source.geometry, source.material);
    mesh.name = `Blender / ${source.part} / ${source.material.name}`;
    mesh.castShadow = mesh.receiveShadow = true;
    // The export is already batched. Preserve its shared geometry and exact PBR materials.
    mesh.userData.keep = true;
    if (source.part === 'skirt') {
      if (!skirt) { skirt = mesh; hips.add(skirt); }
      else skirt.add(mesh);
    } else {
      const parent = parts.get(source.part);
      if (!parent) throw new Error(`Missing Duchess animation pivot: ${source.part}`);
      parent.add(mesh);
      if (source.part === 'hips' && !torso) torso = mesh;
    }
  }
  if (!skirt || !torso) throw new Error('Incomplete Blender Duchess export');
  const handL = new THREE.Object3D(), handR = new THREE.Object3D();
  handL.position.set(0.137, -0.43, 0.014);
  handR.position.set(-0.137, -0.43, 0.014);
  armL.add(handL); armR.add(handR);
  const fig: Figure = {
    root, hips, head, armL, armR, legL, legR, handL, handR, torso, skirt,
    hipY: asset.pivots.hips[1], torsoH: asset.pivots.head[1] - asset.pivots.hips[1],
    headC: 1.137 - asset.pivots.head[1], headR: 0.176, height: 1.62, seated: false, armLen: 0.43,
    setExpr(expression: Expr) {
      closedEyes.visible = ['happy', 'laugh', 'calm'].includes(expression);
      openEyes.visible = !closedEyes.visible;
      surprisedMouth.visible = ['o', 'worried', 'dizzy', 'open', 'laugh'].includes(expression);
      mouth.visible = !surprisedMouth.visible;
    },
  };
  fig.setExpr('smile');
  return { fig, tails };
}
