/**
 * Géométries procédurales du décor : constructeur de quads à UV « monde », moulures extrudées,
 * feuilles, arcs, profils tournés. Les géométries réutilisables sont mises en cache.
 */
import * as THREE from 'three';
import { lathe } from './kit';

export type V3 = [number, number, number];

/** Constructeur de géométrie indexée (quads / triangles) avec normales plates et UV explicites. */
export class GeoBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  idx: number[] = [];

  get count(): number {
    return this.pos.length / 3;
  }

  /** Quad a-b-c-d (sens trigonométrique vu de face). */
  quad(a: V3, b: V3, c: V3, d: V3, uv: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]]): void {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = d[0] - a[0];
    const vy = d[1] - a[1];
    const vz = d[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const o = this.count;
    for (const [i, p] of [a, b, c, d].entries()) {
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(nx, ny, nz);
      this.uv.push(uv[i][0], uv[i][1]);
    }
    this.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }

  tri(a: V3, b: V3, c: V3, uv: [number, number][] = [[0, 0], [1, 0], [0.5, 1]]): void {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const o = this.count;
    for (const [i, p] of [a, b, c].entries()) {
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(nx, ny, nz);
      this.uv.push(uv[i][0], uv[i][1]);
    }
    this.idx.push(o, o + 1, o + 2);
  }

  /**
   * Boîte alignée avec UV en mètres (u le long de la face, v = hauteur × vScale).
   * `faces` : masque des faces à émettre (+x, −x, +y, −y, +z, −z).
   */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, faces = 0b111111, vScale = 1, uOff = 0): void {
    // +X
    if (faces & 0b100000)
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [
        [-z1 + uOff, y0 * vScale],
        [-z0 + uOff, y0 * vScale],
        [-z0 + uOff, y1 * vScale],
        [-z1 + uOff, y1 * vScale],
      ]);
    // −X
    if (faces & 0b010000)
      this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [
        [z0 + uOff, y0 * vScale],
        [z1 + uOff, y0 * vScale],
        [z1 + uOff, y1 * vScale],
        [z0 + uOff, y1 * vScale],
      ]);
    // +Y
    if (faces & 0b001000)
      this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [
        [x0, -z1],
        [x1, -z1],
        [x1, -z0],
        [x0, -z0],
      ]);
    // −Y
    if (faces & 0b000100)
      this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [
        [x0, z0],
        [x1, z0],
        [x1, z1],
        [x0, z1],
      ]);
    // +Z
    if (faces & 0b000010)
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [
        [x0 + uOff, y0 * vScale],
        [x1 + uOff, y0 * vScale],
        [x1 + uOff, y1 * vScale],
        [x0 + uOff, y1 * vScale],
      ]);
    // −Z
    if (faces & 0b000001)
      this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [
        [-x1 + uOff, y0 * vScale],
        [-x0 + uOff, y0 * vScale],
        [-x0 + uOff, y1 * vScale],
        [-x1 + uOff, y1 * vScale],
      ]);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// ─────────────────────────────────────────── Moulures

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

/**
 * Moulure droite : profil [saillie z, hauteur y] (de bas en haut, saillie ≥ 0) extrudé le long de X sur [0, len].
 * Face arrière à z = 0 (contre le mur). Normales lissées le long du profil, extrémités fermées.
 */
export function molding(profile: readonly [number, number][], len: number): THREE.BufferGeometry {
  const key = `mold:${len.toFixed(3)}:${profile.map((p) => p.join(',')).join(';')}`;
  return cachedGeo(key, () => {
    const pos: number[] = [];
    const nrm: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const n = profile.length;
    // normales par point (moyenne des segments adjacents)
    const segN: [number, number][] = [];
    for (let i = 0; i < n - 1; i++) {
      const dz = profile[i + 1][0] - profile[i][0];
      const dy = profile[i + 1][1] - profile[i][1];
      const l = Math.hypot(dz, dy) || 1;
      segN.push([dy / l, -dz / l]); // (nz, ny) : normale extérieure
    }
    let vlen = 0;
    for (let i = 0; i < n; i++) {
      const a = segN[Math.max(0, i - 1)];
      const b = segN[Math.min(n - 2, i)];
      // arêtes vives si l'angle est fort
      const sharp = a[0] * b[0] + a[1] * b[1] < 0.6;
      const [z, y] = profile[i];
      if (i > 0) vlen += Math.hypot(z - profile[i - 1][0], y - profile[i - 1][1]);
      const emit = (nz: number, ny: number) => {
        const l = Math.hypot(nz, ny) || 1;
        pos.push(0, y, z, len, y, z);
        nrm.push(0, ny / l, nz / l, 0, ny / l, nz / l);
        uv.push(0, vlen, len, vlen);
      };
      if (sharp && i > 0 && i < n - 1) {
        emit(a[0], a[1]);
        emit(b[0], b[1]);
      } else emit(a[0] + b[0], a[1] + b[1]);
    }
    // relie les paires de sommets (en sautant les doublons d'arêtes vives)
    const rows = pos.length / 6;
    let prev = 0;
    for (let r = 1; r < rows; r++) {
      const p0 = pos[prev * 6 + 1];
      const z0 = pos[prev * 6 + 2];
      const p1 = pos[r * 6 + 1];
      const z1 = pos[r * 6 + 2];
      if (p0 === p1 && z0 === z1) {
        prev = r;
        continue;
      }
      const a = prev * 2;
      const b = r * 2;
      idx.push(a, a + 1, b + 1, a, b + 1, b);
      prev = r;
    }
    // extrémités
    const cap = (x: number, plus: boolean) => {
      const o = pos.length / 3;
      const pts: THREE.Vector2[] = [];
      if (profile[0][0] !== 0) pts.push(new THREE.Vector2(0, profile[0][1]));
      for (const [z, y] of profile) pts.push(new THREE.Vector2(z, y));
      if (profile[n - 1][0] !== 0) pts.push(new THREE.Vector2(0, profile[n - 1][1]));
      for (const p of pts) {
        pos.push(x, p.y, p.x);
        nrm.push(plus ? 1 : -1, 0, 0);
        uv.push(p.x, p.y);
      }
      const tris = THREE.ShapeUtils.triangulateShape(pts, []);
      for (const t of tris) {
        const a = pts[t[0]];
        const b = pts[t[1]];
        const c = pts[t[2]];
        // composante x de la normale : (by−ay)(cz−az) − (bz−az)(cy−ay), avec (z, y) = (p.x, p.y)
        const nx = (b.y - a.y) * (c.x - a.x) - (b.x - a.x) * (c.y - a.y);
        if (nx > 0 === plus) idx.push(o + t[0], o + t[1], o + t[2]);
        else idx.push(o + t[0], o + t[2], o + t[1]);
      }
    };
    cap(0, false);
    cap(len, true);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  });
}

/** Profils de moulures courants. */
export const PROFILES = {
  baseboard: [
    [0, 0],
    [0.035, 0],
    [0.035, 0.1],
    [0.025, 0.12],
    [0.012, 0.135],
    [0, 0.14],
  ] as [number, number][],
  chairRail: [
    [0, 0],
    [0.015, 0.0],
    [0.03, 0.015],
    [0.035, 0.035],
    [0.03, 0.055],
    [0.015, 0.065],
    [0, 0.065],
  ] as [number, number][],
  cornice: [
    [0, 0],
    [0.02, 0],
    [0.025, 0.02],
    [0.05, 0.05],
    [0.08, 0.1],
    [0.1, 0.14],
    [0.11, 0.16],
    [0.11, 0.2],
    [0, 0.2],
  ] as [number, number][],
  cap: [
    [0, 0],
    [0.04, 0],
    [0.05, 0.015],
    [0.05, 0.04],
    [0.03, 0.06],
    [0, 0.06],
  ] as [number, number][],
};

// ─────────────────────────────────────────── Profils tournés

/** Balustre (vase) : hauteur ~0.62. */
export function balusterGeo(): THREE.BufferGeometry {
  return lathe(
    [
      [0.0, 0],
      [0.045, 0],
      [0.045, 0.04],
      [0.03, 0.06],
      [0.04, 0.12],
      [0.058, 0.22],
      [0.05, 0.3],
      [0.03, 0.38],
      [0.022, 0.46],
      [0.032, 0.52],
      [0.04, 0.56],
      [0.04, 0.6],
      [0.0, 0.6],
    ],
    8,
    'baluster',
  );
}

/** Fût de colonne cannelé (approximé par un tour à 16 faces) avec base et chapiteau. */
export function columnShaftGeo(h: number): THREE.BufferGeometry {
  return lathe(
    [
      [0, 0],
      [0.26, 0],
      [0.26, 0.08],
      [0.22, 0.12],
      [0.24, 0.16],
      [0.19, 0.22],
      [0.17, 0.3],
      [0.15, h - 0.32],
      [0.17, h - 0.26],
      [0.15, h - 0.22],
      [0.2, h - 0.14],
      [0.26, h - 0.08],
      [0.27, h],
      [0, h],
    ],
    16,
    `column:${h}`,
  );
}

/** Pot de fleurs classique (terre cuite / céramique). */
export function potGeo(r: number, h: number): THREE.BufferGeometry {
  return lathe(
    [
      [0, 0],
      [r * 0.7, 0],
      [r * 0.75, h * 0.08],
      [r * 0.92, h * 0.78],
      [r * 1.06, h * 0.82],
      [r * 1.08, h * 0.98],
      [r * 0.98, h],
      [r * 0.9, h * 0.94],
      [0, h * 0.94],
    ],
    18,
    `pot:${r}:${h}`,
  );
}

/** Urne / vase Médicis. */
export function urnGeo(s: number): THREE.BufferGeometry {
  return lathe(
    [
      [0, 0],
      [0.12 * s, 0],
      [0.12 * s, 0.04 * s],
      [0.05 * s, 0.07 * s],
      [0.05 * s, 0.12 * s],
      [0.16 * s, 0.2 * s],
      [0.2 * s, 0.32 * s],
      [0.16 * s, 0.42 * s],
      [0.2 * s, 0.48 * s],
      [0.18 * s, 0.5 * s],
      [0, 0.48 * s],
    ],
    18,
    `urn:${s}`,
  );
}

// ─────────────────────────────────────────── Végétal

/** Feuille plate allongée (origine à la base, pointe vers +Y), légèrement incurvée. */
export function leafGeo(len: number, wid: number, curl = 0.25): THREE.BufferGeometry {
  return cachedGeo(`leaf:${len}:${wid}:${curl}`, () => {
    const seg = 5;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const w = Math.sin(Math.PI * Math.min(1, t * 1.05)) * wid * 0.5 * (1 - t * 0.25);
      const y = t * len;
      const z = Math.sin(t * Math.PI * 0.5) * curl * len * t;
      pos.push(-w, y, z, 0, y, z - wid * 0.12, w, y, z);
      uv.push(0, t, 0.5, t, 1, t);
    }
    for (let i = 0; i < seg; i++) {
      const a = i * 3;
      const b = (i + 1) * 3;
      idx.push(a, a + 1, b + 1, a, b + 1, b, a + 1, a + 2, b + 2, a + 1, b + 2, b + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });
}

/** Touffe de feuillage « low-poly » douce (icosaèdre déformé). */
export function bushGeo(r: number, seed = 1): THREE.BufferGeometry {
  return cachedGeo(`bush:${r}:${seed}`, () => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const n = 1 + 0.14 * Math.sin(x * 9.1 + seed) * Math.cos(z * 7.3 + seed * 2) + 0.08 * Math.sin(y * 11 + seed);
      p.setXYZ(i, x * n, y * n * 0.92, z * n);
    }
    g.computeVertexNormals();
    return g;
  });
}

/** Fleur simple : corolle de pétales (disque ondulé) + cœur. */
export function flowerGeo(r: number): THREE.BufferGeometry {
  return cachedGeo(`flower:${r}`, () => {
    const g = new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.6);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 + 0.18 * Math.cos(a * 5);
      p.setXYZ(i, x * k, p.getY(i) * 0.75, z * k);
    }
    g.computeVertexNormals();
    return g;
  });
}

// ─────────────────────────────────────────── Formes

/** Arc plein cintre (demi-anneau rectangulaire) d'ouverture `w`, épaisseur radiale `t`, profondeur `d`, centré en x = 0, naissance à y = 0. */
export function archGeo(w: number, t: number, d: number, seg = 16): THREE.BufferGeometry {
  return cachedGeo(`arch:${w}:${t}:${d}:${seg}`, () => {
    const s = new THREE.Shape();
    const r0 = w / 2;
    const r1 = w / 2 + t;
    s.moveTo(r1, 0);
    s.absarc(0, 0, r1, 0, Math.PI, false);
    s.lineTo(-r0, 0);
    s.absarc(0, 0, r0, Math.PI, 0, true);
    s.lineTo(r1, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: seg });
    g.translate(0, 0, -d / 2);
    g.clearGroups();
    return g;
  });
}

/** Panneau plat (plan XY) centré, face +Z. */
export function panelGeo(w: number, h: number): THREE.BufferGeometry {
  return cachedGeo(`panel:${w}:${h}`, () => new THREE.PlaneGeometry(w, h));
}

/** Plan au sol (XZ) centré, face +Y. */
export function groundPlane(w: number, d: number): THREE.BufferGeometry {
  return cachedGeo(`gplane:${w}:${d}`, () => {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    return g;
  });
}

/** Panneau plein cintre (rectangle surmonté d'un demi-disque), plan XY, base à y = 0. */
export function archPanelGeo(w: number, h: number): THREE.BufferGeometry {
  return cachedGeo(`archpanel:${w}:${h}`, () => {
    const s = new THREE.Shape();
    const r = w / 2;
    s.moveTo(-r, 0);
    s.lineTo(r, 0);
    s.lineTo(r, h - r);
    s.absarc(0, h - r, r, 0, Math.PI, false);
    s.lineTo(-r, 0);
    const g = new THREE.ShapeGeometry(s, 16);
    // UV normalisés
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h);
    return g;
  });
}

/** Coque de goutte / cône d'eau etc. : tube ouvert (cylindre sans fonds). */
export function openCylinder(rTop: number, rBot: number, h: number, radial = 20): THREE.BufferGeometry {
  return cachedGeo(`ocyl:${rTop}:${rBot}:${h}:${radial}`, () => {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, radial, 1, true);
    g.translate(0, h / 2, 0);
    return g;
  });
}

/** Anneau plat au sol (XZ). */
export function flatRing(r0: number, r1: number, seg = 48): THREE.BufferGeometry {
  return cachedGeo(`fring:${r0}:${r1}:${seg}`, () => {
    const g = new THREE.RingGeometry(r0, r1, seg);
    g.rotateX(-Math.PI / 2);
    return g;
  });
}

/** Disque plat (XZ), face +Y. */
export function flatDisc(r: number, seg = 32): THREE.BufferGeometry {
  return cachedGeo(`fdisc:${r}:${seg}`, () => {
    const g = new THREE.CircleGeometry(r, seg);
    g.rotateX(-Math.PI / 2);
    return g;
  });
}

/** Octaèdre allongé (pampille de cristal). */
export function crystalGeo(r: number, h: number): THREE.BufferGeometry {
  return cachedGeo(`crystal:${r}:${h}`, () => {
    const g = new THREE.OctahedronGeometry(r, 0);
    g.scale(1, h / r / 2, 1);
    g.computeVertexNormals();
    return g;
  });
}

/** Cône (base à y = 0). */
export function cone(r: number, h: number, radial = 16): THREE.BufferGeometry {
  return cachedGeo(`cone:${r}:${h}:${radial}`, () => {
    const g = new THREE.ConeGeometry(r, h, radial);
    g.translate(0, h / 2, 0);
    return g;
  });
}

/** Boîte simple (non arrondie), centrée. */
export function box(w: number, h: number, d: number): THREE.BufferGeometry {
  return cachedGeo(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
}
