/** Chariot à pâtisseries : large et lent, roule d'un bout à l'autre de son couloir sans jamais s'arrêter en route. */
import type { HazardCtx } from '../context';
import type { LaneTuning } from './lane';
import { LaneRunner } from './lane';

export const CART_TUNING: LaneTuning = {
  speed: [2.2, 3],
  radius: 0.6,
  pause: [0.6, 1.2],
  warn: 0.85,
  damage: 35,
  knockback: 7,
  action: 'roll',
  departSfx: 'cart_roll',
  switchChance: 0,
  teleWidth: 1.35,
  walkDamage: 0,
};

export class Cart extends LaneRunner {
  constructor(ctx: HazardCtx, regular = true) {
    super(ctx, 'cart', regular, CART_TUNING);
  }
}
