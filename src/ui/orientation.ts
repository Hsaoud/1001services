/**
 * Garde d'orientation : le service nécessite un viewport paysage.
 * - Sur Android : tente le verrouillage matériel via screen.orientation.lock('landscape').
 * - Sur iPhone / iOS Safari (où l'API de verrouillage est bloquée par le navigateur) et en mode portrait :
 *   affiche un écran d'invitation au pivotement avec animation, bloquant les contrôles
 *   jusqu'à ce que l'appareil soit tourné à l'horizontale.
 */
import { forceLandscapeAndFullscreen, fullscreenAvailable, isHandheld, isIOS, isPortrait, syncViewport } from '../core/device';

export class OrientationGuard {
  readonly el: HTMLElement;
  private onPortraitChange?: (inPortrait: boolean) => void;
  private active = false;
  private settleTimer = 0;
  private previousFocus: HTMLElement | null = null;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'dz-orientation-guard dz-off';
    this.el.setAttribute('aria-live', 'polite');
    this.el.setAttribute('role', 'alertdialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-label', 'Tournez votre appareil en paysage');
    const orientation = window.screen?.orientation as (ScreenOrientation & { lock?: unknown }) | undefined;
    const nativeRotation = fullscreenAvailable() && typeof orientation?.lock === 'function';

    this.el.innerHTML = `
      <div class="dz-og-card dz-paper">
        <div class="dz-og-anim">
          <svg class="dz-og-phone" viewBox="0 0 64 64" aria-hidden="true">
            <rect class="dz-og-body" x="18" y="8" width="28" height="48" rx="5" fill="#fbf3e8" stroke="#8a6420" stroke-width="2.5" />
            <circle class="dz-og-notch" cx="32" cy="14" r="1.5" fill="#8a6420" />
            <line class="dz-og-bar" x1="26" y1="50" x2="38" y2="50" stroke="#8a6420" stroke-width="2" stroke-linecap="round" />
            <path class="dz-og-arrow" d="M48 20 A 20 20 0 0 1 52 44 L 56 40 M 52 44 L 46 42" fill="none" stroke="#c0506a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
        <div class="dz-og-crown">
          <svg viewBox="0 0 40 20" class="dz-gold-svg" aria-hidden="true">
            <path d="M4 16 L2 4 L12 9 L20 2 L28 9 L38 4 L36 16 Z" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width="1" />
          </svg>
        </div>
        <h2 class="dz-og-title">Mode Paysage Requis</h2>
        <p class="dz-og-desc">
          Pour servir avec toute l'élégance requise à La Duchesse, veuillez faire pivoter votre appareil à l'horizontale.
        </p>
        ${isIOS() ? '<p class="dz-og-help">Si l’écran ne pivote pas, désactivez le verrouillage de rotation dans le Centre de contrôle de votre iPhone ou iPad.</p>' : ''}
        <button type="button" class="dz-btn dz-btn-gold dz-og-lockbtn">
          <span class="dz-btn-txt">${nativeRotation ? 'Activer le paysage' : 'Vérifier l’orientation'}</span>
        </button>
      </div>
    `;

    const btn = this.el.querySelector('.dz-og-lockbtn') as HTMLButtonElement | null;
    btn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (nativeRotation) await forceLandscapeAndFullscreen();
      this.check();
    });

    // iOS can fire orientationchange before resizing the page. Recheck after layout settles.
    const check = () => {
      this.check();
      requestAnimationFrame(() => this.check());
      window.clearTimeout(this.settleTimer);
      this.settleTimer = window.setTimeout(() => this.check(), 300);
    };
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    window.visualViewport?.addEventListener('resize', check);
    window.matchMedia?.('(orientation: portrait)').addEventListener?.('change', check);
    window.addEventListener('pageshow', check);
    document.addEventListener('visibilitychange', check);
    if (typeof screen !== 'undefined' && screen.orientation) {
      screen.orientation.addEventListener?.('change', check);
    }

    this.check();
  }

  setCallback(fn: (inPortrait: boolean) => void): void {
    this.onPortraitChange = fn;
    fn(this.active);
    if (this.active) this.el.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }

  check(): boolean {
    if (typeof window === 'undefined') return false;
    syncViewport();
    const touch = isHandheld();
    const portrait = isPortrait();
    // Sur desktop, une fenêtre haute et étroite n'est pas un smartphone, sauf si forcée par ?input=touch
    const shouldBlock = touch && portrait;

    if (shouldBlock !== this.active) {
      if (shouldBlock) this.previousFocus = document.activeElement as HTMLElement | null;
      this.active = shouldBlock;
      this.el.classList.toggle('dz-off', !shouldBlock);
      this.el.classList.toggle('is-visible', shouldBlock);
      this.onPortraitChange?.(shouldBlock);
      if (shouldBlock) this.el.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
      else if (this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
    }
    this.el.setAttribute('aria-hidden', String(!shouldBlock));
    return shouldBlock;
  }
}
