/**
 * Roue de Dégustation : secteurs proportionnels à leur poids (des chances honnêtes),
 * rotation à décélération douce, « tic » à chaque secteur franchi sous l'aiguille.
 */
import { audio } from '../audio';
import type { WheelSegment } from '../data/items';
import { esc, html } from './dom';

const TONE_FILL: Record<WheelSegment['tone'], string> = {
  gold: 'url(#dzg-gold)',
  rose: '#efc3c8',
  cream: '#fdf6ec',
  sage: '#cfe0ca',
};
const TONE_INK: Record<WheelSegment['tone'], string> = {
  gold: '#4a2a0c',
  rose: '#6e2231',
  cream: '#5b1f2a',
  sage: '#2f4a35',
};

const R = 92;
const pt = (aDeg: number, r: number): [number, number] => {
  const a = (aDeg * Math.PI) / 180;
  return [r * Math.sin(a), -r * Math.cos(a)];
};
const f = (n: number) => n.toFixed(2);

export class Wheel {
  readonly el: HTMLElement;
  private rot: SVGGElement;
  private pointer: HTMLElement;
  private bounds: number[] = []; // angle de début de chaque secteur (degrés, sens horaire depuis midi)
  private angles: [number, number][] = [];
  private angle = 0;

  constructor(segments: WheelSegment[]) {
    const total = segments.reduce((s, x) => s + x.weight, 0) || 1;
    let a = 0;
    let paths = '';
    let labels = '';
    segments.forEach((s, i) => {
      const span = (360 * s.weight) / total;
      const a0 = a;
      const a1 = a + span;
      this.bounds.push(a0);
      this.angles.push([a0, a1]);
      const [x0, y0] = pt(a0, R);
      const [x1, y1] = pt(a1, R);
      paths += `<path class="dz-seg" data-i="${i}" d="M0 0L${f(x0)} ${f(y0)}A${R} ${R} 0 ${span > 180 ? 1 : 0} 1 ${f(x1)} ${f(y1)}Z" fill="${TONE_FILL[s.tone]}"/>`;
      const mid = a0 + span / 2;
      const fs = span < 22 ? 7.6 : 8.6;
      // Moitié gauche : texte retourné pour rester lisible (de l'extérieur vers le centre).
      const flip = mid > 180;
      labels += `<g transform="rotate(${f(flip ? mid + 90 : mid - 90)})"><text x="${flip ? -84 : 84}" y="0" text-anchor="${flip ? 'start' : 'end'}" dominant-baseline="central" font-size="${fs}" fill="${TONE_INK[s.tone]}" class="dz-seg-label">${esc(s.label)}</text></g>`;
      a = a1;
    });
    let studs = '';
    for (let i = 0; i < 28; i++) {
      const [x, y] = pt((i / 28) * 360, 99.5);
      studs += `<circle class="dz-stud" cx="${f(x)}" cy="${f(y)}" r="2.1"/>`;
    }
    let dividers = '';
    for (const b of this.bounds) {
      const [x, y] = pt(b, R);
      dividers += `<path d="M0 0L${f(x)} ${f(y)}"/>`;
    }
    this.el = html(`<div class="dz-wheel">
      <svg viewBox="-112 -112 224 224" class="dz-wheel-svg" aria-hidden="true">
        <circle r="108" fill="url(#dzg-velvet)" stroke="#3c1019" stroke-width="1.2"/>
        <circle r="104" fill="none" stroke="url(#dzg-gold)" stroke-width="2.4"/>
        <g class="dz-studs">${studs}</g>
        <g class="dz-wheel-rot">
          <circle r="${R + 1.5}" fill="#3c1019"/>
          ${paths}
          <g stroke="url(#dzg-gold)" stroke-width="1.6" fill="none">${dividers}</g>
          <g class="dz-labels">${labels}</g>
          <circle r="${R}" fill="none" stroke="url(#dzg-gold)" stroke-width="1.6"/>
          <circle r="27" fill="#fbf3e8" stroke="url(#dzg-gold)" stroke-width="2"/>
        </g>
        <circle r="22" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width="1.2"/>
        <circle r="17.5" fill="none" stroke="#fff3c4" stroke-width=".8" opacity=".7"/>
        <text x="0" y="7" text-anchor="middle" font-family="Great Vibes, cursive" font-size="22" fill="#6b4a14">D</text>
      </svg>
      <div class="dz-wheel-pointer"><svg viewBox="0 0 40 52" aria-hidden="true">
        <path d="M20 50 6 18a14 14 0 1 1 28 0z" fill="url(#dzg-gold)" stroke="#8a6420" stroke-width="1.4"/>
        <circle cx="20" cy="15" r="6" fill="#7a2e3a" stroke="#8a6420" stroke-width="1"/>
        <path d="M14 12c1.4-2.4 3.4-3.6 6-3.6" stroke="#fff3c4" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      </svg></div>
    </div>`);
    this.rot = this.el.querySelector('.dz-wheel-rot') as SVGGElement;
    this.pointer = this.el.querySelector('.dz-wheel-pointer') as HTMLElement;
  }

  /** Secteur situé sous l'aiguille pour une rotation donnée. */
  private segAt(rotation: number): number {
    const a = (((-rotation % 360) + 360) % 360);
    for (let i = 0; i < this.angles.length; i++) if (a >= this.angles[i][0] && a < this.angles[i][1]) return i;
    return this.angles.length - 1;
  }

  /** Lance la roue et s'arrête sur le secteur `index`. */
  spin(index: number): Promise<void> {
    const [a0, a1] = this.angles[Math.max(0, Math.min(this.angles.length - 1, index))];
    const theta = a0 + (a1 - a0) * (0.22 + Math.random() * 0.56);
    const start = this.angle;
    const base = ((360 - theta) % 360 + 360) % 360;
    const cur = ((start % 360) + 360) % 360;
    const target = start + 360 * 6 + ((base - cur + 360) % 360);
    const dur = 5600;
    const t0 = performance.now();
    let lastSeg = this.segAt(start);
    let lastTick = 0;
    this.el.classList.add('dz-spinning');
    this.el.querySelectorAll('.dz-seg.dz-win').forEach((p) => p.classList.remove('dz-win'));
    return new Promise((resolve) => {
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - t, 4);
        this.angle = start + (target - start) * e;
        this.rot.setAttribute('transform', `rotate(${this.angle.toFixed(2)})`);
        const seg = this.segAt(this.angle);
        if (seg !== lastSeg) {
          lastSeg = seg;
          if (now - lastTick > 45) {
            lastTick = now;
            audio.sfx('wheel_tick', { pitch: 0.9 + Math.random() * 0.2 });
            this.pointer.classList.remove('dz-flick');
            void this.pointer.offsetWidth;
            this.pointer.classList.add('dz-flick');
          }
        }
        if (t < 1) requestAnimationFrame(step);
        else {
          this.el.classList.remove('dz-spinning');
          this.el.querySelector(`.dz-seg[data-i="${index}"]`)?.classList.add('dz-win');
          audio.sfx('wheel_win');
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }
}
