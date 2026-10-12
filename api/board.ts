import { createHash, timingSafeEqual } from 'node:crypto';
import { applyAction, BadRequest, readBoard } from '../server/db.js';
import { parseBoard, type Action } from '../src/lib/board.js';

// Vercel Function: GET returns the whole board, POST applies one action.
// Reads are public; writes need the WALL_EDIT_KEY env var, sent as a Bearer token.

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

function canEdit(request: Request): boolean {
  const expected = process.env.WALL_EDIT_KEY;
  if (!expected) return false; // Fail closed: no key configured means nobody can write.
  const given = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const digest = (v: string) => createHash('sha256').update(v).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

export async function GET(): Promise<Response> {
  try {
    return json(await readBoard());
  } catch (err) {
    console.error(err);
    return json({ error: 'Could not load the board' }, 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!canEdit(request)) {
    return json({ error: process.env.WALL_EDIT_KEY ? 'Wrong edit key' : 'WALL_EDIT_KEY is not configured' }, 401);
  }
  let action: Action;
  try {
    action = (await request.json()) as Action;
  } catch {
    return json({ error: 'Body must be JSON' }, 400);
  }
  try {
    if (action?.type === 'board/replace') {
      const state = parseBoard(action.state);
      if (!state) return json({ error: 'Invalid board backup' }, 400);
      action = { type: 'board/replace', state };
    }
    await applyAction(action);
    return json({ ok: true });
  } catch (err) {
    if (err instanceof BadRequest) return json({ error: err.message }, 400);
    console.error(err);
    return json({ error: 'Could not save the change' }, 500);
  }
}
