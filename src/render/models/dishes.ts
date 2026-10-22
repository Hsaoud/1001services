/**
 * Plats de La Duchesse : stylisation géométrique nette et gourmande, lisible de haut à ~20 px.
 * Chaque plat est construit une fois (primitives + petites textures canvas), puis « cuit » en quelques
 * meshes partagés (couleurs de sommets par rugosité, métal, verre…) : une instance ≈ 3 à 6 draw calls.
 */
import * as THREE from 'three';
import type { DishId } from '../../types';
import { PALETTE, ceramic, chamferCylinder, cylinder, gold, lathe, matte, mesh, roundedBox, sphere, torus } from '../kit';
import {
  TAU,
  ball,
  bakeCached,
  canvasTex,
  capsule,
  cgeo,
  chunk,
  disc,
  flatTorus,
  glowTex,
  hash01,
  instantiate,
  limb,
  spriteMat,
  stdMat,
  swirlGeo,
  twinkleTex,
} from './common';

/** Hauteur du fond de l'assiette (où se posent les aliments). */
const PLATE_TOP = 0.012;

// ─────────────────────────────────────────── Matériaux & textures propres aux plats

/** Filet doré « peint » (non métallique) : fusionné avec la porcelaine, un draw call de moins par plat. */
const rimGold = (): THREE.MeshStandardMaterial => stdMat('rimGold', { color: '#d8a43c', roughness: 0.35, metalness: 0.3 });
const wet = (c: string): THREE.MeshStandardMaterial => stdMat(`wet:${c}`, { color: c, roughness: 0.15, metalness: 0 });
const cream = (): THREE.MeshStandardMaterial => stdMat('cream', { color: '#fff9f0', roughness: 0.6 });

function frost(): THREE.MeshStandardMaterial {
  return stdMat('frost', { color: '#e7f1ee', roughness: 0.18, metalness: 0, transparent: true, opacity: 0.46, depthWrite: false });
}

function goldGlow(): THREE.MeshStandardMaterial {
  return stdMat('goldGlow', { color: '#f4c95d', metalness: 0.85, roughness: 0.24, emissive: '#d08a1c', emissiveIntensity: 0.5 });
}

/** Alvéoles de gaufre (une cellule, répétée) : couleur + relief. */
function waffleTex(linear: boolean): THREE.CanvasTexture {
  const t = canvasTex(
    linear ? 'waffle:bump' : 'waffle',
    64,
    (c, s) => {
      c.fillStyle = linear ? '#e0e0e0' : '#e7b257';
      c.fillRect(0, 0, s, s);
      const grad = c.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s * 0.5);
      grad.addColorStop(0, linear ? '#484848' : '#bd7e35');
      grad.addColorStop(1, linear ? '#c8c8c8' : '#dda24a');
      c.fillStyle = grad;
      c.fillRect(8, 8, s - 16, s - 16);
      c.fillStyle = linear ? '#f0f0f0' : '#ecc27a';
      c.fillRect(0, 0, s, 7);
      c.fillRect(0, 0, 7, s);
      c.fillStyle = linear ? '#b8b8b8' : '#d69949';
      c.fillRect(0, s - 4, s, 4);
      c.fillRect(s - 4, 0, 4, s);
    },
    !linear,
  );
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(30, 30);
  t.rotation = Math.PI / 4;
  return t;
}

function waffleMat(): THREE.MeshStandardMaterial {
  return stdMat('waffle', { map: waffleTex(false), bumpMap: waffleTex(true), bumpScale: 0.0035, roughness: 0.62 });
}

/** Latte art : cœur / rosetta de mousse sur crème de café. */
function latteTex(): THREE.CanvasTexture {
  return canvasTex('latte', 128, (c, s) => {
    const m = s / 2;
    const g = c.createRadialGradient(m, m, 4, m, m, m);
    g.addColorStop(0, '#d9a777');
    g.addColorStop(0.75, '#b77a4c');
    g.addColorStop(0.92, '#8f5530');
    g.addColorStop(1, '#7a4628');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    const heart = (scale: number, color: string, dy = 0): void => {
      c.save();
      c.translate(m, m + dy);
      c.scale(scale, scale);
      c.beginPath();
      c.moveTo(0, 30);
      c.bezierCurveTo(-8, 22, -40, 6, -40, -14);
      c.bezierCurveTo(-40, -32, -18, -40, 0, -22);
      c.bezierCurveTo(18, -40, 40, -32, 40, -14);
      c.bezierCurveTo(40, 6, 8, 22, 0, 30);
      c.fillStyle = color;
      c.fill();
      c.restore();
    };
    heart(1.0, '#fff7ec', 4);
    heart(0.72, '#e9cfb1', 6);
    heart(0.56, '#fff7ec', 7);
    heart(0.32, '#e9cfb1', 9);
    heart(0.2, '#fff7ec', 10);
    // trait de la rosetta
    c.strokeStyle = '#fff7ec';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(m, m - 34);
    c.lineTo(m, m + 40);
    c.stroke();
  });
}

/** Tranche d'agrume (rondelle). */
function citrusTex(): THREE.CanvasTexture {
  return canvasTex('citrus', 128, (c, s) => {
    const m = s / 2;
    c.fillStyle = '#f39a33';
    c.beginPath();
    c.arc(m, m, m, 0, TAU);
    c.fill();
    c.fillStyle = '#fff2d4';
    c.beginPath();
    c.arc(m, m, m * 0.86, 0, TAU);
    c.fill();
    for (let i = 0; i < 9; i++) {
      const a0 = (i / 9) * TAU + 0.05;
      const a1 = ((i + 1) / 9) * TAU - 0.05;
      c.fillStyle = i % 2 ? '#ffbb4e' : '#ffc965';
      c.beginPath();
      c.moveTo(m, m);
      c.arc(m, m, m * 0.78, a0, a1);
      c.closePath();
      c.fill();
    }
    c.fillStyle = '#fff2d4';
    c.beginPath();
    c.arc(m, m, m * 0.1, 0, TAU);
    c.fill();
  });
}

/** Paille rayée rose / blanc. */
function strawTex(): THREE.CanvasTexture {
  const t = canvasTex('straw', 64, (c, s) => {
    c.fillStyle = '#fff6f6';
    c.fillRect(0, 0, s, s);
    c.fillStyle = '#ef8fb0';
    for (let i = -2; i < 4; i++) {
      c.beginPath();
      c.moveTo(i * 22, 0);
      c.lineTo(i * 22 + 11, 0);
      c.lineTo(i * 22 + 11 + s, s);
      c.lineTo(i * 22 + s, s);
      c.closePath();
      c.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 4);
  return t;
}

/** Cacao en poudre sur mascarpone. */
function cocoaTex(): THREE.CanvasTexture {
  return canvasTex('cocoa', 128, (c, s) => {
    c.fillStyle = '#7b4a2c';
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const x = hash01(i, 1) * s;
      const y = hash01(i, 2) * s;
      const r = 0.6 + hash01(i, 3) * 1.6;
      const d = Math.hypot(x - s / 2, y - s / 2) / (s / 2);
      c.fillStyle = hash01(i, 4) < 0.18 + d * 0.35 ? '#f3e3c8' : hash01(i, 5) < 0.5 ? '#5e3520' : '#8d5835';
      c.fillRect(x, y, r, r);
    }
  });
}

// ─────────────────────────────────────────── Géométries propres aux plats

const PLATE_PROFILE: [number, number][] = [
  [0, 0],
  [0.085, 0],
  [0.09, 0.006],
  [0.105, 0.011],
  [0.121, 0.02],
  [0.126, 0.025],
  [0.123, 0.028],
  [0.111, 0.021],
  [0.095, 0.013],
  [0, 0.012],
];

function plate(g: THREE.Group, mat: THREE.Material = ceramic(PALETTE.ivory), rim: THREE.Material = rimGold()): void {
  g.add(mesh(lathe(PLATE_PROFILE, 20, 'dish:plate'), mat));
  g.add(mesh(flatTorus(0.117, 0.0032, 3, 20), rim, 0, 0.0246, 0));
}

/** Croffle : croissant aplati en croissant de lune, extrudé (alvéoles par texture). */
function croffleGeo(): THREE.BufferGeometry {
  return cgeo('dish:croffle', () => {
    const L = 0.098;
    const s = new THREE.Shape();
    const N = 10;
    const top: THREE.Vector2[] = [];
    const bot: THREE.Vector2[] = [];
    for (let i = 0; i <= N; i++) {
      const x = -L + (2 * L * i) / N;
      const u = x / L;
      const yc = -0.026 * (1 - u * u);
      const w = 0.058 * Math.pow(Math.max(0, 1 - u * u), 0.55) + 0.006;
      top.push(new THREE.Vector2(x, yc + w));
      bot.push(new THREE.Vector2(x, yc - w * 0.8));
    }
    s.moveTo(bot[0].x, bot[0].y);
    for (let i = 1; i <= N; i++) s.lineTo(bot[i].x, bot[i].y);
    for (let i = N; i >= 0; i--) s.lineTo(top[i].x, top[i].y);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.026, bevelEnabled: true, bevelThickness: 0.011, bevelSize: 0.011, bevelSegments: 2, curveSegments: 6 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.011, 0);
    g.computeVertexNormals();
    return g;
  });
}

/** Tranche de pain / brioche (dôme), posée à plat ; base à y = 0. Groupes : 0 = faces, 1 = croûte. */
function breadSliceGeo(): THREE.BufferGeometry {
  return cgeo('dish:bread', () => {
    const s = new THREE.Shape();
    s.moveTo(-0.054, -0.046);
    s.quadraticCurveTo(-0.058, -0.05, -0.05, -0.05);
    s.lineTo(0.05, -0.05);
    s.quadraticCurveTo(0.058, -0.05, 0.056, -0.042);
    s.lineTo(0.06, 0.012);
    s.bezierCurveTo(0.068, 0.056, 0.022, 0.062, 0.0, 0.052);
    s.bezierCurveTo(-0.022, 0.062, -0.068, 0.056, -0.06, 0.012);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.007, bevelSegments: 1, curveSegments: 6 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.008, 0);
    g.computeVertexNormals();
    return g;
  });
}
/** Épaisseur totale de la tranche (face supérieure). */
const BREAD_TOP = 0.046;

function drinkGeo(): THREE.BufferGeometry {
  return cgeo('dish:drink', () => {
    const pts = [
      [0, 0.02],
      [0.046, 0.02],
      [0.0515, 0.142],
      [0, 0.142],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(pts, 18);
    g.computeVertexNormals();
    const pos = g.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    const a = new THREE.Color('#f27fab');
    const b = new THREE.Color('#ffb48f');
    const top = new THREE.Color('#ffd7b5');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = Math.min(1, Math.max(0, (pos.getY(i) - 0.02) / 0.122));
      if (t > 0.99) c.copy(top);
      else c.copy(a).lerp(b, Math.pow(t, 0.9));
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
}

// ─────────────────────────────────────────── Petits éléments

/** Tonal detail and organic contours baked once into the existing vertices.
 * These colors merge into the same material batches as the original ingredients. */
function ingredientSurface(source: THREE.BufferGeometry, kind: 'bread' | 'pancake' | 'blue' | 'rasp' | 'straw' | 'leaf'): THREE.BufferGeometry {
  return cgeo(`ingredient:${kind}:${source.uuid}`, () => {
    const g = source.clone();
    g.computeBoundingBox();
    const bounds = g.boundingBox!;
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const p = g.getAttribute('position');
    const colors = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const h = (y - bounds.min.y) / Math.max(0.0001, size.y);
      const a = Math.atan2(z, x);
      let shade = 1;
      if (kind === 'bread') {
        const edge = Math.max(Math.abs(x - center.x) / (size.x / 2), Math.abs(z - center.z) / (size.z / 2));
        shade = .76 + .20 * h - .14 * Math.min(1, edge) + .06 * Math.sin(x * 170 + z * 81);
        p.setXYZ(i, x * (1 + .018 * Math.sin(z * 110)), y, z);
      } else if (kind === 'pancake') {
        const ripple = 1 + .021 * Math.sin(a * 5 + .4) + .012 * Math.cos(a * 3);
        p.setXYZ(i, x * ripple, y + .0007 * Math.sin(a * 4) * h, z * ripple);
        shade = .78 + .17 * Math.sin(a * 3 + .7) ** 2 + .08 * (1 - h);
      } else if (kind === 'leaf') {
        p.setXYZ(i, x * (.8 + .2 * Math.cos(z * 95)), y + z * z * 9, z);
        shade = .66 + .28 * h + .06 * Math.cos(z * 90);
      } else {
        const ripple = kind === 'rasp' ? 1 + .10 * Math.cos(a * 3.5 + h * 7) : 1;
        const taper = kind === 'straw' ? .58 + .42 * Math.sin(h * Math.PI * .8) : 1;
        p.setXYZ(i, x * ripple * taper, y - (h > .85 ? (h - .85) * size.y * .7 : 0), z * ripple * taper);
        shade = .67 + .28 * h + .09 * Math.sin(a * 3 + h * 6);
        if (kind === 'blue' && h > .92) shade *= .48; // recessed blossom crown
      }
      colors.set([shade, shade * .98, shade * .94], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  });
}

/** Grain minuscule (sucre glace, graines) : octaèdre de 8 triangles. */
function grain(r: number): THREE.BufferGeometry {
  return cgeo(`grain:${r}`, () => new THREE.OctahedronGeometry(r, 0));
}

function leaf(g: THREE.Object3D, x: number, y: number, z: number, rot: number, size = 1, color = '#6ea35a'): void {
  const l = mesh(ingredientSurface(sphere(0.012 * size, 6, 4), 'leaf'), stdMat(`herb:${color}`, { color, vertexColors: true, roughness: .7 }), x, y, z);
  l.scale.set(1, 0.3, 2.1);
  l.rotation.set(0.15, rot, 0.1);
  l.castShadow = false;
  g.add(l);
}

function berry(g: THREE.Object3D, kind: 'rasp' | 'blue' | 'straw', x: number, y: number, z: number): void {
  if (kind === 'blue') {
    g.add(mesh(ingredientSurface(ball(0.0105, 7, 5), 'blue'), stdMat('blueberry', { color: '#536487', vertexColors: true, roughness: 0.55 }), x, y + 0.009, z));
  } else if (kind === 'rasp') {
    const b = mesh(ingredientSurface(ball(0.0125, 7, 5), 'rasp'), stdMat('raspberry', { color: '#c73950', vertexColors: true, roughness: .7 }), x, y + 0.011, z);
    b.scale.set(1, 1.1, 1);
    g.add(b);
  } else {
    const b = mesh(ingredientSurface(ball(0.016, 8, 6), 'straw'), stdMat('strawberry', { color: '#d84149', vertexColors: true, roughness: 0.4 }), x, y + 0.012, z);
    b.scale.set(1, 1.25, 1);
    g.add(b);
    leaf(g, x, y + 0.03, z, 0.5, 0.6, '#5f9a48');
  }
}

function sprinkle(g: THREE.Object3D, n: number, seed: number, rx: number, rz: number, y: number, color: string, r = 0.003, mat?: THREE.Material): void {
  const m = mat ?? matte(color);
  for (let i = 0; i < n; i++) {
    const a = hash01(seed, i) * TAU;
    const d = Math.sqrt(hash01(seed, i + 100));
    const p = mesh(grain(r), m, Math.cos(a) * d * rx, y, Math.sin(a) * d * rz);
    p.rotation.set(hash01(seed, i + 7) * 3, hash01(seed, i + 8) * 3, 0);
    p.castShadow = false;
    g.add(p);
  }
}

// ─────────────────────────────────────────── Recettes

function buildCroffle(): THREE.Group {
  const g = new THREE.Group();
  plate(g);
  const body = new THREE.Group();
  body.rotation.y = 0.35;
  g.add(body);
  body.add(mesh(croffleGeo(), waffleMat(), 0, PLATE_TOP, 0));
  const top = PLATE_TOP + 0.047;
  // filets de chocolat
  const choc = wet('#4a2619');
  for (const [x, z, r, a] of [
    [-0.02, 0.0, 0.055, 0.2],
    [0.03, -0.01, 0.06, 2.6],
  ]) {
    const d = mesh(flatTorus(r, 0.0032, 4, 24, Math.PI * 0.55), choc, x, top + 0.002, z);
    d.rotation.y = a;
    d.castShadow = false;
    body.add(d);
  }
  // chantilly
  body.add(mesh(swirlGeo(0.04, 0.058, 8, 5, 10, 24), cream(), 0.006, top - 0.006, -0.012));
  // éclats de pistache et de chocolat
  const pist = matte('#9cc35a');
  const dark = matte('#4b2a1d');
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9 + 0.3;
    const d = 0.045 + hash01(3, i) * 0.03;
    const p = mesh(chunk(0.0085), i % 2 ? pist : dark, Math.cos(a) * d * 1.2, top + 0.004, Math.sin(a) * d * 0.55 - 0.012);
    p.rotation.set(i, i * 2, 0);
    body.add(p);
  }
  for (let i = 0; i < 5; i++) {
    const p = mesh(chunk(0.0055), pist, Math.cos(i * 1.3) * 0.016 + 0.006, top + 0.045 + i * 0.002, Math.sin(i * 1.3) * 0.016 - 0.012);
    body.add(p);
  }
  berry(body, 'rasp', -0.062, top - 0.006, 0.0);
  leaf(body, -0.072, top + 0.012, 0.012, 0.8);
  return g;
}

function buildBrioche(): THREE.Group {
  const g = new THREE.Group();
  plate(g);
  // nappage caramel sur l'assiette
  const pool = mesh(chamferCylinder(0.085, 0.085, 0.004, 0.002, 20), wet('#c9792a'), 0, PLATE_TOP - 0.002, 0);
  pool.scale.set(1, 1, 0.82);
  g.add(pool);
  const faces = stdMat('brioche:face', { color: '#e5ae59', vertexColors: true, roughness: 0.32 });
  const crust = stdMat('bread:crust', { color: '#a95d26', vertexColors: true, roughness: .7 });
  const sugar = matte('#ffffff');
  const slices: [number, number, number, number, number][] = [
    [-0.022, PLATE_TOP, 0.012, 0.35, 0],
    [0.03, PLATE_TOP + 0.024, -0.016, -0.55, 0.22],
  ];
  slices.forEach(([x, y, z, ry, rx], si) => {
    const sl = new THREE.Mesh(ingredientSurface(breadSliceGeo(), 'bread'), [faces, crust]);
    sl.castShadow = sl.receiveShadow = true;
    sl.position.set(x, y, z);
    sl.rotation.set(rx, ry, 0, 'YXZ');
    g.add(sl);
    // sucre glace
    for (let i = 0; i < 14; i++) {
      const p = mesh(grain(0.0026), sugar, (hash01(si, i) - 0.5) * 0.09, BREAD_TOP, (hash01(si, i + 50) - 0.55) * 0.075);
      p.castShadow = false;
      sl.add(p);
    }
  });
  // fruits rouges
  const top = PLATE_TOP + 0.024 + BREAD_TOP;
  berry(g, 'rasp', 0.03, top + 0.004, -0.012);
  berry(g, 'rasp', 0.05, top - 0.004, 0.012);
  berry(g, 'blue', 0.012, top, 0.004);
  berry(g, 'blue', -0.06, PLATE_TOP + BREAD_TOP, 0.03);
  berry(g, 'blue', -0.045, PLATE_TOP + BREAD_TOP, 0.045);
  berry(g, 'straw', -0.075, PLATE_TOP + 0.002, -0.055);
  leaf(g, 0.035, top + 0.018, 0.0, 1.2);
  return g;
}

function buildPancakes(): THREE.Group {
  const g = new THREE.Group();
  plate(g);
  const syrup = wet('#b9611a');
  const pool = mesh(chamferCylinder(0.1, 0.1, 0.004, 0.002, 20), syrup, 0.008, PLATE_TOP - 0.002, 0.006);
  pool.scale.set(1, 1, 0.9);
  g.add(pool);
  const pan = stdMat('pancake:toasted', { color: '#dca15a', vertexColors: true, roughness: .7 });
  const edge = matte('#f2d397');
  const H = 0.021;
  let y = PLATE_TOP;
  for (let i = 0; i < 4; i++) {
    const ox = (hash01(11, i) - 0.5) * 0.008;
    const oz = (hash01(12, i) - 0.5) * 0.008;
    g.add(mesh(ingredientSurface(chamferCylinder(0.084, 0.086, H, 0.009, 16), 'pancake'), pan, ox, y, oz));
    g.add(mesh(flatTorus(0.083, 0.0045, 3, 16), edge, ox, y + H * 0.5, oz));
    y += H - 0.001;
  }
  // nappe de sirop + coulures
  g.add(mesh(lathe([[0, 0], [0.074, 0], [0.078, 0.003], [0.06, 0.007], [0, 0.008]], 20, 'dish:syrupTop'), syrup, 0, y - 0.002, 0));
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05 + 0.4;
    const len = 0.018 + hash01(5, i) * 0.04;
    const r = 0.0875;
    g.add(mesh(limb(0.0065, len, 5, 1), syrup, Math.cos(a) * r, y - 0.004, Math.sin(a) * r));
    g.add(mesh(ball(0.0085, 5, 4), syrup, Math.cos(a) * r, y - 0.004 - len, Math.sin(a) * r));
  }
  // beurre + fruits
  const butter = mesh(roundedBox(0.036, 0.016, 0.036, 0.005, 1), stdMat('butter', { color: '#f9e39b', roughness: 0.4 }), -0.004, y + 0.01, 0.004);
  butter.rotation.set(0.08, 0.6, 0.05);
  g.add(butter);
  berry(g, 'blue', 0.042, y, 0.018);
  berry(g, 'blue', 0.03, y, 0.04);
  berry(g, 'blue', -0.04, y, -0.03);
  berry(g, 'rasp', 0.035, y, -0.035);
  berry(g, 'rasp', -0.045, y, 0.03);
  leaf(g, 0.05, y + 0.012, -0.01, 0.4);
  return g;
}

function buildTiramisu(): THREE.Group {
  const g = new THREE.Group();
  const saucer = new THREE.Group();
  saucer.scale.set(0.86, 1, 0.86);
  plate(saucer);
  g.add(saucer);
  const y0 = PLATE_TOP;
  const gl = frost();
  // coupe : pied, jambe, bulbe
  g.add(mesh(chamferCylinder(0.044, 0.05, 0.008, 0.003, 16), gl, 0, y0, 0));
  g.add(mesh(cylinder(0.007, 0.01, 0.06, 10), gl, 0, y0 + 0.006, 0));
  g.add(mesh(ball(0.013), gl, 0, y0 + 0.064, 0));
  const b = y0 + 0.068;
  g.add(
    mesh(
      lathe(
        [
          [0.01, b],
          [0.05, b + 0.008],
          [0.084, b + 0.028],
          [0.099, b + 0.052],
          [0.103, b + 0.082],
        ],
        20,
        'dish:coupe',
      ),
      gl,
    ),
  );
  g.add(mesh(flatTorus(0.103, 0.0035, 4, 24), rimGold(), 0, b + 0.082, 0));
  // couches cacao / mascarpone
  const sponge = matte('#7c4a2f');
  const masc = cream();
  g.add(mesh(lathe([[0, b + 0.004], [0.045, b + 0.009], [0.078, b + 0.028], [0.084, b + 0.034], [0, b + 0.034]], 20, 'dish:tl1'), sponge));
  g.add(mesh(lathe([[0, b + 0.034], [0.084, b + 0.034], [0.093, b + 0.048], [0.094, b + 0.052], [0, b + 0.052]], 20, 'dish:tl2'), masc));
  g.add(mesh(lathe([[0, b + 0.052], [0.094, b + 0.052], [0.096, b + 0.06], [0, b + 0.06]], 20, 'dish:tl3'), matte('#8b5535')));
  g.add(mesh(lathe([[0, b + 0.06], [0.096, b + 0.06], [0.098, b + 0.072], [0.088, b + 0.077], [0, b + 0.079]], 20, 'dish:tl4'), masc));
  const dust = new THREE.Mesh(disc(0.09, 20), stdMat('cocoa', { map: cocoaTex(), roughness: 0.9 }));
  dust.position.y = b + 0.0795;
  dust.receiveShadow = true;
  g.add(dust);
  // biscuit cuillère + grains de café
  const bis = mesh(capsule(0.012, 0.062, 6, 2), matte('#ecc583'), 0.032, b + 0.105, -0.018);
  bis.rotation.set(0.7, 0.4, 0.15);
  bis.scale.set(1, 1, 0.75);
  g.add(bis);
  sprinkle(bis, 6, 21, 0.008, 0.008, 0.0, '#ffffff', 0.0022);
  for (const [x, z, r] of [
    [-0.035, 0.025, 0.3],
    [-0.012, 0.045, 1.4],
  ]) {
    const bean = mesh(ball(0.0085, 6, 4), ceramic('#3d2418'), x, b + 0.082, z);
    bean.scale.set(1, 0.6, 1.35);
    bean.rotation.y = r;
    g.add(bean);
  }
  leaf(g, -0.04, b + 0.086, -0.02, 2.2);
  return g;
}

function buildAvotoast(): THREE.Group {
  const g = new THREE.Group();
  plate(g);
  const toast = new THREE.Mesh(ingredientSurface(breadSliceGeo(), 'bread'), [
    stdMat('toast:crumb', { color: '#e6b866', vertexColors: true, roughness: .7 }),
    stdMat('toast:crust', { color: '#a8642c', vertexColors: true, roughness: .7 }),
  ]);
  toast.castShadow = toast.receiveShadow = true;
  toast.position.set(0, PLATE_TOP, 0);
  toast.scale.set(1.45, 0.75, 1.22);
  toast.rotation.y = -0.25;
  g.add(toast);
  const top = PLATE_TOP + BREAD_TOP * 0.75;
  // éventail d'avocat
  const flesh = stdMat('avocado', { color: '#c5d97a', roughness: 0.45 });
  const skin = matte('#5f8d38');
  const fan = new THREE.Group();
  fan.position.set(-0.012, top, -0.03);
  fan.rotation.y = -0.25;
  g.add(fan);
  for (let i = 0; i < 6; i++) {
    const a = -0.55 + i * 0.22;
    const s = new THREE.Group();
    s.rotation.y = a;
    s.position.y = i * 0.0015;
    fan.add(s);
    const f = mesh(sphere(0.02, 8, 6), flesh, 0, 0.004, 0.055);
    f.scale.set(0.72, 0.42, 2.35);
    s.add(f);
    const k = mesh(sphere(0.02, 6, 4), skin, 0.011, 0.002, 0.055);
    k.scale.set(0.28, 0.38, 2.3);
    s.add(k);
  }
  // œuf poché
  const white = stdMat('eggwhite', { color: '#fbf7ee', roughness: 0.35 });
  const egg = mesh(sphere(0.04, 10, 7), white, 0.006, top + 0.016, 0.026);
  egg.scale.set(1, 0.48, 0.92);
  g.add(egg);
  g.add(mesh(ball(0.016, 6, 4), white, -0.028, top + 0.01, 0.04));
  const yolk = mesh(sphere(0.019, 10, 8), wet('#f4a31b'), 0.008, top + 0.031, 0.026);
  yolk.scale.set(1, 0.78, 1);
  g.add(yolk);
  // graines, piment, pousses
  sprinkle(g, 10, 31, 0.05, 0.05, top + 0.022, '#2b2230', 0.0028);
  sprinkle(g, 6, 32, 0.035, 0.035, top + 0.036, '#fbf1dc', 0.0026);
  sprinkle(g, 6, 33, 0.055, 0.045, top + 0.02, '#c8442f', 0.0035);
  leaf(g, 0.045, top + 0.03, 0.03, 0.6, 0.8, '#7cb35a');
  leaf(g, 0.052, top + 0.03, 0.016, -0.5, 0.7, '#8cc46a');
  leaf(g, -0.048, top + 0.016, 0.03, 2.4, 0.8, '#7cb35a');
  return g;
}

function buildMocktail(): THREE.Group {
  const g = new THREE.Group();
  // dessous de verre
  g.add(mesh(chamferCylinder(0.072, 0.072, 0.006, 0.002, 20), matte(PALETTE.blush)));
  g.add(mesh(flatTorus(0.07, 0.0025, 4, 20), rimGold(), 0, 0.006, 0));
  const fr = frost();
  // boisson dégradée rose → pêche
  g.add(mesh(drinkGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3 })));
  // verre
  g.add(mesh(chamferCylinder(0.046, 0.046, 0.016, 0.004, 16), fr, 0, 0.006, 0));
  g.add(
    mesh(
      lathe(
        [
          [0.046, 0.012],
          [0.049, 0.02],
          [0.0555, 0.165],
          [0.0565, 0.17],
        ],
        20,
        'dish:tumbler',
      ),
      fr,
    ),
  );
  g.add(mesh(flatTorus(0.0565, 0.0045, 4, 20), matte('#fffdf8'), 0, 0.169, 0)); // bord givré
  // glaçons
  const ice = stdMat('ice', { color: '#ffffff', roughness: 0.15, transparent: true, opacity: 0.6, depthWrite: false });
  for (const [x, z, r] of [
    [-0.016, 0.012, 0.3],
    [0.014, 0.018, 1.1],
    [0.004, -0.02, 2.1],
  ]) {
    const c = mesh(roundedBox(0.026, 0.026, 0.026, 0.006, 1), ice, x, 0.142, z);
    c.rotation.set(0.3, r, 0.2);
    g.add(c);
  }
  // rondelle d'agrume sur le bord
  const wheelMat = stdMat('citrus', { map: citrusTex(), roughness: 0.45 });
  const wheel = new THREE.Mesh(cylinder(0.034, 0.034, 0.007, 16), [matte('#f39a33'), wheelMat, wheelMat]);
  wheel.castShadow = true;
  wheel.position.set(0.042, 0.168, 0.04);
  wheel.rotation.set(Math.PI / 2 - 0.25, Math.PI / 4, 0, 'YXZ');
  g.add(wheel);
  // paille
  const straw = new THREE.Mesh(cylinder(0.0055, 0.0055, 0.17, 10), stdMat('straw', { map: strawTex(), roughness: 0.5 }));
  straw.castShadow = true;
  straw.position.set(0.006, 0.03, -0.004);
  straw.rotation.set(-0.28, 0, 0.28);
  g.add(straw);
  leaf(g, -0.02, 0.16, -0.012, 0.6, 1.1, '#5f9a48');
  leaf(g, -0.028, 0.162, 0.0, -0.4, 0.9, '#73ad5c');
  return g;
}

function buildLatte(): THREE.Group {
  const g = new THREE.Group();
  // soucoupe
  g.add(
    mesh(
      lathe(
        [
          [0, 0],
          [0.06, 0],
          [0.066, 0.005],
          [0.09, 0.01],
          [0.103, 0.017],
          [0.1, 0.02],
          [0.088, 0.014],
          [0.066, 0.01],
          [0, 0.009],
        ],
        18,
        'dish:saucer',
      ),
      ceramic(PALETTE.ivory),
    ),
  );
  g.add(mesh(flatTorus(0.098, 0.003, 4, 24), rimGold(), 0, 0.0175, 0));
  // tasse rose poudré
  const cup = ceramic('#f2cfcc');
  g.add(
    mesh(
      lathe(
        [
          [0, 0.009],
          [0.034, 0.009],
          [0.038, 0.014],
          [0.05, 0.03],
          [0.058, 0.06],
          [0.0605, 0.085],
          [0.061, 0.091],
          [0.0575, 0.092],
          [0.0555, 0.086],
          [0.051, 0.06],
          [0.04, 0.034],
          [0, 0.03],
        ],
        16,
        'dish:cup',
      ),
      cup,
    ),
  );
  g.add(mesh(flatTorus(0.0592, 0.0028, 4, 20), rimGold(), 0, 0.0915, 0));
  const handle = mesh(torus(0.021, 0.0068, 5, 12, Math.PI * 1.15), cup, 0.0625, 0.058, 0);
  handle.rotation.z = -Math.PI * 0.575;
  g.add(handle);
  // mousse et latte art
  const foam = new THREE.Mesh(disc(0.0555, 24), stdMat('latteArt', { map: latteTex(), roughness: 0.62 }));
  foam.position.y = 0.0855;
  foam.rotation.y = Math.PI / 4;
  foam.receiveShadow = true;
  g.add(foam);
  // cuillère et biscuit
  const sp = new THREE.Group();
  sp.position.set(-0.035, 0.016, 0.07);
  sp.rotation.y = 0.9;
  const bowl = mesh(ball(0.012, 8, 5), ceramic('#d9dde3'), 0, 0, 0);
  bowl.scale.set(1, 0.3, 1.45);
  sp.add(bowl);
  const hd = mesh(capsule(0.0032, 0.055, 5), ceramic('#d9dde3'), 0, 0.002, -0.042);
  hd.rotation.x = Math.PI / 2 - 0.05;
  sp.add(hd);
  g.add(sp);
  const bis = mesh(roundedBox(0.032, 0.006, 0.022, 0.003), matte('#b9773a'), 0.055, 0.016, 0.055);
  bis.rotation.y = -0.6;
  g.add(bis);
  return g;
}

function buildGolden(): THREE.Group {
  const g = new THREE.Group();
  plate(g, gold(PALETTE.goldPale), gold(PALETTE.gold));
  const gg = goldGlow();
  // cloche dorée
  g.add(
    mesh(
      lathe(
        [
          [0, PLATE_TOP],
          [0.088, PLATE_TOP],
          [0.091, PLATE_TOP + 0.007],
          [0.086, PLATE_TOP + 0.03],
          [0.072, PLATE_TOP + 0.058],
          [0.048, PLATE_TOP + 0.079],
          [0.022, PLATE_TOP + 0.088],
          [0, PLATE_TOP + 0.09],
        ],
        24,
        'dish:cloche',
      ),
      gg,
    ),
  );
  g.add(mesh(flatTorus(0.089, 0.0055, 6, 32), gold(PALETTE.gold), 0, PLATE_TOP + 0.005, 0));
  g.add(mesh(flatTorus(0.078, 0.003, 4, 32), gold(PALETTE.brass), 0, PLATE_TOP + 0.046, 0));
  // petite couronne en guise de bouton
  const top = PLATE_TOP + 0.089;
  g.add(mesh(chamferCylinder(0.018, 0.013, 0.022, 0.004, 16), gg, 0, top - 0.002, 0));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    g.add(mesh(ball(0.0055, 8, 6), gg, Math.cos(a) * 0.017, top + 0.022, Math.sin(a) * 0.017));
  }
  g.add(mesh(ball(0.008, 10, 8), stdMat('jewel', { color: '#ff8fb1', emissive: '#ff5f95', emissiveIntensity: 0.6, roughness: 0.2 }), 0, top + 0.012, 0.016));
  // halo et scintillements (animés à l'affichage)
  const halo = new THREE.Sprite(spriteMat('goldHalo', glowTex(), '#ffcf6a', true));
  halo.position.set(0, PLATE_TOP + 0.05, 0);
  halo.scale.setScalar(0.3);
  halo.userData.twinkle = { phase: 0, base: 0.3, amp: 0.06, spin: false };
  g.add(halo);
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Sprite(spriteMat('goldTwinkle', twinkleTex(), '#fff1b8', true));
    const a = i * 2.2 + 0.4;
    s.position.set(Math.cos(a) * 0.085, PLATE_TOP + 0.06 + i * 0.03, Math.sin(a) * 0.085);
    s.userData.twinkle = { phase: i * 1.9, base: 0.07, amp: 0.05, spin: true };
    g.add(s);
  }
  return g;
}

const BUILDERS: Record<DishId, () => THREE.Group> = {
  croffle: buildCroffle,
  brioche: buildBrioche,
  pancakes: buildPancakes,
  tiramisu: buildTiramisu,
  avotoast: buildAvotoast,
  mocktail: buildMocktail,
  latte: buildLatte,
  golden: buildGolden,
};

// ─────────────────────────────────────────── API

/** Anime les sprites scintillants (plat doré) au moment du rendu, sans boucle de mise à jour. */
function armTwinkle(o: THREE.Object3D): void {
  const tw = o.userData.twinkle as { phase: number; base: number; amp: number; spin: boolean } | undefined;
  if (!tw) return;
  const sp = o as THREE.Sprite;
  const mat0 = sp.material;
  sp.onBeforeRender = () => {
    const t = performance.now() / 1000 + tw.phase;
    const k = tw.spin ? Math.max(0, Math.sin(t * 2.6)) : 0.5 + 0.5 * Math.sin(t * 3.1);
    sp.scale.setScalar(tw.base + tw.amp * k);
    if (tw.spin) mat0.rotation = t * 0.8;
    sp.updateMatrix();
    if (sp.parent) sp.matrixWorld.multiplyMatrices(sp.parent.matrixWorld, sp.matrix);
  };
}

/**
 * Modèle 3D d'un plat, posé sur son assiette / soucoupe.
 * Origine : centre du dessous de l'assiette (y = 0). Emprise ≤ 0.26 de diamètre, hauteur ≤ 0.3.
 * Géométries et matériaux partagés (mis en cache) : `disposeTree` n'y touche pas.
 */
export function createDishMesh(id: DishId): THREE.Group {
  const t = bakeCached(`dish:${id}`, BUILDERS[id]);
  const g = new THREE.Group();
  instantiate(t, g);
  g.traverse(armTwinkle);
  g.name = `dish:${id}`;
  return g;
}
