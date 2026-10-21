/**
 * Cloches en argent et sonnettes dorées sur les guéridons : bonus (plat doré, objet, pourboire…) ou pièges.
 */
import type { ClocheState, ClocheViewState, LevelPlan, PedestalSpec, TrapKind } from '../types';
import type { Rng } from '../core/rng';

export type ClocheContent =
  | { kind: 'trap'; trap: TrapKind }
  | { kind: 'golden' } // plat doré
  | { kind: 'item' } // objet d'équipement
  | { kind: 'tip' } // pourboire direct
  | { kind: 'patience' } // mignardises offertes : patience des tables
  | { kind: 'dash' }; // recharge du Pas Chassé

export interface Cloche {
  pedestal: PedestalSpec;
  state: ClocheState;
  t: number; // temps dans l'état (s)
  golden: boolean;
  content: ClocheContent | null;
  highlight: number;
}

const APPEAR = 0.55;
const OPEN = 0.7;
const GONE = 0.6;

export class Cloches {
  readonly list: Cloche[];
  private timer: number;
  private readonly maxPresent: number;

  constructor(
    private plan: LevelPlan,
    pedestals: PedestalSpec[],
    private rng: Rng,
  ) {
    this.list = pedestals.map((p) => ({ pedestal: p, state: 'hidden', t: 0, golden: false, content: null, highlight: 0 }));
    this.timer = Number.isFinite(plan.clocheInterval) ? Math.min(6, plan.clocheInterval * 0.4) : Infinity;
    this.maxPresent = Math.max(1, Math.ceil(pedestals.length / 2));
  }

  update(dt: number, trapsAllowed: boolean): void {
    for (const c of this.list) {
      c.t += dt;
      if (c.state === 'appearing' && c.t >= APPEAR) this.set(c, 'idle');
      else if (c.state === 'opening' && c.t >= OPEN) this.set(c, 'gone');
      else if (c.state === 'gone' && c.t >= GONE) this.set(c, 'hidden');
    }
    if (!this.list.length || !Number.isFinite(this.timer)) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.plan.clocheInterval * this.rng.range(0.7, 1.3);
    const present = this.list.filter((c) => c.state === 'appearing' || c.state === 'idle').length;
    if (present >= this.maxPresent) return;
    const free = this.list.filter((c) => c.state === 'hidden');
    if (!free.length) return;
    const c = this.rng.pick(free);
    c.golden = this.rng.chance(0.15);
    c.content = this.roll(c.golden, trapsAllowed);
    this.set(c, 'appearing');
  }

  private roll(golden: boolean, trapsAllowed: boolean): ClocheContent {
    if (!golden && trapsAllowed && this.plan.traps.length && this.rng.chance(this.plan.trapChance)) {
      // Le piège le plus récent est un peu plus fréquent (pour qu'on le découvre).
      const traps = this.plan.traps;
      const w = traps.map((_, i) => (i === traps.length - 1 ? 2 : 1));
      return { kind: 'trap', trap: this.rng.weighted(traps, w) };
    }
    return this.rng.weighted<ClocheContent>(
      [{ kind: 'golden' }, { kind: 'item' }, { kind: 'tip' }, { kind: 'patience' }, { kind: 'dash' }],
      [45, golden ? 22 : 14, 20, 11, 10],
    );
  }

  private set(c: Cloche, s: ClocheState): void {
    c.state = s;
    c.t = 0;
  }

  /** Ouvre la cloche (si elle est prête) et renvoie son contenu. */
  open(c: Cloche): ClocheContent | null {
    if (c.state !== 'idle' || !c.content) return null;
    const content = c.content;
    c.content = null;
    this.set(c, 'opening');
    return content;
  }

  /** Les pièges en attente se désamorcent (Tournée Générale). */
  defuse(): void {
    for (const c of this.list) if (c.content?.kind === 'trap') c.content = { kind: 'tip' };
  }

  view(c: Cloche, out: ClocheViewState): ClocheViewState {
    out.state = c.state;
    const dur = c.state === 'appearing' ? APPEAR : c.state === 'opening' ? OPEN : c.state === 'gone' ? GONE : 1;
    out.t = Math.min(1, c.t / dur);
    out.golden = c.golden;
    out.highlight = c.highlight;
    return out;
  }
}
