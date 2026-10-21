/**
 * Chaises de salon (bistrot cannée, médaillon Louis XVI capitonné, VIP dorée) — origine au sol au centre
 * de l'assise, dossier côté −Z, assise ≈ 0,32. Partagées par les clients attablés et le client bavard.
 * Version « légère » (lowPoly) pour les ~130 chaises d'un grand salon : ~300 triangles.
 */
import * as THREE from 'three';
import { PALETTE, chamferCylinder, cylinder, matte, mesh, roundedBox, torus, velvet } from '../kit';
import { SATIN_GOLD, ball, flatTorus, limb, pick, satin } from './common';

export type ChairStyle = 'bistro' | 'medallion' | 'vip';

export interface ChairLook {
  style: ChairStyle;
  frame: string;
  fabric: string;
}

const BISTRO_FRAMES = ['#2f2730', '#efe3d3', '#7d9474', '#7a2e3a'];
const MEDALLION_FRAMES = ['#f6efe4', '#efe3d3', '#e9dccb'];
const FABRICS = [PALETTE.rose, PALETTE.sage, PALETTE.lavender, '#e9b9a4', PALETTE.powder, '#b8cfe0'];

/** Apparence de chaise déterminée par une graine (et le statut VIP). */
export function chairLook(r1: number, r2: number, vip: boolean): ChairLook {
  if (vip) return { style: 'vip', frame: SATIN_GOLD, fabric: PALETTE.bordeaux };
  return r1 < 0.5
    ? { style: 'bistro', frame: pick(BISTRO_FRAMES, r2), fabric: '#e6cf9e' }
    : { style: 'medallion', frame: pick(MEDALLION_FRAMES, r2), fabric: pick(FABRICS, (r2 * 7.31) % 1) };
}

export const SEAT_TOP = 0.34;

/** Barreau / pied : capsule (détaillé) ou prisme ouvert à 5 pans (léger). */
function rod(r: number, len: number, lp: boolean): THREE.BufferGeometry {
  if (!lp) return limb(r, len, 6);
  const g = cylinder(r, r, len, 5);
  return g;
}

export function buildChair(look: ChairLook, lp = false): THREE.Group {
  const g = new THREE.Group();
  g.name = 'chair';
  const rad = lp ? 12 : 24;
  if (look.style === 'bistro') {
    const fm = matte(look.frame);
    // assise cannée
    g.add(mesh(chamferCylinder(0.19, 0.18, 0.035, 0.012, rad), matte(look.fabric), 0, 0.3, 0));
    g.add(mesh(flatTorus(0.185, 0.012, lp ? 3 : 5, lp ? 10 : rad), fm, 0, 0.318, 0));
    if (!lp) g.add(mesh(flatTorus(0.12, 0.004, 4, 20), matte('#c9ae7a'), 0, 0.336, 0));
    // pieds légèrement évasés + anneau
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const l = lp ? mesh(rod(0.015, 0.3, true), fm, Math.sin(a) * 0.13, 0.0, Math.cos(a) * 0.13) : mesh(rod(0.015, 0.28, false), fm, Math.sin(a) * 0.13, 0.3, Math.cos(a) * 0.13);
      l.rotation.set(Math.cos(a) * (lp ? -0.12 : 0.12), 0, -Math.sin(a) * (lp ? -0.12 : 0.12));
      g.add(l);
    }
    g.add(mesh(flatTorus(0.15, 0.009, lp ? 3 : 5, lp ? 8 : rad), fm, 0, 0.11, 0));
    // dossier courbé (bois cintré)
    for (const sd of [1, -1]) {
      const u = lp ? mesh(rod(0.014, 0.33, true), fm, sd * 0.13, 0.31, -0.17) : mesh(rod(0.014, 0.36, false), fm, sd * 0.13, 0.66, -0.17);
      u.rotation.z = sd * (lp ? -0.08 : 0.08);
      g.add(u);
    }
    g.add(mesh(torus(0.15, 0.014, lp ? 3 : 6, lp ? 8 : 20, Math.PI), fm, 0, 0.62, -0.18));
    if (!lp) g.add(mesh(torus(0.09, 0.01, 5, 16, Math.PI), fm, 0, 0.53, -0.18));
  } else {
    const gold = look.style === 'vip';
    const fm = gold ? satin(SATIN_GOLD) : matte(look.frame);
    const fab = velvet(look.fabric);
    // coussin capitonné
    g.add(mesh(roundedBox(0.4, 0.07, 0.38, 0.03, lp ? 1 : 2), fab, 0, 0.31, 0.0));
    g.add(mesh(lp ? new THREE.BoxGeometry(0.42, 0.04, 0.4) : roundedBox(0.42, 0.04, 0.4, 0.015), fm, 0, 0.27, 0.0));
    if (!lp) {
      for (const [x, z] of [
        [-0.08, -0.06],
        [0.08, -0.06],
        [0, 0.07],
      ])
        g.add(mesh(ball(0.008, 6, 4), satin(SATIN_GOLD), x, 0.346, z));
    }
    // pieds fuselés
    for (const [x, z] of [
      [0.17, 0.16],
      [-0.17, 0.16],
      [0.17, -0.16],
      [-0.17, -0.16],
    ]) {
      g.add(mesh(lp ? cylinder(0.02, 0.013, 0.26, 5) : chamferCylinder(0.02, 0.013, 0.26, 0.004, 8), fm, x, 0.0, z));
      if (!lp) g.add(mesh(ball(0.016, 6, 4), satin(SATIN_GOLD), x, 0.012, z));
    }
    // dossier médaillon
    const med = new THREE.Group();
    med.position.set(0, 0.64, -0.19);
    med.rotation.x = -0.12;
    const ring = mesh(torus(0.15, 0.016, lp ? 3 : 6, lp ? 12 : 28), fm);
    ring.scale.set(1, 1.22, 1);
    med.add(ring);
    const pad = mesh(lp ? cylinder(0.14, 0.14, 0.04, 12) : chamferCylinder(0.14, 0.14, 0.04, 0.015, 24), fab, 0, 0, -0.02);
    pad.rotation.x = Math.PI / 2;
    pad.scale.set(1, 1, 1.2);
    med.add(pad);
    if (gold) {
      med.add(mesh(ball(0.03, lp ? 6 : 10, lp ? 4 : 8), fm, 0, 0.2, 0));
      med.add(mesh(ball(0.016, lp ? 5 : 8, lp ? 3 : 6), velvet(PALETTE.rose), 0, 0.24, 0));
    } else {
      med.add(mesh(ball(0.02, lp ? 5 : 8, lp ? 3 : 6), fm, 0, 0.19, 0));
    }
    g.add(med);
    for (const sd of [1, -1]) {
      const s = lp ? mesh(rod(0.014, 0.2, true), fm, sd * 0.12, 0.32, -0.18) : mesh(rod(0.014, 0.2, false), fm, sd * 0.12, 0.52, -0.18);
      s.rotation.z = sd * (lp ? -0.25 : 0.25);
      g.add(s);
    }
  }
  return g;
}
