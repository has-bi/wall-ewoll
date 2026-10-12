import { applyAction, BadRequest, readBoard } from '../server/db.js';
import { canEdit, json, unauthorized } from '../server/auth.js';
import { parseBoard, type Action } from '../src/lib/board.js';

// Vercel Function: GET returns the whole board, POST applies one action.
// Reads are public; writes need the WALL_EDIT_KEY env var, sent as a Bearer token.

export async function GET(): Promise<Response> {
  try {
    return json(await readBoard());
  } catch (err) {
    console.error(err);
    return json({ error: 'Could not load the board' }, 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!canEdit(request)) return unauthorized();
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
