import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import type { BoardState } from '../src/types.js';
import { isCategoryIcon, type Action, type BookmarkInput, type CategoryInput } from '../src/lib/board.js';
import { hostnameOf, normalizeUrl } from '../src/lib/url.js';
import { createSeed } from '../src/lib/seed.js';
import { fetchThumbnail } from './thumbs.js';

let client: NeonQueryFunction<false, false> | null = null;

export function sql(): NeonQueryFunction<false, false> {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    client = neon(url);
  }
  return client;
}

/** Tests swap in an in-process Postgres with the same tagged-template interface. */
export function setSqlClient(next: NeonQueryFunction<false, false> | null): void {
  client = next;
}

export class BadRequest extends Error {}

const LIMITS = { categoryName: 30, tagline: 120, sectionName: 40, title: 120, description: 500, url: 2048 };

function cleanName(name: unknown): string {
  if (typeof name !== 'string' || !name.trim()) throw new BadRequest('Name is required');
  return name.trim().slice(0, LIMITS.sectionName);
}

function cleanCategory(input: Partial<CategoryInput> | undefined): CategoryInput {
  const name = typeof input?.name === 'string' ? input.name.trim().slice(0, LIMITS.categoryName) : '';
  if (!name) throw new BadRequest('Name is required');
  return {
    name,
    tagline: typeof input?.tagline === 'string' ? input.tagline.trim().slice(0, LIMITS.tagline) : '',
    icon: isCategoryIcon(input?.icon) ? input.icon : 'grid',
  };
}

function categoryId(v: unknown): string {
  // Category ids appear in URLs (#/road-trip), so keep them to a safe alphabet.
  if (typeof v !== 'string' || !/^[\w-]{1,64}$/.test(v)) throw new BadRequest('Invalid category id');
  return v;
}

function str(v: unknown, field: string): string {
  if (typeof v !== 'string') throw new BadRequest(`${field} must be a string`);
  return v;
}

export async function readBoard(): Promise<BoardState> {
  const db = sql();
  let [categories, sections, bookmarks] = await db.transaction([
    db`SELECT id, name, tagline, icon FROM categories ORDER BY position, id`,
    db`SELECT id, category_id AS "categoryId", name FROM sections ORDER BY position, id`,
    db`SELECT b.id, b.section_id AS "sectionId", b.title, b.url, b.description, b.image_url AS "imageUrl",
              b.created_at AS "createdAt",
              CASE WHEN t.source_url = b.image_url THEN left(md5(t.source_url), 12) END AS thumb
       FROM bookmarks b LEFT JOIN thumbnails t ON t.bookmark_id = b.id
       ORDER BY b.created_at DESC, b.id`,
  ]);
  if (categories.length === 0) {
    // First run on an empty database: install the default Wedding + Cafe board.
    await replaceBoard(createSeed());
    return createSeed();
  }
  bookmarks = bookmarks.map(({ thumb, ...b }) => ({ ...b, createdAt: Number(b.createdAt), ...(thumb ? { thumb } : {}) }));
  return { version: 1, categories, sections, bookmarks } as BoardState;
}

export async function replaceBoard(state: BoardState): Promise<void> {
  const db = sql();
  const { categories: c, sections: s, bookmarks: b } = state;
  await db.transaction([
    db`DELETE FROM categories`,
    db`INSERT INTO categories (id, name, tagline, icon, position)
       SELECT * FROM unnest(${c.map((x) => x.id)}::text[], ${c.map((x) => x.name)}::text[],
                            ${c.map((x) => x.tagline)}::text[], ${c.map((x) => x.icon)}::text[], ${c.map((_, i) => i)}::int[])`,
    db`INSERT INTO sections (id, category_id, name, position)
       SELECT * FROM unnest(${s.map((x) => x.id)}::text[], ${s.map((x) => x.categoryId)}::text[],
                            ${s.map((x) => x.name)}::text[], ${s.map((_, i) => i)}::int[])`,
    db`INSERT INTO bookmarks (id, section_id, title, url, description, image_url, created_at)
       SELECT * FROM unnest(${b.map((x) => x.id)}::text[], ${b.map((x) => x.sectionId)}::text[],
                            ${b.map((x) => x.title)}::text[], ${b.map((x) => x.url)}::text[],
                            ${b.map((x) => x.description)}::text[], ${b.map((x) => x.imageUrl)}::text[],
                            ${b.map((x) => x.createdAt)}::bigint[])`,
  ]);
}

/**
 * Applies the same actions the client reducer handles, so the UI can update
 * optimistically and send the identical action here. Input is untrusted.
 */
export async function applyAction(action: Action): Promise<void> {
  const db = sql();
  switch (action.type) {
    case 'category/add': {
      const { name, tagline, icon } = cleanCategory(action.input);
      const rows = await db`
        INSERT INTO categories (id, name, tagline, icon, position)
        VALUES (${categoryId(action.id)}, ${name}, ${tagline}, ${icon},
                COALESCE((SELECT MAX(position) + 1 FROM categories), 0))
        ON CONFLICT (id) DO NOTHING
        RETURNING id`;
      if (rows.length === 0) throw new BadRequest('A category with that id already exists');
      return;
    }
    case 'category/update': {
      const { name, tagline, icon } = cleanCategory(action.input);
      await db`UPDATE categories SET name = ${name}, tagline = ${tagline}, icon = ${icon} WHERE id = ${categoryId(action.id)}`;
      return;
    }
    case 'category/move': {
      if (action.dir !== 1 && action.dir !== -1) throw new BadRequest('dir must be 1 or -1');
      const id = categoryId(action.id);
      // Same approach as sections: normalise to 0..n-1, then swap with the neighbour.
      await db.transaction([
        db`UPDATE categories c SET position = r.rn
           FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY position, id) - 1 AS rn FROM categories) r
           WHERE c.id = r.id`,
        db`UPDATE categories c SET position = CASE WHEN c.id = ${id} THEN me.position + ${action.dir} ELSE me.position END
           FROM (SELECT position FROM categories WHERE id = ${id}) me
           WHERE (c.id = ${id} OR c.position = me.position + ${action.dir})
             AND EXISTS (SELECT 1 FROM categories n WHERE n.position = me.position + ${action.dir})`,
      ]);
      return;
    }
    case 'category/delete': {
      const id = categoryId(action.id);
      // Sections, bookmarks and thumbnails go with it (ON DELETE CASCADE). Never delete the last one.
      const rows = await db`DELETE FROM categories WHERE id = ${id} AND (SELECT count(*) FROM categories) > 1 RETURNING id`;
      if (rows.length === 0) {
        const [{ n }] = await db`SELECT count(*)::int AS n FROM categories WHERE id = ${id}`;
        if (n) throw new BadRequest("Can't delete the last category");
      }
      return;
    }
    case 'section/add': {
      const name = cleanName(action.name);
      const id = str(action.id, 'id');
      const categoryId = str(action.categoryId, 'categoryId');
      const rows = await db`
        INSERT INTO sections (id, category_id, name, position)
        SELECT ${id}, c.id, ${name},
               COALESCE((SELECT MAX(position) + 1 FROM sections WHERE category_id = c.id), 0)
        FROM categories c WHERE c.id = ${categoryId}
        ON CONFLICT (id) DO NOTHING
        RETURNING id`;
      if (rows.length === 0) throw new BadRequest('Unknown category or duplicate id');
      return;
    }
    case 'section/rename':
      await db`UPDATE sections SET name = ${cleanName(action.name)} WHERE id = ${str(action.id, 'id')}`;
      return;
    case 'section/move': {
      if (action.dir !== 1 && action.dir !== -1) throw new BadRequest('dir must be 1 or -1');
      const id = str(action.id, 'id');
      // Normalise positions to 0..n-1 inside the category first, then swap with the neighbour.
      await db.transaction([
        db`UPDATE sections s SET position = r.rn
           FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY position, id) - 1 AS rn FROM sections
                 WHERE category_id = (SELECT category_id FROM sections WHERE id = ${id})) r
           WHERE s.id = r.id`,
        db`UPDATE sections s SET position = CASE WHEN s.id = ${id} THEN me.position + ${action.dir} ELSE me.position END
           FROM (SELECT category_id, position FROM sections WHERE id = ${id}) me
           WHERE s.category_id = me.category_id
             AND (s.id = ${id} OR s.position = me.position + ${action.dir})
             AND EXISTS (SELECT 1 FROM sections n WHERE n.category_id = me.category_id AND n.position = me.position + ${action.dir})`,
      ]);
      return;
    }
    case 'section/delete':
      await db`DELETE FROM sections WHERE id = ${str(action.id, 'id')}`;
      return;
    case 'bookmark/save': {
      const input: Partial<BookmarkInput> = action.input ?? {};
      const url = normalizeUrl(str(input.url, 'url').slice(0, LIMITS.url));
      if (!url) throw new BadRequest('Only http(s) links are allowed');
      const sectionId = str(input.sectionId, 'sectionId');
      const title = (typeof input.title === 'string' ? input.title.trim() : '').slice(0, LIMITS.title) || hostnameOf(url);
      const description = (typeof input.description === 'string' ? input.description.trim() : '').slice(0, LIMITS.description);
      const imageUrl = typeof input.imageUrl === 'string' ? (normalizeUrl(input.imageUrl.slice(0, LIMITS.url)) ?? '') : '';
      const id = typeof input.id === 'string' && input.id ? input.id : str(action.id, 'id');
      const now = typeof action.now === 'number' && Number.isFinite(action.now) ? Math.trunc(action.now) : Date.now();
      const rows = await db`
        INSERT INTO bookmarks (id, section_id, title, url, description, image_url, created_at)
        SELECT ${id}, s.id, ${title}, ${url}, ${description}, ${imageUrl}, ${now} FROM sections s WHERE s.id = ${sectionId}
        ON CONFLICT (id) DO UPDATE SET
          section_id = EXCLUDED.section_id, title = EXCLUDED.title, url = EXCLUDED.url,
          description = EXCLUDED.description, image_url = EXCLUDED.image_url
        RETURNING id`;
      if (rows.length === 0) throw new BadRequest('Unknown section');
      await syncThumbnail(id, imageUrl);
      return;
    }
    case 'bookmark/delete':
      await db`DELETE FROM bookmarks WHERE id = ${str(action.id, 'id')}`;
      return;
    case 'board/replace':
      // Caller has already validated the payload with parseBoard.
      await replaceBoard(action.state);
      return;
    default:
      throw new BadRequest('Unknown action');
  }
}

/** Keeps the cached thumbnail in step with the bookmark's image URL. Failures leave the card on its fallback tile. */
async function syncThumbnail(bookmarkId: string, imageUrl: string): Promise<void> {
  const db = sql();
  if (!imageUrl) {
    await db`DELETE FROM thumbnails WHERE bookmark_id = ${bookmarkId}`;
    return;
  }
  const [existing] = await db`SELECT source_url FROM thumbnails WHERE bookmark_id = ${bookmarkId}`;
  if (existing?.source_url === imageUrl) return;
  try {
    const thumb = await fetchThumbnail(imageUrl);
    await db`
      INSERT INTO thumbnails (bookmark_id, source_url, content_type, data)
      VALUES (${bookmarkId}, ${imageUrl}, ${thumb.contentType}, decode(${thumb.data.toString('base64')}, 'base64'))
      ON CONFLICT (bookmark_id) DO UPDATE SET
        source_url = EXCLUDED.source_url, content_type = EXCLUDED.content_type, data = EXCLUDED.data`;
  } catch (err) {
    console.warn(`Thumbnail for ${bookmarkId} failed:`, err instanceof Error ? err.message : err);
    await db`DELETE FROM thumbnails WHERE bookmark_id = ${bookmarkId}`;
  }
}

export async function readThumbnail(bookmarkId: string): Promise<{ contentType: string; data: Buffer } | null> {
  const [row] = await sql()`
    SELECT content_type AS "contentType", encode(data, 'base64') AS data FROM thumbnails WHERE bookmark_id = ${bookmarkId}`;
  return row ? { contentType: row.contentType as string, data: Buffer.from(row.data as string, 'base64') } : null;
}
