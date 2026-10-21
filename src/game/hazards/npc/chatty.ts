/**
 * Client bavard : assis à une table (pas de vue propre — le client appartient à la vue de table),
 * il fait frémir sa chaise puis la recule brusquement dans l'allée.
 */
import type { TelegraphHandle } from '../api';
import type { HazardCtx, SeatSlot } from '../context';
import { clamp01, easeOutCubic, line, segProject } from '../util';
import { Agent } from './base';

type ChattyState = 'rest' | 'warn' | 'push' | 'hold' | 'back';

/** Recul maximal de la chaise (u) quand `chairPush` = 1. */
const PUSH_DIST = 0.7;
const PUSH_TIME = 0.15;
const HOLD_TIME = 1.6;
const BACK_TIME = 0.6;

export class Chatty extends Agent {
  readonly seat: SeatSlot;
  private state: ChattyState = 'rest';
  private timer = 0;
  private dur = 1;
  private push = 0;
  private sent = -1;
  private tele: TelegraphHandle | null = null;
  private released = false;

  constructor(ctx: HazardCtx, seat: SeatSlot, regular = true) {
    super(ctx, 'chatty', regular);
    this.seat = seat;
    this.showOnMap = false;
    this.fadeIn = 0.01;
    this.rest(ctx.rng.range(2, 6));
  }

  private rest(d?: number): void {
    this.state = 'rest';
    this.timer = 0;
    this.dur = d ?? this.ctx.rng.range(4, 9);
  }

  /** Zone balayée par la chaise reculée (du siège jusqu'au dossier reculé). */
  private sweep(): { ax: number; az: number; bx: number; bz: number } {
    const s = this.seat;
    return { ax: s.x + s.bx * 0.15, az: s.z + s.bz * 0.15, bx: s.x + s.bx * (0.3 + PUSH_DIST), bz: s.z + s.bz * (0.3 + PUSH_DIST) };
  }

  protected think(dt: number): void {
    const ctx = this.ctx;
    const s = this.seat;
    this.timer += dt;
    const k = clamp01(this.timer / this.dur);
    switch (this.state) {
      case 'rest':
        this.push = 0;
        // pas de client assis sur ce siège : la chaise ne bouge pas toute seule (on réessaie un peu plus tard)
        if (k >= 1 && ctx.world.seatOccupied && !ctx.world.seatOccupied(s.tableId, s.seat)) {
          this.timer = this.dur - ctx.rng.range(0.8, 1.6);
          break;
        }
        if (k >= 1) {
          this.state = 'warn';
          this.timer = 0;
          this.dur = ctx.warn(0.9);
          const ax = s.x + s.bx * 0.3;
          const az = s.z + s.bz * 0.3;
          this.tele = this.tg.add(line(ax, az, ax + s.bx * 0.9, az + s.bz * 0.9, 0.75), 'pink');
        }
        break;
      case 'warn': {
        // la chaise frémit : petites oscillations 0,03 → 0,08
        this.push = 0.055 + 0.025 * Math.sin(this.timer * Math.PI * 2 * 9);
        if (this.tele) this.tele.progress = k;
        if (k >= 1) {
          this.state = 'push';
          this.timer = 0;
          this.dur = PUSH_TIME;
          if (this.tele) {
            this.tele.progress = 1;
            this.tele.active = true;
          }
          ctx.sfxAt('chair_scrape', s.x, s.z);
        }
        break;
      }
      case 'push': {
        this.push = easeOutCubic(k);
        const w = this.sweep();
        const p = ctx.player;
        if (segProject(p.x, p.z, w.ax, w.az, w.bx, w.bz).d <= 0.35 + p.radius) ctx.hit(20, 4, this.source, s.bx, s.bz);
        if (k >= 1) {
          this.state = 'hold';
          this.timer = 0;
          this.dur = HOLD_TIME;
        }
        break;
      }
      case 'hold': {
        this.push = 1;
        // la chaise reculée fait toujours obstacle
        const cx = s.x + s.bx * PUSH_DIST;
        const cz = s.z + s.bz * PUSH_DIST;
        const p = ctx.player;
        if (Math.hypot(p.x - cx, p.z - cz) <= 0.4 + p.radius) ctx.hit(20, 4, this.source, p.x - s.x, p.z - s.z);
        if (k >= 1) {
          this.tele = this.tg.remove(this.tele);
          this.state = 'back';
          this.timer = 0;
          this.dur = BACK_TIME;
        }
        break;
      }
      case 'back':
        this.push = 1 - easeOutCubic(k);
        if (k >= 1) this.rest();
        break;
    }
    this.sendPush();
  }

  private sendPush(): void {
    // les extrémités (0 = rangée, 1 = reculée) sont toujours transmises exactement
    const exact = this.push === 0 || this.push === 1;
    if (this.push === this.sent || (!exact && Math.abs(this.push - this.sent) < 0.002)) return;
    this.sent = this.push;
    this.ctx.world.setChairPush(this.seat.tableId, this.seat.seat, this.push);
  }

  protected override onCalm(): void {
    this.tele = null;
  }

  protected override onCalmedUpdate(dt: number): void {
    // la chaise se range doucement
    this.push = Math.max(0, this.push - dt / 0.4);
    this.sendPush();
  }

  protected override onDispose(): void {
    if (this.sent > 0) this.ctx.world.setChairPush(this.seat.tableId, this.seat.seat, 0);
    this.sent = 0;
    this.release();
  }

  private release(): void {
    if (this.released) return;
    this.released = true;
    this.ctx.releaseSeat(this.seat);
  }
}
