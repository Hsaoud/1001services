/**
 * HUD de service : plaque du salon, jauge de Score de Service, minuteur, plateau,
 * équilibre, Pas Chassé, Passe-Partout, anneaux, combo.
 * `update()` est appelé à chaque image : nœuds en cache, écritures DOM uniquement si la valeur change.
 */
import type { DishId, HudState, RingId } from '../types';
import { RING_INFO } from '../data/items';
import { $, clamp01, fmtClock, fmtInt, html } from './dom';
import type { DishIcons } from './dishicons';
import { ICON, RING_COLOR, ringIcon } from './icons';
import { bellIcon, laurel } from './ornaments';

const RING_ORDER: RingId[] = ['tournee', 'temps', 'brigade', 'grace'];

interface RingSlot {
  el: HTMLElement;
  prog: SVGCircleElement;
  time: HTMLElement;
  state: string;
  p: number;
  t: string;
}

export class Hud {
  readonly el: HTMLElement;
  /** Colonne haut-droite (minuteur puis mini-carte). */
  readonly topRight: HTMLElement;

  private icons: DishIcons;
  // Nœuds
  private mode: HTMLElement;
  private modeIco: HTMLElement;
  private level: HTMLElement;
  private salon: HTMLElement;
  private served: HTMLElement;
  private score: HTMLElement;
  private scoreFill: HTMLElement;
  private scoreVal: HTMLElement;
  private scoreQuota: HTMLElement;
  private scoreMark: HTMLElement;
  private timer: HTMLElement;
  private timerVal: HTMLElement;
  private traySlots: HTMLElement;
  private trayCount: HTMLElement;
  private balance: HTMLElement;
  private balFill: HTMLElement;
  private pips: HTMLElement;
  private passkey: HTMLElement;
  private passProg: SVGCircleElement;
  private combo: HTMLElement;
  private comboVal: HTMLElement;
  private rings = new Map<RingId, RingSlot>();

  // Dernières valeurs écrites
  private v = {
    mode: '',
    level: -1,
    salon: '',
    served: -1,
    quota: -1,
    scoreTxt: '',
    fill: -1,
    reached: false,
    timer: '',
    timerOn: null as boolean | null,
    urgent: false,
    rush: false,
    cap: -1,
    tray: '',
    bal: -1,
    balState: '',
    pipMax: -1,
    pipOn: -1,
    pipArc: -1,
    pass: -2,
    combo: -1,
  };
  private shownScore = 0;
  private lastT = 0;

  constructor(icons: DishIcons) {
    this.icons = icons;
    this.el = html(`<div class="dz-hud" aria-hidden="true">
      <div class="dz-hud-tl">
        <div class="dz-plaque dz-paper">
          <div class="dz-pl-mode"><span class="dz-ico dz-pl-ico"></span><span class="dz-pl-mode-txt"></span></div>
          <div class="dz-pl-level">Service <span class="dz-pl-no">n°</span>&nbsp;<b class="dz-pl-num">1</b></div>
          <div class="dz-pl-salon"></div>
          <div class="dz-pl-served"><span class="dz-ico">${ICON.plate}</span><span class="dz-pl-served-v">0</span> servis</div>
        </div>
      </div>
      <div class="dz-hud-tc">
        <div class="dz-score">
          <div class="dz-score-head dz-caps">Score de Service</div>
          <div class="dz-score-row">
            <span class="dz-score-laurel dz-l">${laurel('', 7)}</span>
            <div class="dz-score-bar">
              <div class="dz-score-track"><div class="dz-score-fill"></div><div class="dz-score-sheen"></div></div>
              <div class="dz-score-mark">${bellIcon()}</div>
            </div>
            <span class="dz-score-laurel dz-r">${laurel('', 7)}</span>
          </div>
          <div class="dz-score-num"><b class="dz-score-val">0</b><span class="dz-score-sep">/</span><span class="dz-score-quota">0</span></div>
          <div class="dz-score-hint"><span class="dz-script">Sonnez la Cloche Royale</span></div>
        </div>
      </div>
      <div class="dz-hud-tr">
        <div class="dz-timer dz-paper">
          <span class="dz-timer-ico">${ICON.watch}</span>
          <span class="dz-timer-val">0:00</span>
          <span class="dz-timer-rush dz-script">La mousse déborde&nbsp;!</span>
        </div>
      </div>
      <div class="dz-hud-bl">
        <div class="dz-traycard dz-paper">
          <div class="dz-tray">
            <svg class="dz-tray-plate" viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true">
              <ellipse cx="100" cy="32" rx="97" ry="25" fill="url(#dzg-silver)" stroke="#7d8794" stroke-width="1.5"/>
              <ellipse cx="100" cy="30" rx="86" ry="18" fill="#f2f4f6" stroke="#b5bcc5" stroke-width="1"/>
              <ellipse cx="100" cy="30" rx="80" ry="15" fill="none" stroke="#c9a24a" stroke-width="1" opacity=".7"/>
            </svg>
            <div class="dz-tray-slots"></div>
          </div>
          <div class="dz-meters">
            <div class="dz-meter-head"><span class="dz-caps">Plateau</span><span class="dz-tray-count"></span></div>
            <div class="dz-balance">
              <div class="dz-meter-head"><span class="dz-caps">Équilibre</span></div>
              <div class="dz-bal-track"><div class="dz-bal-fill"></div><i></i><i></i><i></i></div>
            </div>
            <div class="dz-dashrow">
              <span class="dz-caps">Pas chassé</span>
              <div class="dz-pips"></div>
              <div class="dz-passkey" title="Passe-Partout">
                <svg viewBox="0 0 40 40" class="dz-ring-svg"><circle class="dz-trk" cx="20" cy="20" r="17"/><circle class="dz-prg" cx="20" cy="20" r="17" pathLength="100"/></svg>
                <span class="dz-passkey-ico">${ICON.key}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="dz-hud-br">
        <div class="dz-combo"><span class="dz-combo-l dz-script">Combo</span><b class="dz-combo-v">×2</b></div>
        <div class="dz-rings"></div>
      </div>
    </div>`);
    const q = <T extends Element = HTMLElement>(s: string) => $<T>(this.el, s);
    this.topRight = q('.dz-hud-tr');
    this.mode = q('.dz-pl-mode-txt');
    this.modeIco = q('.dz-pl-ico');
    this.level = q('.dz-pl-num');
    this.salon = q('.dz-pl-salon');
    this.served = q('.dz-pl-served-v');
    this.score = q('.dz-score');
    this.scoreFill = q('.dz-score-fill');
    this.scoreVal = q('.dz-score-val');
    this.scoreQuota = q('.dz-score-quota');
    this.scoreMark = q('.dz-score-mark');
    this.timer = q('.dz-timer');
    this.timerVal = q('.dz-timer-val');
    this.traySlots = q('.dz-tray-slots');
    this.trayCount = q('.dz-tray-count');
    this.balance = q('.dz-balance');
    this.balFill = q('.dz-bal-fill');
    this.pips = q('.dz-pips');
    this.passkey = q('.dz-passkey');
    this.passProg = q<SVGCircleElement>('.dz-passkey .dz-prg');
    this.combo = q('.dz-combo');
    this.comboVal = q('.dz-combo-v');

    const ringsEl = q('.dz-rings');
    for (const id of RING_ORDER) {
      const info = RING_INFO[id];
      const el = html(`<div class="dz-ringslot dz-empty" style="--rc:${RING_COLOR[id]}" title="${info.name}">
        <svg viewBox="0 0 40 40" class="dz-ring-svg"><circle class="dz-trk" cx="20" cy="20" r="18"/><circle class="dz-prg" cx="20" cy="20" r="18" pathLength="100"/></svg>
        <span class="dz-ring-gem">${ringIcon(id)}</span>
        <span class="dz-ring-key dz-key">${info.key}</span>
        <span class="dz-ring-time"></span>
      </div>`);
      ringsEl.appendChild(el);
      this.rings.set(id, {
        el,
        prog: $<SVGCircleElement>(el, '.dz-prg'),
        time: $(el, '.dz-ring-time'),
        state: 'empty',
        p: -1,
        t: '',
      });
    }
  }

  /** Remet les valeurs mémorisées à zéro (nouveau service). */
  reset(): void {
    for (const k of Object.keys(this.v) as (keyof typeof this.v)[]) {
      const cur = this.v[k];
      (this.v as Record<string, unknown>)[k] = typeof cur === 'number' ? -2 : typeof cur === 'string' ? '\u0000' : null;
    }
    this.shownScore = 0;
    this.lastT = 0;
  }

  update(s: HudState): void {
    const v = this.v;
    const now = performance.now();
    const dt = this.lastT ? Math.min(0.1, (now - this.lastT) / 1000) : 1;
    this.lastT = now;

    // ── Plaque
    if (v.mode !== s.mode) {
      v.mode = s.mode;
      this.mode.textContent = s.mode === 'salon' ? 'Salon de Thé' : 'Coup de Feu';
      this.modeIco.innerHTML = s.mode === 'salon' ? ICON.teacup : ICON.fire;
      this.el.classList.toggle('dz-mode-cdf', s.mode === 'coupdefeu');
    }
    if (v.level !== s.level) {
      v.level = s.level;
      this.level.textContent = String(s.level);
    }
    if (v.salon !== s.salonName) {
      v.salon = s.salonName;
      this.salon.textContent = s.salonName;
    }
    if (v.served !== s.served) {
      v.served = s.served;
      this.served.textContent = String(s.served);
    }

    // ── Score : défilement doux des chiffres, jauge graduée jusqu'à 125 % du quota
    if (dt >= 1 || Math.abs(s.score - this.shownScore) < 1) this.shownScore = s.score;
    else this.shownScore += (s.score - this.shownScore) * Math.min(1, dt * 9);
    const txt = fmtInt(this.shownScore);
    if (v.scoreTxt !== txt) {
      if (s.score > this.shownScore + 0.5 && !this.score.classList.contains('dz-bump')) {
        this.score.classList.add('dz-bump');
        setTimeout(() => this.score.classList.remove('dz-bump'), 260);
      }
      v.scoreTxt = txt;
      this.scoreVal.textContent = txt;
    }
    if (v.quota !== s.quota) {
      v.quota = s.quota;
      this.scoreQuota.textContent = fmtInt(s.quota);
    }
    const fill = Math.round(clamp01(this.shownScore / Math.max(1, s.quota * 1.25)) * 1000) / 1000;
    if (v.fill !== fill) {
      v.fill = fill;
      this.scoreFill.style.transform = `scaleX(${fill})`;
    }
    if (v.reached !== s.quotaReached) {
      v.reached = s.quotaReached;
      this.score.classList.toggle('dz-reached', s.quotaReached);
      this.scoreMark.classList.toggle('dz-lit', s.quotaReached);
    }

    // ── Minuteur
    const timerOn = s.timeLeft !== null || s.rush;
    if (v.timerOn !== timerOn) {
      v.timerOn = timerOn;
      this.timer.classList.toggle('dz-hidden', !timerOn);
    }
    if (timerOn) {
      const t = s.timeLeft === null ? '' : fmtClock(s.timeLeft);
      if (v.timer !== t) {
        v.timer = t;
        this.timerVal.textContent = t;
      }
      const urgent = !s.rush && s.timeLeft !== null && s.timeLeft <= 10;
      if (v.urgent !== urgent) {
        v.urgent = urgent;
        this.timer.classList.toggle('dz-urgent', urgent);
      }
    }
    if (v.rush !== s.rush) {
      v.rush = s.rush;
      this.timer.classList.toggle('dz-rush', s.rush);
    }

    // ── Plateau
    if (v.cap !== s.capacity) {
      v.cap = s.capacity;
      v.tray = '\u0000';
      let slots = '';
      for (let i = 0; i < s.capacity; i++) slots += `<span class="dz-slot"><span class="dz-slot-dish"></span></span>`;
      this.traySlots.innerHTML = slots;
      this.traySlots.style.setProperty('--n', String(Math.max(2, s.capacity)));
    }
    const trayKey = s.tray.join(',');
    if (v.tray !== trayKey) {
      const prevCount = v.tray === '\u0000' ? s.tray.length : v.tray ? v.tray.split(',').length : 0;
      v.tray = trayKey;
      const slots = this.traySlots.children;
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i] as HTMLElement;
        const d = (s.tray[i] ?? null) as DishId | null;
        slot.classList.toggle('dz-full', !!d);
        slot.classList.toggle('dz-gold', d === 'golden');
        this.icons.fill(slot.firstElementChild as HTMLElement, d);
        if (d && i >= prevCount) {
          slot.classList.remove('dz-new');
          void slot.offsetWidth;
          slot.classList.add('dz-new');
        }
      }
      this.trayCount.textContent = `${s.tray.length} / ${s.capacity}`;
    } else {
      // Icônes 3D arrivées entre-temps : mise à jour paresseuse.
      const slots = this.traySlots.children;
      for (let i = 0; i < s.tray.length && i < slots.length; i++) this.icons.fill(slots[i].firstElementChild as HTMLElement, s.tray[i]);
    }

    // ── Équilibre
    const b = Math.round(clamp01(s.balance / Math.max(1, s.balanceMax)) * 200) / 200;
    if (v.bal !== b) {
      v.bal = b;
      this.balFill.style.transform = `scaleX(${b})`;
      const st = b < 0.3 ? 'low' : b < 0.6 ? 'mid' : 'ok';
      if (v.balState !== st) {
        v.balState = st;
        this.balance.dataset.state = st;
      }
    }

    // ── Pas Chassé
    if (v.pipMax !== s.dashChargesMax) {
      v.pipMax = s.dashChargesMax;
      v.pipOn = -1;
      v.pipArc = -1;
      let p = '';
      for (let i = 0; i < s.dashChargesMax; i++)
        p += `<span class="dz-pip"><svg viewBox="0 0 20 20"><circle class="dz-pip-trk" cx="10" cy="10" r="8"/><circle class="dz-pip-arc" cx="10" cy="10" r="8" pathLength="100"/><circle class="dz-pip-dot" cx="10" cy="10" r="5.2"/></svg></span>`;
      this.pips.innerHTML = p;
    }
    const on = Math.max(0, Math.min(s.dashChargesMax, s.dashCharges));
    const arc = on < s.dashChargesMax ? Math.round(clamp01(s.dashRecharge01) * 100) : 100;
    if (v.pipOn !== on || v.pipArc !== arc) {
      const pips = this.pips.children;
      for (let i = 0; i < pips.length; i++) {
        const pip = pips[i] as HTMLElement;
        const full = i < on;
        const charging = i === on;
        pip.classList.toggle('dz-on', full);
        pip.classList.toggle('dz-charging', charging);
        if (v.pipOn !== on || charging) {
          const a = pip.querySelector('.dz-pip-arc') as SVGCircleElement;
          a.style.strokeDashoffset = String(full ? 0 : charging ? 100 - arc : 100);
        }
        if (full && i === on - 1 && v.pipOn !== -1 && on > v.pipOn) {
          pip.classList.remove('dz-new');
          void pip.offsetWidth;
          pip.classList.add('dz-new');
        }
      }
      v.pipOn = on;
      v.pipArc = arc;
    }

    // ── Passe-Partout
    const pass = s.passkey01 === null ? -1 : Math.round(clamp01(s.passkey01) * 100);
    if (v.pass !== pass) {
      const wasReady = v.pass === 100;
      v.pass = pass;
      this.passkey.classList.toggle('dz-hidden', pass < 0);
      if (pass >= 0) {
        this.passProg.style.strokeDashoffset = String(100 - pass);
        this.passkey.classList.toggle('dz-ready', pass >= 100);
        if (pass >= 100 && !wasReady) {
          this.passkey.classList.remove('dz-ping');
          void this.passkey.offsetWidth;
          this.passkey.classList.add('dz-ping');
        }
      }
    }

    // ── Anneaux
    for (const r of s.rings) {
      const slot = this.rings.get(r.id);
      if (!slot) continue;
      const state = !r.equipped ? 'empty' : r.active ? 'active' : r.ready01 >= 1 ? 'ready' : 'cool';
      if (slot.state !== state) {
        const was = slot.state;
        slot.state = state;
        slot.el.className = `dz-ringslot dz-${state}`;
        if (state === 'ready' && was === 'cool') {
          slot.el.classList.add('dz-ping');
          setTimeout(() => slot.el.classList.remove('dz-ping'), 900);
        }
      }
      const p = state === 'cool' ? Math.round(clamp01(r.ready01) * 200) / 2 : state === 'empty' ? 0 : 100;
      if (slot.p !== p) {
        slot.p = p;
        slot.prog.style.strokeDashoffset = String(100 - p);
      }
      const t = state === 'cool' ? fmtClock(r.remaining) : '';
      if (slot.t !== t) {
        slot.t = t;
        slot.time.textContent = t;
      }
    }

    // ── Combo
    if (v.combo !== s.combo) {
      const up = s.combo > v.combo && v.combo >= 0;
      v.combo = s.combo;
      const show = s.combo >= 2;
      this.combo.classList.toggle('dz-show', show);
      if (show) {
        this.comboVal.textContent = `×${s.combo}`;
        this.combo.classList.toggle('dz-hot', s.combo >= 5);
        if (up) {
          this.combo.classList.remove('dz-bounce');
          void this.combo.offsetWidth;
          this.combo.classList.add('dz-bounce');
        }
      }
    }
  }
}
