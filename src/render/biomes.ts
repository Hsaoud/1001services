/**
 * Les quatre ambiances de La Duchesse : lumière, fond, palette d'accents, murs et étalonnage.
 */
import type { BiomeId } from '../types';
import type { WallPalette } from './textures';

export interface GradeParams {
  /** Balance des blancs : > 0 = plus chaud. */
  warmth: number;
  saturation: number;
  contrast: number;
  lift: [number, number, number];
  gain: [number, number, number];
  vignette: number;
}

export interface BiomeStyle {
  id: BiomeId;
  backdrop: { top: string; bottom: string; glow: string; bokeh: string };
  hemi: { sky: string; ground: string; intensity: number };
  sun: { color: string; intensity: number; dir: [number, number, number] };
  fill: { color: string; intensity: number; dir: [number, number, number] };
  env: number;
  exposure: number;
  bloom: { strength: number; threshold: number; radius: number };
  grade: GradeParams;
  wall: WallPalette;
  /** Moulures, plinthes et corniches. */
  trim: string;
  /** Dessus des murs coupés (poché du diorama). */
  cap: string;
  /** Socle du diorama : bandeau inférieur. */
  plinthLow: string;
  /** Métal des accents (or / laiton). */
  metal: string;
  accent: string;
  accent2: string;
  velvet: string;
  wood: string;
  cloth: string;
  marbleTop: string;
  foliage: string[];
  flowers: string[];
  pot: string;
  windowSky: [string, string];
  curtain: string;
  /** Couleur des montants de la verrière. */
  mullion: string;
  /** Lumière d'ambiance des lustres (couleur des ampoules). */
  bulb: string;
}

export const BIOMES: Record<BiomeId, BiomeStyle> = {
  boudoir: {
    id: 'boudoir',
    backdrop: { top: '#f6d6cf', bottom: '#f9ece4', glow: 'rgba(255,240,226,0.85)', bokeh: 'rgba(255,214,200,1)' },
    hemi: { sky: '#fff1e6', ground: '#d9a9a0', intensity: 0.62 },
    sun: { color: '#ffd8a8', intensity: 2.5, dir: [-0.45, 1, 0.62] },
    fill: { color: '#f3c6d0', intensity: 0.35, dir: [0.7, 0.5, -0.3] },
    env: 0.24,
    exposure: 1.0,
    bloom: { strength: 0.45, threshold: 1.25, radius: 0.5 },
    grade: { warmth: 0.6, saturation: 1.04, contrast: 1.03, lift: [0.018, 0.008, 0.012], gain: [1.02, 0.99, 0.98], vignette: 0.22 },
    wall: { wainscot: '#f0d6d0', panel: '#f5e1dc', upper: '#e6aa9b', upper2: '#d9978a', pattern: 'brick', frieze: '#d4a537' },
    trim: '#fbf1ea',
    cap: '#e2b0a6',
    plinthLow: '#b4707a',
    metal: '#d4a537',
    accent: '#e8b4b8',
    accent2: '#d48a95',
    velvet: '#c96f86',
    wood: '#8a5a44',
    cloth: '#fbf3ec',
    marbleTop: '#f7ebe8',
    foliage: ['#6f9a5e', '#7da86a', '#5d8a52'],
    flowers: ['#f2b8c0', '#fbe3e0', '#e88a9a', '#fff1e6'],
    pot: '#f3e6dc',
    windowSky: ['#ffd9c2', '#fff4e6'],
    curtain: '#d98d9c',
    mullion: '#5f7a5a',
    bulb: '#ffe0a8',
  },
  jardin: {
    id: 'jardin',
    backdrop: { top: '#cfe6d6', bottom: '#f4f1e2', glow: 'rgba(255,255,240,0.9)', bokeh: 'rgba(230,246,214,1)' },
    hemi: { sky: '#f4fff2', ground: '#a9bf98', intensity: 0.7 },
    sun: { color: '#fff6e2', intensity: 2.6, dir: [-0.35, 1, 0.55] },
    fill: { color: '#d8f0ff', intensity: 0.35, dir: [0.7, 0.6, -0.3] },
    env: 0.26,
    exposure: 1.02,
    bloom: { strength: 0.4, threshold: 1.3, radius: 0.5 },
    grade: { warmth: 0.15, saturation: 1.06, contrast: 1.02, lift: [0.01, 0.016, 0.01], gain: [1.0, 1.01, 0.99], vignette: 0.18 },
    wall: { wainscot: '#b9c8ab', panel: '#c6d3b9', upper: '#f4efe0', upper2: '#e6ecd8', pattern: 'stripes', frieze: '#c9a24a' },
    trim: '#fbf7ec',
    cap: '#cdd8bf',
    plinthLow: '#6f8a66',
    metal: '#c9a24a',
    accent: '#a8b89a',
    accent2: '#e8b4b8',
    velvet: '#7d9474',
    wood: '#9a7454',
    cloth: '#fbf9f0',
    marbleTop: '#f2f4ec',
    foliage: ['#5f9356', '#76a865', '#4f7a48', '#8ab874'],
    flowers: ['#f6c6d0', '#fff6e8', '#f0a7b8', '#c9b6e4', '#ffe1a8'],
    pot: '#e9e2d0',
    windowSky: ['#cfe8f5', '#f2fbf2'],
    curtain: '#a8b89a',
    mullion: '#3f5e45',
    bulb: '#fff0c8',
  },
  terrasse: {
    id: 'terrasse',
    backdrop: { top: '#bfdcf0', bottom: '#fbe8d6', glow: 'rgba(255,246,226,0.9)', bokeh: 'rgba(255,236,206,1)' },
    hemi: { sky: '#e3f1ff', ground: '#d9c3a8', intensity: 0.6 },
    sun: { color: '#ffe6bc', intensity: 2.9, dir: [-0.5, 1, 0.48] },
    fill: { color: '#cdb8ec', intensity: 0.35, dir: [0.7, 0.5, -0.4] },
    env: 0.24,
    exposure: 1.0,
    bloom: { strength: 0.4, threshold: 1.35, radius: 0.5 },
    grade: { warmth: 0.45, saturation: 1.07, contrast: 1.05, lift: [0.012, 0.01, 0.02], gain: [1.02, 1.0, 0.98], vignette: 0.2 },
    wall: { wainscot: '#e4d6c0', panel: '#ece1ce', upper: '#f3ebdd', upper2: '#e9dfcd', pattern: 'ashlar', frieze: '#c9b6e4' },
    trim: '#fbf6ee',
    cap: '#e6d8c2',
    plinthLow: '#9f86c0',
    metal: '#c9a24a',
    accent: '#c9b6e4',
    accent2: '#d08c60',
    velvet: '#9f86c0',
    wood: '#a07a58',
    cloth: '#fdf8f0',
    marbleTop: '#f4efe8',
    foliage: ['#7c9a5a', '#8fae66', '#6b8a50', '#a3b88a'],
    flowers: ['#c9b6e4', '#f6c6d0', '#fff3e0', '#9f86c0', '#f3b37a'],
    pot: '#d08c60',
    windowSky: ['#a9d4f0', '#f6efe2'],
    curtain: '#c9b6e4',
    mullion: '#4c5d4a',
    bulb: '#ffe2a0',
  },
  galerie: {
    id: 'galerie',
    backdrop: { top: '#5b2a39', bottom: '#b9767f', glow: 'rgba(255,214,190,0.55)', bokeh: 'rgba(255,214,150,1)' },
    hemi: { sky: '#fff3e6', ground: '#9a6f6a', intensity: 0.55 },
    sun: { color: '#ffe2bc', intensity: 2.3, dir: [-0.4, 1, 0.6] },
    fill: { color: '#ffd0c0', intensity: 0.3, dir: [0.7, 0.5, -0.3] },
    env: 0.32,
    exposure: 1.0,
    bloom: { strength: 0.55, threshold: 1.15, radius: 0.55 },
    grade: { warmth: 0.5, saturation: 1.05, contrast: 1.06, lift: [0.015, 0.006, 0.012], gain: [1.03, 1.0, 0.97], vignette: 0.28 },
    wall: { wainscot: '#f3efe8', panel: '#faf7f2', upper: '#f6eee2', upper2: '#ead9bf', pattern: 'boiserie', frieze: '#d4a537' },
    trim: '#fffaf2',
    cap: '#e7ddd0',
    plinthLow: '#5b1f2a',
    metal: '#d4a537',
    accent: '#7a2e3a',
    accent2: '#d4a537',
    velvet: '#7a2e3a',
    wood: '#6b4a3a',
    cloth: '#fffaf2',
    marbleTop: '#f6f3ee',
    foliage: ['#5d8a52', '#6f9a5e', '#4f7a48'],
    flowers: ['#fbe3e0', '#ffffff', '#e8b4b8', '#7a2e3a', '#f2d48a'],
    pot: '#f6f3ee',
    windowSky: ['#ffcfb0', '#fff1e0'],
    curtain: '#7a2e3a',
    mullion: '#4c3a2e',
    bulb: '#ffd89a',
  },
};

export function biomeStyle(id: BiomeId): BiomeStyle {
  return BIOMES[id] ?? BIOMES.boudoir;
}
