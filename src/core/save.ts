import type { GameMode, ModeSave, SaveData, Settings } from '../types';

const KEY = 'duchesse-1001-services-v1';

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8,
  music: 0.6,
  sfx: 0.8,
  quality: 'high',
  shake: true,
};

function freshMode(): ModeSave {
  return { unlocked: 1, current: 1, equipment: {}, ringCooldowns: {}, best: {}, totalServed: 0 };
}

export function freshSave(): SaveData {
  return {
    version: 1,
    modes: { salon: freshMode(), coupdefeu: freshMode() },
    settings: { ...DEFAULT_SETTINGS },
    seenIntros: [],
  };
}

/** Charge la sauvegarde (ou en crée une neuve si absente / illisible). */
export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshSave();
    const data = JSON.parse(raw) as Partial<SaveData>;
    const base = freshSave();
    const modes = { ...base.modes };
    for (const m of ['salon', 'coupdefeu'] as GameMode[]) modes[m] = { ...freshMode(), ...(data.modes?.[m] ?? {}) };
    return {
      version: 1,
      modes,
      settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) },
      seenIntros: Array.isArray(data.seenIntros) ? data.seenIntros : [],
    };
  } catch {
    return freshSave();
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // stockage indisponible (navigation privée) : on continue sans sauvegarde
  }
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}
