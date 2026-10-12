import type { BoardState, Bookmark, Section } from '../types.js';
import { hostnameOf, normalizeUrl } from './url.js';

export type BookmarkInput = Omit<Bookmark, 'id' | 'createdAt'> & { id?: string };

export type Action =
  | { type: 'section/add'; categoryId: string; name: string; id: string }
  | { type: 'section/rename'; id: string; name: string }
  | { type: 'section/move'; id: string; dir: -1 | 1 }
  | { type: 'section/delete'; id: string }
  | { type: 'bookmark/save'; input: BookmarkInput; id: string; now: number }
  | { type: 'bookmark/delete'; id: string }
  | { type: 'board/replace'; state: BoardState };

export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function boardReducer(state: BoardState, action: Action): BoardState {
  switch (action.type) {
    case 'section/add': {
      const name = action.name.trim();
      if (!name) return state;
      const section: Section = { id: action.id, categoryId: action.categoryId, name };
      return { ...state, sections: [...state.sections, section] };
    }
    case 'section/rename': {
      const name = action.name.trim();
      if (!name) return state;
      return { ...state, sections: state.sections.map((s) => (s.id === action.id ? { ...s, name } : s)) };
    }
    case 'section/move': {
      const from = state.sections.findIndex((s) => s.id === action.id);
      if (from < 0) return state;
      const categoryId = state.sections[from].categoryId;
      // Swap with the nearest neighbour in the same category; other categories' sections are interleaved in the array.
      let to = from + action.dir;
      while (to >= 0 && to < state.sections.length && state.sections[to].categoryId !== categoryId) to += action.dir;
      if (to < 0 || to >= state.sections.length) return state;
      const sections = [...state.sections];
      [sections[from], sections[to]] = [sections[to], sections[from]];
      return { ...state, sections };
    }
    case 'section/delete':
      return {
        ...state,
        sections: state.sections.filter((s) => s.id !== action.id),
        bookmarks: state.bookmarks.filter((b) => b.sectionId !== action.id),
      };
    case 'bookmark/save': {
      const { input } = action;
      const url = normalizeUrl(input.url);
      if (!url || !state.sections.some((s) => s.id === input.sectionId)) return state;
      const fields = {
        sectionId: input.sectionId,
        title: input.title.trim() || hostnameOf(url),
        url,
        note: input.note.trim(),
        imageUrl: normalizeUrl(input.imageUrl) ?? '',
      };
      if (input.id && state.bookmarks.some((b) => b.id === input.id)) {
        return { ...state, bookmarks: state.bookmarks.map((b) => (b.id === input.id ? { ...b, ...fields } : b)) };
      }
      // Newest first, so a fresh save shows at the top of its section.
      return { ...state, bookmarks: [{ id: action.id, createdAt: action.now, ...fields }, ...state.bookmarks] };
    }
    case 'bookmark/delete':
      return { ...state, bookmarks: state.bookmarks.filter((b) => b.id !== action.id) };
    case 'board/replace':
      return action.state;
  }
}

const isStr = (v: unknown): v is string => typeof v === 'string';

/** Validates untrusted JSON (localStorage or an imported file). Returns null when the shape is wrong. */
export function parseBoard(data: unknown): BoardState | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.version !== 1 || !Array.isArray(d.categories) || !Array.isArray(d.sections) || !Array.isArray(d.bookmarks)) {
    return null;
  }
  const categories = d.categories.filter(
    (c): c is BoardState['categories'][number] => !!c && isStr(c.id) && isStr(c.name) && isStr(c.tagline),
  );
  const categoryIds = new Set(categories.map((c) => c.id));
  const sections = d.sections.filter(
    (s): s is Section => !!s && isStr(s.id) && isStr(s.name) && isStr(s.categoryId) && categoryIds.has(s.categoryId),
  );
  const sectionIds = new Set(sections.map((s) => s.id));
  const bookmarks: Bookmark[] = [];
  for (const b of d.bookmarks as Record<string, unknown>[]) {
    if (!b || !isStr(b.id) || !isStr(b.sectionId) || !sectionIds.has(b.sectionId) || !isStr(b.url)) continue;
    const url = normalizeUrl(b.url);
    if (!url) continue;
    bookmarks.push({
      id: b.id,
      sectionId: b.sectionId,
      title: isStr(b.title) ? b.title : url,
      url,
      note: isStr(b.note) ? b.note : '',
      imageUrl: isStr(b.imageUrl) ? (normalizeUrl(b.imageUrl) ?? '') : '',
      createdAt: typeof b.createdAt === 'number' ? b.createdAt : 0,
    });
  }
  if (categories.length === 0) return null;
  return { version: 1, categories, sections, bookmarks };
}
