import type { BoardState } from '../types';
import { parseBoard } from './board';
import { createSeed } from './seed';

// The database is the source of truth. This browser copy only makes the first paint instant
// and keeps the wall readable when the API is unreachable.
const CACHE_KEY = 'wall-ewoll:cache:v2';
// Before the database existed, bookmarks lived only under this key.
const LEGACY_KEY = 'wall-ewoll:board:v1';

function read(key: string): BoardState | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? parseBoard(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function loadCachedBoard(): BoardState {
  return read(CACHE_KEY) ?? createSeed();
}

export function cacheBoard(state: BoardState): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(state));
  } catch {
    // Quota or blocked storage: the cache is optional.
  }
}

/** Bookmarks saved by the localStorage-only version, if this browser still has any. */
export function loadLegacyBoard(): BoardState | null {
  const board = read(LEGACY_KEY);
  return board && board.bookmarks.length > 0 ? board : null;
}

export function clearLegacyBoard(): void {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Nothing to clean up.
  }
}

export function exportBoard(state: BoardState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `wall-ewoll-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function readBoardFile(file: File): Promise<BoardState | null> {
  try {
    return parseBoard(JSON.parse(await file.text()));
  } catch {
    return null;
  }
}
