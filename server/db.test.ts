// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type { NeonQueryFunction } from '@neondatabase/serverless';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAction, BadRequest, readBoard, readThumbnail, setSqlClient } from './db';
import { createSeed } from '../src/lib/seed';
import { POST } from '../api/board';

/** Minimal stand-in for neon(): lazy tagged-template queries, .query(), and .transaction([...]). */
function pgliteNeon(pg: PGlite): NeonQueryFunction<false, false> {
  type Q = PromiseLike<unknown[]> & { text: string; params: unknown[] };
  const run = async (text: string, params: unknown[]) => (await pg.query(text, params)).rows;
  const make = (text: string, params: unknown[]): Q => ({
    text,
    params,
    then: (ok, fail) => run(text, params).then(ok, fail),
  });
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) =>
    make(strings.reduce((acc, s, i) => `${acc}$${i}${s}`), values);
  sql.query = (text: string, params: unknown[] = []) => make(text, params);
  sql.transaction = async (queries: Q[]) =>
    pg.transaction(async (tx) => {
      const out = [];
      for (const q of queries) out.push((await tx.query(q.text, q.params)).rows);
      return out;
    });
  return sql as unknown as NeonQueryFunction<false, false>;
}

// No network in tests: any image URL containing "broken" fails, everything else "downloads".
vi.mock('./thumbs.js', () => ({
  fetchThumbnail: vi.fn(async (url: string) => {
    if (url.includes('broken')) throw new Error('404');
    return { contentType: 'image/webp', data: Buffer.from(`img:${url}`) };
  }),
}));

const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');

beforeEach(async () => {
  const pg = new PGlite();
  await pg.exec(schema);
  setSqlClient(pgliteNeon(pg));
});

const save = (input: Record<string, unknown>, id = 'b1') =>
  applyAction({
    type: 'bookmark/save',
    id,
    now: 1000,
    input: { sectionId: 'wedding-s1', title: '', url: 'example.com', description: '', imageUrl: '', ...input },
  } as never);

describe('database', () => {
  it('seeds Wedding and Cafe on first read', async () => {
    const board = await readBoard();
    expect(board).toEqual(createSeed());
    expect(await readBoard()).toEqual(createSeed());
  });

  it('saves, edits and deletes bookmarks; newest first', async () => {
    await readBoard();
    await save({ title: 'Old' }, 'a');
    await applyAction({ type: 'bookmark/save', id: 'b', now: 2000, input: { sectionId: 'wedding-s1', title: 'New', url: 'https://b.com', description: ' hi ', imageUrl: '' } });
    let board = await readBoard();
    expect(board.bookmarks.map((b) => b.title)).toEqual(['New', 'Old']);
    expect(board.bookmarks[0]).toMatchObject({ url: 'https://b.com/', description: 'hi', createdAt: 2000 });

    await save({ id: 'a', sectionId: 'wedding-s2', title: 'Moved' }, 'ignored');
    board = await readBoard();
    expect(board.bookmarks.find((b) => b.id === 'a')).toMatchObject({ sectionId: 'wedding-s2', title: 'Moved', createdAt: 1000 });
    expect(board.bookmarks).toHaveLength(2);

    await applyAction({ type: 'bookmark/delete', id: 'a' });
    expect((await readBoard()).bookmarks.map((b) => b.id)).toEqual(['b']);
  });

  it('rejects unsafe urls and unknown sections', async () => {
    await readBoard();
    await expect(save({ url: 'javascript:alert(1)' })).rejects.toBeInstanceOf(BadRequest);
    await expect(save({ sectionId: 'ghost' })).rejects.toBeInstanceOf(BadRequest);
  });

  it('adds, renames, moves and deletes sections; delete cascades', async () => {
    await readBoard();
    await applyAction({ type: 'section/add', categoryId: 'wedding', name: '  Catering ', id: 'x' });
    await expect(applyAction({ type: 'section/add', categoryId: 'nope', name: 'A', id: 'y' })).rejects.toBeInstanceOf(BadRequest);
    await applyAction({ type: 'section/rename', id: 'x', name: 'Food' });
    await applyAction({ type: 'section/move', id: 'x', dir: -1 });
    let names = (await readBoard()).sections.filter((s) => s.categoryId === 'wedding').map((s) => s.name);
    expect(names).toEqual(['Place', 'Wedding Organizer', 'Food', 'Decorations']);

    // Moving the first section up is a no-op.
    await applyAction({ type: 'section/move', id: 'wedding-s1', dir: -1 });
    names = (await readBoard()).sections.filter((s) => s.categoryId === 'wedding').map((s) => s.name);
    expect(names[0]).toBe('Place');

    await save({ sectionId: 'x' });
    await applyAction({ type: 'section/delete', id: 'x' });
    const board = await readBoard();
    expect(board.sections.some((s) => s.id === 'x')).toBe(false);
    expect(board.bookmarks).toHaveLength(0);
  });

  it('replaces the whole board (import)', async () => {
    await readBoard();
    const next = createSeed();
    next.sections = next.sections.slice(0, 2);
    next.bookmarks = [{ id: 'i', sectionId: 'wedding-s2', title: 'T', url: 'https://t.com/', description: '', imageUrl: '', createdAt: 5 }];
    await applyAction({ type: 'board/replace', state: next });
    expect(await readBoard()).toEqual(next);
  });
});

describe('categories', () => {
  it('adds, updates, reorders and deletes categories', async () => {
    await readBoard();
    await applyAction({ type: 'category/add', id: 'road-trip', input: { name: 'Road Trip', tagline: 'Weekend drives', icon: 'plane' } });
    await expect(applyAction({ type: 'category/add', id: 'road-trip', input: { name: 'Again', tagline: '', icon: 'grid' } })).rejects.toBeInstanceOf(BadRequest);
    await expect(applyAction({ type: 'category/add', id: 'bad id!', input: { name: 'X', tagline: '', icon: 'grid' } })).rejects.toBeInstanceOf(BadRequest);
    await expect(applyAction({ type: 'category/add', id: 'empty', input: { name: '  ', tagline: '', icon: 'grid' } })).rejects.toBeInstanceOf(BadRequest);
    await applyAction({ type: 'category/update', id: 'road-trip', input: { name: 'Trips', tagline: '', icon: '<script>' } });
    await applyAction({ type: 'category/move', id: 'road-trip', dir: -1 });
    let board = await readBoard();
    expect(board.categories.map((c) => c.id)).toEqual(['wedding', 'road-trip', 'cafe']);
    expect(board.categories[1]).toEqual({ id: 'road-trip', name: 'Trips', tagline: '', icon: 'grid' });

    await applyAction({ type: 'section/add', categoryId: 'road-trip', name: 'Bali', id: 'bali' });
    await save({ sectionId: 'bali', imageUrl: 'https://cdn.example.com/bali.jpg' });
    await applyAction({ type: 'category/delete', id: 'road-trip' });
    board = await readBoard();
    expect(board.categories.map((c) => c.id)).toEqual(['wedding', 'cafe']);
    expect(board.sections.some((s) => s.id === 'bali')).toBe(false);
    expect(board.bookmarks).toHaveLength(0);
    expect(await readThumbnail('b1')).toBeNull();
  });

  it('refuses to delete the last category', async () => {
    await readBoard();
    await applyAction({ type: 'category/delete', id: 'cafe' });
    await expect(applyAction({ type: 'category/delete', id: 'wedding' })).rejects.toThrow(/last category/);
    expect((await readBoard()).categories.map((c) => c.id)).toEqual(['wedding']);
  });
});

describe('thumbnails', () => {
  it('caches the image on save and exposes a version token', async () => {
    await readBoard();
    await save({ imageUrl: 'https://cdn.example.com/a.jpg' });
    const [b] = (await readBoard()).bookmarks;
    expect(b.thumb).toMatch(/^[a-f0-9]{12}$/);
    expect((await readThumbnail('b1'))?.data.toString()).toBe('img:https://cdn.example.com/a.jpg');
  });

  it('drops a stale thumbnail when the new image cannot be fetched', async () => {
    await readBoard();
    await save({ imageUrl: 'https://cdn.example.com/a.jpg' });
    await save({ id: 'b1', imageUrl: 'https://cdn.example.com/broken.jpg' });
    const [b] = (await readBoard()).bookmarks;
    expect(b.imageUrl).toBe('https://cdn.example.com/broken.jpg');
    expect(b.thumb).toBeUndefined();
    expect(await readThumbnail('b1')).toBeNull();
  });

  it('removes the thumbnail when the image is cleared, and with the bookmark', async () => {
    await readBoard();
    await save({ imageUrl: 'https://cdn.example.com/a.jpg' });
    await save({ id: 'b1', imageUrl: '' });
    expect(await readThumbnail('b1')).toBeNull();
    await save({ id: 'b1', imageUrl: 'https://cdn.example.com/a.jpg' });
    await applyAction({ type: 'bookmark/delete', id: 'b1' });
    expect(await readThumbnail('b1')).toBeNull();
  });
});

describe('schema migration', () => {
  it('renames the v1 "note" column to "description" without losing data', async () => {
    const old = new PGlite();
    await old.exec(`
      CREATE TABLE categories (id text PRIMARY KEY, name text NOT NULL, tagline text NOT NULL DEFAULT '', position integer NOT NULL DEFAULT 0);
      CREATE TABLE sections (id text PRIMARY KEY, category_id text NOT NULL REFERENCES categories(id) ON DELETE CASCADE, name text NOT NULL, position integer NOT NULL DEFAULT 0);
      CREATE TABLE bookmarks (id text PRIMARY KEY, section_id text NOT NULL REFERENCES sections(id) ON DELETE CASCADE, title text NOT NULL, url text NOT NULL, note text NOT NULL DEFAULT '', image_url text NOT NULL DEFAULT '', created_at bigint NOT NULL);
      INSERT INTO categories VALUES ('cafe', 'Cafe', '', 0);
      INSERT INTO sections VALUES ('s', 'cafe', 'Greeny', 0);
      INSERT INTO bookmarks VALUES ('x', 's', 'Kopi', 'https://kopi.com/', 'old note', '', 1);`);
    // Same splitting as scripts/db-setup.ts, run twice to prove it's idempotent.
    const statements = schema.split(/;\s*$/m).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean);
    for (let i = 0; i < 2; i++) for (const st of statements) await old.query(st);
    setSqlClient(pgliteNeon(old));
    const board = await readBoard();
    expect(board.bookmarks[0]).toMatchObject({ id: 'x', description: 'old note' });
    expect(board.categories[0]).toMatchObject({ id: 'cafe', icon: 'cup' });
  });
});

describe('POST /api/board auth', () => {
  const post = (key?: string) =>
    POST(
      new Request('http://x/api/board', {
        method: 'POST',
        headers: key ? { authorization: `Bearer ${key}` } : {},
        body: JSON.stringify({ type: 'bookmark/delete', id: 'nothing' }),
      }),
    );

  it('refuses writes when no key is configured', async () => {
    delete process.env.WALL_EDIT_KEY;
    expect((await post('anything')).status).toBe(401);
  });

  it('checks the bearer key', async () => {
    process.env.WALL_EDIT_KEY = 'secret';
    expect((await post()).status).toBe(401);
    expect((await post('wrong')).status).toBe(401);
    expect((await post('secret')).status).toBe(200);
  });
});
