import { createHash, timingSafeEqual } from 'node:crypto';

/** One shared key (WALL_EDIT_KEY) unlocks every write. No key configured means nobody can write. */
export function canEdit(request: Request): boolean {
  const expected = process.env.WALL_EDIT_KEY;
  if (!expected) return false;
  const given = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const digest = (v: string) => createHash('sha256').update(v).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

export const unauthorized = () =>
  json({ error: process.env.WALL_EDIT_KEY ? 'Wrong edit key' : 'WALL_EDIT_KEY is not configured' }, 401);

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
