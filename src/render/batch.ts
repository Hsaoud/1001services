/**
 * Fusion de la géométrie statique : tout le décor immobile (murs, mobilier, plantes…) est accumulé
 * puis fusionné par matériau et par tronçon spatial (pour garder le frustum culling).
 * Les couleurs sont écrites par sommet (matériaux `vc`), ce qui réduit drastiquement les draw calls.
 */
import * as THREE from 'three';
import { patched, wantsColor } from './mats';

export interface PaintOpts {
  color?: THREE.ColorRepresentation;
  /** Amplitude de balancement (feuillages) : poids croissant avec la hauteur au-dessus de la base courante. */
  sway?: number;
  /** Décor haut : s'efface (tramage) quand il masque le joueur. */
  tall?: boolean;
  cast?: boolean;
  receive?: boolean;
}

interface Item {
  geo: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  color: THREE.Color;
  sway: number;
  baseY: number;
  swayH: number;
}

interface Group {
  mat: THREE.Material;
  cast: boolean;
  receive: boolean;
  sway: boolean;
  items: Item[];
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Matrice de placement : translation, rotation autour de Y (puis X, Z optionnelles), échelle. */
export function M(x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0): THREE.Matrix4 {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

const WHITE = new THREE.Color('#ffffff');

export class StaticBatch {
  private groups = new Map<string, Group>();
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  private swayBase = 0;
  private swayH = 1.2;
  /** Nombre de sommets accumulés (statistiques). */
  vertexCount = 0;

  /** Empile une transformation locale (repère d'un meuble, d'un décor…). */
  push(m: THREE.Matrix4): void {
    const top = this.stack[this.stack.length - 1];
    this.stack.push(top.clone().multiply(m));
  }

  pop(): void {
    if (this.stack.length > 1) this.stack.pop();
  }

  /** Base du balancement des feuillages (hauteur monde du pied de la plante) et hauteur de référence. */
  setSwayBase(y: number, h = 1.2): void {
    this.swayBase = y;
    this.swayH = h;
  }

  /** Ajoute une géométrie (non modifiée) avec une matrice locale optionnelle. */
  add(geo: THREE.BufferGeometry, mat: THREE.Material, local?: THREE.Matrix4 | null, opts: PaintOpts = {}): void {
    const top = this.stack[this.stack.length - 1];
    const matrix = local ? top.clone().multiply(local) : top.clone();
    const sway = opts.sway ?? 0;
    const material = patched(mat, { seeThrough: opts.tall, sway: sway > 0 || mat.userData.sway === true });
    const cast = opts.cast ?? true;
    const receive = opts.receive ?? true;
    const swayFlag = sway > 0 || mat.userData.sway === true;
    const key = `${material.uuid}:${cast ? 1 : 0}${receive ? 1 : 0}`;
    let g = this.groups.get(key);
    if (!g) {
      g = { mat: material, cast, receive, sway: swayFlag, items: [] };
      this.groups.set(key, g);
    }
    g.items.push({
      geo,
      matrix,
      color: opts.color !== undefined ? new THREE.Color(opts.color) : WHITE,
      sway,
      baseY: this.swayBase,
      swayH: this.swayH,
    });
    this.vertexCount += geo.attributes.position.count;
  }

  /** Ajoute tous les meshes d'un sous-arbre (positions monde courantes), avec la couleur de leur userData.color. */
  addObject(root: THREE.Object3D, opts: PaintOpts = {}): void {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      this.add(mesh.geometry, mat, mesh.matrixWorld, { ...opts, color: (mesh.userData.color as THREE.ColorRepresentation) ?? opts.color });
    });
  }

  /** Fusionne et ajoute les meshes au parent. `chunk` = taille (m) des tronçons spatiaux. */
  build(parent: THREE.Object3D, chunk = 12): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const g of this.groups.values()) {
      const byChunk = new Map<string, Item[]>();
      for (const it of g.items) {
        const e = it.matrix.elements;
        const k = `${Math.floor(e[12] / chunk)}:${Math.floor(e[14] / chunk)}`;
        let arr = byChunk.get(k);
        if (!arr) byChunk.set(k, (arr = []));
        arr.push(it);
      }
      for (const items of byChunk.values()) {
        // découpe si trop de sommets (index 32 bits accepté, mais on garde des lots raisonnables)
        const geo = mergeItems(items, wantsColor(g.mat), g.sway);
        const mesh = new THREE.Mesh(geo, g.mat);
        mesh.castShadow = g.cast;
        mesh.receiveShadow = g.receive;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        mesh.userData.batch = true;
        parent.add(mesh);
        out.push(mesh);
      }
    }
    this.groups.clear();
    return out;
  }
}

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();

function mergeItems(items: Item[], color: boolean, sway: boolean): THREE.BufferGeometry {
  let nv = 0;
  let ni = 0;
  for (const it of items) {
    const c = it.geo.attributes.position.count;
    nv += c;
    ni += it.geo.index ? it.geo.index.count : c;
  }
  const pos = new Float32Array(nv * 3);
  const nrm = new Float32Array(nv * 3);
  const uv = new Float32Array(nv * 2);
  const col = color ? new Float32Array(nv * 3) : null;
  const sw = sway ? new Float32Array(nv) : null;
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0;
  let io = 0;
  for (const it of items) {
    const g = it.geo;
    const P = g.attributes.position;
    const N = g.attributes.normal as THREE.BufferAttribute | undefined;
    const U = g.attributes.uv as THREE.BufferAttribute | undefined;
    const C = g.attributes.color as THREE.BufferAttribute | undefined;
    const count = P.count;
    _nm.getNormalMatrix(it.matrix);
    const flip = it.matrix.determinant() < 0;
    for (let i = 0; i < count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(it.matrix);
      const o3 = (vo + i) * 3;
      pos[o3] = _v.x;
      pos[o3 + 1] = _v.y;
      pos[o3 + 2] = _v.z;
      if (N) {
        _n.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize();
        nrm[o3] = _n.x;
        nrm[o3 + 1] = _n.y;
        nrm[o3 + 2] = _n.z;
      } else {
        nrm[o3 + 1] = 1;
      }
      if (U) {
        uv[(vo + i) * 2] = U.getX(i);
        uv[(vo + i) * 2 + 1] = U.getY(i);
      }
      if (col) {
        let r = it.color.r;
        let gg = it.color.g;
        let b = it.color.b;
        if (C) {
          r *= C.getX(i);
          gg *= C.getY(i);
          b *= C.getZ(i);
        }
        col[o3] = r;
        col[o3 + 1] = gg;
        col[o3 + 2] = b;
      }
      if (sw) {
        const h = Math.max(0, Math.min(1, (_v.y - it.baseY) / it.swayH));
        sw[vo + i] = it.sway * h * h;
      }
    }
    if (g.index) {
      const I = g.index;
      const n = I.count;
      for (let k = 0; k < n; k += 3) {
        const a = I.getX(k) + vo;
        const b = I.getX(k + 1) + vo;
        const c = I.getX(k + 2) + vo;
        idx[io++] = a;
        idx[io++] = flip ? c : b;
        idx[io++] = flip ? b : c;
      }
    } else {
      for (let k = 0; k < count; k += 3) {
        idx[io++] = vo + k;
        idx[io++] = vo + (flip ? k + 2 : k + 1);
        idx[io++] = vo + (flip ? k + 1 : k + 2);
      }
    }
    vo += count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (sw) geo.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}
