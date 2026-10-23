/** Native page scrolling during the welcome gesture, without changing overflow afterwards. */
import { isHandheld, syncViewport } from './device';

export function isUpwardSwipe(dx: number, dy: number): boolean {
  return dy >= 48 && dy > Math.abs(dx) * 1.25;
}

/** Let menu panels scroll, but stop their edges from scrolling the page during play. */
export function canScrollWithin(target: Element | null, dy: number): boolean {
  for (let el = target; el && el !== document.body; el = el.parentElement) {
    const style = getComputedStyle(el);
    if (!/(auto|scroll)/.test(style.overflowY) || el.scrollHeight <= el.clientHeight) continue;
    if (dy > 0 && el.scrollTop > 0) return true;
    if (dy < 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
  }
  return false;
}

export function prepareEntranceScroll(): () => void {
  const root = document.documentElement;
  root.dataset.entrance = 'waiting';
  if (!isHandheld()) return () => { root.dataset.entrance = 'entered'; };

  // Keep this throughout the session. Toggling body overflow can reveal Safari's bars.
  root.dataset.nativeScroll = 'true';
  let waiting = true;
  let lastY = 0;
  const start = (e: TouchEvent) => { lastY = e.touches[0]?.clientY ?? 0; };
  const move = (e: TouchEvent) => {
    const y = e.touches[0]?.clientY ?? lastY;
    const dy = y - lastY;
    lastY = y;
    if (waiting || e.touches.length !== 1) return;
    const target = e.target instanceof Element ? e.target : null;
    if (!canScrollWithin(target, dy) && e.cancelable) e.preventDefault();
  };
  window.addEventListener('touchstart', start, { passive: true });
  window.addEventListener('touchmove', move, { passive: false });
  return () => {
    waiting = false;
    root.dataset.entrance = 'entered';
    syncViewport();
  };
}
