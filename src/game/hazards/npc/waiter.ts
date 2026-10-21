/** Serveur débordé : glisse tout droit sur un couloir, plateau en avant (télégraphe crème avant le départ). */
import type { HazardCtx } from '../context';
import type { LaneTuning } from './lane';
import { LaneRunner } from './lane';

export const WAITER_TUNING: LaneTuning = {
  speed: [5.5, 7],
  radius: 0.4,
  pause: [1.5, 3],
  warn: 0.85,
  damage: 25,
  knockback: 6,
  action: 'slide',
  departSfx: null,
  switchChance: 0.35,
  teleWidth: 0.95,
  walkDamage: 10,
};

export class Waiter extends LaneRunner {
  constructor(ctx: HazardCtx, regular = true) {
    super(ctx, 'waiter', regular, WAITER_TUNING);
  }
}
