import type { BoardState } from '../types';
import { parseBoard, type Action } from './board';

const KEY_STORAGE = 'wall-ewoll:edit-key';

export class UnauthorizedError extends Error {}

export function getEditKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function setEditKey(key: string): void {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // Private mode: the key just won't be remembered.
  }
}

export async function fetchBoard(): Promise<BoardState> {
  const res = await fetch('/api/board', { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET /api/board failed: ${res.status}`);
  const board = parseBoard(await res.json());
  if (!board) throw new Error('Server returned an invalid board');
  return board;
}

export async function sendAction(action: Action): Promise<void> {
  const res = await fetch('/api/board', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${getEditKey()}` },
    body: JSON.stringify(action),
  });
  if (res.status === 401) throw new UnauthorizedError((await res.json().catch(() => null))?.error ?? 'Unauthorized');
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Save failed (${res.status})`);
}
