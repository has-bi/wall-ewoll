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

- Categories: Wedding and Cafe to start; add, rename, pick an icon, reorder or delete more any time
  (mobile: tap the title or "More"; desktop: the + next to the category tabs)
- Sections as tabs inside each category, masonry card grid, floating "+" on mobile
- Every bookmark is normalised to **thumbnail + title + short description** (clamped with "…"),
  whatever the link is: Instagram, Threads, Facebook, TikTok, X/Twitter, YouTube, Google Maps or any article
- Paste a link and the card fills itself in; every field can still be edited by hand
- Links without an image get a brand-colour tile naming the source
- Add / rename / reorder / delete sections; search; JSON export/import; "Fill missing previews" for older bookmarks

## How link previews work

`POST /api/preview` (needs the edit key) reads the link on the server:

| Source | How |
|---|---|
| TikTok | official oEmbed (`tiktok.com/oembed`) |
| X / Twitter | the embed widget's syndication endpoint (`cdn.syndication.twimg.com`) |
| Instagram, Threads, Facebook | Open Graph tags fetched as Meta's link-preview crawler, captions cleaned of "1,204 likes, 31 comments - …" |
| Everything else | Open Graph / Twitter-card / `<title>` tags |

Title = who posted it (social) or the page title (articles); description = caption or meta description.
On save, the server downloads the image, re-encodes it to a ≤720px WebP and stores it in the `thumbnails`
table, served from `/api/thumb`. Platform image URLs (Instagram, TikTok, X) are signed and expire within days,
so cards never depend on them. All server fetches block private/internal addresses, cap size and time out.

Instagram in particular may refuse logged-out requests from datacenter IPs now and then; when a link
can't be read the card still saves, with a fallback tile, and "Refresh from link" can retry later.

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
api/preview.ts           read title/description/image from a link (auth)
api/thumb.ts             serve cached thumbnails
server/db.ts             SQL for every action (Neon serverless driver)
server/preview.ts        per-platform metadata extraction
server/thumbs.ts         download + resize images (sharp)
server/safe-fetch.ts     SSRF-guarded fetch
db/schema.sql            tables
scripts/db-setup.ts      migration + seed
src/
  types.ts               data model (Category, Section, Bookmark)
  lib/board.ts           reducer + validation of untrusted JSON
  lib/api.ts             fetch board / send actions, edit key
  lib/storage.ts         browser cache, legacy data, export/import
  lib/seed.ts            default categories and sections
  lib/url.ts             URL normalising
  lib/platform.ts        detect Instagram/TikTok/X/… from a URL
  components/            PinCard + Masonry, BookmarkDialog, Modal
  styles/tokens.css      design.md tokens as CSS variables
  styles/app.css         component styles
```
