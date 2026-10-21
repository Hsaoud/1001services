/**
 * Laboratoire audio (audio-lab.html) : déclencher chaque effet, écouter les morceaux,
 * régler intensité / volumes / pause, et analyser hors-ligne (crête, RMS, durée, brillance)
 * pour vérifier le niveau et l'absence de saturation sans avoir à écouter.
 */
import type { MusicTrack, SfxId } from '../types';
import { audio, audioDebug, audioMeter } from './index';
import { createEngine } from './engine';
import { MusicDirector, musicDebug } from './music';
import { SFX_IDS, SfxPlayer } from './sfx';

const root = document.getElementById('lab') as HTMLElement;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  Object.assign(n, props);
  for (const k of kids) n.append(k);
  return n;
}

function slider(label: string, min: number, max: number, step: number, value: number, onInput: (v: number) => void): HTMLLabelElement {
  const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
  const out = el('output', { textContent: value.toFixed(2) });
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = v.toFixed(2);
    onInput(v);
  });
  const l = el('label', { className: 'slider' }, label, input, out);
  return l;
}

function section(title: string, ...kids: Node[]): HTMLElement {
  return el('section', {}, el('h2', { textContent: title }), ...kids);
}

// ─────────────────────────────────────────── État local

const vols = { master: 1, music: 0.8, sfx: 1 };
const fx = { pitch: 1, volume: 1, pan: 0, burst: false };
let paused = false;

// Tout geste dans la page déverrouille l'audio (comme dans le jeu)
document.addEventListener('pointerdown', () => audio.unlock(), { capture: true });
document.addEventListener('keydown', () => audio.unlock(), { capture: true });

// ─────────────────────────────────────────── En-tête & contexte

root.append(
  el('h1', { textContent: 'Laboratoire audio' }),
  el('p', { className: 'sub', textContent: 'Les 1001 Services de La Duchesse — effets et musique 100 % synthétisés (WebAudio).' }),
);

const status = el('span', { id: 'status', textContent: '…' });
const unlockBtn = el('button', { className: 'primary', textContent: 'Déverrouiller l’audio' });
unlockBtn.addEventListener('click', () => audio.unlock());
root.append(section('Contexte', el('div', { className: 'row' }, unlockBtn, status)));

// Vumètre de sortie (crête maintenue) : vérifie que le son circule et ne sature pas
const meterBar = el('div', { className: 'meter' }, el('div', { className: 'fill' }));
const meterTxt = el('span', { className: 'meter-txt', textContent: '— dBFS' });
const meterRow = el('div', { className: 'row meter-row' }, meterBar, meterTxt);
let peakHold = 0;
let maxSeen = 0;
let buf: Float32Array<ArrayBuffer> | null = null;
function drawMeter(): void {
  const an = audioMeter();
  if (an) {
    if (!buf || buf.length !== an.fftSize) buf = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(buf);
    let pk = 0;
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const a = Math.abs(buf[i]);
      if (a > pk) pk = a;
      sum += buf[i] * buf[i];
    }
    const rms = Math.sqrt(sum / buf.length);
    peakHold = Math.max(pk, peakHold * 0.97);
    maxSeen = Math.max(maxSeen, pk);
    const toPct = (x: number): number => Math.max(0, Math.min(100, ((20 * Math.log10(x + 1e-9) + 60) / 60) * 100));
    (meterBar.firstChild as HTMLElement).style.width = `${toPct(rms)}%`;
    meterBar.style.setProperty('--peak', `${toPct(peakHold)}%`);
    meterTxt.textContent = `RMS ${(20 * Math.log10(rms + 1e-9)).toFixed(1)} · crête ${(20 * Math.log10(peakHold + 1e-9)).toFixed(1)} · max ${(20 * Math.log10(maxSeen + 1e-9)).toFixed(1)} dBFS`;
  }
  requestAnimationFrame(drawMeter);
}
requestAnimationFrame(drawMeter);
root.lastElementChild?.append(meterRow);
(window as unknown as { audioLabMeter: () => number }).audioLabMeter = () => maxSeen;

setInterval(() => {
  const d = audioDebug();
  status.textContent = `état ${d.state} · t ${d.time.toFixed(1)} s · voix sfx ${d.voices} · piste ${d.track ?? '—'} · intensité ${d.intensity.toFixed(2)} · latence ${(d.baseLatency * 1000).toFixed(0)} ms · ${d.sampleRate} Hz`;
}, 250);

// ─────────────────────────────────────────── Volumes & pause

const pauseBtn = el('button', { textContent: 'Pause : non' });
pauseBtn.addEventListener('click', () => {
  paused = !paused;
  audio.setPaused(paused);
  pauseBtn.textContent = `Pause : ${paused ? 'oui' : 'non'}`;
  pauseBtn.classList.toggle('on', paused);
});
const applyVols = (): void => audio.setVolumes(vols.master, vols.music, vols.sfx);
root.append(
  section(
    'Volumes',
    el(
      'div',
      { className: 'row' },
      slider('Maître', 0, 1, 0.01, vols.master, (v) => ((vols.master = v), applyVols())),
      slider('Musique', 0, 1, 0.01, vols.music, (v) => ((vols.music = v), applyVols())),
      slider('Effets', 0, 1, 0.01, vols.sfx, (v) => ((vols.sfx = v), applyVols())),
      pauseBtn,
    ),
  ),
);
applyVols();

// ─────────────────────────────────────────── Musique

const tracks: [MusicTrack, string][] = [
  ['title', 'Titre (valse)'],
  ['service', 'Service (swing)'],
  ['rush', 'Coup de feu'],
  ['results', 'Résultats'],
  [null, 'Silence'],
];
const trackBtns: HTMLButtonElement[] = [];
const musicRow = el('div', { className: 'row' });
for (const [t, label] of tracks) {
  const b = el('button', { textContent: label });
  b.addEventListener('click', () => {
    audio.unlock();
    audio.music(t);
    trackBtns.forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
  });
  trackBtns.push(b);
  musicRow.append(b);
}
root.append(
  section(
    'Musique',
    musicRow,
    el('div', { className: 'row intensity' }, slider('Intensité', 0, 1, 0.01, 0, (v) => audio.setIntensity(v))),
    el('p', { className: 'hint', textContent: 'Même piste → pas de redémarrage. Fondu enchaîné ~1,5 s. L’intensité accélère et densifie service / coup de feu.' }),
  ),
);

// ─────────────────────────────────────────── Effets

const burst = el('input', { type: 'checkbox' });
burst.addEventListener('change', () => (fx.burst = burst.checked));
const grid = el('div', { className: 'grid' });

function fire(id: SfxId): void {
  audio.unlock();
  const n = fx.burst ? 8 : 1;
  for (let i = 0; i < n; i++) {
    setTimeout(() => audio.sfx(id, { pitch: fx.pitch, volume: fx.volume, pan: fx.pan }), i * 45);
  }
}

for (const id of SFX_IDS) {
  const b = el('button', { textContent: id, title: `audio.sfx('${id}')` });
  b.addEventListener('click', () => fire(id));
  grid.append(b);
}

let stepTimer: ReturnType<typeof setInterval> | null = null;
const walkBtn = el('button', { textContent: 'Marche (pas en boucle)' });
walkBtn.addEventListener('click', () => {
  audio.unlock();
  if (stepTimer) {
    clearInterval(stepTimer);
    stepTimer = null;
    walkBtn.classList.remove('on');
  } else {
    stepTimer = setInterval(() => audio.sfx('step', { volume: fx.volume, pan: fx.pan }), 210);
    walkBtn.classList.add('on');
  }
});

root.append(
  section(
    'Effets',
    el(
      'div',
      { className: 'row' },
      slider('Hauteur', 0.5, 2, 0.01, fx.pitch, (v) => (fx.pitch = v)),
      slider('Volume', 0, 1, 0.01, fx.volume, (v) => (fx.volume = v)),
      slider('Pan', -1, 1, 0.01, fx.pan, (v) => (fx.pan = v)),
      el('label', { className: 'slider' }, burst, 'Rafale ×8 (polyphonie)'),
      walkBtn,
    ),
    grid,
  ),
);

// ─────────────────────────────────────────── Analyse hors-ligne

interface Stats {
  peakDb: number;
  rmsDb: number;
  /** Sonie courte pondérée A (max sur fenêtres de 46 ms), dB. */
  laMax: number;
  /** Sonie pondérée A moyenne sur la partie active, dB. */
  laEq: number;
  /** Répartition d'énergie : < 250 Hz, 250–2 k, 2–6 k, > 6 kHz. */
  bands: [number, number, number, number];
  len: number;
  centroid: number;
  hf: number;
  bad: boolean;
  env: Float32Array;
}

const SR = 44100;
const db = (x: number): number => (x > 0 ? 20 * Math.log10(x) : -Infinity);

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar;
        im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/** Pondération A (en puissance), normalisée à 1 kHz. */
function aWeight(f: number): number {
  const f2 = f * f;
  const ra = (12194 * 12194 * f2 * f2) / ((f2 + 20.6 * 20.6) * Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) * (f2 + 12194 * 12194));
  return ra * ra * 1.5849; // +2 dB
}

function analyse(buf: AudioBuffer, from = SETTLE): Stats {
  const skip = Math.floor(from * buf.sampleRate);
  const L = buf.getChannelData(0).subarray(skip);
  const R = (buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0)).subarray(skip);
  const n = L.length;
  let peak = 0;
  let last = 0;
  let bad = false;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(L[i]);
    const b = Math.abs(R[i]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) bad = true;
    const m = Math.max(a, b);
    if (m > peak) peak = m;
    if (m > 0.001) last = i;
  }
  let sum = 0;
  for (let i = 0; i <= last; i++) {
    const m = (L[i] + R[i]) * 0.5;
    sum += m * m;
  }
  const rms = Math.sqrt(sum / Math.max(1, last + 1));
  // spectre court terme (fenêtres de Hann, recouvrement 50 %) : sonie pondérée A + bandes
  const N = 2048;
  const hop = 1024;
  const win = new Float64Array(N);
  let w2 = 0;
  for (let i = 0; i < N; i++) {
    win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
    w2 += win[i] * win[i];
  }
  const aw = new Float64Array(N / 2);
  for (let k = 1; k < N / 2; k++) aw[k] = aWeight((k * SR) / N);
  const count = Math.max(1, Math.min(900, Math.floor((last + 1 - N) / hop) + 1));
  let tot = 0;
  let wsum = 0;
  let hf = 0;
  let laMaxLin = 0;
  let laSum = 0;
  const bands: [number, number, number, number] = [0, 0, 0, 0];
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let f = 0; f < count; f++) {
    const off = f * hop;
    for (let i = 0; i < N; i++) {
      const idx = off + i;
      re[i] = idx < n ? (L[idx] + R[idx]) * 0.5 * win[i] : 0;
      im[i] = 0;
    }
    fft(re, im);
    let la = 0;
    for (let k = 1; k < N / 2; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      const fHz = (k * SR) / N;
      tot += p;
      wsum += p * fHz;
      if (fHz > 6000) hf += p;
      bands[fHz < 250 ? 0 : fHz < 2000 ? 1 : fHz < 6000 ? 2 : 3] += p;
      la += p * aw[k];
    }
    const ms = (2 * la) / (N * w2);
    laSum += ms;
    if (ms > laMaxLin) laMaxLin = ms;
  }
  const bt = bands[0] + bands[1] + bands[2] + bands[3] || 1;
  for (let i = 0; i < 4; i++) bands[i] /= bt;
  // enveloppe (pour la vignette)
  const W = 120;
  const env = new Float32Array(W);
  const span = Math.max(1, Math.ceil((last + 1) / W));
  for (let x = 0; x < W; x++) {
    let m = 0;
    for (let i = x * span; i < Math.min(n, (x + 1) * span); i++) m = Math.max(m, Math.abs(L[i]), Math.abs(R[i]));
    env[x] = m;
  }
  return { peakDb: db(peak), rmsDb: db(rms), laMax: 10 * Math.log10(laMaxLin || 1e-12), laEq: 10 * Math.log10(laSum / count || 1e-12), bands, len: (last + 1) / SR, centroid: tot > 0 ? wsum / tot : 0, hf: tot > 0 ? hf / tot : 0, bad, env };
}

function envCanvas(s: Stats): HTMLCanvasElement {
  const c = el('canvas', { className: 'env', width: 120, height: 26 });
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#c98a8a';
    for (let x = 0; x < s.env.length; x++) {
      const h = Math.max(1, s.env[x] * 26);
      g.fillRect(x, 13 - h / 2, 1, h);
    }
  }
  return c;
}

/**
 * Le compresseur WebAudio démarre « fermé » et se relâche pendant ~1 s : on laisse la chaîne
 * se stabiliser avant de jouer quoi que ce soit, sinon les mesures sont faussées (jusqu'à −18 dB).
 */
const SETTLE = 1.024;

async function renderSfx(id: SfxId): Promise<AudioBuffer> {
  const oac = new OfflineAudioContext(2, Math.ceil(SR * (SETTLE + 5)), SR);
  const e = createEngine(oac);
  const p = new SfxPlayer(e);
  void oac.suspend(SETTLE).then(() => {
    p.play(id, { pitch: 1, volume: 1, pan: 0 });
    void oac.resume();
  });
  return oac.startRendering();
}

async function renderMusic(track: Exclude<MusicTrack, null>, intensity: number, seconds: number): Promise<AudioBuffer> {
  const oac = new OfflineAudioContext(2, Math.ceil(SR * (SETTLE + seconds)), SR);
  const e = createEngine(oac);
  const d = new MusicDirector(e);
  d.forceIntensity(intensity);
  void oac.suspend(SETTLE).then(() => {
    d.play(track);
    d.pump(SETTLE + seconds);
    void oac.resume();
  });
  return oac.startRendering();
}

function statRow(name: string, s: Stats, ms: number): HTMLTableRowElement {
  const cell = (txt: string, warn = false): HTMLTableCellElement => el('td', { textContent: txt, className: warn ? 'warn' : '' });
  return el(
    'tr',
    {},
    cell(name),
    cell(s.peakDb.toFixed(1), s.peakDb > -0.5 || s.peakDb < -40),
    cell(s.rmsDb.toFixed(1)),
    cell(s.laMax.toFixed(1)),
    cell(s.laEq.toFixed(1)),
    cell(s.bands.map((b) => Math.round(b * 100)).join(' / ')),
    cell(s.len.toFixed(2)),
    cell(Math.round(s.centroid).toString(), s.centroid > 4500),
    cell((s.hf * 100).toFixed(1) + ' %', s.hf > 0.15),
    cell(s.bad ? 'NaN !' : 'ok', s.bad),
    cell(ms.toFixed(0)),
    el('td', {}, envCanvas(s)),
  );
}

function table(): HTMLTableElement {
  const t = el('table');
  const head = el('tr');
  for (const h of ['nom', 'crête dBFS', 'RMS dB', 'LA max', 'LA moy', 'bandes %', 'durée s', 'centroïde Hz', '> 6 kHz', 'valeurs', 'rendu ms', 'enveloppe']) head.append(el('th', { textContent: h }));
  t.append(head);
  return t;
}

const results = el('div', { className: 'scroll' });
const anaSfx = el('button', { textContent: 'Analyser tous les effets' });
const anaMusic = el('button', { textContent: 'Analyser la musique (20 s / piste)' });
const report: Record<string, { peak: number; rms: number; la: number; laEq: number; bands: number[]; len: number; centroid: number; hf: number; bad: boolean }> = {};
(window as unknown as { audioLabReport: typeof report }).audioLabReport = report;

anaSfx.addEventListener('click', async () => {
  anaSfx.disabled = true;
  const t = table();
  results.replaceChildren(t);
  for (const id of SFX_IDS) {
    const t0 = performance.now();
    const s = analyse(await renderSfx(id));
    t.append(statRow(id, s, performance.now() - t0));
    report[id] = { peak: s.peakDb, rms: s.rmsDb, la: s.laMax, laEq: s.laEq, bands: s.bands, len: s.len, centroid: s.centroid, hf: s.hf, bad: s.bad };
  }
  anaSfx.disabled = false;
});

anaMusic.addEventListener('click', async () => {
  anaMusic.disabled = true;
  const t = table();
  results.replaceChildren(t);
  const jobs: [Exclude<MusicTrack, null>, number][] = [
    ['title', 0],
    ['service', 0],
    ['service', 1],
    ['rush', 0],
    ['rush', 1],
    ['results', 0],
  ];
  for (const [track, I] of jobs) {
    const t0 = performance.now();
    const s = analyse(await renderMusic(track, I, 20));
    const name = `${track} I=${I}`;
    t.append(statRow(name, s, performance.now() - t0));
    report[name] = { peak: s.peakDb, rms: s.rmsDb, la: s.laMax, laEq: s.laEq, bands: s.bands, len: s.len, centroid: s.centroid, hf: s.hf, bad: s.bad };
  }
  anaMusic.disabled = false;
});

root.append(
  section(
    'Analyse hors-ligne',
    el('div', { className: 'row' }, anaSfx, anaMusic),
    el('p', { className: 'hint', textContent: 'Rendu OfflineAudioContext à travers la vraie chaîne (compresseur + limiteur), volume 1. Rouge : crête > −0,5 dBFS, centroïde > 4,5 kHz ou > 15 % d’énergie au-dessus de 6 kHz.' }),
    results,
  ),
);

// Accès console (diagnostic) : await audioLab.sfx(['step']) / await audioLab.music('service', 1, 20)
const fmt = (name: string, s: Stats): string =>
  `${name.padEnd(16)} pk ${s.peakDb.toFixed(1).padStart(6)} LA ${s.laMax.toFixed(1).padStart(6)} eq ${s.laEq.toFixed(1).padStart(6)} len ${s.len.toFixed(2)} cen ${Math.round(s.centroid).toString().padStart(5)} b ${s.bands.map((b) => Math.round(b * 100)).join('/')}${s.bad ? ' NaN!' : ''}`;
(window as unknown as { audioLab: unknown }).audioLab = {
  api: audio,
  debug: audioDebug,
  async sfx(ids: SfxId[] = SFX_IDS): Promise<string> {
    const lines: string[] = [];
    for (const id of ids) lines.push(fmt(id, analyse(await renderSfx(id))));
    return lines.join('\n');
  },
  async music(track: Exclude<MusicTrack, null>, intensity = 0, seconds = 20, solo: typeof musicDebug.solo = null): Promise<string> {
    musicDebug.solo = solo;
    try {
      return fmt(`${track} I=${intensity}${solo ? ' ' + solo : ''}`, analyse(await renderMusic(track, intensity, seconds)));
    } finally {
      musicDebug.solo = null;
    }
  },
};
