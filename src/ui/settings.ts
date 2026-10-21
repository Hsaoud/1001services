/** Réglages : volumes, qualité graphique, secousses, rappel des commandes. */
import type { Settings } from '../types';
import type { UiCtx } from './ctx';
import { $, html } from './dom';
import type { Screen } from './nav';
import { corners } from './ornaments';

const QUALITY: { v: Settings['quality']; label: string }[] = [
  { v: 'low', label: 'Basse' },
  { v: 'medium', label: 'Moyenne' },
  { v: 'high', label: 'Haute' },
];

export function createSettings(ctx: UiCtx, initial: Settings, onChange: (s: Settings) => void, onClose: () => void): Screen {
  const s: Settings = { ...initial };
  const slider = (key: 'master' | 'music' | 'sfx', label: string) => `
    <div class="dz-set-row">
      <label class="dz-set-label" for="dz-set-${key}">${label}</label>
      <input id="dz-set-${key}" class="dz-range" type="range" min="0" max="1" step="0.05" value="${s[key]}" data-nav data-key="${key}" aria-label="${label}">
      <span class="dz-set-val" data-val="${key}"></span>
    </div>`;
  const el = html(`<div class="dz-settings">
    <div class="dz-backdrop"></div>
    <div class="dz-set-card dz-paper dz-frame">
      ${corners()}
      <div class="dz-h-eyebrow">Les 1001 Services de La Duchesse</div>
      <h2 class="dz-h-title">Réglages</h2>
      <div class="dz-set-cols">
        <div class="dz-set-col">
          <section class="dz-set-sec">
            <h3 class="dz-set-h"><span class="dz-caps">L’ambiance sonore</span></h3>
            ${slider('master', 'Volume général')}
            ${slider('music', 'Musique')}
            ${slider('sfx', 'Effets sonores')}
          </section>
          <section class="dz-set-sec">
            <h3 class="dz-set-h"><span class="dz-caps">L’image</span></h3>
            <div class="dz-set-row">
              <span class="dz-set-label">Qualité graphique</span>
              <div class="dz-seg" role="radiogroup" aria-label="Qualité graphique">
                ${QUALITY.map((q) => `<button class="dz-seg-b" data-nav data-q="${q.v}" role="radio">${q.label}</button>`).join('')}
              </div>
            </div>
            <div class="dz-set-row">
              <span class="dz-set-label">Secousses de l’écran</span>
              <button class="dz-switch" data-nav role="switch" aria-label="Secousses de l’écran"><span class="dz-switch-knob"></span><span class="dz-switch-t"></span></button>
            </div>
          </section>
        </div>
        <section class="dz-set-sec dz-set-controls">
          <h3 class="dz-set-h"><span class="dz-caps">Le service, mode d’emploi</span></h3>
          <ul class="dz-ctrl">
            <li><span class="dz-ctrl-k"><span class="dz-key">Z</span><span class="dz-key">Q</span><span class="dz-key">S</span><span class="dz-key">D</span><em>ou</em><span class="dz-key">W</span><span class="dz-key">A</span><span class="dz-key">S</span><span class="dz-key">D</span><em>ou</em><span class="dz-key">←</span><span class="dz-key">↑</span><span class="dz-key">↓</span><span class="dz-key">→</span></span><span class="dz-ctrl-d">Se déplacer</span></li>
            <li><span class="dz-ctrl-k"><span class="dz-key">E</span></span><span class="dz-ctrl-d">Prendre un plat, servir, ouvrir une cloche, sonner</span></li>
            <li><span class="dz-ctrl-k"><span class="dz-key">Espace</span><em>ou</em><span class="dz-key">Maj</span></span><span class="dz-ctrl-d">Pas chassé (Dash)</span></li>
            <li><span class="dz-ctrl-k"><span class="dz-key">Tab</span></span><span class="dz-ctrl-d">Vue d’ensemble du salon</span></li>
            <li><span class="dz-ctrl-k"><span class="dz-key">1</span><span class="dz-key">2</span><span class="dz-key">3</span><span class="dz-key">4</span></span><span class="dz-ctrl-d">Pouvoirs des anneaux royaux</span></li>
            <li><span class="dz-ctrl-k"><span class="dz-key">Échap</span></span><span class="dz-ctrl-d">Pause</span></li>
          </ul>
        </section>
      </div>
      <div class="dz-btn-row dz-set-actions"><button class="dz-btn dz-primary dz-set-close" data-nav>Fermer</button></div>
    </div>
  </div>`);

  const emit = () => onChange({ ...s });
  const paint = () => {
    for (const key of ['master', 'music', 'sfx'] as const) {
      const inp = $<HTMLInputElement>(el, `[data-key="${key}"]`);
      inp.style.setProperty('--p', `${Math.round(s[key] * 100)}%`);
      $(el, `[data-val="${key}"]`).textContent = `${Math.round(s[key] * 100)} %`;
    }
    el.querySelectorAll<HTMLElement>('[data-q]').forEach((b) => {
      const on = b.dataset.q === s.quality;
      b.classList.toggle('dz-on', on);
      b.setAttribute('aria-checked', String(on));
    });
    const sw = $(el, '.dz-switch');
    sw.classList.toggle('dz-on', s.shake);
    sw.setAttribute('aria-checked', String(s.shake));
    $(el, '.dz-switch-t').textContent = s.shake ? 'Oui' : 'Non';
  };
  el.querySelectorAll<HTMLInputElement>('.dz-range').forEach((inp) =>
    inp.addEventListener('input', () => {
      const k = inp.dataset.key as 'master' | 'music' | 'sfx';
      s[k] = Math.round(Number(inp.value) * 100) / 100;
      paint();
      emit();
    }),
  );
  el.querySelectorAll<HTMLElement>('[data-q]').forEach((b) =>
    b.addEventListener('click', () => {
      s.quality = b.dataset.q as Settings['quality'];
      paint();
      emit();
    }),
  );
  $(el, '.dz-switch').addEventListener('click', () => {
    s.shake = !s.shake;
    paint();
    emit();
  });
  const close = () => {
    void ctx.stack.remove(screen);
    onClose();
  };
  $(el, '.dz-set-close').addEventListener('click', close);
  paint();
  const screen: Screen = {
    el,
    back: close,
    focus: () => el.querySelector<HTMLElement>('[data-key="master"]'),
  };
  return screen;
}
