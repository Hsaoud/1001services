/**
 * Icônes de plats rendues depuis leur modèle 3D : petite scène privée (vue 3/4 plongeante comme en jeu,
 * lumières clé / ambiance / contre-jour), rendu dans une cible sRGB multi-échantillonnée à fond transparent,
 * lecture des pixels → canvas 2D → data URL PNG. L'état du renderer est restauré. Mis en cache par id + taille.
 */
import * as THREE from 'three';
import type { DishId } from '../../types';
import { createDishMesh } from './dishes';
import blenderPortraitUrl from '../../assets/duchess/duchess-portrait.png?url';

const cache = new Map<string, string>();

let scene: THREE.Scene | null = null;
let camera: THREE.OrthographicCamera | null = null;

function setup(): { scene: THREE.Scene; camera: THREE.OrthographicCamera } {
  if (scene && camera) return { scene, camera };
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff6ee', '#e9cfc8', 1.25));
  const key = new THREE.DirectionalLight('#fff1e2', 2.1);
  key.position.set(-1.5, 4, 3.5);
  scene.add(key);
  const fill = new THREE.DirectionalLight('#e4ecff', 0.55);
  fill.position.set(4, 1.5, -0.5);
  scene.add(fill);
  const rim = new THREE.DirectionalLight('#ffe2ea', 1.0);
  rim.position.set(-3, 2.5, -4);
  scene.add(rim);
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
  return { scene, camera };
}

/** Direction de vue (du centre vers la caméra) : lacet 45° depuis +X+Z, élévation ~38°. */
const VIEW_DIR = new THREE.Vector3(Math.SQRT1_2 * Math.cos(0.66), Math.sin(0.66), Math.SQRT1_2 * Math.cos(0.66)).normalize();

/** Convertit un buffer de pixels RGBA WebGL (retourné verticalement) en data URL PNG redimensionnée. */
function pixelsToDataUrl(pixels: Uint8Array, w2: number, h2: number, outW: number, outH: number): string {
  const big = document.createElement('canvas');
  big.width = w2;
  big.height = h2;
  const bctx = big.getContext('2d')!;
  const img = bctx.createImageData(w2, h2);
  const toLin = (c: number): number => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  const toSrgb = (x: number): number => {
    const v = x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(v * 255)));
  };
  for (let y = 0; y < h2; y++) {
    const src = (h2 - 1 - y) * w2 * 4;
    const dst = y * w2 * 4;
    for (let x = 0; x < w2 * 4; x += 4) {
      const a = pixels[src + x + 3];
      img.data[dst + x + 3] = a;
      if (a === 255 || a === 0) {
        img.data[dst + x] = pixels[src + x];
        img.data[dst + x + 1] = pixels[src + x + 1];
        img.data[dst + x + 2] = pixels[src + x + 2];
      } else {
        const k = 255 / a;
        img.data[dst + x] = toSrgb(Math.min(1, toLin(pixels[src + x]) * k));
        img.data[dst + x + 1] = toSrgb(Math.min(1, toLin(pixels[src + x + 1]) * k));
        img.data[dst + x + 2] = toSrgb(Math.min(1, toLin(pixels[src + x + 2]) * k));
      }
    }
  }
  bctx.putImageData(img, 0, 0);
  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const octx = out.getContext('2d')!;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(big, 0, 0, outW, outH);
  return out.toDataURL('image/png');
}

/** Rend le modèle 3D du plat dans une petite image (fond transparent) et renvoie une data URL PNG. */
export function makeDishIcon(gl: THREE.WebGLRenderer, id: DishId, size = 96): string {
  const ck = `${id}:${size}`;
  const hit = cache.get(ck);
  if (hit) return hit;
  if (typeof document === 'undefined') return '';

  const { scene: sc, camera: cam } = setup();
  const dish = createDishMesh(id);
  sc.add(dish);

  // halos additifs exclus de l'icône (fond transparent) ; boîte englobante des meshes uniquement
  const box = new THREE.Box3();
  dish.updateMatrixWorld(true);
  dish.traverse((o) => {
    const sp = o as THREE.Sprite;
    if (sp.isSprite && !(o.userData.twinkle as { spin?: boolean } | undefined)?.spin) sp.visible = false;
    if ((o as THREE.Mesh).isMesh) box.expandByObject(o);
  });
  // cadrage serré : boîte englobante projetée dans le repère caméra
  const center = box.getCenter(new THREE.Vector3());
  cam.position.copy(center).addScaledVector(VIEW_DIR, 4);
  cam.up.set(0, 1, 0);
  cam.lookAt(center);
  cam.updateMatrixWorld(true);
  const inv = cam.matrixWorldInverse;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) {
    pts.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(inv));
  }
  const vb = new THREE.Box3().setFromPoints(pts);
  const half = Math.max(vb.max.x - vb.min.x, vb.max.y - vb.min.y) * 0.5 * 1.08;
  const cx = (vb.max.x + vb.min.x) / 2;
  const cy = (vb.max.y + vb.min.y) / 2;
  cam.left = cx - half;
  cam.right = cx + half;
  cam.top = cy + half;
  cam.bottom = cy - half;
  cam.updateProjectionMatrix();

  // rendu (×2 puis réduction pour un anticrénelage doux)
  const S = size * 2;
  const rt = new THREE.WebGLRenderTarget(S, S, { samples: 4, colorSpace: THREE.SRGBColorSpace, type: THREE.UnsignedByteType });
  const prevTarget = gl.getRenderTarget();
  const prevClear = gl.getClearColor(new THREE.Color());
  const prevAlpha = gl.getClearAlpha();
  const prevAuto = gl.autoClear;
  const prevShadowUpdate = gl.shadowMap.needsUpdate;
  const pixels = new Uint8Array(S * S * 4);
  try {
    gl.setRenderTarget(rt);
    gl.setClearColor(0x000000, 0);
    gl.autoClear = true;
    gl.clear(true, true, true);
    gl.render(sc, cam);
    gl.readRenderTargetPixels(rt, 0, 0, S, S, pixels);
  } finally {
    gl.setRenderTarget(prevTarget);
    gl.setClearColor(prevClear, prevAlpha);
    gl.autoClear = prevAuto;
    gl.shadowMap.needsUpdate = prevShadowUpdate;
    rt.dispose();
    sc.remove(dish);
  }

  const url = pixelsToDataUrl(pixels, S, S, size, size);
  cache.set(ck, url);
  return url;
}

/** Beauty portrait rendered from the editable Blender sculpt with Cycles.
 * Vite embeds it in the offline build; the gameplay character uses the same sculpt's mesh export.
 */
export function makeDuchessPortrait(_gl: THREE.WebGLRenderer, _width = 900, _height = 1300): string {
  return blenderPortraitUrl;
}
