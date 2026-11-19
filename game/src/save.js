// Save game: cash, mission progress and story state in localStorage.
// Nothing leaves the browser; a fresh player starts at mission 1 with $250.
import { CONFIG } from './config.js';

const KEY = 'solmar-bay-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      cash: state.cash,
      missionIndex: state.missionIndex,
      storyDone: !!state.storyDone,
      savedAt: Date.now(),
    }));
  } catch {
    // storage full or blocked: the game keeps running, progress just is not kept
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function freshState() {
  return { cash: CONFIG.economy.startCash, missionIndex: 0, storyDone: false };
}
