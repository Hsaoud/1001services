/**
 * Détection et gestion du support d'entrée actif : tactile, clavier ou manette.
 * Adapte automatiquement l'interface et expose le verrouillage paysage,
 * le plein écran et les retours haptiques (vibrations).
 */

export type InputMode = 'keyboard' | 'gamepad' | 'touch';

type Listener = (mode: InputMode) => void;

/** Appareil tactile principal (téléphone, tablette). */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse || 'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0;
}

/** Appareil tenu en main (écran tactile avec pointeur grossier). */
export function isHandheld(): boolean {
  if (typeof window === 'undefined') return false;
  const q = new URLSearchParams(location.search).get('input');
  if (q === 'touch') return true;
  if (q === 'keyboard' || q === 'gamepad') return false;
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

/** Vérifie si l'écran est actuellement orienté en portrait. */
export function isPortrait(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.screen?.orientation?.type) {
    return window.screen.orientation.type.startsWith('portrait');
  }
  return window.innerHeight > window.innerWidth;
}

/** Tente de verrouiller l'écran en mode paysage (supporté sur Android Chrome). */
export async function lockLandscape(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof screen === 'undefined') return false;
  try {
    const o = screen.orientation as ScreenOrientation & {
      lock?: (orientation: string) => Promise<void>;
    };
    if (o && typeof o.lock === 'function') {
      await o.lock('landscape');
      return true;
    }
    const legacy = screen as unknown as {
      lockOrientation?: (o: string) => boolean;
      mozLockOrientation?: (o: string) => boolean;
      msLockOrientation?: (o: string) => boolean;
    };
    if (legacy.lockOrientation?.('landscape') || legacy.mozLockOrientation?.('landscape') || legacy.msLockOrientation?.('landscape')) {
      return true;
    }
  } catch {
    // Les navigateurs refusent si pas de geste utilisateur ou pas de support (ex: iOS Safari).
  }
  return false;
}

/** Déclenche une vibration haptique si l'appareil le supporte. */
export function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignoré
    }
  }
}

/** Vérifie si un élément est actuellement en plein écran. */
export function isFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as unknown as {
    fullscreenElement?: Element;
    webkitFullscreenElement?: Element;
    mozFullScreenElement?: Element;
    msFullscreenElement?: Element;
  };
  return !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
}

/** Vérifie si le mode plein écran est disponible (ou API préfixée Webkit/Blink). */
export function fullscreenAvailable(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.documentElement as unknown as {
    requestFullscreen?: unknown;
    webkitRequestFullscreen?: unknown;
    webkitRequestFullScreen?: unknown;
    mozRequestFullScreen?: unknown;
    msRequestFullscreen?: unknown;
  };
  const doc = document as unknown as {
    fullscreenEnabled?: boolean;
    webkitFullscreenEnabled?: boolean;
    mozFullScreenEnabled?: boolean;
  };
  const hasFn = !!(el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen || el.mozRequestFullScreen || el.msRequestFullscreen);
  return hasFn && doc.fullscreenEnabled !== false && doc.webkitFullscreenEnabled !== false;
}

/** Bascule le mode plein écran. */
export function toggleFullscreen(): void {
  if (isFullscreen()) {
    exitFullscreen();
  } else {
    enterFullscreen();
  }
}

/** Quitte le plein écran si actif. */
export function exitFullscreen(): void {
  if (typeof document === 'undefined') return;
  const doc = document as unknown as {
    exitFullscreen?: () => Promise<void>;
    webkitExitFullscreen?: () => void;
    mozCancelFullScreen?: () => void;
    msExitFullscreen?: () => void;
  };
  try {
    if (doc.exitFullscreen) void doc.exitFullscreen().catch(() => {});
    else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
    else if (doc.mozCancelFullScreen) doc.mozCancelFullScreen();
    else if (doc.msExitFullscreen) doc.msExitFullscreen();
  } catch {
    // Ignoré
  }
}

/** Entre en plein écran si permis (supporte les variantes Webkit). */
export function enterFullscreen(): void {
  if (typeof document === 'undefined' || isFullscreen()) return;
  const el = document.documentElement as unknown as {
    requestFullscreen?: (opts?: { navigationUI?: string }) => Promise<void>;
    webkitRequestFullscreen?: () => void;
    webkitRequestFullScreen?: () => void;
    mozRequestFullScreen?: () => void;
    msRequestFullscreen?: () => void;
  };
  try {
    if (el.requestFullscreen) {
      void el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
        void el.requestFullscreen?.().catch(() => {});
      });
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    } else if (el.webkitRequestFullScreen) {
      el.webkitRequestFullScreen();
    } else if (el.mozRequestFullScreen) {
      el.mozRequestFullScreen();
    } else if (el.msRequestFullscreen) {
      el.msRequestFullscreen();
    }
  } catch {
    // Ignoré si rejeté
  }
}

/** Tente de forcer le paysage, le plein écran et le masquage des barres d'adresse/en-têtes. */
export async function forceLandscapeAndFullscreen(): Promise<void> {
  enterFullscreen();
  await lockLandscape();
  if (typeof window !== 'undefined') {
    window.scrollTo(0, 1);
    setTimeout(() => window.scrollTo(0, 1), 60);
    setTimeout(() => window.scrollTo(0, 1), 260);
  }
}

class DeviceTracker {
  mode: InputMode = 'keyboard';
  private forced: InputMode | null = null;
  private readonly listeners = new Set<Listener>();

  init(): void {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(location.search).get('input');
    if (q === 'touch' || q === 'gamepad' || q === 'keyboard') this.forced = q;
    this.mode = this.forced ?? (isTouchDevice() ? 'touch' : 'keyboard');
    this.reflect();

    window.addEventListener(
      'keydown',
      (e) => {
        if (!e.isTrusted) return;
        this.set('keyboard');
      },
      true,
    );

    window.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'touch' || e.pointerType === 'pen') {
          this.set('touch');
          // Sur mobile, tenter le verrouillage paysage dès la première interaction
          void lockLandscape();
        } else if (e.pointerType === 'mouse' && this.mode !== 'touch') {
          this.set('keyboard');
        }
      },
      true,
    );

    window.addEventListener('gamepadconnected', () => {
      this.set('gamepad');
    });
  }

  set(mode: InputMode): boolean {
    if (this.forced) mode = this.forced;
    if (mode === this.mode) return false;
    this.mode = mode;
    this.reflect();
    this.emit();
    return true;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  vibrate(pattern: number | number[]): void {
    if (this.mode === 'touch' || isTouchDevice()) {
      vibrate(pattern);
    }
  }

  private reflect(): void {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.input = this.mode;
  }

  private emit(): void {
    for (const f of this.listeners) f(this.mode);
  }
}

export const device = new DeviceTracker();
