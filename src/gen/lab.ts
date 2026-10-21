/**
 * Labo 2D des salons (gen-lab.html) : vue de dessus du générateur, pour vérifier formes, mobilier et accès.
 * Niveau 1..100, graine libre, couches activables (grille de marche, collisions, couloirs, décor…).
 */
import { levelSeed } from '../core/rng';
import { levelPlan } from '../data/progression';
import type { DecorKind, FloorStyle, SalonLayout } from '../types';
import { CELL } from '../types';
import { generateSalon, layoutToAscii, validateLayout } from './index';

const FLOOR_COLORS: Record<FloorStyle, string> = {
  parquet: '#c99a5e',
  tiles_rose: '#e7b7bd',
  carpet: '#9a4255',
  marble: '#e6e2da',
  stone: '#cfc5b0',
  terracotta: '#c4704f',
  checker: '#bcd3b6',
  stage: '#a9773f',
};

const DECOR_STYLE: Partial<Record<DecorKind, [string, string]>> = {
  plant: ['#3f8f4e', 'p'],
  bigplant: ['#2f7a3d', 'P'],
  flowers: ['#e06c9a', 'f'],
  olive: ['#7d8f3a', 'o'],
  parasol: ['#f0d9a0', ''],
  fountain: ['#6fb7d6', 'F'],
  arch: ['#d8b4e2', ''],
  column: ['#f2ede4', ''],
  chandelier: ['#ffd76a', ''],
  rug: ['#8a2f45', ''],
  banquette: ['#b0465f', ''],
  piano: ['#222', 'π'],
  mirror: ['#e9d27a', 'M'],
  painting: ['#d08b5b', 'T'],
  lamp: ['#ffe6a0', 'L'],
  cake_display: ['#f5c6d6', 'G'],
  bookshelf: ['#6b4a2e', 'B'],
  trellis: ['#7fbf7f', '#'],
  lantern: ['#ffb347', 'l'],
  statue: ['#d9d4cc', 'S'],
  stage_steps: ['#7a5230', ''],
  door: ['#5a3a22', 'D'],
};

const params = new URLSearchParams(location.search);
const state = {
  level: Number(params.get('level') ?? 1),
  variant: 0,
  seed: 0,
  customSeed: false,
  walk: false,
  colliders: true,
  lanes: true,
  decor: true,
  spots: true,
  ascii: false,
};

let layout: SalonLayout;
let genMs = 0;
let errors: string[] = [];

const side = document.getElementById('side')!;
const canvas = document.getElementById('cv') as HTMLCanvasElement;
const g = canvas.getContext('2d')!;

function regenerate(): void {
  if (!state.customSeed) state.seed = levelSeed(state.level, state.variant);
  const plan = levelPlan(state.level);
  const t0 = performance.now();
  layout = generateSalon(plan, state.seed);
  genMs = performance.now() - t0;
  errors = validateLayout(layout, plan);
  renderSide();
  draw();
}

function renderSide(): void {
  const plan = levelPlan(state.level);
  const L = layout;
  const vip = L.tables.filter((t) => t.vip).length;
  side.innerHTML = `
    <h1>Labo des salons</h1>
    <label>Niveau <b>${state.level}</b> <span class="muted">(${plan.biome})</span>
      <input id="lv" type="range" min="1" max="100" value="${state.level}"></label>
    <div class="row">
      <button id="prev">◀</button><button id="next">▶</button>
      <span>Variante ${state.variant}</span><button id="vm">−</button><button id="vp">+</button>
    </div>
    <div class="row">Graine <input id="seed" type="number" value="${state.seed}"><button id="reseed">Niveau</button></div>
    <div class="row">
      ${toggle('walk', 'marche')}${toggle('colliders', 'collisions')}${toggle('lanes', 'couloirs')}
      ${toggle('decor', 'décor')}${toggle('spots', 'service / apparition')}${toggle('ascii', 'ASCII')}
    </div>
    <p>${L.width}×${L.depth} cases (plan ${plan.width}×${plan.depth}) · <b>${genMs.toFixed(1)} ms</b></p>
    <p>Tables ${L.tables.length}/${plan.tables} (VIP ${vip}/${plan.vipTables}) · comptoirs ${L.counters.length}/${plan.counters}
      · guéridons ${L.pedestals.length}/${plan.pedestals} · couloirs ${L.lanes.length} · décor ${L.decor.length}
      · apparitions ${L.spawnPoints.length}</p>
    <p class="${errors.length ? 'err' : 'ok'}">${errors.length ? errors.slice(0, 12).join('<br>') : 'Salon valide ✓'}</p>
    <b>Zones</b><ul>${L.zones.map((z) => `<li>${z.id} · ${z.name} <span class="muted">(${z.kind}, ${z.floor}${z.raised ? ', estrade' : ''})</span></li>`).join('')}</ul>
    <b>Comptoirs</b><ul>${L.counters.map((c) => `<li>${c.id} · ${c.station}${c.island ? ' (îlot)' : ''} <span class="muted">${c.dishes.join(', ')}</span></li>`).join('')}</ul>
    ${state.ascii ? `<pre>${layoutToAscii(L).replace(/</g, '&lt;')}</pre>` : ''}
  `;
  const lv = side.querySelector('#lv') as HTMLInputElement;
  lv.oninput = () => {
    state.level = Number(lv.value);
    state.customSeed = false;
    regenerate();
  };
  (side.querySelector('#prev') as HTMLButtonElement).onclick = () => step(-1);
  (side.querySelector('#next') as HTMLButtonElement).onclick = () => step(1);
  (side.querySelector('#vm') as HTMLButtonElement).onclick = () => variant(-1);
  (side.querySelector('#vp') as HTMLButtonElement).onclick = () => variant(1);
  const seed = side.querySelector('#seed') as HTMLInputElement;
  seed.onchange = () => {
    state.seed = Number(seed.value) >>> 0;
    state.customSeed = true;
    regenerate();
  };
  (side.querySelector('#reseed') as HTMLButtonElement).onclick = () => {
    state.customSeed = false;
    regenerate();
  };
  for (const k of ['walk', 'colliders', 'lanes', 'decor', 'spots', 'ascii'] as const) {
    const el = side.querySelector(`#t-${k}`) as HTMLInputElement;
    el.onchange = () => {
      state[k] = el.checked;
      if (k === 'ascii') renderSide();
      draw();
    };
  }
}

function toggle(k: keyof typeof state, label: string): string {
  return `<label><input id="t-${k}" type="checkbox" ${state[k] ? 'checked' : ''}> ${label}</label>`;
}

function step(d: number): void {
  state.level = Math.max(1, Math.min(100, state.level + d));
  state.customSeed = false;
  regenerate();
}

function variant(d: number): void {
  state.variant = Math.max(0, state.variant + d);
  state.customSeed = false;
  regenerate();
}

function draw(): void {
  const L = layout;
  const dpr = window.devicePixelRatio || 1;
  const vw = canvas.parentElement!.clientWidth;
  const vh = canvas.parentElement!.clientHeight;
  canvas.width = vw * dpr;
  canvas.height = vh * dpr;
  canvas.style.width = `${vw}px`;
  canvas.style.height = `${vh}px`;
  const s = Math.max(4, Math.floor(Math.min((vw - 30) / L.width, (vh - 30) / L.depth)));
  const ox = Math.floor((vw - s * L.width) / 2);
  const oz = Math.floor((vh - s * L.depth) / 2);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, vw, vh);
  const X = (x: number) => ox + x * s;
  const Z = (z: number) => oz + z * s;

  // Cases
  for (let z = 0; z < L.depth; z++)
    for (let x = 0; x < L.width; x++) {
      const i = z * L.width + x;
      const c = L.cells[i];
      if (c === CELL.VOID) continue;
      const zone = L.zones[L.zoneOf[i]];
      g.fillStyle =
        c === CELL.WALL ? '#6a5260' : c === CELL.RAIL ? '#c8b07e' : c === CELL.GLASS ? '#86c3d6' : zone ? FLOOR_COLORS[zone.floor] : '#999';
      g.fillRect(X(x), Z(z), s, s);
      if (c === CELL.FLOOR && state.walk) {
        g.fillStyle = L.walk[i] ? 'rgba(40,200,90,0.28)' : 'rgba(220,40,40,0.35)';
        g.fillRect(X(x), Z(z), s, s);
      }
    }
  // grille fine
  g.strokeStyle = 'rgba(0,0,0,0.08)';
  g.lineWidth = 1;
  for (let x = 0; x <= L.width; x++) line(X(x), Z(0), X(x), Z(L.depth));
  for (let z = 0; z <= L.depth; z++) line(X(0), Z(z), X(L.width), Z(z));
  // estrades
  for (const zn of L.zones)
    if (zn.raised > 0) {
      g.strokeStyle = '#ffd36b';
      g.lineWidth = 2;
      g.strokeRect(X(zn.rect.x), Z(zn.rect.z), zn.rect.w * s, zn.rect.d * s);
    }

  // Décor non bloquant au sol (tapis, marches) d'abord
  if (state.decor)
    for (const d of L.decor) {
      if (d.kind === 'rug' || d.kind === 'stage_steps') {
        g.save();
        g.translate(X(d.x), Z(d.z));
        g.rotate(-d.rot);
        g.fillStyle = d.kind === 'rug' ? 'rgba(138,47,69,0.45)' : 'rgba(122,82,48,0.8)';
        const w = (d.w ?? 1) * s;
        const dd = (d.d ?? 1) * s;
        g.fillRect(-w / 2, -dd / 2, w, dd);
        g.restore();
      }
    }

  // Couloirs
  if (state.lanes)
    for (const l of L.lanes) {
      const horiz = l.a.z === l.b.z;
      g.fillStyle = 'rgba(80,140,255,0.18)';
      if (horiz) g.fillRect(X(Math.min(l.a.x, l.b.x)), Z(l.a.z - l.width / 2), Math.abs(l.b.x - l.a.x) * s, l.width * s);
      else g.fillRect(X(l.a.x - l.width / 2), Z(Math.min(l.a.z, l.b.z)), l.width * s, Math.abs(l.b.z - l.a.z) * s);
      g.strokeStyle = '#4f8cff';
      g.setLineDash([s / 3, s / 4]);
      g.lineWidth = 2;
      line(X(l.a.x), Z(l.a.z), X(l.b.x), Z(l.b.z));
      g.setLineDash([]);
    }

  // Collisions
  if (state.colliders)
    for (const c of L.colliders) {
      g.strokeStyle = 'rgba(255,60,60,0.85)';
      g.fillStyle = 'rgba(255,60,60,0.12)';
      g.lineWidth = 1;
      if (c.shape === 'circle') {
        g.beginPath();
        g.arc(X(c.x), Z(c.z), c.r * s, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      } else {
        g.fillRect(X(c.minX), Z(c.minZ), (c.maxX - c.minX) * s, (c.maxZ - c.minZ) * s);
        g.strokeRect(X(c.minX), Z(c.minZ), (c.maxX - c.minX) * s, (c.maxZ - c.minZ) * s);
      }
    }

  // Tables & chaises
  for (const t of L.tables) {
    for (const st of t.seats) {
      g.fillStyle = t.vip ? '#c9a13b' : '#7b4b2a';
      g.beginPath();
      g.arc(X(st.x), Z(st.z), 0.2 * s, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#000';
      line(X(st.x), Z(st.z), X(st.x + Math.sin(st.angle) * 0.25), Z(st.z + Math.cos(st.angle) * 0.25));
    }
    g.fillStyle = t.vip ? '#fff3c4' : '#fbf6ee';
    g.strokeStyle = t.vip ? '#c9a13b' : '#6b4a2e';
    g.lineWidth = 2;
    if (t.shape === 'round') {
      g.beginPath();
      g.arc(X(t.x), Z(t.z), (t.w / 2) * s, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    } else {
      // w / d : plateau avant rotation (rot impair : grand côté selon Z)
      const tw = t.rot % 2 ? t.d : t.w;
      const td = t.rot % 2 ? t.w : t.d;
      g.fillRect(X(t.x - tw / 2), Z(t.z - td / 2), tw * s, td * s);
      g.strokeRect(X(t.x - tw / 2), Z(t.z - td / 2), tw * s, td * s);
    }
    text(String(t.id), X(t.x), Z(t.z), '#3a2a20', Math.max(8, s * 0.45));
    if (state.spots)
      for (const p of t.serviceSpots) {
        g.fillStyle = '#26c26a';
        g.fillRect(X(p.x) - 2, Z(p.z) - 2, 4, 4);
      }
  }

  // Comptoirs
  for (const c of L.counters) {
    g.fillStyle = c.island ? '#8a5a3a' : '#a0683f';
    g.fillRect(X(c.x - c.w / 2), Z(c.z - c.d / 2), c.w * s, c.d * s);
    g.strokeStyle = '#ffd36b';
    g.lineWidth = c.island ? 3 : 1;
    g.strokeRect(X(c.x - c.w / 2), Z(c.z - c.d / 2), c.w * s, c.d * s);
    text(`${c.id}:${c.station}`, X(c.x), Z(c.z), '#fff', Math.max(8, s * 0.42));
    g.fillStyle = '#3fe0ff';
    g.beginPath();
    g.arc(X(c.front.x), Z(c.front.z), 0.15 * s, 0, Math.PI * 2);
    g.fill();
  }

  // Guéridons
  for (const p of L.pedestals) {
    g.fillStyle = '#d7dde3';
    g.strokeStyle = '#5b6670';
    g.beginPath();
    g.arc(X(p.x), Z(p.z), 0.32 * s, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }

  // Décor
  if (state.decor)
    for (const d of L.decor) {
      if (d.kind === 'rug' || d.kind === 'stage_steps') continue;
      const [col, ch] = DECOR_STYLE[d.kind] ?? ['#fff', '?'];
      if (d.kind === 'chandelier') {
        g.strokeStyle = col;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(X(d.x), Z(d.z), 0.45 * s * (d.scale ?? 1), 0, Math.PI * 2);
        g.stroke();
        continue;
      }
      if (d.kind === 'parasol') {
        g.fillStyle = 'rgba(240,217,160,0.35)';
        g.beginPath();
        g.arc(X(d.x), Z(d.z), 1.1 * s * (d.scale ?? 1), 0, Math.PI * 2);
        g.fill();
        continue;
      }
      if (d.kind === 'arch') {
        g.save();
        g.translate(X(d.x), Z(d.z));
        g.rotate(-d.rot);
        g.strokeStyle = col;
        g.lineWidth = 3;
        g.strokeRect((-(d.w ?? 1) / 2) * s, -0.15 * s, (d.w ?? 1) * s, 0.3 * s);
        g.restore();
        continue;
      }
      if (d.kind === 'banquette' || d.kind === 'bookshelf' || d.kind === 'cake_display' || d.kind === 'piano' || (d.kind === 'flowers' && d.w)) {
        g.save();
        g.translate(X(d.x), Z(d.z));
        g.rotate(-d.rot);
        g.fillStyle = col;
        const w = (d.w ?? 1) * s;
        const dd = (d.d ?? 1) * s;
        g.fillRect(-w / 2, -dd / 2, w, dd);
        g.restore();
        if (ch) text(ch, X(d.x), Z(d.z), '#fff', Math.max(8, s * 0.5));
        continue;
      }
      if (d.kind === 'column') {
        g.fillStyle = col;
        g.strokeStyle = '#8c8577';
        g.beginPath();
        g.arc(X(d.x), Z(d.z), 0.28 * s, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        continue;
      }
      if (d.kind === 'fountain') {
        g.fillStyle = col;
        g.beginPath();
        g.arc(X(d.x), Z(d.z), 1.2 * s, 0, Math.PI * 2);
        g.fill();
        text('Fontaine', X(d.x), Z(d.z), '#073042', Math.max(8, s * 0.45));
        continue;
      }
      // petits décors : pastille + lettre (muraux : losange)
      g.fillStyle = col;
      g.beginPath();
      if (d.wall) {
        const r = 0.3 * s;
        g.moveTo(X(d.x), Z(d.z) - r);
        g.lineTo(X(d.x) + r, Z(d.z));
        g.lineTo(X(d.x), Z(d.z) + r);
        g.lineTo(X(d.x) - r, Z(d.z));
        g.closePath();
      } else g.arc(X(d.x), Z(d.z), 0.33 * s, 0, Math.PI * 2);
      g.fill();
      if (ch) text(ch, X(d.x), Z(d.z), '#111', Math.max(7, s * 0.4));
    }

  // Cloche, entrée, départ, marée
  g.fillStyle = '#ffcf3f';
  g.beginPath();
  g.arc(X(L.royalBell.x), Z(L.royalBell.z), 0.3 * s, 0, Math.PI * 2);
  g.fill();
  text('Cloche', X(L.royalBell.x), Z(L.royalBell.z) - 0.6 * s, '#ffcf3f', Math.max(8, s * 0.42));
  g.fillStyle = '#3fe0ff';
  g.fillRect(X(L.royalBell.front.x) - 2, Z(L.royalBell.front.z) - 2, 4, 4);
  const e = L.entrance;
  const dir = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ][e.rot];
  g.strokeStyle = '#3cff8a';
  g.lineWidth = 3;
  line(X(e.x), Z(e.z), X(e.x + dir[0] * 1.2), Z(e.z + dir[1] * 1.2));
  g.fillStyle = '#3cff8a';
  g.beginPath();
  g.arc(X(L.playerStart.x), Z(L.playerStart.z), 0.32 * s, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#4fa3ff';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(X(L.tideOrigin.x), Z(L.tideOrigin.z), 0.9 * s, 0, Math.PI * 2);
  g.stroke();
  if (state.spots)
    for (const p of L.spawnPoints) {
      g.strokeStyle = '#c77dff';
      g.lineWidth = 2;
      line(X(p.x) - 4, Z(p.z) - 4, X(p.x) + 4, Z(p.z) + 4);
      line(X(p.x) - 4, Z(p.z) + 4, X(p.x) + 4, Z(p.z) - 4);
    }

  // Noms des zones
  for (const zn of L.zones) {
    const cx = X(zn.rect.x + zn.rect.w / 2);
    const cz = Z(zn.rect.z) + 14;
    text(zn.name, cx, cz, 'rgba(30,10,30,0.85)', Math.max(10, Math.min(16, s * 0.6)), true);
  }
}

function line(ax: number, az: number, bx: number, bz: number): void {
  g.beginPath();
  g.moveTo(ax, az);
  g.lineTo(bx, bz);
  g.stroke();
}

function text(t: string, x: number, z: number, color: string, size: number, halo = false): void {
  g.font = `${halo ? 'bold ' : ''}${size}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (halo) {
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 3;
    g.strokeText(t, x, z);
  }
  g.fillStyle = color;
  g.fillText(t, x, z);
}

window.addEventListener('resize', draw);
window.addEventListener('keydown', (ev) => {
  if (ev.target instanceof HTMLInputElement && ev.target.type !== 'range' && ev.target.type !== 'checkbox') return;
  if (ev.key === 'ArrowRight') step(1);
  if (ev.key === 'ArrowLeft') step(-1);
  if (ev.key === 'ArrowUp') variant(1);
  if (ev.key === 'ArrowDown') variant(-1);
});
regenerate();
