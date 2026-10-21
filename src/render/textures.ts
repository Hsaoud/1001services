/**
 * Textures procédurales (CanvasTexture) : sols, murs, extérieurs, tapis, tableaux, fond, atlas de particules.
 * Tout est dessiné au canvas 2D puis mis en cache. Aucune image externe.
 */
import * as THREE from 'three';
import type { BiomeId, FloorStyle } from '../types';

// ─────────────────────────────────────────── Outils

let maxAniso = 4;
const allTextures = new Set<THREE.Texture>();
const cache = new Map<string, THREE.Texture>();

/** Anisotropie max (fixée par le GameRenderer selon le GPU et la qualité). */
export function setMaxAnisotropy(n: number): void {
  maxAniso = Math.max(1, n);
  for (const t of allTextures) {
    if (t.userData.aniso) {
      t.anisotropy = maxAniso;
      t.needsUpdate = true;
    }
  }
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: false });
  if (!ctx) throw new Error('canvas 2d indisponible');
  return [c, ctx];
}

function toTexture(c: HTMLCanvasElement, opts: { repeat?: boolean; srgb?: boolean; aniso?: boolean; mips?: boolean } = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat !== false) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.generateMipmaps = opts.mips !== false;
  t.minFilter = opts.mips !== false ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  if (opts.aniso !== false) {
    t.userData.aniso = true;
    t.anisotropy = maxAniso;
  }
  t.userData.shared = true;
  allTextures.add(t);
  return t;
}

function cached<T extends THREE.Texture>(key: string, make: () => T): T {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t as T;
}

/** Générateur pseudo-aléatoire local (mulberry32). */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    let t = (s = (s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashI(x: number, y: number, s: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Bruit de valeur périodique (période px × py en cellules de réseau). */
function vnoise(x: number, y: number, px: number, py: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const x0 = ((xi % px) + px) % px;
  const y0 = ((yi % py) + py) % py;
  const x1 = (x0 + 1) % px;
  const y1 = (y0 + 1) % py;
  const a = hashI(x0, y0, seed);
  const b = hashI(x1, y0, seed);
  const c = hashI(x0, y1, seed);
  const d = hashI(x1, y1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** fbm périodique : (u, v) dans [0, 1[, `base` = fréquence de départ (entière pour rester raccordable). */
function fbm(u: number, v: number, base: number, oct: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let f = base;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(u * f, v * f, f, f, seed + i * 17);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

function hex(c: string): [number, number, number] {
  const col = new THREE.Color(c);
  return [col.r * 255, col.g * 255, col.b * 255];
}

function mixHex(a: string, b: string, t: number): string {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
}

function shade(c: string, k: number): string {
  const col = new THREE.Color(c);
  if (k >= 0) col.lerp(new THREE.Color('#ffffff'), k);
  else col.lerp(new THREE.Color('#000000'), -k);
  return '#' + col.getHexString();
}

/** Ajoute un grain fin (poudre, pierre) à tout le canvas. */
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, seed: number): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const r = rng(seed);
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

/** Dessine un chemin en tenant compte du raccord (dessine aussi les copies décalées d'une période). */
function wrapDraw(w: number, h: number, draw: (ox: number, oy: number) => void): void {
  for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) draw(ox, oy);
}

// ─────────────────────────────────────────── Sols

export interface FloorTex {
  map: THREE.Texture;
  /** Taille (m) couverte par une répétition de la texture. */
  sizeX: number;
  sizeZ: number;
  roughness: number;
  metalness: number;
}

/** Texture de sol (mise en cache par style & biome). */
export function floorTexture(style: FloorStyle, biome: BiomeId): FloorTex {
  const key = `floor:${style}:${biome}`;
  const t = cached(key, () => drawFloor(style, biome));
  const meta = FLOOR_META[style];
  return { map: t, sizeX: meta.sx, sizeZ: meta.sz, roughness: meta.rough, metalness: 0 };
}

const HEX_S = 512 / (8 * Math.sqrt(3)); // côté des tomettes en px
const FLOOR_META: Record<FloorStyle, { sx: number; sz: number; rough: number }> = {
  parquet: { sx: 2, sz: 2, rough: 0.48 },
  tiles_rose: { sx: 2, sz: 2, rough: 0.62 },
  carpet: { sx: 2, sz: 2, rough: 0.95 },
  marble: { sx: 2, sz: 2, rough: 0.22 },
  stone: { sx: 2, sz: 2, rough: 0.85 },
  terracotta: { sx: 2, sz: (2 * Math.round(3 * HEX_S * 5)) / 512, rough: 0.78 },
  checker: { sx: 2, sz: 2, rough: 0.35 },
  stage: { sx: 2, sz: 2, rough: 0.45 },
};

function drawFloor(style: FloorStyle, biome: BiomeId): THREE.Texture {
  switch (style) {
    case 'parquet':
      return drawParquet(biome);
    case 'tiles_rose':
      return drawCementTiles(biome);
    case 'carpet':
      return drawCarpet();
    case 'marble':
      return drawMarble(biome);
    case 'stone':
      return drawStone();
    case 'terracotta':
      return drawTomettes();
    case 'checker':
      return drawChecker();
    case 'stage':
      return drawStage();
  }
}

/** Parquet en chevrons (point de Hongrie) couleur miel. */
function drawParquet(biome: BiomeId): THREE.Texture {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  const r = rng(11);
  const cols = 4;
  const cw = S / cols;
  const rows = 10;
  const step = S / rows;
  const base = biome === 'galerie' ? ['#b98a5e', '#c69a6c', '#ad7d52', '#d2a978'] : ['#dbb887', '#e5c597', '#d0aa79', '#ebd0a4', '#cda271'];
  ctx.fillStyle = '#7a5332';
  ctx.fillRect(0, 0, S, S);
  for (let col = 0; col < cols; col++) {
    const x0 = col * cw;
    const xm = x0 + cw / 2;
    const x1 = x0 + cw;
    for (let row = -3; row < rows + 3; row++) {
      for (const side of [0, 1]) {
        const y = row * step + (side ? 0 : 0);
        const path = new Path2D();
        if (side === 0) {
          path.moveTo(x0, y);
          path.lineTo(xm, y + cw / 2);
          path.lineTo(xm, y + cw / 2 + step);
          path.lineTo(x0, y + step);
        } else {
          path.moveTo(xm, y + cw / 2);
          path.lineTo(x1, y);
          path.lineTo(x1, y + step);
          path.lineTo(xm, y + cw / 2 + step);
        }
        path.closePath();
        const tone = base[Math.floor(r() * base.length)];
        wrapDraw(0, S, (_ox, oy) => {
          ctx.save();
          ctx.translate(0, oy);
          ctx.clip(path);
          // dégradé de vernis le long de la lame
          const g = ctx.createLinearGradient(x0, y, x1, y + step);
          g.addColorStop(0, shade(tone, 0.08));
          g.addColorStop(0.5, tone);
          g.addColorStop(1, shade(tone, -0.06));
          ctx.fillStyle = g;
          ctx.fillRect(x0 - 2, y - 2, cw + 4, cw + step + 4);
          // veinage du bois
          ctx.globalAlpha = 0.16;
          ctx.strokeStyle = shade(tone, -0.35);
          ctx.lineWidth = 0.8;
          const dir = side === 0 ? 1 : -1;
          for (let k = 0; k < 7; k++) {
            const off = r() * step;
            ctx.beginPath();
            const sx = side === 0 ? x0 : xm;
            const sy = side === 0 ? y + off : y + cw / 2 + off;
            ctx.moveTo(sx, sy);
            for (let q = 1; q <= 8; q++) {
              const px = sx + (q / 8) * (cw / 2);
              const py = sy + dir * (q / 8) * (cw / 2) + Math.sin(q * 1.3 + k) * 1.2;
              ctx.lineTo(px, py);
            }
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          ctx.restore();
          // joint
          ctx.save();
          ctx.translate(0, oy);
          ctx.strokeStyle = 'rgba(92,58,32,0.75)';
          ctx.lineWidth = 1.4;
          ctx.stroke(path);
          ctx.restore();
        });
      }
    }
  }
  grain(ctx, S, S, 10, 3);
  return toTexture(c);
}

/** Carreaux de ciment poudrés à motif floral (0.5 m). */
function drawCementTiles(biome: BiomeId): THREE.Texture {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  const T = S / 4;
  const pal =
    biome === 'jardin'
      ? { bg: '#f4ecdc', a: '#a8b89a', b: '#e8b4b8', line: '#c9b79f', dot: '#d4a537' }
      : { bg: '#f7e9e2', a: '#e3a9ae', b: '#a8b89a', line: '#d7b9ad', dot: '#c9a24a' };
  const r = rng(7);
  for (let ty = 0; ty < 4; ty++)
    for (let tx = 0; tx < 4; tx++) {
      const x = tx * T;
      const y = ty * T;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, T, T);
      ctx.clip();
      ctx.fillStyle = mixHex(pal.bg, '#ffffff', r() * 0.25);
      ctx.fillRect(x, y, T, T);
      const cx = x + T / 2;
      const cy = y + T / 2;
      // quarts de cercle aux coins (forment des cercles au raccord)
      ctx.fillStyle = pal.b;
      for (const [qx, qy] of [
        [x, y],
        [x + T, y],
        [x, y + T],
        [x + T, y + T],
      ]) {
        ctx.beginPath();
        ctx.arc(qx, qy, T * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = pal.bg;
      for (const [qx, qy] of [
        [x, y],
        [x + T, y],
        [x, y + T],
        [x + T, y + T],
      ]) {
        ctx.beginPath();
        ctx.arc(qx, qy, T * 0.13, 0, Math.PI * 2);
        ctx.fill();
      }
      // losange fin
      ctx.strokeStyle = pal.line;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, y + 6);
      ctx.lineTo(x + T - 6, cy);
      ctx.lineTo(cx, y + T - 6);
      ctx.lineTo(x + 6, cy);
      ctx.closePath();
      ctx.stroke();
      // fleur à quatre pétales
      ctx.fillStyle = pal.a;
      for (let k = 0; k < 4; k++) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((k * Math.PI) / 2);
        ctx.beginPath();
        ctx.ellipse(0, -T * 0.17, T * 0.085, T * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = pal.b;
      for (let k = 0; k < 4; k++) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((k * Math.PI) / 2 + Math.PI / 4);
        ctx.beginPath();
        ctx.ellipse(0, -T * 0.13, T * 0.04, T * 0.08, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = pal.dot;
      ctx.beginPath();
      ctx.arc(cx, cy, T * 0.045, 0, Math.PI * 2);
      ctx.fill();
      // usure poudrée
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = '#ffffff';
      for (let k = 0; k < 6; k++) {
        ctx.beginPath();
        ctx.arc(x + r() * T, y + r() * T, 6 + r() * 18, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      // joint
      ctx.strokeStyle = 'rgba(150,120,110,0.45)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.75, y + 0.75, T - 1.5, T - 1.5);
    }
  grain(ctx, S, S, 9, 5);
  return toTexture(c);
}

/** Moquette bordeaux damassée (la bordure dorée est géométrique). */
function drawCarpet(): THREE.Texture {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = '#7a2e3a';
  ctx.fillRect(0, 0, S, S);
  const M = S / 4;
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++) {
      const cx = i * M + (j % 2 ? M / 2 : 0) + M / 2;
      const cy = j * M + M / 2;
      wrapDraw(S, S, (ox, oy) => {
        ctx.save();
        ctx.translate(cx + ox, cy + oy);
        // médaillon damassé
        ctx.fillStyle = '#8c3846';
        ctx.beginPath();
        ctx.ellipse(0, 0, M * 0.26, M * 0.36, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#6a2531';
        for (let k = 0; k < 4; k++) {
          ctx.save();
          ctx.rotate((k * Math.PI) / 2);
          ctx.beginPath();
          ctx.moveTo(0, -M * 0.05);
          ctx.quadraticCurveTo(M * 0.14, -M * 0.2, 0, -M * 0.31);
          ctx.quadraticCurveTo(-M * 0.14, -M * 0.2, 0, -M * 0.05);
          ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = 'rgba(201,162,74,0.55)';
        ctx.beginPath();
        ctx.arc(0, 0, M * 0.04, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }
  // velours (fibres)
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const n = (fbm(x / S, y / S, 32, 2, 4) - 0.5) * 26 + (hashI(x, y, 9) - 0.5) * 14;
      const i = (y * S + x) * 4;
      d[i] = Math.max(0, Math.min(255, d[i] + n));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n * 0.5));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.6));
    }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

/** Marbre blanc veiné en dalles de 1 m. */
function drawMarble(biome: BiomeId): THREE.Texture {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  const img = ctx.createImageData(S, S);
  const d = img.data;
  const base = hex(biome === 'galerie' ? '#f7f4ef' : '#f5f1ea');
  const vein = hex('#a9a199');
  const goldV = hex('#cdb58a');
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const slab = (Math.floor(u * 2) + Math.floor(v * 2) * 2) % 4;
      const ang = slab % 2 ? 0.7 : -0.5;
      const w1 = fbm(u, v, 4, 5, 21 + slab);
      const t = (u * Math.cos(ang) + v * Math.sin(ang)) * 9 + w1 * 7;
      const ve = Math.pow(1 - Math.abs(Math.sin(t * Math.PI * 0.5)), 9);
      const ve2 = Math.pow(1 - Math.abs(Math.sin((t * 2.3 + w1 * 3) * Math.PI)), 22) * 0.55;
      const cloud = fbm(u, v, 8, 3, 3) - 0.5;
      const i = (y * S + x) * 4;
      const vv = Math.min(1, ve * 0.7 + ve2 * 0.45);
      for (let k = 0; k < 3; k++) {
        let col = base[k] + cloud * 14;
        col = col * (1 - vv) + (slab === 2 ? goldV[k] : vein[k]) * vv;
        d[i + k] = col;
      }
      d[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  // joints fins
  ctx.strokeStyle = 'rgba(160,150,140,0.5)';
  ctx.lineWidth = 1.2;
  for (let k = 0; k <= 2; k++) {
    ctx.beginPath();
    ctx.moveTo(k * (S / 2), 0);
    ctx.lineTo(k * (S / 2), S);
    ctx.moveTo(0, k * (S / 2));
    ctx.lineTo(S, k * (S / 2));
    ctx.stroke();
  }
  return toTexture(c);
}

/** Dallage de pierre claire (opus romain). */
function drawStone(): THREE.Texture {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  const U = S / 4;
  const r = rng(31);
  // partition raccordable d'une grille 4×4 en rectangles
  const used = Array.from({ length: 4 }, () => [false, false, false, false]);
  const rects: [number, number, number, number][] = [];
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++) {
      if (used[j][i]) continue;
      let w = 1;
      let h = 1;
      if (r() < 0.5 && i + 1 < 4 && !used[j][i + 1]) w = 2;
      if (r() < 0.4 && j + 1 < 4) {
        let ok = true;
        for (let q = 0; q < w; q++) if (used[j + 1][i + q]) ok = false;
        if (ok) h = 2;
      }
      for (let b = 0; b < h; b++) for (let a = 0; a < w; a++) used[j + b][i + a] = true;
      rects.push([i, j, w, h]);
    }
  ctx.fillStyle = '#cfc4b2';
  ctx.fillRect(0, 0, S, S);
  const tones = ['#ece4d6', '#e6dccb', '#f1eadf', '#e0d5c2', '#ebe2d0'];
  for (const [i, j, w, h] of rects) {
    const x = i * U + 2;
    const y = j * U + 2;
    const g = ctx.createLinearGradient(x, y, x + w * U, y + h * U);
    const tone = tones[Math.floor(r() * tones.length)];
    g.addColorStop(0, shade(tone, 0.06));
    g.addColorStop(1, shade(tone, -0.05));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x, y, w * U - 4, h * U - 4, 5);
    ctx.fill();
  }
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const n = (fbm(x / S, y / S, 16, 4, 8) - 0.5) * 30 + (hashI(x, y, 2) - 0.5) * 10;
      const i = (y * S + x) * 4;
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n * 0.9;
    }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

/** Tomettes hexagonales en terre cuite. */
function drawTomettes(): THREE.Texture {
  const s = HEX_S;
  const W = 512;
  const H = Math.round(3 * s * 5);
  const [c, ctx] = makeCanvas(W, H);
  ctx.fillStyle = '#e9dccb';
  ctx.fillRect(0, 0, W, H);
  const r = rng(5);
  const tones = ['#c97b52', '#d08c60', '#bf6f49', '#d79a6d', '#c4845c', '#b9673f'];
  const hw = Math.sqrt(3) * s;
  for (let row = -1; row < 12; row++)
    for (let col = -1; col < 10; col++) {
      const cx = col * hw + (row % 2 ? hw / 2 : 0);
      const cy = row * 1.5 * s;
      const tone = tones[Math.floor(r() * tones.length)];
      wrapDraw(W, H, (ox, oy) => {
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + (k * Math.PI) / 3;
          const px = cx + ox + Math.cos(a) * (s - 1.6);
          const py = cy + oy + Math.sin(a) * (s - 1.6);
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        const g = ctx.createRadialGradient(cx + ox - s * 0.3, cy + oy - s * 0.3, 2, cx + ox, cy + oy, s);
        g.addColorStop(0, shade(tone, 0.1));
        g.addColorStop(1, shade(tone, -0.08));
        ctx.fillStyle = g;
        ctx.fill();
      });
    }
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const n = (hashI(x, y, 4) - 0.5) * 16 + (vnoise((x / W) * 24, (y / H) * 24, 24, 24, 3) - 0.5) * 18;
      const i = (y * W + x) * 4;
      d[i] += n;
      d[i + 1] += n * 0.8;
      d[i + 2] += n * 0.7;
    }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

/** Damier crème / vert sauge (0.5 m). */
function drawChecker(): THREE.Texture {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  const T = S / 4;
  const img = ctx.createImageData(S, S);
  const d = img.data;
  const a = hex('#f6efe2');
  const b = hex('#bccab0');
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const odd = (Math.floor(x / T) + Math.floor(y / T)) % 2;
      const col = odd ? b : a;
      const n = (fbm(x / S, y / S, 8, 4, odd ? 2 : 9) - 0.5) * 22;
      const i = (y * S + x) * 4;
      d[i] = col[0] + n;
      d[i + 1] = col[1] + n;
      d[i + 2] = col[2] + n;
      d[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = 'rgba(120,120,100,0.35)';
  ctx.lineWidth = 1.2;
  for (let k = 0; k <= 4; k++) {
    ctx.beginPath();
    ctx.moveTo(k * T, 0);
    ctx.lineTo(k * T, S);
    ctx.moveTo(0, k * T);
    ctx.lineTo(S, k * T);
    ctx.stroke();
  }
  return toTexture(c);
}

/** Plancher d'estrade (noyer, lames droites). */
function drawStage(): THREE.Texture {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  const r = rng(17);
  const pw = S / 13;
  ctx.fillStyle = '#4a2c1a';
  ctx.fillRect(0, 0, S, S);
  const tones = ['#94603d', '#8a5636', '#9e6a45', '#83502f', '#a37049'];
  for (let k = 0; k < 13; k++) {
    let x = -r() * S;
    const y = k * pw;
    while (x < S) {
      const len = S * (0.35 + r() * 0.5);
      const tone = tones[Math.floor(r() * tones.length)];
      wrapDraw(S, 0, (ox) => {
        const g = ctx.createLinearGradient(0, y, 0, y + pw);
        g.addColorStop(0, shade(tone, 0.08));
        g.addColorStop(1, shade(tone, -0.08));
        ctx.fillStyle = g;
        ctx.fillRect(x + ox + 1, y + 1, len - 2, pw - 2);
        ctx.globalAlpha = 0.18;
        ctx.strokeStyle = shade(tone, -0.4);
        ctx.lineWidth = 0.8;
        for (let q = 0; q < 4; q++) {
          const yy = y + 4 + r() * (pw - 8);
          ctx.beginPath();
          ctx.moveTo(x + ox, yy);
          ctx.bezierCurveTo(x + ox + len * 0.3, yy + 2, x + ox + len * 0.6, yy - 2, x + ox + len, yy);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      });
      x += len;
    }
  }
  grain(ctx, S, S, 8, 6);
  return toTexture(c);
}

// ─────────────────────────────────────────── Murs

export interface WallPalette {
  wainscot: string;
  panel: string;
  upper: string;
  upper2: string;
  pattern: 'brick' | 'stripes' | 'ashlar' | 'boiserie';
  frieze: string;
}

/**
 * Façade intérieure d'un mur : 1 m de large × 2.4 m de haut (v = 0 au sol).
 * Lambris peint en bas, papier peint / briques en haut.
 */
export function wallTexture(biome: BiomeId, p: WallPalette): THREE.Texture {
  return cached(`wall:${biome}`, () => {
    const W = 256;
    const H = 614;
    const [c, ctx] = makeCanvas(W, H);
    const m = H / 2.4; // px par mètre
    const yOf = (meters: number) => H - meters * m;
    // partie haute
    const top = yOf(2.4);
    const upperBottom = yOf(1.0);
    ctx.fillStyle = p.upper;
    ctx.fillRect(0, top, W, upperBottom - top);
    const r = rng(41);
    if (p.pattern === 'brick') {
      const bh = 0.075 * m;
      const bw = W / 4;
      let row = 0;
      for (let y = upperBottom; y > top - bh; y -= bh, row++) {
        const off = row % 2 ? bw / 2 : 0;
        for (let x = -bw; x < W + bw; x += bw) {
          const tone = [p.upper, p.upper2, mixHex(p.upper, p.upper2, 0.5), shade(p.upper, 0.08)][Math.floor(r() * 4)];
          ctx.fillStyle = tone;
          ctx.beginPath();
          ctx.roundRect(x + off + 1.2, y - bh + 1.2, bw - 2.4, bh - 2.4, 1.5);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#f3e4dc';
      ctx.fillRect(0, top, W, upperBottom - top);
      ctx.globalCompositeOperation = 'source-over';
    } else if (p.pattern === 'stripes') {
      const sw = W / 6;
      for (let k = 0; k < 6; k++) {
        ctx.fillStyle = k % 2 ? p.upper2 : p.upper;
        ctx.fillRect(k * sw, top, sw, upperBottom - top);
      }
      // brins de feuillage
      ctx.strokeStyle = shade(p.upper2, -0.2);
      ctx.fillStyle = shade(p.upper2, -0.15);
      ctx.lineWidth = 1.2;
      for (let k = 0; k < 6; k++) {
        const cx = (k % 3) * (W / 3) + W / 6 + (k > 2 ? W / 6 : 0);
        const cy = top + (k > 2 ? 0.75 : 0.3) * (upperBottom - top);
        ctx.beginPath();
        ctx.moveTo(cx, cy + 14);
        ctx.quadraticCurveTo(cx + 3, cy, cx, cy - 14);
        ctx.stroke();
        for (let q = -1; q <= 1; q += 2)
          for (let s = 0; s < 3; s++) {
            ctx.beginPath();
            ctx.ellipse(cx + q * 4, cy - 8 + s * 8, 2.4, 5, q * 0.7, 0, Math.PI * 2);
            ctx.fill();
          }
      }
    } else if (p.pattern === 'ashlar') {
      const bh = 0.3 * m;
      let row = 0;
      for (let y = upperBottom; y > top - bh; y -= bh, row++) {
        const off = row % 2 ? W / 4 : 0;
        for (let x = -W / 2; x < W + W / 2; x += W / 2) {
          ctx.fillStyle = mixHex(p.upper, p.upper2, r());
          ctx.fillRect(x + off + 1, y - bh + 1, W / 2 - 2, bh - 2);
        }
      }
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = shade(p.upper, -0.12);
      ctx.fillRect(0, top, W, upperBottom - top);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      // boiserie : grands cadres moulurés dorés sur soie crème
      ctx.fillStyle = p.upper;
      ctx.fillRect(0, top, W, upperBottom - top);
      // damas discret
      ctx.fillStyle = p.upper2;
      for (let k = 0; k < 3; k++) {
        const cy = top + (k + 0.5) * ((upperBottom - top) / 3);
        ctx.save();
        ctx.translate(W / 2, cy);
        ctx.globalAlpha = 0.5;
        for (let q = 0; q < 4; q++) {
          ctx.rotate(Math.PI / 2);
          ctx.beginPath();
          ctx.ellipse(0, -12, 6, 12, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
      }
      const inset = 18;
      ctx.strokeStyle = p.frieze;
      ctx.lineWidth = 4;
      ctx.strokeRect(inset, top + 20, W - inset * 2, upperBottom - top - 40);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(inset + 4, top + 24, W - inset * 2 - 8, upperBottom - top - 48);
    }
    // ombre douce sous la corniche
    const g = ctx.createLinearGradient(0, top, 0, top + 0.35 * m);
    g.addColorStop(0, 'rgba(60,30,30,0.18)');
    g.addColorStop(1, 'rgba(60,30,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, top, W, 0.35 * m);
    // frise
    ctx.fillStyle = p.frieze;
    ctx.fillRect(0, yOf(2.4), W, 0.06 * m);
    // lambris
    const wTop = yOf(0.95);
    ctx.fillStyle = p.wainscot;
    ctx.fillRect(0, wTop, W, H - wTop);
    const px = 22;
    const py0 = yOf(0.85);
    const py1 = yOf(0.2);
    // panneau à cadre biseauté
    ctx.fillStyle = p.panel;
    ctx.fillRect(px, py0, W - px * 2, py1 - py0);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(px, py1);
    ctx.lineTo(px, py0);
    ctx.lineTo(W - px, py0);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(80,50,50,0.25)';
    ctx.beginPath();
    ctx.moveTo(W - px, py0);
    ctx.lineTo(W - px, py1);
    ctx.lineTo(px, py1);
    ctx.stroke();
    ctx.strokeStyle = p.frieze;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px + 9, py0 + 9, W - px * 2 - 18, py1 - py0 - 18);
    grain(ctx, W, H, 6, 12);
    return toTexture(c);
  });
}

/** Parement extérieur (socle, faces extérieures des murs) : 1 m × 1 m. */
export function exteriorTexture(biome: BiomeId): THREE.Texture {
  return cached(`ext:${biome}`, () => {
    const S = 256;
    const [c, ctx] = makeCanvas(S, S);
    const r = rng(77);
    if (biome === 'boudoir') {
      // brique toulousaine
      ctx.fillStyle = '#efd9cf';
      ctx.fillRect(0, 0, S, S);
      const bh = S / 12;
      const bw = S / 4;
      for (let row = 0; row < 12; row++) {
        const off = row % 2 ? bw / 2 : 0;
        for (let x = -bw; x < S + bw; x += bw) {
          ctx.fillStyle = ['#d99a8a', '#e3a898', '#cf8e7e', '#e8b2a2'][Math.floor(r() * 4)];
          ctx.beginPath();
          ctx.roundRect(x + off + 1.5, row * bh + 1.5, bw - 3, bh - 3, 2);
          ctx.fill();
        }
      }
    } else {
      const pal: Record<string, [string, string, string]> = {
        jardin: ['#efe8d8', '#e3dac6', '#d7cdb8'],
        terrasse: ['#f0e6d6', '#e7dac6', '#dccdb6'],
        galerie: ['#f6f2ec', '#ece6dc', '#e2dace'],
      };
      const [a, b, j] = pal[biome];
      ctx.fillStyle = j;
      ctx.fillRect(0, 0, S, S);
      const bh = S / 4;
      for (let row = 0; row < 4; row++) {
        const off = row % 2 ? S / 4 : 0;
        for (let x = -S / 2; x < S + S / 2; x += S / 2) {
          ctx.fillStyle = mixHex(a, b, r());
          ctx.beginPath();
          ctx.roundRect(x + off + 2, row * bh + 2, S / 2 - 4, bh - 4, 3);
          ctx.fill();
        }
      }
    }
    grain(ctx, S, S, 12, 9);
    return toTexture(c);
  });
}

// ─────────────────────────────────────────── Tapis, tableaux, ciel

/** Tapis décoratif (variante 0..3), avec franges transparentes aux extrémités. */
export function rugTexture(variant: number): THREE.Texture {
  const v = ((variant % 4) + 4) % 4;
  return cached(`rug:${v}`, () => {
    const W = 512;
    const H = 512;
    const [c, ctx] = makeCanvas(W, H);
    const fr = 22;
    const pals = [
      { bg: '#7a2e3a', b1: '#d4a537', b2: '#f3e3c8', m: '#5b1f2a', m2: '#e8b4b8' },
      { bg: '#f1d6d3', b1: '#c98b95', b2: '#fbf3e8', m: '#e8b4b8', m2: '#a8b89a' },
      { bg: '#e9e3cf', b1: '#7d9474', b2: '#fbf3e8', m: '#a8b89a', m2: '#d08c60' },
      { bg: '#d9cfe8', b1: '#9f86c0', b2: '#fbf3e8', m: '#c9b6e4', m2: '#e9c46a' },
    ];
    const p = pals[v];
    ctx.clearRect(0, 0, W, H);
    // franges
    ctx.strokeStyle = p.b2;
    ctx.lineWidth = 2;
    for (let x = 6; x < W - 6; x += 6) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 1, fr);
      ctx.moveTo(x, H);
      ctx.lineTo(x + 1, H - fr);
      ctx.stroke();
    }
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, fr, W, H - fr * 2);
    // bordures
    ctx.strokeStyle = p.b1;
    ctx.lineWidth = 14;
    ctx.strokeRect(22, fr + 22, W - 44, H - fr * 2 - 44);
    ctx.strokeStyle = p.b2;
    ctx.lineWidth = 3;
    ctx.strokeRect(38, fr + 38, W - 76, H - fr * 2 - 76);
    // frise de petits motifs
    ctx.fillStyle = p.b2;
    for (let x = 40; x < W - 40; x += 24) {
      ctx.beginPath();
      ctx.arc(x, fr + 22, 3, 0, Math.PI * 2);
      ctx.arc(x, H - fr - 22, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // médaillon central
    const cx = W / 2;
    const cy = H / 2;
    if (v === 2) {
      for (let k = 0; k < 7; k++) {
        ctx.fillStyle = k % 2 ? p.m : p.m2;
        ctx.globalAlpha = k % 2 ? 0.9 : 0.6;
        ctx.fillRect(60, fr + 60 + k * ((H - fr * 2 - 120) / 7), W - 120, (H - fr * 2 - 120) / 14);
      }
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = p.m;
      ctx.beginPath();
      ctx.ellipse(cx, cy, W * 0.28, H * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.m2;
      for (let k = 0; k < 8; k++) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((k * Math.PI) / 4);
        ctx.beginPath();
        ctx.ellipse(0, -H * 0.12, 14, 30, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = p.b1;
      ctx.beginPath();
      ctx.arc(cx, cy, 22, 0, Math.PI * 2);
      ctx.fill();
      // coins
      for (const [qx, qy] of [
        [70, fr + 70],
        [W - 70, fr + 70],
        [70, H - fr - 70],
        [W - 70, H - fr - 70],
      ]) {
        ctx.fillStyle = p.m2;
        ctx.beginPath();
        ctx.arc(qx, qy, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = p.b1;
        ctx.beginPath();
        ctx.arc(qx, qy, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // fibres
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const n = (Math.random() - 0.5) * 18;
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
    return toTexture(c, { repeat: false });
  });
}

/** Tableau encadré (variante 0..3) : nature morte, camée, paysage, botanique. */
export function paintingTexture(variant: number): THREE.Texture {
  const v = ((variant % 4) + 4) % 4;
  return cached(`paint:${v}`, () => {
    const W = 256;
    const H = 320;
    const [c, ctx] = makeCanvas(W, H);
    if (v === 0) {
      // nature morte : vase de pivoines
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#3e3a4a');
      g.addColorStop(1, '#6b5a5a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#c9a24a';
      ctx.beginPath();
      ctx.moveTo(100, 290);
      ctx.quadraticCurveTo(70, 220, 110, 190);
      ctx.lineTo(146, 190);
      ctx.quadraticCurveTo(186, 220, 156, 290);
      ctx.fill();
      const flowers = ['#f2b8c0', '#fbe3e0', '#e88a9a', '#fff1e6', '#f7c8b8'];
      for (let k = 0; k < 9; k++) {
        const a = -Math.PI / 2 + (k - 4) * 0.33;
        const rr = 60 + (k % 3) * 18;
        ctx.fillStyle = '#6f9a5e';
        ctx.beginPath();
        ctx.ellipse(128 + Math.cos(a) * rr * 0.8, 170 + Math.sin(a) * rr * 0.6 + 20, 10, 20, a, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = flowers[k % flowers.length];
        ctx.beginPath();
        ctx.arc(128 + Math.cos(a) * rr, 175 + Math.sin(a) * rr, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.arc(122 + Math.cos(a) * rr, 168 + Math.sin(a) * rr, 9, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (v === 1) {
      // camée : profil de La Duchesse
      ctx.fillStyle = '#e8b4b8';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fbf3e8';
      ctx.beginPath();
      ctx.ellipse(W / 2, H / 2, 92, 122, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c98b95';
      ctx.beginPath();
      ctx.moveTo(150, 250);
      ctx.bezierCurveTo(150, 215, 140, 205, 150, 190);
      ctx.bezierCurveTo(158, 180, 170, 170, 162, 158);
      ctx.lineTo(170, 150);
      ctx.bezierCurveTo(160, 140, 166, 128, 160, 118);
      ctx.bezierCurveTo(150, 70, 90, 70, 86, 120);
      ctx.bezierCurveTo(80, 150, 100, 170, 104, 200);
      ctx.bezierCurveTo(100, 220, 80, 240, 90, 262);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#b07080';
      ctx.beginPath();
      ctx.arc(100, 96, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d4a537';
      for (let k = 0; k < 5; k++) {
        ctx.beginPath();
        ctx.arc(90 + k * 10, 68 - Math.abs(k - 2) * 5, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (v === 2) {
      // paysage pastel : la Garonne et ses arches
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#f7d9c9');
      g.addColorStop(0.55, '#fbe9dc');
      g.addColorStop(0.56, '#a9c4cf');
      g.addColorStop(1, '#8fb0bf');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#e2a99b';
      ctx.fillRect(0, 150, W, 26);
      ctx.fillStyle = '#a9c4cf';
      for (let k = 0; k < 5; k++) {
        ctx.beginPath();
        ctx.ellipse(26 + k * 52, 178, 20, 18, 0, Math.PI, 0);
        ctx.fill();
      }
      ctx.fillStyle = '#d99a8a';
      ctx.fillRect(160, 96, 40, 54);
      ctx.beginPath();
      ctx.moveTo(156, 98);
      ctx.lineTo(180, 66);
      ctx.lineTo(204, 98);
      ctx.fill();
      ctx.fillStyle = '#fff6ee';
      ctx.beginPath();
      ctx.arc(64, 70, 22, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // planche botanique
      ctx.fillStyle = '#f4ecdc';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#4f7a48';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(128, 290);
      ctx.bezierCurveTo(120, 220, 140, 150, 128, 60);
      ctx.stroke();
      ctx.fillStyle = '#7d9474';
      for (let k = 0; k < 8; k++) {
        const y = 270 - k * 26;
        const s = k % 2 ? 1 : -1;
        ctx.beginPath();
        ctx.ellipse(128 + s * 26, y, 26, 10, s * -0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#e8b4b8';
      ctx.beginPath();
      ctx.arc(128, 56, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d48a95';
      ctx.beginPath();
      ctx.arc(128, 56, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    grain(ctx, W, H, 10, v + 50);
    return toTexture(c, { repeat: false });
  });
}

/** Ciel vu par les fenêtres (émissif). */
export function skyTexture(top: string, bottom: string): THREE.Texture {
  return cached(`sky:${top}:${bottom}`, () => {
    const W = 64;
    const H = 128;
    const [c, ctx] = makeCanvas(W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.ellipse(10 + k * 16, 30 + (k % 2) * 22, 14, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // cimes d'arbres au loin
    ctx.fillStyle = 'rgba(126,160,118,0.75)';
    for (let k = 0; k < 6; k++) {
      ctx.beginPath();
      ctx.arc(k * 13, H - 10, 12, 0, Math.PI * 2);
      ctx.fill();
    }
    return toTexture(c, { repeat: false, aniso: false });
  });
}

/** Fond dégradé derrière le diorama (avec halo et bokeh). */
export function backdropTexture(top: string, bottom: string, glowCol: string, bokeh: string): THREE.Texture {
  return cached(`bg:${top}:${bottom}:${glowCol}`, () => {
    const W = 512;
    const H = 512;
    const [c, ctx] = makeCanvas(W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const rg = ctx.createRadialGradient(W / 2, H * 0.5, 10, W / 2, H * 0.5, W * 0.62);
    rg.addColorStop(0, glowCol);
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
    const r = rng(99);
    for (let k = 0; k < 26; k++) {
      const x = r() * W;
      const y = r() * H;
      const rad = 6 + r() * 26;
      const bg = ctx.createRadialGradient(x, y, 0, x, y, rad);
      bg.addColorStop(0, bokeh);
      bg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = 0.25 + r() * 0.35;
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    grain(ctx, W, H, 5, 13);
    const t = toTexture(c, { repeat: false, aniso: false });
    return t;
  });
}

// ─────────────────────────────────────────── Sprites

/** Halo radial doux (blanc), pour lueurs additives. */
export function glowTexture(): THREE.Texture {
  return cached('glow', () => {
    const S = 128;
    const [c, ctx] = makeCanvas(S, S);
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    return toTexture(c, { repeat: false, aniso: false, srgb: false });
  });
}

/** Index des sprites de l'atlas de particules (4 × 4). */
export const SPRITE = {
  dot: 0,
  sparkle: 1,
  petal: 2,
  coin: 3,
  bubble: 4,
  puff: 5,
  confetti: 6,
  star: 7,
  plate: 8,
  fork: 9,
  leaf: 10,
  ring: 11,
  heart: 12,
  drop: 13,
  swirl: 14,
  glint: 15,
} as const;

/** Atlas des particules (512 × 512, cases de 128 px). Les sprites blancs sont teintés par la couleur de la particule. */
export function spriteAtlas(): THREE.Texture {
  return cached('atlas', () => {
    const S = 512;
    const C = 128;
    const [c, ctx] = makeCanvas(S, S);
    const cell = (i: number, draw: () => void) => {
      ctx.save();
      ctx.translate((i % 4) * C + C / 2, Math.floor(i / 4) * C + C / 2);
      draw();
      ctx.restore();
    };
    const radial = (r: number, stops: [number, string][]) => {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      for (const [o, col] of stops) g.addColorStop(o, col);
      return g;
    };
    // 0 point doux
    cell(SPRITE.dot, () => {
      ctx.fillStyle = radial(60, [
        [0, 'rgba(255,255,255,1)'],
        [0.35, 'rgba(255,255,255,0.8)'],
        [1, 'rgba(255,255,255,0)'],
      ]);
      ctx.fillRect(-64, -64, 128, 128);
    });
    // 1 étincelle (étoile à 4 branches)
    cell(SPRITE.sparkle, () => {
      ctx.fillStyle = radial(40, [
        [0, 'rgba(255,255,255,1)'],
        [1, 'rgba(255,255,255,0)'],
      ]);
      ctx.fillRect(-64, -64, 128, 128);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        const r = k % 2 ? 9 : 60;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    });
    // 2 pétale
    cell(SPRITE.petal, () => {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, 46);
      ctx.bezierCurveTo(-46, 10, -30, -46, 0, -34);
      ctx.bezierCurveTo(30, -46, 46, 10, 0, 46);
      ctx.fill();
      ctx.fillStyle = 'rgba(200,170,180,0.45)';
      ctx.beginPath();
      ctx.ellipse(0, 12, 6, 26, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    // 3 pièce d'or
    cell(SPRITE.coin, () => {
      ctx.fillStyle = '#b8862b';
      ctx.beginPath();
      ctx.arc(0, 0, 50, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = radial(46, [
        [0, '#fff3c4'],
        [0.6, '#f0c75a'],
        [1, '#d4a537'],
      ]);
      ctx.beginPath();
      ctx.arc(-3, -3, 44, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#b8862b';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, 32, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#b8862b';
      ctx.font = 'bold 44px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('D', 0, 3);
    });
    // 4 bulle
    cell(SPRITE.bubble, () => {
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, 50, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.ellipse(-20, -22, 12, 7, -0.7, 0, Math.PI * 2);
      ctx.fill();
    });
    // 5 bouffée (mousse, fumée)
    cell(SPRITE.puff, () => {
      for (const [x, y, r] of [
        [-18, 8, 34],
        [16, 10, 32],
        [0, -14, 38],
        [-4, 18, 30],
      ]) {
        ctx.fillStyle = radial(r, [
          [0, 'rgba(255,255,255,0.95)'],
          [0.7, 'rgba(255,255,255,0.6)'],
          [1, 'rgba(255,255,255,0)'],
        ]);
        ctx.save();
        ctx.translate(x, y);
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });
    // 6 confetti
    cell(SPRITE.confetti, () => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(-18, -34, 36, 68);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(4, -34, 14, 68);
    });
    // 7 étoile (étourdi)
    cell(SPRITE.star, () => {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(180,140,60,0.9)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const r = k % 2 ? 22 : 52;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
    // 8 assiette
    cell(SPRITE.plate, () => {
      ctx.fillStyle = '#e9e6e2';
      ctx.beginPath();
      ctx.ellipse(0, 0, 54, 54, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#d4a537';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, 47, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-2, -2, 32, 0, Math.PI * 2);
      ctx.fill();
    });
    // 9 fourchette
    cell(SPRITE.fork, () => {
      ctx.fillStyle = '#e4e7ea';
      ctx.strokeStyle = '#9aa1a8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-6, -10, 12, 62, 6);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(-18, -54, 36, 46, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.globalCompositeOperation = 'destination-out';
      for (const x of [-9, 0, 9]) ctx.fillRect(x - 2, -56, 4, 30);
      ctx.globalCompositeOperation = 'source-over';
    });
    // 10 feuille
    cell(SPRITE.leaf, () => {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -52);
      ctx.quadraticCurveTo(40, -10, 0, 52);
      ctx.quadraticCurveTo(-40, -10, 0, -52);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -46);
      ctx.lineTo(0, 46);
      ctx.stroke();
    });
    // 11 anneau
    cell(SPRITE.ring, () => {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.arc(0, 0, 48, 0, Math.PI * 2);
      ctx.stroke();
    });
    // 12 cœur
    cell(SPRITE.heart, () => {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, 44);
      ctx.bezierCurveTo(-60, 0, -36, -50, 0, -20);
      ctx.bezierCurveTo(36, -50, 60, 0, 0, 44);
      ctx.fill();
    });
    // 13 goutte
    cell(SPRITE.drop, () => {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -50);
      ctx.bezierCurveTo(10, -20, 34, 6, 34, 22);
      ctx.arc(0, 22, 34, 0, Math.PI);
      ctx.bezierCurveTo(-34, 6, -10, -20, 0, -50);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
    });
    // 14 volute
    cell(SPRITE.swirl, () => {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let k = 0; k < 60; k++) {
        const a = k * 0.18;
        const r = 4 + k * 0.8;
        if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.stroke();
    });
    // 15 éclat (croix fine)
    cell(SPRITE.glint, () => {
      ctx.fillStyle = radial(22, [
        [0, 'rgba(255,255,255,1)'],
        [1, 'rgba(255,255,255,0)'],
      ]);
      ctx.fillRect(-64, -64, 128, 128);
      const lg = ctx.createLinearGradient(-62, 0, 62, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0)');
      lg.addColorStop(0.5, 'rgba(255,255,255,1)');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(-62, -3, 124, 6);
      const lg2 = ctx.createLinearGradient(0, -62, 0, 62);
      lg2.addColorStop(0, 'rgba(255,255,255,0)');
      lg2.addColorStop(0.5, 'rgba(255,255,255,1)');
      lg2.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = lg2;
      ctx.fillRect(-3, -62, 6, 124);
    });
    const t = toTexture(c, { repeat: false, aniso: false });
    t.premultiplyAlpha = false;
    return t;
  });
}

/** Texture de lumière volumétrique (faisceau vertical, dégradé). */
export function beamTexture(): THREE.Texture {
  return cached('beam', () => {
    const W = 64;
    const H = 128;
    const [c, ctx] = makeCanvas(W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const h = ctx.createLinearGradient(0, 0, W, 0);
    h.addColorStop(0, 'rgba(0,0,0,1)');
    h.addColorStop(0.5, 'rgba(0,0,0,0)');
    h.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = h;
    ctx.fillRect(0, 0, W, H);
    return toTexture(c, { repeat: false, aniso: false, srgb: false });
  });
}
