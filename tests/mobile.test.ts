import { describe, expect, it } from 'vitest';
import { Input } from '../src/core/input';
import { device } from '../src/core/device';

describe('mobile & virtual input', () => {
  it('transmet les mouvements du joystick tactile virtuel', () => {
    const input = new Input();
    input.setStick(0.8, -0.6);
    const m = input.move();
    expect(m.x).toBeCloseTo(0.8);
    expect(m.y).toBeCloseTo(-0.6);

    input.setStick(0, 0);
    const stop = input.move();
    expect(stop.x).toBe(0);
    expect(stop.y).toBe(0);
  });

  it('enregistre et consomme les boutons virtuels tactiles', () => {
    const input = new Input();
    expect(input.take('dash')).toBe(false);

    input.press('dash');
    expect(input.take('dash')).toBe(true);
    // Consommé
    expect(input.take('dash')).toBe(false);

    input.press('interact');
    expect(input.isHeld('interact')).toBe(true);
    expect(input.take('interact')).toBe(true);
    expect(input.isHeld('interact')).toBe(false);
  });

  it('gère le basculement de mode de saisie', () => {
    device.set('touch');
    expect(device.mode).toBe('touch');

    device.set('keyboard');
    expect(device.mode).toBe('keyboard');
  });
});
