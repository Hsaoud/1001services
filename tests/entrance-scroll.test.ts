import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canScrollWithin, isUpwardSwipe, prepareEntranceScroll } from '../src/core/entrance-scroll';

class Panel {
  parentElement: Panel | null = null;
  scrollTop = 0;
  clientHeight = 100;
  scrollHeight = 400;
  overflowY = 'auto';
}

describe('salon entrance gesture', () => {
  it('requires a deliberate upward swipe, excluding taps, downward and horizontal gestures', () => {
    expect(isUpwardSwipe(8, 80)).toBe(true);
    expect(isUpwardSwipe(0, 47)).toBe(false);
    expect(isUpwardSwipe(0, -100)).toBe(false);
    expect(isUpwardSwipe(100, 60)).toBe(false);
    expect(isUpwardSwipe(-100, 60)).toBe(false);
  });
});

describe('native entrance scrolling on iPhone', () => {
  let browser: EventTarget & { innerWidth: number; innerHeight: number };
  let body: Panel;
  let root: { dataset: Record<string, string>; style: { setProperty: ReturnType<typeof vi.fn> } };
  const element = (panel: Panel) => panel as unknown as Element;
  const touch = (type: string, y: number, target?: Panel, count = 1) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { touches: Array.from({ length: count }, () => ({ clientY: y })) });
    if (target) Object.defineProperty(event, 'target', { value: target });
    browser.dispatchEvent(event);
    return event;
  };

  beforeEach(() => {
    browser = Object.assign(new EventTarget(), { innerWidth: 844, innerHeight: 340 });
    body = new Panel();
    root = { dataset: {}, style: { setProperty: vi.fn() } };
    vi.stubGlobal('window', browser);
    vi.stubGlobal('document', { body, documentElement: root });
    vi.stubGlobal('navigator', { userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 5 });
    vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('Element', Panel);
    vi.stubGlobal('getComputedStyle', (p: Panel) => ({ overflowY: p.overflowY }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('leaves the complete welcome gesture native, then prevents page movement without changing its scroll geometry', () => {
    const entered = prepareEntranceScroll();
    expect(root.dataset.nativeScroll).toBe('true');
    touch('touchstart', 250);
    expect(touch('touchmove', 150).defaultPrevented).toBe(false);
    entered();
    expect(root.dataset.entrance).toBe('entered');
    expect(root.dataset.nativeScroll).toBe('true');
    touch('touchstart', 200);
    expect(touch('touchmove', 100).defaultPrevented).toBe(true);
    expect(root.style.setProperty).toHaveBeenCalledWith('--game-height', '340px');
  });

  it('keeps menu scrolling usable while preventing page scroll at either edge', () => {
    const entered = prepareEntranceScroll();
    entered();
    const panel = new Panel();
    panel.parentElement = body;
    panel.scrollTop = 50;
    touch('touchstart', 200);
    expect(touch('touchmove', 180, panel).defaultPrevented).toBe(false);
    panel.scrollTop = 300;
    expect(touch('touchmove', 160, panel).defaultPrevented).toBe(true);
    panel.scrollTop = 0;
    expect(touch('touchmove', 180, panel).defaultPrevented).toBe(true);
  });

  it('allows a nested menu to pass scrolling to its parent panel', () => {
    const outer = new Panel();
    outer.parentElement = body;
    const inner = new Panel();
    inner.parentElement = outer;
    inner.scrollTop = 300;
    expect(canScrollWithin(element(inner), -20)).toBe(true);
    outer.scrollTop = 300;
    expect(canScrollWithin(element(inner), -20)).toBe(false);
    inner.scrollTop = 50;
    expect(canScrollWithin(element(inner), 20)).toBe(true);
  });

  it('does not treat a non-scrollable or clipped panel as a scrollable menu', () => {
    const panel = new Panel();
    panel.parentElement = body;
    panel.scrollHeight = panel.clientHeight;
    expect(canScrollWithin(element(panel), -20)).toBe(false);
    panel.scrollHeight = 400;
    panel.overflowY = 'hidden';
    expect(canScrollWithin(element(panel), -20)).toBe(false);
  });

  it('does not enable document scrolling for the desktop entrance', () => {
    vi.stubGlobal('navigator', { userAgent: 'Desktop', platform: 'Win32', maxTouchPoints: 0 });
    const entered = prepareEntranceScroll();
    expect(root.dataset.nativeScroll).toBeUndefined();
    entered();
    touch('touchstart', 200);
    expect(touch('touchmove', 100).defaultPrevented).toBe(false);
  });
});
