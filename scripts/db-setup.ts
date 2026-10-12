// Creates the tables (idempotent) and seeds Wedding + Cafe if the board is empty.
// Usage: DATABASE_URL=... npm run db:setup
import { readFileSync } from 'node:fs';
import { readBoard, sql } from '../server/db.js';

const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
const statements = schema
  .split(/;\s*$/m)
  .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
  .filter(Boolean);

const db = sql();
for (const statement of statements) await db.query(statement);

const board = await readBoard();
console.log(
  `Schema ready. ${board.categories.length} categories, ${board.sections.length} sections, ${board.bookmarks.length} bookmarks.`,
);
