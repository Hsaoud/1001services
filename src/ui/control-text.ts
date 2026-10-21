import { device, type InputMode } from '../core/device';

/** Adapt tutorial copy as well as key badges: no keyboard commands in touch instructions. */
export function controlText(text: string, mode: InputMode = device.mode): string {
  if (mode !== 'touch') return text;
  return text
    .replace(/Espace \(ou Maj\) pour Dasher/g, 'Touchez Dash pour accélérer')
    .replace(/Espace ou Maj\s*:/g, 'Touchez Dash :')
    .replace(/appuyez sur E/g, 'touchez le bouton Action')
    .replace(/avec E/g, 'avec le bouton Action')
    .replace(/\(E\)/g, '(bouton Action)')
    .replace(/Tab\s*:\s*agrandir/g, 'Touchez Vue pour agrandir');
}
