/**
 * Détection et gestion du support d'entrée actif : tactile, clavier ou manette.
 * Adapte automatiquement l'interface et expose le verrouillage paysage,
 * le plein écran et les retours haptiques (vibrations).
 */

export type InputMode = 'keyboard' | 'gamepad' | 'touch';

type Listener = (mode: InputMode) => void;
type FullscreenListener = (isFullscreen: boolean) => void;

/** Détecte un appareil iOS (iPhone, iPad, iPod touch). */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const plat = navigator.platform || '';
  return /iPad|iPhone|iPod/.test(ua) || (plat === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1);
}

/** Vérifie si l'application est exécutée en mode autonome / PWA (installée sur l'écran d'accueil). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as unknown as { standalone?: boolean };
  return !!(nav.standalone || window.matchMedia?.('(display-mode: standalone)').matches);
}

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
  return isIOS() || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
}

/** Vérifie si l'écran est actuellement orienté en portrait. */
export function isPortrait(): boolean {
  if (typeof window === 'undefined') return false;
  // Use the page's layout, like CSS orientation queries. Safari can expose an
  // outdated screen.orientation.type while the viewport has already rotated.
  if (window.innerWidth > 0 && window.innerHeight > 0) return window.innerHeight >= window.innerWidth;
  return window.matchMedia?.('(orientation: portrait)').matches ?? true;
}

/** Track Safari's visible viewport as its toolbars expand/collapse or the device rotates. */
export function syncViewport(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const viewport = window.visualViewport;
  const useVisual = viewport && Math.abs(viewport.scale - 1) < 0.01;
  const width = useVisual ? viewport.width : window.innerWidth;
  const height = useVisual ? viewport.height : window.innerHeight;
  if (width > 0) document.documentElement.style.setProperty('--game-width', `${Math.round(width)}px`);
  if (height > 0) document.documentElement.style.setProperty('--game-height', `${Math.round(height)}px`);
}

/** Reconcile layout after browser chrome changes; Safari controls its own toolbars. */
export function collapseMobileBars(): void {
  if (typeof window === 'undefined') return;
  syncViewport();
  requestAnimationFrame(syncViewport);
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

/** True only when the browser supports native DOM fullscreen. */
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
  const native = hasFn && doc.fullscreenEnabled !== false && doc.webkitFullscreenEnabled !== false;
  return native;
}

/** Bascule le mode plein écran. */
export function toggleFullscreen(): void {
  if (isFullscreen()) {
    exitFullscreen();
  } else {
    void enterFullscreen();
  }
}

/** Quitte le plein écran si actif. */
export function exitFullscreen(): void {
  if (typeof document === 'undefined') return;
  const doc = document as unknown as {
    exitFullscreen?: () => Promise<void>;
    webkitExitFullscreen?: () => void;
    webkitCancelFullScreen?: () => void;
    mozCancelFullScreen?: () => void;
    msExitFullscreen?: () => void;
  };
  try {
    if (doc.exitFullscreen) void doc.exitFullscreen().catch(() => {});
    else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
    else if (doc.webkitCancelFullScreen) doc.webkitCancelFullScreen();
    else if (doc.mozCancelFullScreen) doc.mozCancelFullScreen();
    else if (doc.msExitFullscreen) doc.msExitFullscreen();
  } catch {
    // Ignoré
  }
}

/** Entre en plein écran si permis (supporte les variantes Webkit). */
export async function enterFullscreen(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  if (isFullscreen()) return true;

  const target = (document.documentElement || document.body) as HTMLElement & {
    requestFullscreen?: (opts?: { navigationUI?: string }) => Promise<void>;
    webkitRequestFullscreen?: () => Promise<void> | void;
    webkitRequestFullScreen?: () => Promise<void> | void;
    mozRequestFullScreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
  };

  collapseMobileBars();

  try {
    if (typeof target.requestFullscreen === 'function') {
      try {
        await target.requestFullscreen({ navigationUI: 'hide' });
        collapseMobileBars();
        return true;
      } catch {
        // En cas de rejet avec navigationUI, réessayer sans options
        try {
          await target.requestFullscreen();
          collapseMobileBars();
          return true;
        } catch {
          // Échec du plein écran standard
        }
      }
    } else if (typeof target.webkitRequestFullscreen === 'function') {
      await target.webkitRequestFullscreen();
      collapseMobileBars();
      return true;
    } else if (typeof target.webkitRequestFullScreen === 'function') {
      await target.webkitRequestFullScreen();
      collapseMobileBars();
      return true;
    }
  } catch {
    // Ignoré si rejeté (ex: hors geste utilisateur)
  }

  // Sans API plein écran DOM, conserver les dimensions visibles du navigateur.
  collapseMobileBars();
  return false;
}

/** Demande le plein écran puis le paysage lorsque le navigateur les permet. */
export async function forceLandscapeAndFullscreen(): Promise<void> {
  await enterFullscreen();
  await lockLandscape();
  collapseMobileBars();
}

class DeviceTracker {
  mode: InputMode = 'keyboard';
  private forced: InputMode | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly fsListeners = new Set<FullscreenListener>();
  private initialized = false;

  init(): void {
    if (typeof window === 'undefined' || this.initialized) return;
    this.initialized = true;
    const q = new URLSearchParams(location.search).get('input');
    if (q === 'touch' || q === 'gamepad' || q === 'keyboard') this.forced = q;
    this.mode = this.forced ?? (isTouchDevice() ? 'touch' : 'keyboard');
    this.reflect();
    syncViewport();
    window.addEventListener('resize', syncViewport, { passive: true });
    window.visualViewport?.addEventListener('resize', syncViewport, { passive: true });
    window.addEventListener('pageshow', syncViewport);

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
        } else if (e.pointerType === 'mouse' && this.mode !== 'touch') {
          this.set('keyboard');
        }
      },
      true,
    );

    // Détection des changements de plein écran pour synchroniser l'icône et l'interface
    const onFs = () => this.notifyFullscreen();
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);

    window.addEventListener('gamepadconnected', () => {
      this.set('gamepad');
    });
  }

  notifyFullscreen(fs: boolean = isFullscreen()): void {
    for (const fn of this.fsListeners) fn(fs);
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

  onFullscreenChange(fn: FullscreenListener): () => void {
    this.fsListeners.add(fn);
    return () => this.fsListeners.delete(fn);
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
