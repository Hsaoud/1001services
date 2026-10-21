/**
 * Commandes tactiles pour mobile (téléphone, tablette).
 * - Joystick flottant sous le pouce gauche.
 * - Bouton d'action contextuel sous le pouce droit (Servir, Prendre, Ouvrir, Sonner).
 * - Bouton Pas Chassé (Dash) avec charges et jauge de recharge.
 * - Bouton Vue du salon (Radar) et barre supérieure (Pause, Plein écran).
 * - Binds tactiles directs sur les Anneaux Royaux et la Mini-carte.
 */
import type { Input } from '../core/input';
import { device, fullscreenAvailable, isFullscreen, toggleFullscreen } from '../core/device';
import type { World } from '../game/world';
import { ICON } from './icons';

const STICK_RADIUS = 0.95;
const STICK_DEAD = 0.12;

export class TouchControls {
  readonly el: HTMLElement;
  readonly topBar: HTMLElement;

  private input: Input | null = null;
  private zone: HTMLElement;
  private base: HTMLElement;
  private knob: HTMLElement;

  private actBtn: HTMLButtonElement;
  private actLabel: HTMLElement;
  private dashBtn: HTMLButtonElement;
  private dashPips: HTMLElement;
  private radarBtn: HTMLButtonElement;
  private fullBtn: HTMLButtonElement;
  private pauseBtn: HTMLButtonElement;

  private stickId = -1;
  private cx = 0;
  private cy = 0;

  private lastActLabel = '';
  private lastActState = false;
  private lastCharges = -1;
  private lastMaxCharges = -1;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'dz-touch-layer dz-off';

    // ── Zone du joystick flottant (moitié gauche de l'écran)
    this.zone = document.createElement('div');
    this.zone.className = 'dz-stick-zone';

    this.base = document.createElement('div');
    this.base.className = 'dz-stick';

    this.knob = document.createElement('div');
    this.knob.className = 'dz-stick-knob';
    this.base.appendChild(this.knob);

    this.el.appendChild(this.zone);
    this.el.appendChild(this.base);

    this.zone.addEventListener('pointerdown', (e) => this.onStickDown(e));
    this.zone.addEventListener('pointermove', (e) => this.onStickMove(e));
    const end = (e: PointerEvent) => this.onStickUp(e);
    this.zone.addEventListener('pointerup', end);
    this.zone.addEventListener('pointercancel', end);
    this.zone.addEventListener('lostpointercapture', end);

    // ── Boutons d'action (moitié droite, bas)
    const actions = document.createElement('div');
    actions.className = 'dz-tactions';

    // Bouton Vue / Radar
    this.radarBtn = document.createElement('button');
    this.radarBtn.type = 'button';
    this.radarBtn.className = 'dz-tbtn dz-tbtn-radar';
    this.radarBtn.setAttribute('aria-label', 'Vue du salon');
    this.radarBtn.innerHTML = `
      <span class="dz-tbtn-ico"><svg viewBox="0 0 24 24" class="dz-radar-svg"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 3v18M3 12h18" stroke="currentColor" stroke-width="1.2" opacity=".7"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M12 12l5-5" stroke="#f6d38c" stroke-width="2" stroke-linecap="round"/></svg></span>
      <span class="dz-tbtn-label">Vue</span>
    `;
    this.bindAction(this.radarBtn, 'radar');
    actions.appendChild(this.radarBtn);

    // Bouton d'action contextuel (Servir / Prendre / Ouvrir / Sonner)
    this.actBtn = document.createElement('button');
    this.actBtn.type = 'button';
    this.actBtn.className = 'dz-tbtn dz-tbtn-act is-idle';
    this.actBtn.setAttribute('aria-label', 'Action');
    this.actBtn.innerHTML = `
      <span class="dz-tbtn-glow"></span>
      <span class="dz-tbtn-ico">${ICON.plate}</span>
      <span class="dz-tbtn-label">Action</span>
    `;
    this.actLabel = this.actBtn.querySelector('.dz-tbtn-label') as HTMLElement;
    this.bindAction(this.actBtn, 'interact');
    actions.appendChild(this.actBtn);

    // Bouton Pas Chassé (Dash)
    this.dashBtn = document.createElement('button');
    this.dashBtn.type = 'button';
    this.dashBtn.className = 'dz-tbtn dz-tbtn-dash';
    this.dashBtn.setAttribute('aria-label', 'Pas Chassé');
    this.dashBtn.innerHTML = `
      <span class="dz-tbtn-ico"><svg viewBox="0 0 24 24"><path d="M4 17l6-6-6-6M11 17l6-6-6-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      <span class="dz-tbtn-label">Dash</span>
      <div class="dz-tbtn-pips"></div>
    `;
    this.dashPips = this.dashBtn.querySelector('.dz-tbtn-pips') as HTMLElement;
    this.bindAction(this.dashBtn, 'dash');
    actions.appendChild(this.dashBtn);

    this.el.appendChild(actions);

    // ── Barre d'accès rapide supérieure (Pause, Plein écran)
    this.topBar = document.createElement('div');
    this.topBar.className = 'dz-ttop-bar';

    this.pauseBtn = document.createElement('button');
    this.pauseBtn.type = 'button';
    this.pauseBtn.className = 'dz-tbtn-small dz-tbtn-pause';
    this.pauseBtn.setAttribute('aria-label', 'Pause');
    this.pauseBtn.innerHTML = `
      <svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>
    `;
    this.bindAction(this.pauseBtn, 'pause');
    this.topBar.appendChild(this.pauseBtn);

    const ICON_FULL = `<svg viewBox="0 0 24 24"><path d="M3 9V4h5M21 9V4h-5M3 15v5h5M21 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const ICON_EXIT = `<svg viewBox="0 0 24 24"><path d="M9 3v5H4M15 3v5h5M9 21v-5H4M15 21v-5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    this.fullBtn = document.createElement('button');
    this.fullBtn.type = 'button';
    this.fullBtn.className = 'dz-tbtn-small dz-tbtn-full';
    this.fullBtn.setAttribute('aria-label', 'Plein écran');
    this.fullBtn.innerHTML = ICON_FULL;

    const refreshFullBtn = (fs: boolean = isFullscreen()) => {
      this.fullBtn.innerHTML = fs ? ICON_EXIT : ICON_FULL;
      this.fullBtn.setAttribute('aria-label', fs ? 'Quitter le plein écran' : 'Plein écran');
      this.fullBtn.classList.toggle('is-active', fs);
    };

    device.onFullscreenChange(refreshFullBtn);

    const onFullAction = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFullscreen();
      refreshFullBtn();
    };
    this.fullBtn.addEventListener('click', onFullAction);

    if (!fullscreenAvailable()) {
      this.fullBtn.classList.add('dz-hidden');
    }
    this.topBar.appendChild(this.fullBtn);

    this.el.appendChild(this.topBar);
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => this.release());
    window.addEventListener('orientationchange', () => this.release());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.release(); });
    device.subscribe(mode => { if (mode !== 'touch') this.release(); });
  }

  attach(input: Input): void {
    this.input = input;
  }

  show(on: boolean): void {
    this.el.classList.toggle('dz-off', !on);
    if (!on) {
      this.release();
    }
  }

  /** Rend les emplacements d'anneaux et la minimap directement cliquables / touchables sur mobile. */
  bindHud(hudEl: HTMLElement): void {
    hudEl.addEventListener('pointerdown', (e) => {
      const ringSlot = (e.target as HTMLElement).closest('.dz-ringslot') as HTMLElement | null;
      if (ringSlot && this.input) {
        e.preventDefault();
        e.stopPropagation();
        ringSlot.classList.add('dz-press');
        setTimeout(() => ringSlot.classList.remove('dz-press'), 120);

        const parent = ringSlot.parentElement;
        if (parent) {
          const index = Array.from(parent.children).indexOf(ringSlot);
          if (index >= 0 && index < 4) {
            const ringAction = (['ring1', 'ring2', 'ring3', 'ring4'] as const)[index];
            this.input.press(ringAction);
            device.vibrate(20);
          }
        }
        return;
      }

      const minimap = (e.target as HTMLElement).closest('.dz-minimap') as HTMLElement | null;
      if (minimap && this.input) {
        e.preventDefault();
        e.stopPropagation();
        this.input.press('radar');
        device.vibrate(15);
      }
    });
  }

  private bindAction(btn: HTMLElement, action: 'interact' | 'dash' | 'radar' | 'pause'): void {
    let lastPointer = -Infinity;
    const activate = () => {
      this.input?.press(action);
      device.vibrate(action === 'dash' ? 25 : 15);
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.classList.add('is-press');
      lastPointer = performance.now();
      activate();
    });
    // VoiceOver and keyboard activation can send click without pointerdown.
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.detail === 0 || performance.now() - lastPointer > 500) activate();
    });

    const up = () => btn.classList.remove('is-press');
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
  }

  // ── Joystick virtuel

  private radius(): number {
    const tb = parseFloat(getComputedStyle(this.el).getPropertyValue('--tb')) || 68;
    return tb * STICK_RADIUS;
  }

  private onStickDown(e: PointerEvent): void {
    if (this.stickId >= 0) return;
    e.preventDefault();
    this.stickId = e.pointerId;
    try {
      this.zone.setPointerCapture(e.pointerId);
    } catch {
      // Ignoré si capture non supportée
    }
    this.cx = e.clientX;
    this.cy = e.clientY;
    this.base.style.left = `${this.cx}px`;
    this.base.style.top = `${this.cy}px`;
    this.base.classList.add('is-on');
    this.knob.style.transform = 'translate(-50%, -50%)';
  }

  private onStickMove(e: PointerEvent): void {
    if (e.pointerId !== this.stickId) return;
    e.preventDefault();
    const R = this.radius();
    let dx = e.clientX - this.cx;
    let dy = e.clientY - this.cy;
    const d = Math.hypot(dx, dy);

    // Suivi doux du pouce si on dépasse le rayon
    if (d > R * 1.5) {
      const k = (d - R * 1.5) / d;
      this.cx += dx * k;
      this.cy += dy * k;
      this.base.style.left = `${this.cx}px`;
      this.base.style.top = `${this.cy}px`;
      dx = e.clientX - this.cx;
      dy = e.clientY - this.cy;
    }

    const dd = Math.hypot(dx, dy);
    const m = Math.min(1, dd / R);
    const ux = dd > 0 ? dx / dd : 0;
    // En coordonnées écran, +Y va vers le bas. Pour le jeu, +Y va vers le haut.
    const uy = dd > 0 ? -dy / dd : 0;

    const v = m < STICK_DEAD ? 0 : (m - STICK_DEAD) / (1 - STICK_DEAD);
    this.knob.style.transform = `translate(calc(-50% + ${ux * m * R}px), calc(-50% + ${-uy * m * R}px))`;
    this.input?.setStick(ux * v, uy * v);
  }

  private onStickUp(e: PointerEvent): void {
    if (e.pointerId !== this.stickId) return;
    this.stickId = -1;
    this.base.classList.remove('is-on');
    this.input?.setStick(0, 0);
  }

  release(): void {
    this.stickId = -1;
    this.base.classList.remove('is-on');
    this.input?.setStick(0, 0);
    this.input?.clear();
    this.el.querySelectorAll('.is-press').forEach(btn => btn.classList.remove('is-press'));
  }

  // ── Synchronisation par frame avec le monde

  update(world: World): void {
    // Bouton d'action contextuel
    const fa = world.getFocusAction();
    if (fa.label !== this.lastActLabel || fa.active !== this.lastActState) {
      this.lastActLabel = fa.label;
      this.lastActState = fa.active;
      this.actLabel.textContent = fa.label;
      this.actBtn.setAttribute('aria-label', fa.label);
      this.actBtn.classList.toggle('is-idle', !fa.active);
      this.actBtn.classList.toggle('is-active', fa.active);
    }

    // Bouton Dash et ses pips
    const p = world.player;
    const max = Math.max(1, Math.round(p.stats.dashCharges));
    const ch = Math.max(0, Math.min(max, p.dashCharges));
    if (ch !== this.lastCharges || max !== this.lastMaxCharges) {
      this.lastCharges = ch;
      this.lastMaxCharges = max;
      this.dashPips.textContent = '';
      for (let i = 0; i < max; i++) {
        const pip = document.createElement('i');
        if (i < ch) pip.className = 'is-full';
        this.dashPips.appendChild(pip);
      }
      this.dashBtn.classList.toggle('is-empty', ch === 0);
    }
  }
}
