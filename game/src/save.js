// Save / load for Cayo Verde: one small JSON record in localStorage, written after
// every completed mission and read back on the title screen.
const SAVE_KEY = 'cayo-verde-save-v1';

export function saveProgress(state) {
  try {
    const record = {
      cash: state.cash,
      missionIndex: state.missionIndex,
      health: state.health,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function loadProgress() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw);
    if (typeof record.cash !== 'number' || typeof record.missionIndex !== 'number') return null;
    return record;
  } catch {
    return null;
  }
}

export function clearProgress() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* storage unavailable */ }
}
