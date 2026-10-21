/**
 * Entrées clavier (codes physiques : ZQSD sur AZERTY = WASD sur QWERTY) et manette.
 * Le jeu lit un état continu (déplacement) et des fronts « pressé cette image » (actions).
 */

export type Action = 'interact' | 'dash' | 'radar' | 'ring1' | 'ring2' | 'ring3' | 'ring4' | 'pause';

const KEYMAP: Record<string, Action> = {
  KeyE: 'interact',
  Enter: 'interact',
  NumpadEnter: 'interact',
  Space: 'dash',
  ShiftLeft: 'dash',
  ShiftRight: 'dash',
  Tab: 'radar',
  Digit1: 'ring1',
  Digit2: 'ring2',
  Digit3: 'ring3',
  Digit4: 'ring4',
  Numpad1: 'ring1',
  Numpad2: 'ring2',
  Numpad3: 'ring3',
  Numpad4: 'ring4',
  Escape: 'pause',
  KeyP: 'pause',
};

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

/** Boutons manette (mapping standard). */
const PAD_ACTIONS: [number, Action][] = [
  [0, 'interact'], // A
  [1, 'dash'], // B
  [5, 'dash'], // RB
  [7, 'dash'], // RT
  [3, 'radar'], // Y
  [8, 'radar'], // Back
  [12, 'ring1'], // D-pad haut
  [15, 'ring2'], // droite
  [13, 'ring3'], // bas
  [14, 'ring4'], // gauche
  [9, 'pause'], // Start
];

export class Input {
  private held = new Set<string>();
  private pressed = new Set<Action>();
  private padPrev = new Map<number, boolean>();
  private padMove = { x: 0, y: 0 };
  private padHeld = new Set<Action>();
  private stickX = 0;
  private stickY = 0;
  private vpress = new Set<Action>();
  /** Le jeu capte les touches (Tab, Espace…) : seulement pendant le service. */
  capture = false;

  constructor(target?: Window) {
    const t = target ?? (typeof window !== 'undefined' ? window : null);
    if (t) {
      t.addEventListener('keydown', (e) => {
        if (this.capture && (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault();
        if (e.repeat) return;
        this.held.add(e.code);
        const a = KEYMAP[e.code];
        if (a) this.pressed.add(a);
      });
      t.addEventListener('keyup', (e) => {
        this.held.delete(e.code);
      });
      t.addEventListener('blur', () => {
        this.held.clear();
        this.stickX = 0;
        this.stickY = 0;
      });
    }
  }

  /** Définit la direction du joystick tactile virtuel (x droite, y haut). */
  setStick(x: number, y: number): void {
    this.stickX = Math.max(-1, Math.min(1, x));
    this.stickY = Math.max(-1, Math.min(1, y));
  }

  /** Enregistre l'appui sur un bouton tactile ou virtuel. */
  press(a: Action): void {
    this.pressed.add(a);
    this.vpress.add(a);
  }

  /** À appeler une fois par image avant de lire l'état. */
  poll(): void {
    this.padMove.x = 0;
    this.padMove.y = 0;
    this.padHeld.clear();
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      const mag = Math.hypot(ax, ay);
      if (mag > 0.22) {
        const k = Math.min(1, (mag - 0.22) / 0.7) / mag;
        this.padMove.x = ax * k;
        this.padMove.y = -ay * k;
      }
      for (const [btn, action] of PAD_ACTIONS) {
        const down = !!pad.buttons[btn]?.pressed;
        const key = pad.index * 100 + btn;
        if (down) this.padHeld.add(action);
        if (down && !this.padPrev.get(key)) this.pressed.add(action);
        this.padPrev.set(key, down);
      }
      break;
    }
  }

  /** Direction de déplacement « écran » : x = droite, y = haut, norme ≤ 1. */
  move(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    for (const code of this.held) {
      const m = MOVE_KEYS[code];
      if (m) {
        x += m[0];
        y += m[1];
      }
    }
    x = Math.max(-1, Math.min(1, x));
    y = Math.max(-1, Math.min(1, y));
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    if (len === 0 && (this.padMove.x !== 0 || this.padMove.y !== 0)) return { ...this.padMove };
    if (len === 0 && (this.stickX !== 0 || this.stickY !== 0)) return { x: this.stickX, y: this.stickY };
    return { x, y };
  }

  /** Vrai si l'action a été déclenchée depuis la dernière consommation. */
  take(a: Action): boolean {
    if (this.pressed.has(a)) {
      this.pressed.delete(a);
      this.vpress.delete(a);
      return true;
    }
    return false;
  }

  /** Action maintenue (clavier, manette ou tactile). */
  isHeld(a: Action): boolean {
    if (this.padHeld.has(a) || this.vpress.has(a)) return true;
    for (const [code, act] of Object.entries(KEYMAP)) if (act === a && this.held.has(code)) return true;
    return false;
  }

  /** Oublie les appuis en attente (changement d'écran). */
  clear(): void {
    this.pressed.clear();
    this.vpress.clear();
  }
}
