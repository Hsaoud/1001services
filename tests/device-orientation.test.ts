import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fullscreenAvailable, isHandheld, isPortrait, syncViewport } from '../src/core/device';

describe('iPhone orientation and viewport', () => {
  let viewport: { width: number; height: number; scale: number };
  let browser: { innerWidth: number; innerHeight: number; visualViewport: typeof viewport; screen: unknown; matchMedia: ReturnType<typeof vi.fn> };
  let properties: Map<string, string>;
  beforeEach(() => {
    viewport = { width: 844, height: 340, scale: 1 };
    browser = { innerWidth: 844, innerHeight: 390, visualViewport: viewport,
      screen: { orientation: { type: 'portrait-primary' } }, matchMedia: vi.fn(() => ({ matches: false })) };
    properties = new Map();
    vi.stubGlobal('window', browser);
    vi.stubGlobal('navigator', { userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 5 });
    vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('matchMedia', browser.matchMedia);
    vi.stubGlobal('document', { documentElement: { style: { setProperty: (k: string, v: string) => properties.set(k, v) } } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('recognizes landscape even when Safari reports a stale portrait screen', () => {
    expect(isPortrait()).toBe(false);
  });
  it('recognizes return to portrait despite a stale landscape screen', () => {
    browser.innerWidth = 390; browser.innerHeight = 844;
    browser.screen = { orientation: { type: 'landscape-primary' } };
    expect(isPortrait()).toBe(true);
  });
  it('does not mistake an on-screen keyboard for device rotation', () => {
    browser.innerWidth = 390; browser.innerHeight = 844;
    viewport.width = 390; viewport.height = 240;
    expect(isPortrait()).toBe(true);
  });
  it('uses Safari visible height for game layout as toolbars resize', () => {
    syncViewport();
    expect(properties.get('--game-height')).toBe('340px');
    viewport.height = 390;
    syncViewport();
    expect(properties.get('--game-height')).toBe('390px');
    expect(properties.get('--game-width')).toBe('844px');
  });
  it('keeps layout dimensions during a zoomed visual viewport', () => {
    viewport.scale = 2; viewport.width = 422; viewport.height = 195;
    syncViewport();
    expect(properties.get('--game-width')).toBe('844px');
    expect(properties.get('--game-height')).toBe('390px');
  });
  it('recognizes iPhone without a coarse pointer media query', () => {
    expect(isHandheld()).toBe(true);
  });
  it('allows touch testing on desktop without blocking a narrow desktop window', () => {
    vi.stubGlobal('navigator', { userAgent: 'Desktop', platform: 'Win32', maxTouchPoints: 0 });
    expect(isHandheld()).toBe(false);
    vi.stubGlobal('location', { search: '?input=touch' });
    expect(isHandheld()).toBe(true);
  });
  it('does not advertise fullscreen on an iPhone without the DOM API', () => {
    expect(fullscreenAvailable()).toBe(false);
  });
});
