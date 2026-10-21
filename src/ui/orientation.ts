/**
 * Garde d'orientation : force le mode paysage sur Android et iPhone / iPad.
 * - Sur Android : tente le verrouillage matériel via screen.orientation.lock('landscape').
 * - Sur iPhone / iOS Safari (où l'API de verrouillage est bloquée par le navigateur) et en mode portrait :
 *   affiche un écran d'invitation au pivotement avec animation, bloquant les contrôles
 *   jusqu'à ce que l'appareil soit tourné à l'horizontale.
 */
import { collapseMobileBars, enterFullscreen, forceLandscapeAndFullscreen, isFullscreen, isPortrait, isTouchDevice, lockLandscape } from '../core/device';

export class OrientationGuard {
  readonly el: HTMLElement;
  private onPortraitChange?: (inPortrait: boolean) => void;
  private active = false;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'dz-orientation-guard dz-off';
    this.el.setAttribute('aria-live', 'polite');

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
        <button type="button" class="dz-btn dz-btn-gold dz-og-lockbtn">
          <span class="dz-btn-txt">Tourner en Paysage</span>
        </button>
      </div>
    `;

    const btn = this.el.querySelector('.dz-og-lockbtn') as HTMLButtonElement | null;
    btn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await forceLandscapeAndFullscreen();
    });

    // Toucher sur l'écran d'orientation pour forcer le verrouillage paysage et plein écran
    this.el.addEventListener('click', async (e) => {
      if ((e.target as HTMLElement).closest('.dz-og-lockbtn')) return;
      await forceLandscapeAndFullscreen();
    });

    // Écoute des changements d'orientation et redimensionnement
    const check = () => this.check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    if (typeof screen !== 'undefined' && screen.orientation) {
      screen.orientation.addEventListener('change', check);
    }

    // Sur mobile en paysage, forcer le plein écran dès le premier geste tactile valide (click / touchend)
    const tryFullscreenOnTouch = () => {
      if (!isPortrait() && isTouchDevice()) {
        if (!isFullscreen()) {
          void enterFullscreen();
        } else {
          collapseMobileBars();
        }
      }
    };
    window.addEventListener('click', tryFullscreenOnTouch, { capture: true, passive: true });
    window.addEventListener('touchend', tryFullscreenOnTouch, { capture: true, passive: true });

    this.check();
  }

  setCallback(fn: (inPortrait: boolean) => void): void {
    this.onPortraitChange = fn;
  }

  check(): boolean {
    if (typeof window === 'undefined') return false;
    const touch = isTouchDevice();
    const portrait = isPortrait();
    // Sur desktop, une fenêtre haute et étroite n'est pas un smartphone, sauf si forcée par ?input=touch
    const shouldBlock = touch && portrait;

    if (shouldBlock !== this.active) {
      const wasActive = this.active;
      this.active = shouldBlock;
      this.el.classList.toggle('dz-off', !shouldBlock);
      this.el.classList.toggle('is-visible', shouldBlock);
      if (shouldBlock) {
        void lockLandscape();
      } else if (wasActive && touch) {
        // Sortie du mode portrait -> passage en paysage : replier immédiatement l'en-tête du navigateur
        collapseMobileBars();
        void lockLandscape();
      }
      this.onPortraitChange?.(shouldBlock);
    }
    return shouldBlock;
  }
}
