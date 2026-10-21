/** Fabrique des obstacles vivants (un module par type, base commune dans base.ts). */
import type { NpcKind } from '../../../types';
import type { HazardCtx } from '../context';
import type { Agent } from './base';
import { Bride } from './bride';
import { Cart } from './cart';
import { Chatty } from './chatty';
import { Child } from './child';
import { Critic } from './critic';
import { Influencer } from './influencer';
import { Poodle } from './poodle';
import { Polisher } from './polisher';
import { Waiter } from './waiter';
import { Waltz } from './waltz';

export type { Agent, Body, AgentPhase } from './base';
export { Hungry, HUNGRY_RADIUS, HUNGRY_WARN } from './hungry';
export { Critic, CRITIC_AURA } from './critic';

/**
 * Crée un obstacle du plan. `null` si impossible (plus de siège pour un bavard)
 * ou pour les affamés, qui ne viennent que du piège de cloche.
 */
export function createAgent(ctx: HazardCtx, kind: NpcKind, regular = true): Agent | null {
  switch (kind) {
    case 'waiter':
      return new Waiter(ctx, regular);
    case 'chatty': {
      const seat = ctx.claimSeat();
      return seat ? new Chatty(ctx, seat, regular) : null;
    }
    case 'cart':
      return new Cart(ctx, regular);
    case 'poodle':
      return new Poodle(ctx, regular);
    case 'influencer':
      return new Influencer(ctx, regular);
    case 'hungry':
      return null;
    case 'child':
      return new Child(ctx, regular);
    case 'polisher':
      return new Polisher(ctx, regular);
    case 'bride':
      return new Bride(ctx, regular);
    case 'critic':
      return new Critic(ctx, regular);
    case 'waltz':
      return new Waltz(ctx, regular);
  }
}
