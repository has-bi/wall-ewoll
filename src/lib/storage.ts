import type { BoardState } from '../types';
import { parseBoard } from './board';
import { createSeed } from './seed';

// All persistence goes through this module, so swapping localStorage for an API later touches one file.
const KEY = 'wall-ewoll:board:v1';

export function loadBoard(): BoardState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return parseBoard(JSON.parse(raw)) ?? createSeed();
  } catch {
    // Storage blocked or corrupt JSON: fall back to a fresh board.
  }
  return createSeed();
}

export function saveBoard(state: BoardState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
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
