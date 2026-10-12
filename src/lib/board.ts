import type { BoardState, Bookmark, Category, Section } from '../types.js';
import { hostnameOf, normalizeUrl } from './url.js';

export type BookmarkInput = Pick<Bookmark, 'sectionId' | 'title' | 'url' | 'description' | 'imageUrl'> & { id?: string };

/** Icons a category can pick; shared by the UI and the server's validation. */
export const CATEGORY_ICONS = ['grid', 'ring', 'cup', 'home', 'plane', 'food', 'bag', 'heart', 'book', 'gift'] as const;
export type CategoryIcon = (typeof CATEGORY_ICONS)[number];
export const isCategoryIcon = (v: unknown): v is CategoryIcon => CATEGORY_ICONS.includes(v as CategoryIcon);

export type CategoryInput = Pick<Category, 'name' | 'tagline' | 'icon'>;

export type Action =
  | { type: 'category/add'; id: string; input: CategoryInput }
  | { type: 'category/update'; id: string; input: CategoryInput }
  | { type: 'category/move'; id: string; dir: -1 | 1 }
  | { type: 'category/delete'; id: string }
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

/** URL-friendly id for a new category ("Road Trip" → "road-trip"), unique among existing ids. */
export function categoryIdFor(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'category';
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return id;
}

function cleanCategory(input: CategoryInput): CategoryInput | null {
  const name = input.name.trim().slice(0, 30);
  if (!name) return null;
  return { name, tagline: input.tagline.trim().slice(0, 120), icon: isCategoryIcon(input.icon) ? input.icon : 'grid' };
}

function swapWithin<T extends { id: string }>(list: T[], id: string, dir: -1 | 1, sameGroup: (a: T, b: T) => boolean): T[] | null {
  const from = list.findIndex((x) => x.id === id);
  if (from < 0) return null;
  // Swap with the nearest neighbour in the same group; other groups can be interleaved in the array.
  let to = from + dir;
  while (to >= 0 && to < list.length && !sameGroup(list[from], list[to])) to += dir;
  if (to < 0 || to >= list.length) return null;
  const next = [...list];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function boardReducer(state: BoardState, action: Action): BoardState {
  switch (action.type) {
    case 'category/add': {
      const fields = cleanCategory(action.input);
      if (!fields || state.categories.some((c) => c.id === action.id)) return state;
      return { ...state, categories: [...state.categories, { id: action.id, ...fields }] };
    }
    case 'category/update': {
      const fields = cleanCategory(action.input);
      if (!fields) return state;
      return { ...state, categories: state.categories.map((c) => (c.id === action.id ? { ...c, ...fields } : c)) };
    }
    case 'category/move': {
      const categories = swapWithin(state.categories, action.id, action.dir, () => true);
      return categories ? { ...state, categories } : state;
    }
    case 'category/delete': {
      // The app always needs at least one category to show.
      if (state.categories.length <= 1) return state;
      const gone = new Set(state.sections.filter((s) => s.categoryId === action.id).map((s) => s.id));
      return {
        ...state,
        categories: state.categories.filter((c) => c.id !== action.id),
        sections: state.sections.filter((s) => !gone.has(s.id)),
        bookmarks: state.bookmarks.filter((b) => !gone.has(b.sectionId)),
      };
    }
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
      const sections = swapWithin(state.sections, action.id, action.dir, (a, b) => a.categoryId === b.categoryId);
      return sections ? { ...state, sections } : state;
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
        description: input.description.trim(),
        imageUrl: normalizeUrl(input.imageUrl) ?? '',
      };
      if (input.id && state.bookmarks.some((b) => b.id === input.id)) {
        const update = (b: Bookmark): Bookmark =>
          // The cached thumbnail only stays valid while the image URL is unchanged.
          ({ ...b, ...fields, thumb: b.imageUrl === fields.imageUrl ? b.thumb : undefined });
        return { ...state, bookmarks: state.bookmarks.map((b) => (b.id === input.id ? update(b) : b)) };
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
  const categories: Category[] = (d.categories as Record<string, unknown>[])
    .filter((c) => !!c && isStr(c.id) && isStr(c.name) && isStr(c.tagline))
    .map((c) => ({
      id: c.id as string,
      name: c.name as string,
      tagline: c.tagline as string,
      // Backups from before categories had icons.
      icon: isCategoryIcon(c.icon) ? c.icon : c.id === 'wedding' ? 'ring' : c.id === 'cafe' ? 'cup' : 'grid',
    }));
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
      // Backups from before v2 call the description "note".
      description: isStr(b.description) ? b.description : isStr(b.note) ? b.note : '',
      imageUrl: isStr(b.imageUrl) ? (normalizeUrl(b.imageUrl) ?? '') : '',
      // Goes into an /api/thumb URL, so only accept the hex token the server generates.
      ...(isStr(b.thumb) && /^[a-f0-9]{1,32}$/.test(b.thumb) ? { thumb: b.thumb } : {}),
      createdAt: typeof b.createdAt === 'number' ? b.createdAt : 0,
    });
  }
  if (categories.length === 0) return null;
  return { version: 1, categories, sections, bookmarks };
}
