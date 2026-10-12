import { describe, expect, it } from 'vitest';
import { boardReducer, parseBoard, type BookmarkInput } from './board';
import { createSeed } from './seed';
import { normalizeUrl } from './url';

const save = (state = createSeed(), input: Partial<BookmarkInput> = {}) =>
  boardReducer(state, {
    type: 'bookmark/save',
    id: 'b1',
    now: 1,
    input: { sectionId: 'wedding-s1', title: '', url: 'example.com', note: '', imageUrl: '', ...input },
  });

describe('normalizeUrl', () => {
  it('adds https to bare domains', () => expect(normalizeUrl('instagram.com/venue')).toBe('https://instagram.com/venue'));
  it('rejects non-http schemes', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('data:text/html,hi')).toBeNull();
  });
  it('rejects junk', () => {
    expect(normalizeUrl('')).toBeNull();
    expect(normalizeUrl('hello')).toBeNull();
  });
});

describe('seed', () => {
  it('has the two MVP categories with their sections', () => {
    const s = createSeed();
    expect(s.categories.map((c) => c.name)).toEqual(['Wedding', 'Cafe']);
    expect(s.sections.filter((x) => x.categoryId === 'cafe').map((x) => x.name)).toEqual(['Greeny', 'WFCable', 'Cute', 'Sweet Cake']);
  });
});

describe('boardReducer', () => {
  it('saves a bookmark, falling back to the domain as title', () => {
    const s = save();
    expect(s.bookmarks).toHaveLength(1);
    expect(s.bookmarks[0]).toMatchObject({ title: 'example.com', url: 'https://example.com/' });
  });

  it('ignores bookmarks with an unsafe url or unknown section', () => {
    expect(save(undefined, { url: 'javascript:alert(1)' }).bookmarks).toHaveLength(0);
    expect(save(undefined, { sectionId: 'nope' }).bookmarks).toHaveLength(0);
  });

  it('edits in place and can move a bookmark to another section', () => {
    const s = save(save(), { id: 'b1', sectionId: 'wedding-s2', title: 'Renamed' });
    expect(s.bookmarks).toHaveLength(1);
    expect(s.bookmarks[0]).toMatchObject({ sectionId: 'wedding-s2', title: 'Renamed' });
  });

  it('adds, renames and deletes sections; delete cascades to bookmarks', () => {
    let s = boardReducer(createSeed(), { type: 'section/add', categoryId: 'wedding', name: ' Catering ', id: 'x' });
    expect(s.sections.at(-1)).toEqual({ id: 'x', categoryId: 'wedding', name: 'Catering' });
    s = boardReducer(s, { type: 'section/rename', id: 'x', name: 'Food' });
    expect(s.sections.find((x) => x.id === 'x')?.name).toBe('Food');
    s = save(s, { sectionId: 'x' });
    s = boardReducer(s, { type: 'section/delete', id: 'x' });
    expect(s.sections.some((x) => x.id === 'x')).toBe(false);
    expect(s.bookmarks).toHaveLength(0);
  });

  it('rejects blank section names', () => {
    const s = createSeed();
    expect(boardReducer(s, { type: 'section/add', categoryId: 'wedding', name: '  ', id: 'x' })).toBe(s);
  });

  it('moves sections only within their category', () => {
    // A wedding section added after the cafe ones must skip over them when moved up.
    let s = boardReducer(createSeed(), { type: 'section/add', categoryId: 'wedding', name: 'Catering', id: 'x' });
    s = boardReducer(s, { type: 'section/move', id: 'x', dir: -1 });
    const wedding = s.sections.filter((x) => x.categoryId === 'wedding').map((x) => x.name);
    expect(wedding).toEqual(['Place', 'Wedding Organizer', 'Catering', 'Decorations']);
    const first = s.sections.find((x) => x.categoryId === 'cafe')!;
    expect(boardReducer(s, { type: 'section/move', id: first.id, dir: -1 })).toBe(s);
  });
});

describe('parseBoard', () => {
  it('round-trips a valid board', () => {
    const s = save();
    expect(parseBoard(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('drops bookmarks with unsafe urls or orphan sections', () => {
    const s = createSeed();
    const raw = {
      ...s,
      bookmarks: [
        { id: '1', sectionId: 'wedding-s1', url: 'javascript:alert(1)', title: 'x' },
        { id: '2', sectionId: 'ghost', url: 'https://a.com', title: 'x' },
        { id: '3', sectionId: 'wedding-s1', url: 'https://a.com', title: 'ok' },
      ],
    };
    expect(parseBoard(raw)?.bookmarks.map((b) => b.id)).toEqual(['3']);
  });

  it('rejects the wrong shape', () => {
    expect(parseBoard(null)).toBeNull();
    expect(parseBoard({ version: 2 })).toBeNull();
  });
});
