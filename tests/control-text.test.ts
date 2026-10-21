import { describe, expect, it } from 'vitest';
import { levelPlan } from '../src/data/progression';
import { INTROS } from '../src/data/bestiary';
import { controlText } from '../src/ui/control-text';

describe('touch instruction copy', () => {
  const instructions = [...Array.from({ length: 10 }, (_, i) => levelPlan(i + 1).tips).flat(), ...INTROS.map(i => i.tip)];
  it('replaces every keyboard command in tutorial and novelty instructions', () => {
    for (const text of instructions) expect(controlText(text, 'touch')).not.toMatch(/\bE\b|Espace|\bMaj\b|\bTab\b/);
  });
  it('preserves the desktop instructions', () => {
    for (const text of instructions) expect(controlText(text, 'keyboard')).toBe(text);
  });
  it('uses the same button labels as the touch controls', () => {
    expect(controlText('appuyez sur E', 'touch')).toBe('touchez le bouton Action');
    expect(controlText('Tab : agrandir la carte.', 'touch')).toBe('Touchez Vue pour agrandir la carte.');
  });
});
