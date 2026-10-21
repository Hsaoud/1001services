/**
 * Labo du moteur de rendu (render-lab.html) : salon de n'importe quel niveau, ambiance forcée,
 * qualité, joueur au clavier (ZQSD / WASD / flèches, Espace = dash, E = interagir), PNJ,
 * effets, télégraphes, états de tables / comptoirs / cloches / Cloche Royale, marée, urgence, vitrine.
 */
import { GameRenderer } from './renderer';
import type { SalonView, View } from './api';
import type {
  BellViewState,
  BiomeId,
  ClocheViewState,
  CounterSpec,
  CounterViewState,
  DecorSpec,
  DishId,
  FxKind,
  NpcKind,
  NpcViewState,
  PedestalSpec,
  PlayerViewState,
  SalonLayout,
  Settings,
  TableMood,
  TableSpec,
  TableViewState,
  Telegraph,
  TelegraphShape,
  TelegraphTone,
  ZoneSpec,
} from '../types';
import { CELL } from '../types';
import { generateSalon } from '../gen';
import { levelPlan } from '../data/progression';
import { levelSeed } from '../core/rng';

// Le labo ignore les rechargements à chaud des dépendances (d'autres modules changent souvent) :
// recharger la page à la main pour voir les modifications (ou ajouter ?live à l'URL).
if (import.meta.hot && !new URLSearchParams(location.search).has('live')) {
  import.meta.hot.accept(['./renderer', '../gen', '../data/progression', '../core/rng', '../types'], () => {});
}

const stage = document.getElementById('stage') as HTMLElement;
const R = new GameRenderer(stage);
(window as unknown as { R: GameRenderer }).R = R;
R.webglRenderer.info.autoReset = false;

// ─────────────────────────────────────────── Panneau

const panel = document.createElement('div');
Object.assign(panel.style, {
  position: 'fixed',
  top: '10px',
  left: '10px',
  width: '268px',
  maxHeight: 'calc(100% - 20px)',
  overflowY: 'auto',
  background: 'rgba(255,250,244,0.9)',
  border: '1px solid #e2c9a0',
  borderRadius: '12px',
  padding: '10px 12px',
  font: '13px/1.35 system-ui, sans-serif',
  color: '#3d2a22',
  boxShadow: '0 6px 24px rgba(90,40,40,0.15)',
  zIndex: '10',
  userSelect: 'none',
} satisfies Partial<CSSStyleDeclaration>);
document.body.appendChild(panel);

const stats = document.createElement('div');
Object.assign(stats.style, {
  position: 'fixed',
  right: '10px',
  top: '10px',
  background: 'rgba(43,34,48,0.72)',
  color: '#fff3dc',
  font: '12px/1.4 ui-monospace, monospace',
  padding: '6px 10px',
  borderRadius: '8px',
  zIndex: '10',
  whiteSpace: 'pre',
} satisfies Partial<CSSStyleDeclaration>);
document.body.appendChild(stats);

function section(title: string): HTMLDivElement {
  const h = document.createElement('div');
  h.textContent = title;
  Object.assign(h.style, { fontWeight: '700', margin: '8px 0 4px', color: '#9b5a3c', letterSpacing: '0.03em' });
  panel.appendChild(h);
  const box = document.createElement('div');
  Object.assign(box.style, { display: 'flex', flexWrap: 'wrap', gap: '4px' });
  panel.appendChild(box);
  return box;
}

function button(parent: HTMLElement, label: string, fn: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  Object.assign(b.style, {
    font: '12px system-ui, sans-serif',
    padding: '3px 7px',
    borderRadius: '7px',
    border: '1px solid #d9b98a',
    background: '#fff6ea',
    color: '#3d2a22',
    cursor: 'pointer',
  } satisfies Partial<CSSStyleDeclaration>);
  b.addEventListener('click', (e) => {
    fn();
    (e.currentTarget as HTMLButtonElement).blur();
  });
  parent.appendChild(b);
  return b;
}

function toggle(parent: HTMLElement, label: string, fn: (on: boolean) => void, init = false): void {
  let on = init;
  const b = button(parent, label, () => {
    on = !on;
    b.style.background = on ? '#f2c97a' : '#fff6ea';
    fn(on);
  });
  b.style.background = on ? '#f2c97a' : '#fff6ea';
}

// ─────────────────────────────────────────── Salon

const general = section('Salon');
const levelRow = document.createElement('div');
levelRow.style.width = '100%';
const levelInput = document.createElement('input');
levelInput.type = 'range';
levelInput.min = '1';
levelInput.max = '100';
levelInput.value = String(Number(new URLSearchParams(location.search).get('level') ?? 1));
levelInput.style.width = '160px';
const levelLabel = document.createElement('span');
levelRow.append('Niveau ', levelInput, levelLabel);
general.appendChild(levelRow);

const biomeSel = document.createElement('select');
for (const b of ['auto', 'boudoir', 'jardin', 'terrasse', 'galerie', 'démo']) {
  const o = document.createElement('option');
  o.value = b;
  o.textContent = b === 'démo' ? 'démo (tous les décors)' : b;
  biomeSel.appendChild(o);
}
const qualSel = document.createElement('select');
for (const q of ['high', 'medium', 'low']) {
  const o = document.createElement('option');
  o.value = q;
  o.textContent = q;
  qualSel.appendChild(o);
}
const selRow = document.createElement('div');
selRow.style.width = '100%';
selRow.append('Ambiance ', biomeSel, ' Qualité ', qualSel);
general.appendChild(selRow);
const demoBiome = document.createElement('select');
for (const b of ['boudoir', 'jardin', 'terrasse', 'galerie']) {
  const o = document.createElement('option');
  o.value = b;
  o.textContent = b;
  demoBiome.appendChild(o);
}
const demoRow = document.createElement('div');
demoRow.style.width = '100%';
demoRow.append('Ambiance démo ', demoBiome);
general.appendChild(demoRow);

let layout: SalonLayout;
let salon: SalonView;
let player: View<PlayerViewState>;
let tableStates: TableViewState[] = [];
let counterStates: CounterViewState[] = [];
let clocheStates: ClocheViewState[] = [];
let bellState: BellViewState = { lit: false, ring: 0, highlight: 0 };
const ps: PlayerViewState = {
  x: 0,
  z: 0,
  heading: 0,
  speed01: 0,
  vx: 0,
  vz: 0,
  turnRate: 0,
  dashing: false,
  dashT: 0,
  phasing: false,
  tray: [],
  capacity: 3,
  balance01: 1,
  hitT: 0,
  stunned: false,
  slipping: false,
  fall01: 0,
  invulnerable: false,
  grace: false,
  bellRing: 0,
};
interface Npc {
  kind: NpcKind;
  view: View<NpcViewState>;
  s: NpcViewState;
  tx: number;
  tz: number;
}
let npcs: Npc[] = [];
let cooking: { t: number; dur: number }[] = [];
let clocheTimers: number[] = [];
let ringT = 0;

/** Mémorise les réglages du labo (survit aux rechargements de page). */
function saveLab(): void {
  try {
    sessionStorage.setItem(
      'duchesse-render-lab',
      JSON.stringify({ level: levelInput.value, biome: biomeSel.value, demo: demoBiome.value, quality: qualSel.value, cam: camLockState() }),
    );
  } catch {
    /* stockage indisponible */
  }
}

function restoreLab(): void {
  try {
    const raw = sessionStorage.getItem('duchesse-render-lab');
    if (!raw) return;
    const st = JSON.parse(raw) as { level?: string; biome?: string; demo?: string; quality?: string; cam?: [number, number, number] | null };
    if (st.level && !new URLSearchParams(location.search).has('level')) levelInput.value = st.level;
    if (st.biome) biomeSel.value = st.biome;
    if (st.demo) demoBiome.value = st.demo;
    if (st.quality) {
      qualSel.value = st.quality;
      R.setQuality(st.quality as Settings['quality']);
    }
    pendingCam = st.cam ?? null;
  } catch {
    /* ignore */
  }
}
let pendingCam: [number, number, number] | null = null;

function load(): void {
  saveLab();
  const n = Number(levelInput.value);
  levelLabel.textContent = ` ${n}`;
  const b = biomeSel.value;
  const t0 = performance.now();
  if (b === 'démo') layout = demoLayout(demoBiome.value as BiomeId);
  else {
    layout = generateSalon(levelPlan(n), levelSeed(n));
    if (b !== 'auto') layout = { ...layout, biome: b as BiomeId };
  }
  const tGen = performance.now() - t0;
  salon = R.buildSalon(layout);
  player = R.createPlayer();
  npcs = [];
  ps.x = layout.playerStart.x;
  ps.z = layout.playerStart.z;
  ps.tray = [];
  R.cameraFollow(ps.x, ps.z, true);
  tableStates = layout.tables.map((t) => ({ mood: 'empty', clients: 0, served: [], chairPush: t.seats.map(() => 0), highlight: 0, vip: t.vip }));
  counterStates = layout.counters.map(() => ({ ready: [], cooking: 0, cookingDish: null, glow: 0, highlight: 0 }));
  cooking = layout.counters.map(() => ({ t: 0, dur: 0 }));
  clocheStates = layout.pedestals.map(() => ({ state: 'hidden', t: 0, golden: false, highlight: 0 }));
  clocheTimers = layout.pedestals.map(() => 0);
  bellState = { lit: false, ring: 0, highlight: 0 };
  telegraphs = [];
  R.setTelegraphs([]);
  genMs = tGen;
  // accès de débogage (console)
  (window as unknown as { labState: unknown }).labState = { layout, tableStates, counterStates, clocheStates, cooking, ps, get bell() { return bellState; } };
}
let genMs = 0;
levelInput.addEventListener('input', () => (levelLabel.textContent = ` ${levelInput.value}`));
levelInput.addEventListener('change', load);
biomeSel.addEventListener('change', load);
demoBiome.addEventListener('change', () => {
  if (biomeSel.value === 'démo') load();
});
qualSel.addEventListener('change', () => {
  R.setQuality(qualSel.value as Settings['quality']);
  saveLab();
});
button(general, '◀', () => {
  levelInput.value = String(Math.max(1, Number(levelInput.value) - 1));
  load();
});
button(general, '▶', () => {
  levelInput.value = String(Math.min(100, Number(levelInput.value) + 1));
  load();
});
button(general, 'Recharger', load);

// ─────────────────────────────────────────── Ambiance

const amb = section('Ambiance & caméra');
let tideOn = false;
let tideR = 0;
let tideT = 0;
toggle(amb, 'Marée', (on) => {
  tideOn = on;
  tideR = 0;
  tideT = 0;
});
let rushOn = false;
toggle(amb, 'Urgence', (on) => (rushOn = on));
toggle(amb, 'Vitrine', (on) => R.setShowcase(on));
let shakeOn = false;
toggle(amb, 'Lustres', (on) => (shakeOn = on));
button(amb, 'Secousse', () => R.shake(0.8));
button(amb, 'Zoom +', () => (R.rig.zoom = Math.max(0.25, R.rig.zoom * 0.7)));
button(amb, 'Zoom −', () => (R.rig.zoom = Math.min(3, R.rig.zoom / 0.7)));
let guideOn = false;
toggle(amb, 'Guidage', (on) => (guideOn = on));

// ─────────────────────────────────────────── PNJ

const npcBox = section('PNJ');
const NPC_KINDS: NpcKind[] = ['waiter', 'chatty', 'cart', 'poodle', 'influencer', 'hungry', 'child', 'polisher', 'bride', 'critic', 'waltz'];
for (const k of NPC_KINDS) button(npcBox, k, () => spawnNpc(k));
button(npcBox, '✕ tous', () => {
  for (const n of npcs) R.removeView(n.view);
  npcs = [];
});

function walkable(x: number, z: number): boolean {
  const i = Math.floor(z) * layout.width + Math.floor(x);
  return x >= 0 && z >= 0 && x < layout.width && z < layout.depth && layout.walk[i] === 1;
}

function randomWalkable(): [number, number] {
  for (let k = 0; k < 200; k++) {
    const x = Math.random() * layout.width;
    const z = Math.random() * layout.depth;
    if (walkable(x, z)) return [Math.floor(x) + 0.5, Math.floor(z) + 0.5];
  }
  return [layout.playerStart.x, layout.playerStart.z];
}

function spawnNpc(kind: NpcKind): void {
  const view = R.createNpc(kind);
  const a = Math.random() * Math.PI * 2;
  let x = ps.x + Math.cos(a) * 2;
  let z = ps.z + Math.sin(a) * 2;
  if (!walkable(x, z)) [x, z] = randomWalkable();
  const [tx, tz] = randomWalkable();
  npcs.push({ kind, view, s: { x, z, heading: 0, speed01: 0, action: 'walk', actionT: 0, fade: 0, aux: 0 }, tx, tz });
}

// ─────────────────────────────────────────── Effets

const fxBox = section('Effets (au joueur)');
const FX: FxKind[] = ['serve', 'coins', 'pickup', 'foam', 'champagne', 'syrup', 'dust', 'crash', 'flash', 'teleport', 'dash', 'petals', 'steam', 'confetti', 'stun', 'ring', 'cloche', 'golden', 'splash'];
for (const k of FX)
  button(fxBox, k, () => {
    const dx = Math.sin(ps.heading);
    const dz = Math.cos(ps.heading);
    R.fx(k, ps.x + (k === 'champagne' || k === 'steam' ? 0 : dx * 0.6), ps.z + (k === 'champagne' || k === 'steam' ? 0 : dz * 0.6), { dirX: dx, dirZ: dz });
  });

// ─────────────────────────────────────────── Télégraphes

const telBox = section('Télégraphes');
interface LabTel {
  t: Telegraph;
  age: number;
  dur: number;
  activeDur: number;
}
let telegraphs: LabTel[] = [];
let telId = 1;
let toneIdx = 0;
const TONES: TelegraphTone[] = ['pink', 'gold', 'cream', 'blue'];
function addTel(shape: TelegraphShape, persistent = false, tone?: TelegraphTone): void {
  const tn = tone ?? TONES[toneIdx++ % TONES.length];
  telegraphs.push({ t: { id: telId++, shape, tone: tn, progress: persistent ? 1 : 0, active: false, persistent }, age: 0, dur: persistent ? 0 : 1.9, activeDur: persistent ? 7 : 1.2 });
}
button(telBox, 'cercle', () => addTel({ type: 'circle', x: ps.x + 2, z: ps.z, r: 1.4 }));
button(telBox, 'anneau', () => addTel({ type: 'ring', x: ps.x, z: ps.z, r0: 1.2, r1: 2.4 }));
button(telBox, 'ligne', () => addTel({ type: 'line', ax: ps.x - 4, az: ps.z + 1.5, bx: ps.x + 4, bz: ps.z + 1.5, width: 0.7 }));
button(telBox, 'cône', () => addTel({ type: 'cone', x: ps.x - 1, z: ps.z - 1, angle: Math.PI * 0.25, spread: 0.45, length: 4 }));
button(telBox, 'croix', () => addTel({ type: 'cross', x: ps.x + 1, z: ps.z + 1, length: 3, width: 0.6 }));
button(telBox, 'flaque sirop', () => addTel({ type: 'circle', x: ps.x + 1.5, z: ps.z - 1, r: 1.1 }, true, 'gold'));
button(telBox, 'traînée cire', () => addTel({ type: 'line', ax: ps.x - 3, az: ps.z - 2, bx: ps.x + 3, bz: ps.z - 2.5, width: 0.8 }, true, 'blue'));
let telFrozen = false;
toggle(telBox, 'Figer', (on) => (telFrozen = on));
button(telBox, 'tous', () => {
  addTel({ type: 'circle', x: ps.x + 2.5, z: ps.z, r: 1.3 }, false, 'pink');
  addTel({ type: 'ring', x: ps.x - 2.5, z: ps.z, r0: 0.8, r1: 1.6 }, false, 'gold');
  addTel({ type: 'line', ax: ps.x - 4, az: ps.z + 2.5, bx: ps.x + 4, bz: ps.z + 2.5, width: 0.6 }, false, 'cream');
  addTel({ type: 'cone', x: ps.x, z: ps.z - 1.5, angle: Math.PI, spread: 0.4, length: 3.5 }, false, 'blue');
  addTel({ type: 'cross', x: ps.x + 3, z: ps.z - 3, length: 2.2, width: 0.5 }, false, 'pink');
});

// ─────────────────────────────────────────── États

const stBox = section('Tables, comptoirs, cloches');
const MOODS: TableMood[] = ['empty', 'seated', 'waiting', 'eating', 'happy', 'angry'];
let moodIdx = 0;
const DISHES: DishId[] = ['croffle', 'latte', 'pancakes', 'tiramisu', 'avotoast', 'brioche', 'mocktail', 'golden'];
button(stBox, 'Humeur ↻', () => {
  moodIdx = (moodIdx + 1) % MOODS.length;
  const m = MOODS[moodIdx];
  layout.tables.forEach((t, i) => {
    const s = tableStates[i];
    s.mood = m;
    s.clients = m === 'empty' ? 0 : t.seats.length;
    if (m === 'empty' || m === 'seated' || m === 'waiting') s.served = [];
  });
  setStatus(`humeur : ${m}`);
});
button(stBox, 'Assiette +', () => {
  layout.tables.forEach((t, i) => {
    const s = tableStates[i];
    if (s.served.length < t.seats.length + 1) s.served = [...s.served, DISHES[(i + s.served.length) % DISHES.length]];
    s.clients = Math.max(s.clients, t.seats.length);
    s.mood = 'eating';
  });
});
button(stBox, 'Chaises', () => {
  for (const s of tableStates) s.chairPush = s.chairPush.map((v, k) => (v > 0.5 ? 0 : k === 0 ? 1 : 0));
});
button(stBox, 'Cuisson', () => {
  cooking.forEach((c) => {
    c.t = 0;
    c.dur = 2.5 + Math.random();
  });
});
button(stBox, 'Prêt +', () => {
  layout.counters.forEach((c, i) => {
    const s = counterStates[i];
    if (s.ready.length < 4) s.ready = [...s.ready, c.dishes[s.ready.length % Math.max(1, c.dishes.length)] ?? 'croffle'];
    s.glow = 1;
  });
});
button(stBox, 'Vider passe', () => {
  for (const s of counterStates) {
    s.ready = [];
    s.glow = 0;
  }
});
button(stBox, 'Cloches ↻', () => {
  clocheStates.forEach((c, i) => {
    const next: Record<ClocheViewState['state'], ClocheViewState['state']> = { hidden: 'appearing', appearing: 'idle', idle: 'opening', opening: 'gone', gone: 'hidden' };
    c.state = next[c.state];
    c.t = 0;
    clocheTimers[i] = 0;
  });
  setStatus(`cloches : ${clocheStates[0]?.state ?? '—'}`);
});
toggle(stBox, 'Dorées', (on) => clocheStates.forEach((c) => (c.golden = on)));
toggle(stBox, 'Cloche Royale', (on) => (bellState.lit = on));
button(stBox, 'Sonner', () => (ringT = 0.0001));

const status = document.createElement('div');
Object.assign(status.style, { marginTop: '8px', color: '#7a5a48', fontSize: '12px' });
panel.appendChild(status);
const help = document.createElement('div');
help.innerHTML = 'ZQSD / WASD / flèches : marcher · Espace : dash · E : prendre / servir';
Object.assign(help.style, { marginTop: '6px', color: '#9b7a68', fontSize: '11px' });
panel.appendChild(help);
function setStatus(s: string): void {
  status.textContent = s;
}

// ─────────────────────────────────────────── Clavier

const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'range') return;
  keys.add(e.code);
  if (e.code === 'Space' && !ps.dashing) {
    ps.dashing = true;
    ps.dashT = 0;
    R.fx('dash', ps.x, ps.z, { dirX: Math.sin(ps.heading), dirZ: Math.cos(ps.heading) });
  }
  if (e.code === 'KeyE') interact();
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

function interact(): void {
  // servir une table proche
  let best = -1;
  let bd = 2.2;
  layout.tables.forEach((t, i) => {
    const d = Math.hypot(t.x - ps.x, t.z - ps.z);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  if (best >= 0 && ps.tray.length > 0) {
    const s = tableStates[best];
    const dish = ps.tray.pop() as DishId;
    s.served = [...s.served, dish];
    s.clients = layout.tables[best].seats.length;
    s.mood = 'happy';
    R.fx('serve', layout.tables[best].x, layout.tables[best].z);
    R.fx('coins', layout.tables[best].x, layout.tables[best].z);
    return;
  }
  // prendre au comptoir
  let ci = -1;
  let cd = 1.8;
  layout.counters.forEach((c, i) => {
    const d = Math.hypot(c.front.x - ps.x, c.front.z - ps.z);
    if (d < cd) {
      cd = d;
      ci = i;
    }
  });
  if (ci >= 0) {
    const s = counterStates[ci];
    const d = s.ready.pop();
    if (d && ps.tray.length < ps.capacity) {
      ps.tray.push(d);
      s.ready = [...s.ready];
      if (s.ready.length === 0) s.glow = 0;
      R.fx('pickup', ps.x, ps.z);
    }
    return;
  }
  // cloche royale
  if (Math.hypot(layout.royalBell.front.x - ps.x, layout.royalBell.front.z - ps.z) < 1.8) {
    ringT = 0.0001;
    ps.bellRing = 0.0001;
  }
}

// ─────────────────────────────────────────── Boucle

let camLock: [number, number] | null = null;
function camLockState(): [number, number, number] | null {
  return camLock ? [camLock[0], camLock[1], R.rig.zoom] : null;
}
/** Outil de capture : fige la caméra sur un point (x, z) avec un zoom ; `look()` sans argument rend la main. */
(window as unknown as { look: (x?: number, z?: number, zoom?: number) => void }).look = (x?: number, z?: number, zoom = 0.45) => {
  if (x === undefined || z === undefined) {
    camLock = null;
    R.rig.zoom = 1;
    saveLab();
    return;
  }
  camLock = [x, z];
  R.rig.zoom = zoom;
  R.cameraFollow(x, z, true);
  saveLab();
};
/** Outil de capture : téléporte le joueur. */
(window as unknown as { tp: (x: number, z: number) => void }).tp = (x: number, z: number) => {
  ps.x = x;
  ps.z = z;
};

let last = performance.now();
let fpsAcc = 0;
let fpsN = 0;
let fps = 0;
let time = 0;

let lastFrameAt = 0;
function loop(now: number): void {
  frame(now);
  requestAnimationFrame(loop);
}
function frame(now: number): void {
  lastFrameAt = performance.now();
  const slow = (window as unknown as { slow?: number }).slow ?? 1;
  const dt = Math.min(0.05, (now - last) / 1000) * slow;
  last = now;
  time += dt;
  fpsAcc += dt;
  fpsN++;
  if (fpsAcc > 0.5) {
    fps = fpsN / fpsAcc;
    fpsAcc = 0;
    fpsN = 0;
  }
  updatePlayer(dt);
  updateNpcs(dt);
  updateStates(dt);
  updateTelegraphs(dt);
  if (tideOn) {
    tideR = Math.min(Math.max(layout.width, layout.depth) * 1.2, tideR + dt * 1.6);
    tideT += dt;
    R.setTide({ active: true, origin: layout.tideOrigin, radius: tideR, t: tideT });
  } else R.setTide(null);
  R.setRush(rushOn || tideOn ? 1 : 0);
  salon.setChandelierShake(shakeOn ? 0.8 : 0);
  if (guideOn) {
    const targets = layout.tables
      .map((t) => ({ x: t.x, z: t.z, d: Math.hypot(t.x - ps.x, t.z - ps.z) }))
      .sort((a, b) => a.d - b.d)
      .slice(1, 4);
    R.setGuide({ x: ps.x, z: ps.z }, targets);
  } else R.setGuide({ x: ps.x, z: ps.z }, []);
  if (camLock) R.cameraFollow(camLock[0], camLock[1]);
  else R.cameraFollow(ps.x, ps.z);
  salon.update(dt, time);
  R.webglRenderer.info.reset();
  R.render(dt, time);
  const info = R.webglRenderer.info;
  const st = R.salonStats;
  stats.textContent =
    `${fps.toFixed(0)} fps   niveau ${layout.level} · ${layout.biome} · ${layout.width}×${layout.depth}\n` +
    `draw ${info.render.calls}   tri ${(info.render.triangles / 1000).toFixed(0)}k\n` +
    `tables ${layout.tables.length}  sièges ${layout.tables.reduce((s, t) => s + t.seats.length, 0)}  décor ${layout.decor.length}\n` +
    (st ? `batch ${st.meshes} meshes · ${(st.vertices / 1000).toFixed(0)}k v · ${st.buildMs.toFixed(0)} ms (+gen ${genMs.toFixed(0)} ms)` : '');
}

let prevHeading = 0;
function updatePlayer(dt: number): void {
  let ix = 0;
  let iz = 0;
  if (keys.has('KeyW') || keys.has('KeyZ') || keys.has('ArrowUp')) {
    ix -= 1;
    iz -= 1;
  }
  if (keys.has('KeyS') || keys.has('ArrowDown')) {
    ix += 1;
    iz += 1;
  }
  if (keys.has('KeyA') || keys.has('KeyQ') || keys.has('ArrowLeft')) {
    ix -= 1;
    iz += 1;
  }
  if (keys.has('KeyD') || keys.has('ArrowRight')) {
    ix += 1;
    iz -= 1;
  }
  const l = Math.hypot(ix, iz);
  const speed = ps.dashing ? 9 : 4.2;
  if (ps.dashing) {
    ps.dashT += dt / 0.25;
    if (ps.dashT >= 1) {
      ps.dashing = false;
      ps.dashT = 0;
    }
  }
  let vx = 0;
  let vz = 0;
  if (l > 0) {
    vx = (ix / l) * speed;
    vz = (iz / l) * speed;
  } else if (ps.dashing) {
    vx = Math.sin(ps.heading) * speed;
    vz = Math.cos(ps.heading) * speed;
  }
  const nx = ps.x + vx * dt;
  const nz = ps.z + vz * dt;
  if (walkable(nx, ps.z)) ps.x = nx;
  if (walkable(ps.x, nz)) ps.z = nz;
  ps.vx = vx;
  ps.vz = vz;
  ps.speed01 = Math.min(1, Math.hypot(vx, vz) / 4.2);
  if (l > 0) {
    const target = Math.atan2(vx, vz);
    let d = target - ps.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    ps.heading += d * Math.min(1, dt * 14);
  }
  ps.turnRate = (ps.heading - prevHeading) / Math.max(dt, 1e-3);
  prevHeading = ps.heading;
  if (ps.bellRing > 0) ps.bellRing = Math.min(1, ps.bellRing + dt * 1.5) % 1;
  player.update(ps, dt);
}

function updateNpcs(dt: number): void {
  for (const n of npcs) {
    const s = n.s;
    s.fade = Math.min(1, s.fade + dt * 2);
    const dx = n.tx - s.x;
    const dz = n.tz - s.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.3) [n.tx, n.tz] = randomWalkable();
    else {
      const sp = n.kind === 'child' ? 3.2 : n.kind === 'waiter' || n.kind === 'cart' ? 2.4 : 1.4;
      const nx = s.x + (dx / d) * sp * dt;
      const nz = s.z + (dz / d) * sp * dt;
      if (walkable(nx, nz)) {
        s.x = nx;
        s.z = nz;
      } else [n.tx, n.tz] = randomWalkable();
      s.heading = Math.atan2(dx, dz);
      s.speed01 = 0.8;
      s.action = n.kind === 'cart' ? 'roll' : n.kind === 'waiter' ? 'slide' : n.kind === 'bride' || n.kind === 'waltz' ? 'dance' : 'walk';
      s.actionT = (s.actionT + dt) % 1;
    }
    n.view.update(s, dt);
  }
}

function updateStates(dt: number): void {
  // surbrillance des éléments à portée
  layout.tables.forEach((t, i) => {
    const s = tableStates[i];
    s.highlight = Math.hypot(t.x - ps.x, t.z - ps.z) < Math.max(t.w, t.d) / 2 + 1.3 ? 1 : 0;
    s.chairPush = s.chairPush.map((v) => v);
    salon.tables[i].update(s, dt);
  });
  layout.counters.forEach((c, i) => {
    const s = counterStates[i];
    s.highlight = Math.hypot(c.front.x - ps.x, c.front.z - ps.z) < 1.4 ? 1 : 0;
    const k = cooking[i];
    if (k.dur > 0) {
      k.t += dt;
      s.cooking = Math.min(1, k.t / k.dur);
      s.cookingDish = c.dishes[0] ?? null;
      if (k.t >= k.dur) {
        k.dur = 0;
        s.cooking = 0;
        s.cookingDish = null;
        if (s.ready.length < 4) s.ready = [...s.ready, c.dishes[s.ready.length % Math.max(1, c.dishes.length)] ?? 'croffle'];
        s.glow = 1;
      }
    }
    salon.counters[i].update(s, dt);
  });
  layout.pedestals.forEach((p, i) => {
    const s = clocheStates[i];
    s.highlight = Math.hypot(p.x - ps.x, p.z - ps.z) < 1.3 ? 1 : 0;
    clocheTimers[i] += dt;
    const dur = s.state === 'appearing' ? 0.7 : s.state === 'opening' ? 0.9 : 1;
    s.t = Math.min(1, clocheTimers[i] / dur);
    if (s.state === 'appearing' && s.t >= 1) {
      s.state = 'idle';
      clocheTimers[i] = 0;
    }
    if (s.state === 'opening' && s.t >= 1) {
      s.state = 'gone';
      clocheTimers[i] = 0;
    }
    salon.cloches[i].update(s, dt);
  });
  bellState.highlight = Math.hypot(layout.royalBell.front.x - ps.x, layout.royalBell.front.z - ps.z) < 1.5 ? 1 : 0;
  if (ringT > 0) {
    ringT += dt / 1.4;
    if (ringT >= 1) ringT = 0;
  }
  bellState.ring = ringT;
  salon.bell.update(bellState, dt);
}

function updateTelegraphs(dt: number): void {
  for (const lt of telegraphs) {
    if (!telFrozen) lt.age += dt;
    if (!lt.t.persistent) {
      lt.t.progress = Math.min(1, lt.age / lt.dur);
      lt.t.active = lt.age >= lt.dur;
    }
  }
  telegraphs = telegraphs.filter((lt) => lt.age < lt.dur + lt.activeDur);
  R.setTelegraphs(telegraphs.map((lt) => lt.t));
}

// ─────────────────────────────────────────── Salon de démonstration (tous les décors)

/** Salon fait main : quatre zones (salon, estrade VIP, jardin d'hiver, terrasse) et tous les types de décor. */
function demoLayout(biome: BiomeId): SalonLayout {
  const W = 24;
  const D = 18;
  const cells = new Uint8Array(W * D).fill(CELL.FLOOR);
  const zoneOf = new Int16Array(W * D).fill(0);
  const set = (x: number, z: number, c: number) => {
    if (x >= 0 && z >= 0 && x < W && z < D) cells[z * W + x] = c;
  };
  const floorMain = biome === 'galerie' ? 'marble' : biome === 'jardin' ? 'checker' : biome === 'terrasse' ? 'terracotta' : 'parquet';
  const zones: ZoneSpec[] = [
    { id: 0, kind: 'salon', rect: { x: 0, z: 0, w: 17, d: 18 }, floor: floorMain, raised: 0, name: 'Le Grand Salon' },
    { id: 1, kind: 'vip', rect: { x: 9, z: 1, w: 7, d: 5 }, floor: 'stage', raised: 0.18, name: "L'Estrade" },
    { id: 2, kind: 'jardin', rect: { x: 17, z: 0, w: 7, d: 10 }, floor: biome === 'boudoir' ? 'tiles_rose' : 'checker', raised: 0, name: "Le Jardin d'Hiver" },
    { id: 3, kind: 'terrasse', rect: { x: 17, z: 10, w: 7, d: 8 }, floor: 'stone', raised: 0, name: 'La Terrasse' },
    { id: 4, kind: 'galerie', rect: { x: 1, z: 13, w: 5, d: 4 }, floor: 'carpet', raised: 0, name: 'Le Coin Velours' },
  ];
  for (const z of zones)
    for (let j = z.rect.z; j < z.rect.z + z.rect.d; j++) for (let i = z.rect.x; i < z.rect.x + z.rect.w; i++) zoneOf[j * W + i] = z.id;
  for (let x = 0; x < W; x++) {
    set(x, 0, x >= 17 ? CELL.GLASS : CELL.WALL);
    set(x, D - 1, x >= 17 ? CELL.RAIL : CELL.WALL);
  }
  for (let z = 0; z < D; z++) {
    set(0, z, CELL.WALL);
    set(W - 1, z, z < 10 ? CELL.GLASS : CELL.RAIL);
    if (!((z >= 3 && z <= 5) || (z >= 12 && z <= 14))) set(16, z, CELL.WALL);
  }
  for (let x = 17; x < W - 1; x++) if (x !== 19 && x !== 20) set(x, 10, CELL.RAIL);
  const tables: TableSpec[] = [];
  const round = (x: number, z: number, n: number, vip = false, zone = 0, w = 1.1): void => {
    const seats = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.PI / 4;
      const sx = x + Math.sin(a) * 0.88;
      const sz = z + Math.cos(a) * 0.88;
      seats.push({ x: sx, z: sz, angle: Math.atan2(x - sx, z - sz) });
    }
    tables.push({ id: tables.length, x, z, shape: 'round', w, d: w, rot: 0, seats, vip, zone, serviceSpots: [{ x, z: z + 1.4 }] });
  };
  const rect = (x: number, z: number, w: number, d: number, zone = 0, shape: 'rect' | 'square' = 'rect'): void => {
    const seats = [];
    if (w >= d) {
      for (const sx of w > 1.2 ? [-0.45, 0.45] : [0]) {
        seats.push({ x: x + sx, z: z - d / 2 - 0.42, angle: 0 });
        seats.push({ x: x + sx, z: z + d / 2 + 0.42, angle: Math.PI });
      }
    } else {
      seats.push({ x: x - w / 2 - 0.42, z, angle: Math.PI / 2 });
      seats.push({ x: x + w / 2 + 0.42, z, angle: -Math.PI / 2 });
    }
    tables.push({ id: tables.length, x, z, shape, w, d, rot: 0, seats, vip: false, zone, serviceSpots: [{ x, z: z + 1.4 }] });
  };
  round(5, 5.5, 4);
  round(12, 9.5, 3, false, 0, 1.0);
  rect(5.5, 10.5, 0.9, 0.9, 0, 'square');
  rect(11.5, 13.5, 1.8, 0.9);
  round(11, 3.3, 4, true, 1, 1.2);
  round(14.2, 3.3, 3, true, 1, 1.0);
  round(18.6, 2.4, 3, false, 2, 1.0);
  rect(21.8, 2.6, 0.9, 0.9, 2, 'square');
  round(18.8, 13.6, 3, false, 3);
  rect(21.6, 15.2, 1.8, 0.9, 3);
  const counter = (id: number, x: number, z: number, w: number, d: number, rot: 0 | 1 | 2 | 3, station: CounterSpec['station'], dishes: DishId[], island = false): CounterSpec => {
    const fx = rot === 1 ? x + w / 2 + 0.7 : rot === 3 ? x - w / 2 - 0.7 : x;
    const fz = rot === 0 ? z + d / 2 + 0.7 : rot === 2 ? z - d / 2 - 0.7 : z;
    return { id, x, z, w, d, rot, station, dishes, front: { x: fx, z: fz }, island };
  };
  const counters: CounterSpec[] = [
    counter(0, 3, 1.45, 2, 0.9, 0, 'croffle', ['croffle']),
    counter(1, 1.45, 6.5, 0.9, 2, 1, 'brioche', ['pancakes', 'brioche']),
    counter(2, 1.45, 9.5, 0.9, 2, 1, 'tiramisu', ['tiramisu']),
    counter(3, 6.5, 1.45, 2, 0.9, 0, 'sale', ['avotoast']),
    counter(4, 8.5, 7.5, 2.6, 1.2, 0, 'bar', ['latte', 'mocktail'], true),
  ];
  const pedestals: PedestalSpec[] = [
    { id: 0, x: 7.5, z: 12.5 },
    { id: 1, x: 14.5, z: 7.2 },
    { id: 2, x: 20, z: 8.6 },
  ];
  const decor: DecorSpec[] = [
    { kind: 'arch', x: 16.5, z: 4.5, rot: Math.PI / 2, w: 3 },
    { kind: 'arch', x: 16.5, z: 13.5, rot: Math.PI / 2, w: 3 },
    { kind: 'column', x: 8.6, z: 5.6, rot: 0 },
    { kind: 'chandelier', x: 5, z: 5.5, rot: 0 },
    { kind: 'chandelier', x: 12.6, z: 3.3, rot: 0, scale: 1.25 },
    { kind: 'chandelier', x: 12, z: 11.5, rot: 0 },
    { kind: 'rug', x: 5, z: 5.5, rot: 0, w: 3.2, d: 3.2, variant: 0 },
    { kind: 'rug', x: 11.5, z: 13.5, rot: 0, w: 3.4, d: 2.6, variant: 1 },
    { kind: 'banquette', x: 10.5, z: 16.5, rot: Math.PI, w: 2.6, d: 0.6 },
    { kind: 'piano', x: 2.4, z: 15.2, rot: Math.PI / 2, w: 1.6, d: 1.7 },
    { kind: 'mirror', x: 0.5, z: 3.5, rot: Math.PI / 2, wall: true },
    { kind: 'painting', x: 0.5, z: 12.5, rot: Math.PI / 2, wall: true, variant: 0 },
    { kind: 'painting', x: 9.5, z: 0.5, rot: 0, wall: true, variant: 1 },
    { kind: 'lamp', x: 0.5, z: 11, rot: Math.PI / 2, wall: true },
    { kind: 'lamp', x: 14.8, z: 16.2, rot: 0 },
    { kind: 'cake_display', x: 6.6, z: 16.2, rot: Math.PI, w: 0.9, d: 0.6 },
    { kind: 'bookshelf', x: 12.6, z: 1.25, rot: 0, w: 1.6, d: 0.45 },
    { kind: 'trellis', x: 19.5, z: 0.5, rot: 0, wall: true },
    { kind: 'trellis', x: 22.4, z: 6.5, rot: -Math.PI / 2, wall: false, w: 1.2 },
    { kind: 'lantern', x: 23.5, z: 12.5, rot: -Math.PI / 2, wall: true },
    { kind: 'lantern', x: 17.6, z: 16.4, rot: 0, variant: 1 },
    { kind: 'lantern', x: 22.3, z: 11.4, rot: 0, variant: 0 },
    { kind: 'statue', x: 8.8, z: 16.2, rot: Math.PI, variant: 0 },
    { kind: 'statue', x: 15.3, z: 10.2, rot: -Math.PI / 2, variant: 1 },
    { kind: 'stage_steps', x: 12, z: 6, rot: 0, w: 2, d: 0.45 },
    { kind: 'plant', x: 1.5, z: 3.4, rot: 0, variant: 0 },
    { kind: 'plant', x: 15.4, z: 16.3, rot: 0, variant: 2 },
    { kind: 'plant', x: 8.2, z: 1.4, rot: 0, variant: 1 },
    { kind: 'plant', x: 4.3, z: 12.3, rot: 0, variant: 3 },
    { kind: 'bigplant', x: 17.7, z: 8.6, rot: 0, variant: 0 },
    { kind: 'bigplant', x: 22.2, z: 8.6, rot: 0, variant: 1 },
    { kind: 'flowers', x: 4.6, z: 16.2, rot: 0, variant: 0 },
    { kind: 'flowers', x: 20.2, z: 16.4, rot: 0, variant: 1, w: 1.2 },
    { kind: 'flowers', x: 15.3, z: 1.5, rot: 0, variant: 2 },
    { kind: 'olive', x: 22.3, z: 16.3, rot: 0 },
    { kind: 'olive', x: 17.8, z: 11.3, rot: 0 },
    { kind: 'parasol', x: 18.8, z: 13.6, rot: 0.3 },
    { kind: 'parasol', x: 21.6, z: 15.2, rot: 1, scale: 1.25 },
    { kind: 'fountain', x: 20.2, z: 5.4, rot: 0, w: 2.6 },
  ];
  const walk = new Uint8Array(W * D);
  for (let i = 0; i < W * D; i++) walk[i] = cells[i] === CELL.FLOOR ? 1 : 0;
  set(7, D - 1, CELL.WALL);
  return {
    level: 0,
    seed: 4242,
    biome,
    width: W,
    depth: D,
    cells,
    zoneOf,
    zones,
    tables,
    counters,
    pedestals,
    decor,
    colliders: [],
    royalBell: { x: 9.6, z: 15.9, front: { x: 9.6, z: 14.8 } },
    entrance: { x: 7.5, z: D - 0.5, rot: 2 },
    playerStart: { x: 7.5, z: 14.5 },
    tideOrigin: { x: 8.5, z: 7.5 },
    lanes: [],
    spawnPoints: [{ x: 7.5, z: 15 }],
    walk,
  };
}

restoreLab();
load();
const pc = pendingCam as [number, number, number] | null;
if (pc) (window as unknown as { look: (x?: number, z?: number, zoom?: number) => void }).look(pc[0], pc[1], pc[2]);
requestAnimationFrame(loop);
// onglet non composé (volet partagé en arrière-plan) : rAF suspendu → on entretient la boucle par minuterie
setInterval(() => {
  if (performance.now() - lastFrameAt > 120) frame(performance.now());
}, 33);

// Outil de capture : un script mémorisé (sessionStorage « duchesse-lab-script ») est rejoué après chaque
// chargement, ce qui rend les mises en scène robustes aux rechargements du serveur de développement.
(window as unknown as { btn: (label: string) => void }).btn = (label: string) => {
  [...document.querySelectorAll('button')].find((b) => b.textContent === label)?.click();
};
try {
  const code = sessionStorage.getItem('duchesse-lab-script');
  if (code) setTimeout(() => void new Function(`return (async () => { ${code} })()`)(), 400);
} catch {
  /* ignore */
}
