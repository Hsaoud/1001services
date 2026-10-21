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

/** Vérifie si le mode plein écran est disponible (non disponible sur iOS Safari). */
export function fullscreenAvailable(): boolean {
  if (typeof document === 'undefined') return false;
  return !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false;
}

/** Bascule le mode plein écran. */
export function toggleFullscreen(): void {
  if (!fullscreenAvailable()) return;
  if (document.fullscreenElement) {
    void document.exitFullscreen?.().catch(() => {});
  } else {
    void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  }
}

/** Entre en plein écran si permis. */
export function enterFullscreen(): void {
  if (!fullscreenAvailable() || document.fullscreenElement) return;
  void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
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
