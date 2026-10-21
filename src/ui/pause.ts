/** Menu de pause. */
import type { PauseHandlers } from './api';
import type { UiCtx } from './ctx';
import { html } from './dom';
import type { Screen } from './nav';
import { corners, cupArt, fleuron } from './ornaments';

export function createPause(ctx: UiCtx, h: PauseHandlers): Screen {
  const el = html(`<div class="dz-pause">
    <div class="dz-backdrop"></div>
    <div class="dz-pause-card dz-paper dz-frame">
      ${corners()}
      <div class="dz-pause-art">${cupArt()}</div>
      <div class="dz-h-eyebrow">Le service est suspendu</div>
      <h2 class="dz-h-title">Un instant…</h2>
      <div class="dz-fleuron-wrap">${fleuron()}</div>
      <nav class="dz-pause-menu">
        <button class="dz-btn dz-primary" data-nav data-a="resume">Reprendre le service</button>
        <button class="dz-btn" data-nav data-a="restart">Recommencer le service</button>
        <button class="dz-btn" data-nav data-a="settings">Réglages</button>
        <button class="dz-btn dz-ghost" data-nav data-a="quit">Quitter vers le titre</button>
      </nav>
      <div class="dz-pause-keys"><span class="dz-key">Échap</span> reprendre</div>
    </div>
  </div>`);
  const screen: Screen = {
    el,
    back: () => h.onResume(),
  };
  el.querySelectorAll<HTMLElement>('[data-a]').forEach((b) =>
    b.addEventListener('click', () => {
      const a = b.dataset.a;
      if (a === 'resume') h.onResume();
      else if (a === 'restart') h.onRestart();
      else if (a === 'settings') h.onSettings();
      else if (a === 'quit') h.onQuit();
    }),
  );
  void ctx;
  return screen;
}
