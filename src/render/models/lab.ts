/**
 * Labo des modèles (models-lab.html) : vitrine autonome des plats (et de leurs icônes), du Maître d'Hôtel,
 * de tous les PNJ (cycle d'actions) et des clients attablés, avec commandes pour tester chaque état.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { DishId, NpcAction, NpcKind, NpcViewState, PlayerViewState, TableMood } from '../../types';
import type { View } from '../api';
import { angleDelta, ceramic, chamferCylinder, gold, matte, mesh, PALETTE } from '../kit';
import { createDishMesh } from './dishes';
import { makeDishIcon } from './icons';
import { createPlayerView } from './player';
import { createNpcView } from './npcs';
import { createSeatedClient, type SeatedClient } from './clients';
import { TAU } from './common';

const angleWrap = (a: number): number => angleDelta(0, a);

// les erreurs HMR des autres modules (développés en parallèle) ne doivent pas masquer le labo
new MutationObserver(() => document.querySelectorAll('vite-error-overlay').forEach((e) => e.remove())).observe(document.body, { childList: true });

const DISH_IDS: DishId[] =['croffle', 'brioche', 'pancakes', 'tiramisu', 'avotoast', 'mocktail', 'latte', 'golden'];

// ─────────────────────────────────────────── Scène

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // comme le GameRenderer
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f3e2de');
scene.add(new THREE.HemisphereLight('#fff1e6', '#d9a9a0', 1.1));
const fill = new THREE.DirectionalLight('#f3c6d0', 0.5);
fill.position.set(8, 6, -6);
scene.add(fill);
const sun = new THREE.DirectionalLight('#ffd8a8', 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -14;
sun.shadow.camera.right = 14;
sun.shadow.camera.top = 14;
sun.shadow.camera.bottom = -14;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);
scene.add(sun.target);

// sol en carreaux de ciment poudrés
{
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#f7e9e3';
  c.fillRect(0, 0, 128, 128);
  c.fillStyle = '#efd7d0';
  c.fillRect(0, 0, 64, 64);
  c.fillRect(64, 64, 64, 64);
  c.strokeStyle = '#e6c9c1';
  c.lineWidth = 2;
  c.strokeRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(30, 30);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
}

// ─────────────────────────────────────────── Caméra iso (orbite légère)

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
const cam = { yaw: Math.PI / 4, elev: Math.PI / 4, viewH: 5, target: new THREE.Vector3(0, 0.5, 0), goal: new THREE.Vector3(0, 0.5, 0) };

function placeCamera(): void {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  const aspect = w / h;
  camera.left = (-cam.viewH * aspect) / 2;
  camera.right = (cam.viewH * aspect) / 2;
  camera.top = cam.viewH / 2;
  camera.bottom = -cam.viewH / 2;
  camera.updateProjectionMatrix();
  const d = 40;
  camera.position.set(
    cam.target.x + Math.sin(cam.yaw) * Math.cos(cam.elev) * d,
    cam.target.y + Math.sin(cam.elev) * d,
    cam.target.z + Math.cos(cam.yaw) * Math.cos(cam.elev) * d,
  );
  camera.lookAt(cam.target);
  sun.position.copy(cam.target).add(new THREE.Vector3(-5, 12, 7));
  sun.target.position.copy(cam.target);
}

function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  placeCamera();
}
window.addEventListener('resize', resize);

let drag: { x: number; y: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  cam.yaw -= (e.clientX - drag.x) * 0.006;
  cam.elev = Math.min(1.45, Math.max(0.15, cam.elev + (e.clientY - drag.y) * 0.004));
  drag = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', () => (drag = null));
canvas.addEventListener(
  'wheel',
  (e) => {
    cam.viewH = Math.min(30, Math.max(1.2, cam.viewH * Math.exp(e.deltaY * 0.001)));
    e.preventDefault();
  },
  { passive: false },
);

// ─────────────────────────────────────────── Zones

const AREAS: Record<string, { pos: THREE.Vector3; h: number }> = {
  joueur: { pos: new THREE.Vector3(0, 0.6, 0), h: 4.5 },
  plats: { pos: new THREE.Vector3(0, 0.15, -4), h: 2.4 },
  pnj: { pos: new THREE.Vector3(9, 0.5, 0.5), h: 9 },
  clients: { pos: new THREE.Vector3(-7, 0.5, 0), h: 5 },
  tout: { pos: new THREE.Vector3(1, 0.3, 0), h: 15 },
};
let follow = false;
/** Ralenti (paramètre d'URL `slow`) pour inspecter les animations rapides. */
let timeScale = 1;
let simTime = 0;
let freezeAt = Infinity;
/** Fige la simulation après `sec` secondes (captures d'écran d'instants précis). */
function freezeIn(sec: number): void {
  timeScale = 1;
  freezeAt = simTime + sec;
}
function focus(name: string): void {
  follow = name === 'joueur';
  const a = AREAS[name];
  cam.goal.copy(a.pos);
  cam.viewH = a.h;
}

// ─────────────────────────────────────────── Plats

DISH_IDS.forEach((id, i) => {
  const x = (i - (DISH_IDS.length - 1) / 2) * 0.55;
  const ped = mesh(chamferCylinder(0.17, 0.19, 0.04, 0.012), ceramic(PALETTE.cream), x, 0, -4);
  scene.add(ped);
  const d = createDishMesh(id);
  d.position.set(x, 0.04, -4);
  scene.add(d);
});

// ─────────────────────────────────────────── Joueur

const player = createPlayerView();
scene.add(player.root);
const ps: PlayerViewState = {
  x: 0,
  z: 0,
  heading: Math.PI / 4,
  speed01: 0,
  vx: 0,
  vz: 0,
  turnRate: 0,
  dashing: false,
  dashT: 0,
  phasing: false,
  tray: ['croffle', 'latte'],
  capacity: 4,
  balance01: 1,
  hitT: 0,
  stunned: false,
  slipping: false,
  fall01: 0,
  invulnerable: false,
  grace: false,
  bellRing: 0,
};
const pctl = { mode: 'stop' as 'stop' | 'circle' | 'keys', circleT: 0, dashTime: -1, fallTime: -1, bellTime: -1 };
const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase());
  if (e.key === ' ') {
    startDash();
    e.preventDefault();
  }
  if (e.key >= '1' && e.key <= '5') focus(['joueur', 'plats', 'pnj', 'clients', 'tout'][Number(e.key) - 1]);
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

function startDash(): void {
  if (pctl.dashTime < 0) pctl.dashTime = 0;
}

let prevHeading = ps.heading;
function updatePlayerSim(dt: number): void {
  const DASH = 0.28;
  let ix = 0;
  let iz = 0;
  if (pctl.mode === 'keys') {
    // repère écran → monde (caméra iso)
    const up = (keys.has('z') || keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    const right = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('q') || keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    const fwdX = -Math.sin(cam.yaw);
    const fwdZ = -Math.cos(cam.yaw);
    ix = fwdX * up + Math.cos(cam.yaw) * right;
    iz = fwdZ * up - Math.sin(cam.yaw) * right;
    const l = Math.hypot(ix, iz);
    if (l > 0) {
      ix /= l;
      iz /= l;
    }
  } else if (pctl.mode === 'circle') {
    pctl.circleT += dt * 0.9;
    ix = -Math.sin(pctl.circleT);
    iz = Math.cos(pctl.circleT);
  }
  const maxV = 3.4;
  let tvx = ix * maxV;
  let tvz = iz * maxV;
  if (pctl.dashTime >= 0) {
    pctl.dashTime += dt;
    ps.dashing = pctl.dashTime < DASH;
    ps.dashT = Math.min(1, pctl.dashTime / DASH);
    if (ps.dashing) {
      tvx = Math.sin(ps.heading) * 10;
      tvz = Math.cos(ps.heading) * 10;
    }
    if (pctl.dashTime > DASH + 0.15) pctl.dashTime = -1;
  } else {
    ps.dashing = false;
    ps.dashT = 0;
  }
  const k = 1 - Math.exp(-(ps.dashing ? 30 : 9) * dt);
  ps.vx += (tvx - ps.vx) * k;
  ps.vz += (tvz - ps.vz) * k;
  ps.x += ps.vx * dt;
  ps.z += ps.vz * dt;
  if (pctl.mode === 'circle') {
    const r = Math.hypot(ps.x, ps.z);
    if (r > 2.2) {
      ps.x *= 2.2 / r;
      ps.z *= 2.2 / r;
    }
  }
  if (pctl.mode === 'stop' && !ps.dashing) {
    ps.x *= 1 - Math.min(1, dt * 1.5);
    ps.z *= 1 - Math.min(1, dt * 1.5);
  }
  const sp = Math.hypot(ps.vx, ps.vz);
  ps.speed01 = Math.min(1, sp / maxV);
  if (sp > 0.2) ps.heading = Math.atan2(ps.vx, ps.vz);
  ps.turnRate = dt > 0 ? angleWrap(ps.heading - prevHeading) / dt : 0;
  prevHeading = ps.heading;
  ps.hitT = Math.max(0, ps.hitT - dt * 1.6);
  if (pctl.fallTime >= 0) {
    pctl.fallTime += dt;
    ps.fall01 = Math.min(1, pctl.fallTime / 1.0);
    if (pctl.fallTime > 1.6) {
      pctl.fallTime = -1;
      ps.fall01 = 0;
    }
  }
  if (pctl.bellTime >= 0) {
    pctl.bellTime += dt;
    ps.bellRing = Math.min(1, pctl.bellTime / 0.9);
    if (pctl.bellTime > 0.9) {
      pctl.bellTime = -1;
      ps.bellRing = 0;
    }
  }
}

// ─────────────────────────────────────────── PNJ

const NPC_ACTIONS: Record<NpcKind, NpcAction[]> = {
  waiter: ['slide', 'idle', 'walk', 'stunned', 'calmed', 'leave'],
  chatty: ['sit', 'push', 'idle', 'stunned', 'calmed', 'leave'],
  cart: ['roll', 'idle', 'stunned', 'calmed', 'leave'],
  poodle: ['walk', 'idle', 'crouch', 'leap', 'stunned', 'calmed', 'leave'],
  influencer: ['walk', 'idle', 'aim', 'flash', 'stunned', 'calmed', 'leave'],
  hungry: ['walk', 'idle', 'sit', 'stunned', 'calmed', 'leave'],
  child: ['walk', 'idle', 'stunned', 'calmed', 'leave'],
  polisher: ['roll', 'walk', 'idle', 'stunned', 'calmed', 'leave'],
  bride: ['dance', 'walk', 'idle', 'stunned', 'calmed', 'leave'],
  critic: ['walk', 'idle', 'stunned', 'calmed', 'leave'],
  waltz: ['dance', 'walk', 'idle', 'stunned', 'calmed', 'leave'],
};
const LOCO: NpcAction[] = ['walk', 'slide', 'roll', 'dance', 'leap'];

interface LabNpc {
  kind: NpcKind;
  view: View<NpcViewState>;
  st: NpcViewState;
  base: THREE.Vector2;
  idx: number;
  t: number;
  fadeT: number;
}
const npcs: LabNpc[] = [];
const npcCtl = { forced: '' as NpcAction | '', hold: false, spin: false, cycle: 2.6 };
const KINDS: NpcKind[] = ['waiter', 'chatty', 'cart', 'poodle', 'influencer', 'hungry', 'child', 'polisher', 'bride', 'critic', 'waltz'];
KINDS.forEach((kind, i) => {
  const col = i % 4;
  const row = Math.floor(i / 4);
  const n = kind === 'bride' ? 4 : kind === 'hungry' ? 3 : 1;
  for (let j = 0; j < n; j++) {
    const view = createNpcView(kind);
    scene.add(view.root);
    const bx = 5 + col * 2.6 + (kind === 'hungry' ? (j - 1) * 0.7 : 0);
    const bz = -2.5 + row * 2.8 + (kind === 'bride' ? j * 0.55 : 0) + (kind === 'hungry' ? Math.abs(j - 1) * 0.5 : 0);
    npcs.push({
      kind,
      view,
      st: { x: bx, z: bz, heading: Math.PI / 4, speed01: 0, action: 'idle', actionT: 0, fade: 1, aux: kind === 'bride' ? j : kind === 'chatty' ? 0 : undefined },
      base: new THREE.Vector2(bx, bz),
      idx: 0,
      t: 0,
      fadeT: -1,
    });
  }
});

function updateNpcs(dt: number, time: number): void {
  for (const n of npcs) {
    const acts = NPC_ACTIONS[n.kind];
    if (!npcCtl.hold) n.t += dt;
    if (n.t > npcCtl.cycle) {
      n.t = 0;
      n.idx = (n.idx + 1) % acts.length;
    }
    let action = npcCtl.forced || acts[n.idx];
    if (!acts.includes(action as NpcAction)) action = acts[n.idx];
    n.st.action = action as NpcAction;
    n.st.actionT = Math.min(1, n.t / npcCtl.cycle);
    n.st.speed01 = LOCO.includes(n.st.action) ? 1 : 0;
    n.st.heading = npcCtl.spin ? Math.PI / 4 + time * 0.8 : n.kind === 'bride' ? Math.PI : Math.PI / 4;
    if (n.kind === 'chatty') n.st.aux = n.st.action === 'push' ? Math.min(1, n.st.actionT * 2.5) : 0;
    // fondu : bouton de test, ou départ / calme
    let fade = 1;
    if (n.fadeT >= 0) {
      n.fadeT += dt;
      fade = n.fadeT < 0.7 ? 1 - n.fadeT / 0.7 : n.fadeT < 1.0 ? 0 : Math.min(1, (n.fadeT - 1.0) / 0.5);
      if (n.fadeT > 1.6) n.fadeT = -1;
    } else if (n.st.action === 'leave' || n.st.action === 'calmed') {
      fade = n.st.actionT < 0.6 ? 1 : 1 - (n.st.actionT - 0.6) / 0.4;
    } else if (n.t < 0.35 && !npcCtl.hold && (acts[(n.idx + acts.length - 1) % acts.length] === 'leave' || acts[(n.idx + acts.length - 1) % acts.length] === 'calmed')) {
      fade = n.t / 0.35;
    }
    n.st.fade = Math.max(0, Math.min(1, fade));
    n.st.x = n.base.x;
    n.st.z = n.base.y;
    n.view.update(n.st, dt);
  }
}

// ─────────────────────────────────────────── Clients attablés

interface LabTable {
  clients: SeatedClient[];
}
const tables: LabTable[] = [];
const clientCtl = { mood: 'seated' as TableMood, push: 0, present: true, perSeatMoods: false };
[
  { x: -8.2, z: -0.6, vip: false, seed: 11 },
  { x: -5.8, z: 0.6, vip: true, seed: 47 },
  { x: -8.2, z: 1.9, vip: false, seed: 93 },
].forEach(({ x, z, vip, seed }, ti) => {
  const top = new THREE.Group();
  top.position.set(x, 0, z);
  scene.add(top);
  top.add(mesh(chamferCylinder(0.06, 0.1, 0.52, 0.01), gold(PALETTE.brass), 0, 0, 0));
  top.add(mesh(chamferCylinder(0.24, 0.26, 0.03, 0.01), gold(PALETTE.brass), 0, 0, 0));
  top.add(mesh(chamferCylinder(0.48, 0.48, 0.035, 0.012, 40), ceramic(vip ? PALETTE.blush : PALETTE.marble), 0, 0.52, 0));
  top.add(mesh(chamferCylinder(0.5, 0.5, 0.012, 0.004, 40), matte(vip ? PALETTE.bordeaux : PALETTE.rose), 0, 0.515, 0));
  const d = createDishMesh(DISH_IDS[ti * 2]);
  d.position.set(0.15, 0.555, 0.1);
  top.add(d);
  const t: LabTable = { clients: [] };
  const n = ti === 2 ? 2 : 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (ti === 2 ? Math.PI / 2 : Math.PI / 4);
    const c = createSeatedClient(seed + i * 7, vip);
    // le client regarde le centre de la table (+Z local)
    c.root.position.set(Math.sin(a) * 0.78, 0, Math.cos(a) * 0.78);
    c.root.rotation.y = a + Math.PI;
    top.add(c.root);
    t.clients.push(c);
  }
  tables.push(t);
});

const MOODS: TableMood[] = ['empty', 'seated', 'waiting', 'eating', 'happy', 'angry'];
function updateClients(dt: number, time: number): void {
  tables.forEach((t, ti) => {
    t.clients.forEach((c, i) => {
      const mood = clientCtl.perSeatMoods ? MOODS[(i + ti * 2 + 1) % MOODS.length] : clientCtl.mood;
      c.setPresent(clientCtl.present && mood !== 'empty');
      c.update(dt, { mood, push: i === 0 ? clientCtl.push : 0, time });
    });
  });
}

// ─────────────────────────────────────────── Interface

const ui = document.getElementById('ui')!;
function h3(t: string): void {
  const e = document.createElement('h3');
  e.textContent = t;
  ui.appendChild(e);
}
function row(): HTMLDivElement {
  const d = document.createElement('div');
  ui.appendChild(d);
  return d;
}
function btn(parent: HTMLElement, label: string, on: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = on;
  parent.appendChild(b);
  return b;
}
function toggle(parent: HTMLElement, label: string, get: () => boolean, set: (v: boolean) => void): void {
  const b = btn(parent, label, () => {
    set(!get());
    b.classList.toggle('on', get());
  });
  b.classList.toggle('on', get());
}
function slider(parent: HTMLElement, label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void): void {
  const l = document.createElement('label');
  l.textContent = label;
  const i = document.createElement('input');
  i.type = 'range';
  i.min = String(min);
  i.max = String(max);
  i.step = String(step);
  i.value = String(get());
  i.oninput = () => set(Number(i.value));
  l.appendChild(i);
  parent.appendChild(l);
}
function radio<T extends string>(parent: HTMLElement, options: readonly T[], get: () => T, set: (v: T) => void): void {
  const bs: HTMLButtonElement[] = [];
  for (const o of options) {
    const b = btn(parent, o, () => {
      set(o);
      bs.forEach((x, k) => x.classList.toggle('on', options[k] === get()));
    });
    b.classList.toggle('on', o === get());
    bs.push(b);
  }
}

h3('Vues');
{
  const pm = new THREE.PMREMGenerator(renderer);
  const envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.5;
  const r0 = row();
  toggle(r0, 'carte d’environnement', () => scene.environment !== null, (v) => {
    scene.environment = v ? envTex : null;
    scene.environmentIntensity = 0.5;
  });
  const r = row();
  for (const k of Object.keys(AREAS)) btn(r, k, () => focus(k));
  btn(r, 'échelle jeu (15)', () => (cam.viewH = 15));
  btn(r, 'iso', () => {
    cam.yaw = Math.PI / 4;
    cam.elev = Math.PI / 4;
  });
}

h3('Joueur');
{
  const r = row();
  radio(r, ['stop', 'circle', 'keys'] as const, () => pctl.mode, (v) => (pctl.mode = v));
  const r2 = row();
  btn(r2, 'Pas Chassé', startDash);
  btn(r2, 'Choc', () => (ps.hitT = 1));
  btn(r2, 'Chute', () => (pctl.fallTime = 0));
  btn(r2, 'Cloche', () => (pctl.bellTime = 0));
  const r3 = row();
  toggle(r3, 'étourdi', () => ps.stunned, (v) => (ps.stunned = v));
  toggle(r3, 'glisse', () => ps.slipping, (v) => (ps.slipping = v));
  toggle(r3, 'passe-partout', () => ps.phasing, (v) => (ps.phasing = v));
  toggle(r3, 'invulnérable', () => ps.invulnerable, (v) => (ps.invulnerable = v));
  toggle(r3, 'grâce', () => ps.grace, (v) => (ps.grace = v));
  slider(row(), 'équilibre', 0, 1, 0.01, () => ps.balance01, (v) => (ps.balance01 = v));
  slider(row(), 'capacité', 1, 6, 1, () => ps.capacity, (v) => (ps.capacity = v));
  const r4 = row();
  for (const id of DISH_IDS) btn(r4, `+${id}`, () => (ps.tray = ps.tray.length < 6 ? [...ps.tray, id] : ps.tray));
  const r5 = row();
  btn(r5, 'retirer 1er', () => (ps.tray = ps.tray.slice(1)));
  btn(r5, 'retirer dernier', () => (ps.tray = ps.tray.slice(0, -1)));
  btn(r5, 'vider', () => (ps.tray = []));
  btn(r5, 'remplir', () => (ps.tray = DISH_IDS.slice(0, ps.capacity)));
}

h3('PNJ');
{
  const r = row();
  toggle(r, 'figer', () => npcCtl.hold, (v) => (npcCtl.hold = v));
  toggle(r, 'tourner', () => npcCtl.spin, (v) => (npcCtl.spin = v));
  btn(r, 'fondu', () => npcs.forEach((n) => (n.fadeT = 0)));
  slider(row(), 'cycle (s)', 1, 6, 0.1, () => npcCtl.cycle, (v) => (npcCtl.cycle = v));
  const r2 = row();
  const all: (NpcAction | '')[] = ['', 'idle', 'walk', 'slide', 'roll', 'sit', 'push', 'aim', 'flash', 'crouch', 'leap', 'stunned', 'dance', 'leave', 'calmed'];
  radio(r2, all.map((a) => a || 'auto'), () => npcCtl.forced || 'auto', (v) => (npcCtl.forced = v === 'auto' ? '' : (v as NpcAction)));
}

h3('Clients attablés');
{
  const r = row();
  radio(r, MOODS, () => clientCtl.mood, (v) => (clientCtl.mood = v));
  const r2 = row();
  toggle(r2, 'présents', () => clientCtl.present, (v) => (clientCtl.present = v));
  toggle(r2, 'humeurs variées', () => clientCtl.perSeatMoods, (v) => (clientCtl.perSeatMoods = v));
  slider(row(), 'recul chaise', 0, 1, 0.01, () => clientCtl.push, (v) => (clientCtl.push = v));
}

// icônes générées depuis les modèles
{
  const strip = document.getElementById('icons')!;
  for (const id of DISH_IDS) {
    const fig = document.createElement('figure');
    const img = document.createElement('img');
    img.src = makeDishIcon(renderer, id, 96);
    img.alt = id;
    const cap = document.createElement('figcaption');
    cap.textContent = id;
    fig.append(img, cap);
    strip.appendChild(fig);
  }
}

// ─────────────────────────────────────────── Boucle

resize();
focus('joueur');
// conserve la vue entre les rechargements (HMR)
try {
  const saved = JSON.parse(sessionStorage.getItem('lab:cam') ?? 'null') as { x: number; y: number; z: number; h: number; yaw: number; elev: number } | null;
  if (saved) {
    cam.goal.set(saved.x, saved.y, saved.z);
    cam.viewH = saved.h;
    cam.yaw = saved.yaw;
    cam.elev = saved.elev;
  }
} catch {
  /* stockage indisponible */
}
setInterval(() => {
  try {
    sessionStorage.setItem('lab:cam', JSON.stringify({ x: cam.goal.x, y: cam.goal.y, z: cam.goal.z, h: cam.viewH, yaw: cam.yaw, elev: cam.elev }));
  } catch {
    /* stockage indisponible */
  }
}, 500);
cam.target.copy(cam.goal);
const timer = new THREE.Timer();
let time = 0;
function frame(): void {
  timer.update();
  let dt = Math.min(0.05, timer.getDelta()) * timeScale;
  if (simTime + dt >= freezeAt) {
    dt = Math.max(0, freezeAt - simTime);
    timeScale = 0;
    freezeAt = Infinity;
  }
  simTime += dt;
  time += dt;
  cam.target.lerp(cam.goal, 1 - Math.exp(-6 * dt));
  placeCamera();
  updatePlayerSim(dt);
  if (follow) cam.goal.set(ps.x, 0.6, ps.z);
  player.update(ps, dt);
  updateNpcs(dt, time);
  updateClients(dt, time);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// panneau repliable (touche H)
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'h') ui.style.display = ui.style.display === 'none' ? '' : 'none';
});

/** Cadre la caméra sur le premier PNJ d'une espèce. */
function look(kind: NpcKind, h = 2.2): void {
  const n = npcs.find((x) => x.kind === kind);
  if (!n) return;
  follow = false;
  cam.goal.set(n.base.x, 0.55, n.base.y);
  cam.viewH = h;
}

// paramètres d'URL (#look=poodle&h=1.4&act=leap&ui=0…) : vue reproductible, survit aux rechargements
function applyHash(): void {
  const q = new URLSearchParams(location.hash.slice(1));
  if (![...q.keys()].length) return;
  const num = (k: string, d: number): number => (q.has(k) ? Number(q.get(k)) : d);
  if (q.get('area')) focus(q.get('area')!);
  if (q.get('look')) look(q.get('look') as NpcKind, num('h', 2.2));
  if (q.has('h')) cam.viewH = num('h', cam.viewH);
  cam.goal.x += num('dx', 0);
  cam.goal.z += num('dz', 0);
  if (q.has('y')) cam.goal.y = num('y', cam.goal.y);
  cam.yaw = num('yaw', cam.yaw);
  cam.elev = num('elev', cam.elev);
  cam.target.copy(cam.goal);
  if (q.has('act')) npcCtl.forced = q.get('act') as NpcAction;
  if (q.get('hold') === '1') npcCtl.hold = true;
  if (q.has('at')) npcs.forEach((n) => (n.t = num('at', 0.5)));
  if (q.get('ui') === '0') ui.style.display = 'none';
  if (q.has('mood')) clientCtl.mood = q.get('mood') as TableMood;
  if (q.has('push')) clientCtl.push = num('push', 0);
  if (q.get('varied') === '1') clientCtl.perSeatMoods = true;
  if (q.has('slow')) timeScale = num('slow', 1);
  if (q.get('dash') === '1') startDash();
  if (q.get('hit') === '1') ps.hitT = 1;
  if (q.get('fall') === '1') pctl.fallTime = 0;
  if (q.get('bell') === '1') pctl.bellTime = 0;
  if (q.has('pmode')) pctl.mode = q.get('pmode') as typeof pctl.mode;
  if (q.has('bal')) ps.balance01 = num('bal', 1);
  if (q.has('cap')) ps.capacity = num('cap', 4);
  if (q.has('tray')) ps.tray = (q.get('tray') || '').split(',').filter(Boolean) as DishId[];
  for (const fl of (q.get('flags') || '').split(',')) {
    if (fl === 'stunned' || fl === 'slipping' || fl === 'phasing' || fl === 'invulnerable' || fl === 'grace') ps[fl] = true;
  }
}
applyHash();
window.addEventListener('hashchange', applyHash);

// accès console pour le débogage
Object.assign(window as unknown as Record<string, unknown>, { lab: { scene, renderer, camera, ps, pctl, npcs, cam, focus, look, clientCtl, npcCtl, ui, startDash, freezeIn, setSlow: (v: number) => (timeScale = v) } });
