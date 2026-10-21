/**
 * Le Maître d'Hôtel : déplacement relatif à la caméra, Pas Chassé (Dash) à charges, équilibre du plateau,
 * étourdissement, glissade, chute dans une trappe, Passe-Partout.
 */
import type { DishId, PlayerStats, PlayerViewState, Vec2 } from '../types';
import { DISHES } from '../data/dishes';
import type { CollisionWorld } from './collision';

export const PLAYER_RADIUS = 0.32;
const DASH_TIME = 0.19;
const DASH_DIST = 3.3;
const DASH_IFRAMES_AFTER = 0.08;
const ACCEL = 34;
const DECEL = 28;
const SLIP_ACCEL = 3.2;

/** Directions monde des axes écran (caméra iso depuis +X+Z). */
const SCREEN_RIGHT = { x: Math.SQRT1_2, z: -Math.SQRT1_2 };
const SCREEN_UP = { x: -Math.SQRT1_2, z: -Math.SQRT1_2 };

export interface PlayerEvents {
  dash(x: number, z: number, dirX: number, dirZ: number): void;
  dashEmpty(): void;
  crash(x: number, z: number, lost: DishId[]): void;
  fallen(): void;
  respawned(x: number, z: number): void;
}

export class Player {
  x: number;
  z: number;
  vx = 0;
  vz = 0;
  heading = 0;
  turnRate = 0;
  readonly radius = PLAYER_RADIUS;

  tray: DishId[] = [];
  balance: number;
  private sinceHit = 99;

  dashCharges: number;
  private dashRecharge = 0; // s accumulées vers la prochaine charge
  private dashT = -1; // ≥ 0 pendant un dash
  private dashDirX = 0;
  private dashDirZ = 1;
  private iframes = 0;
  phasing = false;
  private phaseExtend = 0;
  passkeyReady = 0; // s restantes avant le prochain Passe-Partout

  stun = 0;
  private control = 1; // 0..1 (perte de contrôle après un choc)
  hitT = 0;
  slipping = false;
  fall = -1; // ≥ 0 pendant une chute (s)
  private respawnAt: Vec2 = { x: 0, z: 0 };
  grace = 0; // s restantes de Grâce Ducale
  bellRing = 0;
  stepAcc = 0;

  constructor(
    start: Vec2,
    public stats: PlayerStats,
    private events: PlayerEvents,
  ) {
    this.x = start.x;
    this.z = start.z;
    this.balance = stats.balanceMax;
    this.dashCharges = stats.dashCharges;
    this.heading = Math.PI * 1.25; // regarde vers le fond de la salle (−X −Z)
  }

  get dashing(): boolean {
    return this.dashT >= 0;
  }
  get invulnerable(): boolean {
    return this.dashT >= 0 || this.iframes > 0 || this.grace > 0 || this.fall >= 0;
  }
  get busy(): boolean {
    return this.fall >= 0 || this.stun > 0;
  }
  get carryingSweet(): boolean {
    return this.tray.some((d) => DISHES[d].sweet);
  }

  setStats(s: PlayerStats): void {
    this.stats = s;
    this.balance = Math.min(this.balance, s.balanceMax);
    this.dashCharges = Math.min(this.dashCharges, s.dashCharges);
  }

  /** Direction monde depuis une entrée écran (x droite, y haut). */
  static worldDir(ix: number, iy: number): Vec2 {
    return { x: SCREEN_RIGHT.x * ix + SCREEN_UP.x * iy, z: SCREEN_RIGHT.z * ix + SCREEN_UP.z * iy };
  }

  update(dt: number, input: { x: number; y: number }, wantDash: boolean, slippery: boolean, col: CollisionWorld): void {
    const prevHeading = this.heading;
    this.hitT = Math.max(0, this.hitT - dt * 2.5);
    this.iframes = Math.max(0, this.iframes - dt);
    this.grace = Math.max(0, this.grace - dt);
    this.bellRing = Math.max(0, this.bellRing - dt * 1.4);
    this.passkeyReady = Math.max(0, this.passkeyReady - dt);
    this.control = Math.min(1, this.control + dt * 3);
    this.sinceHit += dt;

    // Recharge des charges de dash (une à la fois) ; illimitées sous Grâce Ducale.
    if (this.dashCharges < this.stats.dashCharges) {
      this.dashRecharge += dt;
      if (this.dashRecharge >= this.stats.dashCooldown) {
        this.dashRecharge = 0;
        this.dashCharges++;
      }
    } else this.dashRecharge = 0;

    // Équilibre : se reprend doucement après 3 s sans choc.
    if (this.sinceHit > 3) this.balance = Math.min(this.stats.balanceMax, this.balance + this.stats.balanceMax * 0.08 * dt);

    // Chute dans une trappe.
    if (this.fall >= 0) {
      this.fall += dt;
      this.vx = this.vz = 0;
      this.dashT = -1;
      this.phasing = false;
      if (this.fall >= 1.3) {
        this.fall = -1;
        this.x = this.respawnAt.x;
        this.z = this.respawnAt.z;
        this.iframes = 1.5;
        this.events.respawned(this.x, this.z);
      }
      return;
    }

    if (this.stun > 0) this.stun = Math.max(0, this.stun - dt);
    const canAct = this.stun <= 0;

    const dir = Player.worldDir(input.x, input.y);
    const inLen = Math.hypot(dir.x, dir.z);

    // Déclenchement du Pas Chassé.
    if (wantDash && canAct && this.dashT < 0) {
      if (this.dashCharges > 0 || this.grace > 0) {
        if (this.grace <= 0) this.dashCharges--;
        if (inLen > 0.1) {
          this.dashDirX = dir.x / inLen;
          this.dashDirZ = dir.z / inLen;
        } else {
          this.dashDirX = Math.sin(this.heading);
          this.dashDirZ = Math.cos(this.heading);
        }
        this.dashT = 0;
        this.phasing = this.stats.passkeyCooldown !== null && this.passkeyReady <= 0;
        if (this.phasing) this.passkeyReady = this.stats.passkeyCooldown ?? 0;
        this.phaseExtend = 0;
        this.events.dash(this.x, this.z, this.dashDirX, this.dashDirZ);
      } else this.events.dashEmpty();
    }

    const speedMul = this.grace > 0 ? 1.35 : 1;
    const maxSpeed = this.stats.speed * speedMul;

    if (this.dashT >= 0) {
      this.dashT += dt;
      const sp = DASH_DIST / DASH_TIME;
      this.vx = this.dashDirX * sp;
      this.vz = this.dashDirZ * sp;
      if (this.dashT >= DASH_TIME) {
        // Fin du dash : si on est encore dans un meuble (Passe-Partout), on prolonge la traversée.
        if (this.phasing && col.overlapsFurniture(this.x, this.z, this.radius) && this.phaseExtend < 0.6) {
          this.phaseExtend += dt;
          this.dashT = DASH_TIME - dt * 0.5;
          this.vx = this.dashDirX * maxSpeed * 1.4;
          this.vz = this.dashDirZ * maxSpeed * 1.4;
        } else {
          this.dashT = -1;
          this.phasing = false;
          this.iframes = Math.max(this.iframes, DASH_IFRAMES_AFTER);
          this.vx = this.dashDirX * maxSpeed;
          this.vz = this.dashDirZ * maxSpeed;
        }
      }
    } else {
      this.slipping = slippery;
      const tx = canAct ? dir.x * maxSpeed : 0;
      const tz = canAct ? dir.z * maxSpeed : 0;
      if (slippery) {
        // Sur le sirop / la cire : l'élan domine, le contrôle est faible.
        this.vx += (tx - this.vx) * Math.min(1, SLIP_ACCEL * dt);
        this.vz += (tz - this.vz) * Math.min(1, SLIP_ACCEL * dt);
        const s = Math.hypot(this.vx, this.vz);
        const cap = maxSpeed * 1.3;
        if (s > cap) {
          this.vx *= cap / s;
          this.vz *= cap / s;
        }
      } else {
        const accel = (inLen > 0.05 ? ACCEL : DECEL) * (0.35 + 0.65 * this.control);
        const dvx = tx - this.vx;
        const dvz = tz - this.vz;
        const dl = Math.hypot(dvx, dvz);
        const step = accel * dt;
        if (dl <= step) {
          this.vx = tx;
          this.vz = tz;
        } else {
          this.vx += (dvx / dl) * step;
          this.vz += (dvz / dl) * step;
        }
      }
    }

    const n = col.moveCircle(this, this.vx * dt, this.vz * dt, this.radius, { phaseFurniture: this.phasing });
    if (n && !this.dashing) {
      // On annule la composante de vitesse qui rentre dans l'obstacle.
      const vn = this.vx * n.x + this.vz * n.z;
      if (vn < 0) {
        this.vx -= vn * n.x;
        this.vz -= vn * n.z;
      }
    }

    const sp = Math.hypot(this.vx, this.vz);
    if (sp > 0.3 && (canAct || this.dashing)) {
      const target = Math.atan2(this.vx, this.vz);
      let d = target - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, dt * (this.dashing ? 30 : 14));
    }
    let dh = this.heading - prevHeading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.turnRate += (dh / Math.max(dt, 1e-4) - this.turnRate) * Math.min(1, dt * 10);
  }

  /** Choc : retire de l'équilibre, recul, perte de contrôle. Renvoie true si le plateau s'est renversé. */
  hit(damage: number, fromX: number, fromZ: number, knockback: number, stun: number): boolean {
    this.sinceHit = 0;
    this.hitT = 1;
    this.control = 0;
    this.iframes = 0.35;
    let dx = this.x - fromX;
    let dz = this.z - fromZ;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    this.vx = dx * knockback;
    this.vz = dz * knockback;
    if (stun > 0) this.stun = Math.max(this.stun, stun);
    this.balance -= damage;
    if (this.balance <= 0) {
      this.crash();
      return true;
    }
    return false;
  }

  /** Le plateau se renverse : tous les plats sont perdus. */
  crash(): void {
    const lost = this.tray;
    this.tray = [];
    this.balance = this.stats.balanceMax;
    this.stun = Math.max(this.stun, 0.8);
    this.iframes = Math.max(this.iframes, 1.4);
    this.events.crash(this.x, this.z, lost);
  }

  stunFor(seconds: number): void {
    this.stun = Math.max(this.stun, seconds);
    this.vx *= 0.2;
    this.vz *= 0.2;
  }

  /** Chute dans une trappe : plateau perdu, retour à `respawn`. */
  drop(respawn: Vec2): void {
    const lost = this.tray;
    this.tray = [];
    this.fall = 0;
    this.respawnAt = respawn;
    this.dashT = -1;
    this.phasing = false;
    if (lost.length) this.events.crash(this.x, this.z, lost);
    this.events.fallen();
  }

  teleport(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.vx = this.vz = 0;
    this.dashT = -1;
    this.phasing = false;
    this.iframes = Math.max(this.iframes, 0.6);
  }

  /** Recharge toutes les charges de dash (bonus de cloche). */
  refillDash(): void {
    this.dashCharges = this.stats.dashCharges;
    this.dashRecharge = 0;
  }

  dashRecharge01(): number {
    return this.dashCharges >= this.stats.dashCharges ? 1 : this.dashRecharge / this.stats.dashCooldown;
  }

  viewState(capacity: number, out: PlayerViewState): PlayerViewState {
    out.x = this.x;
    out.z = this.z;
    out.heading = this.heading;
    out.vx = this.vx;
    out.vz = this.vz;
    out.speed01 = Math.min(1.5, Math.hypot(this.vx, this.vz) / this.stats.speed);
    out.turnRate = this.turnRate;
    out.dashing = this.dashT >= 0;
    out.dashT = this.dashT >= 0 ? Math.min(1, this.dashT / DASH_TIME) : 0;
    out.phasing = this.phasing;
    out.tray = this.tray;
    out.capacity = capacity;
    out.balance01 = Math.max(0, this.balance / this.stats.balanceMax);
    out.hitT = this.hitT;
    out.stunned = this.stun > 0;
    out.slipping = this.slipping && !this.dashing;
    out.fall01 = this.fall >= 0 ? Math.min(1, this.fall / 0.6) : 0;
    out.invulnerable = this.iframes > 0 && this.dashT < 0 && this.grace <= 0;
    out.grace = this.grace > 0;
    out.bellRing = this.bellRing;
    return out;
  }
}

export function emptyPlayerView(): PlayerViewState {
  return {
    x: 0,
    z: 0,
    heading: 0,
    speed01: 0,
    vx: 0,
    vz: 0,
    turnRate: 0,
    dashing: false,
    dashT: 0,
    phasing: false,
    tray: [],
    capacity: 2,
    balance01: 1,
    hitT: 0,
    stunned: false,
    slipping: false,
    fall01: 0,
    invulnerable: false,
    grace: false,
    bellRing: 0,
  };
}
