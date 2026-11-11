import { useCallback, useState } from 'react';
import type { SavedState } from '../types';

// Same key and shape as the pre-React app, so existing progress carries over.
export const KEY = 'bearTrainerV1';

export function loadSaved(): SavedState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s === 'object') return { ...s, a: s.a || {} };
  } catch { /* private mode or bad JSON: start fresh */ }
  return { a: {} };
}

function persist(s: SavedState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or blocked */ }
}

/** App-wide saved state; every update is written to localStorage. */
export function useSaved() {
  const [saved, setSaved] = useState<SavedState>(loadSaved);
  const update = useCallback((fn: (s: SavedState) => SavedState) => {
    setSaved((prev) => { const next = fn(prev); persist(next); return next; });
  }, []);
  return [saved, update] as const;
}
