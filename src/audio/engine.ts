/**
 * Moteur audio : graphe de mixage, réverbération de salon (réponse impulsionnelle générée)
 * et tampons de bruit fabriqués en code. Fonctionne sur tout BaseAudioContext
 * (AudioContext en jeu, OfflineAudioContext pour l'analyse du laboratoire).
 *
 *   sfxDry ───────────────────────────────┐
 *   sfxWet ──► reverbIn                   │
 *   musicIn ─► musicPause ─► musicLP ─► musicVol ──┬──► master ─► compresseur ─► limiteur ─► sortie
 *                                       musicSend ─┘ (vers reverbIn)
 *   reverbIn ─► passe-haut ─► passe-bas ─► convolution ─► reverbOut ─► master
 */

export type NoiseKind = 'white' | 'pink' | 'brown' | 'crackle';

export interface Engine {
  readonly ac: BaseAudioContext;
  readonly master: GainNode;
  /** Sortie finale (après limiteur), avant la destination — pour un vumètre éventuel. */
  readonly out: GainNode;
  /** Bus des effets (son direct). */
  readonly sfxDry: GainNode;
  /** Envoi des effets vers la réverbération (même volume que sfxDry). */
  readonly sfxWet: GainNode;
  /** Entrée de toutes les pistes musicales. */
  readonly musicIn: GainNode;
  /** Atténuation de pause. */
  readonly musicPause: GainNode;
  /** Passe-bas de pause (étouffe la musique). */
  readonly musicLP: BiquadFilterNode;
  /** Volume musique (réglage joueur). */
  readonly musicVol: GainNode;
  readonly reverbIn: GainNode;
  readonly buffers: Readonly<Record<NoiseKind, AudioBuffer>>;
}

/** Durée des tampons de bruit (lus en boucle à partir d'un décalage aléatoire). */
const NOISE_SECONDS = 2;

export function createEngine(ac: BaseAudioContext, dest: AudioNode = ac.destination): Engine {
  // ── Chaîne maître : compression douce (« colle ») puis limiteur de sécurité
  const master = ac.createGain();
  master.gain.value = 1;

  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 12;
  comp.ratio.value = 2.2;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;

  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;

  // Le compresseur WebAudio applique un gain de rattrapage automatique : on compense légèrement.
  const trim = ac.createGain();
  trim.gain.value = 0.85;

  master.connect(comp);
  comp.connect(limiter);
  limiter.connect(trim);
  trim.connect(dest);

  // ── Réverbération partagée : petit salon élégant (≈ 1,5 s), aigus amortis
  const reverbIn = ac.createGain();
  const revHp = ac.createBiquadFilter();
  revHp.type = 'highpass';
  revHp.frequency.value = 240; // pas de boue dans le grave
  revHp.Q.value = 0.6;
  const revLp = ac.createBiquadFilter();
  revLp.type = 'lowpass';
  revLp.frequency.value = 6500;
  revLp.Q.value = 0.5;
  const conv = ac.createConvolver();
  conv.normalize = true;
  conv.buffer = makeImpulse(ac, 1.8);
  const reverbOut = ac.createGain();
  reverbOut.gain.value = 0.5;
  reverbIn.connect(revHp);
  revHp.connect(revLp);
  revLp.connect(conv);
  conv.connect(reverbOut);
  reverbOut.connect(master);

  // ── Effets
  const sfxDry = ac.createGain();
  const sfxWet = ac.createGain();
  sfxDry.connect(master);
  sfxWet.connect(reverbIn);

  // ── Musique : entrée → pause (gain + passe-bas) → volume → maître (+ envoi réverbération)
  const musicIn = ac.createGain();
  musicIn.gain.value = 1.8; // calage global de la musique (≈ −28 dB(A) en moyenne au volume 1)
  const musicPause = ac.createGain();
  const musicLP = ac.createBiquadFilter();
  musicLP.type = 'lowpass';
  musicLP.frequency.value = Math.min(20000, ac.sampleRate * 0.45);
  musicLP.Q.value = 0.5;
  const musicVol = ac.createGain();
  const musicSend = ac.createGain();
  musicSend.gain.value = 0.22;
  musicIn.connect(musicPause);
  musicPause.connect(musicLP);
  musicLP.connect(musicVol);
  musicVol.connect(master);
  musicVol.connect(musicSend);
  musicSend.connect(reverbIn);

  return {
    ac,
    master,
    out: trim,
    sfxDry,
    sfxWet,
    musicIn,
    musicPause,
    musicLP,
    musicVol,
    reverbIn,
    buffers: {
      white: makeNoise(ac, 'white'),
      pink: makeNoise(ac, 'pink'),
      brown: makeNoise(ac, 'brown'),
      crackle: makeNoise(ac, 'crackle'),
    },
  };
}

/** Glissement exponentiel FINI (pour les fréquences de filtre : pas de recalcul permanent). */
export function glide(param: AudioParam, value: number, now: number, dur: number): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(Math.max(param.value, 1), now);
  param.exponentialRampToValueAtTime(Math.max(value, 1), now + dur);
}

/** Rampe douce d'un paramètre (constante de temps `tc`). */
export function smooth(param: AudioParam, value: number, now: number, tc = 0.06): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.setTargetAtTime(value, now, tc);
}

// ─────────────────────────────────────────── Tampons générés

function makeNoise(ac: BaseAudioContext, kind: NoiseKind): AudioBuffer {
  const sr = ac.sampleRate;
  const len = Math.floor(sr * NOISE_SECONDS);
  const buf = ac.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  if (kind === 'white') {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } else if (kind === 'pink') {
    // Bruit rose (filtre de Paul Kellet)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    }
  } else if (kind === 'brown') {
    // Bruit brun (intégration avec fuite) : grondements
    let b = 0;
    for (let i = 0; i < len; i++) {
      b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = b;
    }
  } else {
    // Crépitement : impulsions éparses à queue courte (bulles de champagne, effervescence)
    const density = 420 / sr;
    let tail = 0;
    let amp = 0;
    for (let i = 0; i < len; i++) {
      if (Math.random() < density) {
        amp = (Math.random() < 0.5 ? -1 : 1) * (0.25 + 0.75 * Math.random());
        tail = 6 + Math.floor(Math.random() * 18);
      }
      if (tail > 0) {
        d[i] = amp;
        amp *= -0.72; // petite oscillation amortie
        tail--;
      } else d[i] = 0;
    }
  }
  normalize(d, kind === 'crackle' ? 0.9 : 0.95);
  // Fondu aux bords pour une boucle sans clic
  const fade = Math.min(256, len >> 4);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    d[i] *= k;
    d[len - 1 - i] *= k;
  }
  return buf;
}

function normalize(d: Float32Array, peak: number): void {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m <= 0) return;
  const k = peak / m;
  for (let i = 0; i < d.length; i++) d[i] *= k;
}

/**
 * Réponse impulsionnelle d'un salon feutré : premières réflexions éparses puis queue
 * diffuse stéréo à décroissance exponentielle, de plus en plus sombre (les aigus meurent vite).
 */
function makeImpulse(ac: BaseAudioContext, seconds: number): AudioBuffer {
  const sr = ac.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ac.createBuffer(2, len, sr);
  const rt60 = seconds * 0.8;
  const pre = Math.floor(sr * 0.014);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      // coefficient du passe-bas : de clair (0,25) à sombre (0,9)
      const a = 0.25 + 0.65 * Math.min(1, t / (seconds * 0.7));
      const w = Math.random() * 2 - 1;
      lp = a * lp + (1 - a) * w;
      const norm = Math.sqrt((1 + a) / (1 - a)); // compense la perte d'énergie du filtrage
      const env = Math.exp((-6.9 * t) / rt60);
      const fadeIn = Math.min(1, t / 0.02);
      d[i] = lp * norm * env * fadeIn * 0.5;
    }
    // Premières réflexions (murs, miroirs, vitrines)
    for (let k = 0; k < 10; k++) {
      const idx = Math.floor(sr * (0.005 + 0.004 * k + Math.random() * 0.006));
      if (idx < len) d[idx] += (Math.random() < 0.5 ? -1 : 1) * (0.55 - k * 0.04);
    }
  }
  return buf;
}
