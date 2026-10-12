# Wall Ewoll

A wall of bookmarks grouped by **category → section**, shown as cards.
MVP categories:

- **Wedding**: Place, Wedding Organizer, Decorations (+ your own sections)
- **Cafe**: Greeny, WFCable, Cute, Sweet Cake (+ your own sections)

Visual language follows [`design.md`](./design.md): cream canvas, saturated section cards that cycle
pink → teal → lavender → peach → ochre → cream, and canvas bookmark cards inside them.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL and WALL_EDIT_KEY
npm run db:setup             # create tables + seed Wedding/Cafe (safe to re-run)
npm run dev                  # http://localhost:5173, also serves /api/board
npm test                     # reducer, URL validation, SQL (in-process Postgres) and auth tests
```

## Deploy (Vercel + Neon)

1. In Vercel → Project → Settings → Environment Variables, make sure `DATABASE_URL` exists
   (the Neon integration adds it) and **add `WALL_EDIT_KEY`** with a long random value.
2. Redeploy. The `vercel-build` script runs `db:setup` first, so the tables are created automatically.

## Features

- Category tabs (URL hash routing, e.g. `#/cafe`, so refresh and shared links keep the tab)
- Add / rename / reorder / delete sections per category
- Add / edit / delete bookmarks (link, title, note, optional cover image), move between sections
- Search inside the current category, section jump chips
- Export / import a JSON backup

## How data is stored

Neon Postgres is the source of truth (`db/schema.sql`: `categories`, `sections`, `bookmarks`).
The browser keeps a cached copy so the page paints instantly and stays readable if the API is down.

- `GET /api/board` returns the whole board. It is **public**: anyone with the URL can view.
- `POST /api/board` applies one change (the same action objects the UI reducer uses). It needs
  `Authorization: Bearer <WALL_EDIT_KEY>`. The UI asks for the key the first time you edit and remembers
  it on that device ("Lock editing" in the footer forgets it). If `WALL_EDIT_KEY` is not set, all writes are refused.
- The UI updates optimistically; if a save fails it reloads the board from the server.
- Bookmarks saved by the earlier localStorage-only version are offered for upload once ("Move them").

Only `http(s)` links are accepted (bare domains get `https://`), both in the browser and on the server,
so a saved card can never run `javascript:` code.

## Structure

```
api/board.ts             Vercel Function: GET board, POST action (auth)
server/db.ts             SQL for every action (Neon serverless driver)
db/schema.sql            tables
scripts/db-setup.ts      migration + seed
src/
  types.ts               data model (Category, Section, Bookmark)
  lib/board.ts           reducer + validation of untrusted JSON
  lib/api.ts             fetch board / send actions, edit key
  lib/storage.ts         browser cache, legacy data, export/import
  lib/seed.ts            default categories and sections
  lib/url.ts             URL normalising
  components/            SectionBlock, BookmarkCard, dialogs, hero illustration
  styles/tokens.css      design.md tokens as CSS variables
  styles/app.css         component styles
```
