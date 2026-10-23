/** The salon doors open once per page load, after a native upward swipe (or confirmation). */
import { audio } from '../audio';
import { device, forceLandscapeAndFullscreen, fullscreenAvailable, isHandheld, isPortrait } from '../core/device';
import { isUpwardSwipe, prepareEntranceScroll } from '../core/entrance-scroll';
import type { UiCtx } from './ctx';
import { $, html } from './dom';
import { isConfirmKey, type Screen } from './nav';
import { corners, crown, fleuron } from './ornaments';

export function createEntrance(ctx: UiCtx, onOpen: () => void): Screen {
  const finishScroll = prepareEntranceScroll();
  const el = html(`<section class="dz-entrance" aria-label="Bienvenue à La Duchesse">
    <div class="dz-entrance-door dz-entrance-left" aria-hidden="true"><div class="dz-entrance-moulding">${corners()}<span class="dz-entrance-rosette">✦</span></div><i class="dz-entrance-handle"></i></div>
    <div class="dz-entrance-door dz-entrance-right" aria-hidden="true"><div class="dz-entrance-moulding">${corners()}<span class="dz-entrance-rosette">✦</span></div><i class="dz-entrance-handle"></i></div>
    <div class="dz-entrance-invitation">
      <div class="dz-entrance-crown">${crown()}</div>
      <p class="dz-caps dz-entrance-eyebrow">Le salon vous attend</p>
      <h1 class="dz-script">La Duchesse</h1>
      <div class="dz-entrance-fleuron">${fleuron()}</div>
      <button type="button" class="dz-entrance-enter" data-nav>
        <span class="dz-entrance-swipe" aria-hidden="true"><svg viewBox="0 0 32 56"><path d="M16 48V10M6 20 16 10 26 20"/></svg></span>
        <span class="dz-entrance-touch">Glisse vers le haut pour entrer</span>
        <span class="dz-entrance-keyboard">Clique ou appuie sur Entrée pour entrer</span>
        <span class="dz-entrance-gamepad">Appuie sur A pour entrer</span>
      </button>
      <p class="dz-entrance-note">Les 1001 Services de La Duchesse</p>
    </div>
  </section>`);
  let opening = false;
  let start: { id: number; x: number; y: number } | null = null;
  let lastTouch = -Infinity;
  let frame = 0;
  let previousConfirm = false;
  let removeTimer = 0;
  let completed = false;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const button = $<HTMLButtonElement>(el, '.dz-entrance-enter');

  const open = (nativeGesture = true) => {
    if (opening || (isHandheld() && isPortrait())) return;
    opening = true;
    start = null;
    cancelAnimationFrame(frame);
    unsubscribe();
    audio.unlock();
    audio.sfx('ui_open');
    // Must stay inside a real gesture; Gamepad API polling has no user activation.
    if (nativeGesture && isHandheld() && fullscreenAvailable()) void forceLandscapeAndFullscreen();
    finishScroll();
    el.classList.add('is-opening');
    el.setAttribute('aria-hidden', 'true');
    button.disabled = true;
    const remove = () => {
      if (completed) return;
      completed = true;
      window.clearTimeout(removeTimer);
      void ctx.stack.remove(screen, false);
      onOpen();
    };
    const left = $(el, '.dz-entrance-left');
    left.addEventListener('transitionend', (e) => { if (e.target === left && e.propertyName === 'transform') remove(); }, { once: true });
    removeTimer = window.setTimeout(remove, reducedMotion ? 100 : 1400);
  };

  const reflect = () => { button.setAttribute('aria-label', device.mode === 'touch' ? 'Glisse vers le haut pour entrer, ou touche deux fois pour ouvrir' : 'Entrer à La Duchesse'); };
  const unsubscribe = device.subscribe(reflect);
  reflect();
  el.addEventListener('touchstart', (e) => {
    lastTouch = performance.now();
    const t = e.touches[0];
    start = e.touches.length === 1 && t ? { id: t.identifier, x: t.clientX, y: t.clientY } : null;
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    lastTouch = performance.now();
    const t = Array.from(e.changedTouches).find(t => t.identifier === start?.id);
    if (t && start && isUpwardSwipe(t.clientX - start.x, start.y - t.clientY)) open();
    start = null;
  }, { passive: true });
  el.addEventListener('touchcancel', () => { start = null; }, { passive: true });
  button.addEventListener('click', (e) => {
    // Ignore the compatibility click after a touch: the upward gesture should scroll Safari.
    // Screen-reader activation is a click with detail=0 and remains available.
    if (e.detail === 0 || performance.now() - lastTouch > 700) open();
  });
  const poll = () => {
    if (opening) return;
    const confirm = Array.from(navigator.getGamepads?.() ?? []).some(p => p?.buttons[0]?.pressed);
    if (confirm && !previousConfirm) open(false);
    previousConfirm = confirm;
    if (!opening) frame = requestAnimationFrame(poll);
  };
  frame = requestAnimationFrame(poll);
  const screen: Screen = {
    el,
    focus: () => button,
    key: (e) => {
      if (opening) return true;
      if (!isConfirmKey(e)) return false;
      if (!e.repeat) open();
      return true;
    },
  };
  return screen;
}
