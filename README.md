# Wall Ewoll

A wall of bookmarks grouped by **category → section**, shown as cards.
MVP categories:

- **Wedding**: Place, Wedding Organizer, Decorations (+ your own sections)
- **Cafe**: Greeny, WFCable, Cute, Sweet Cake (+ your own sections)

Visual language follows [`design.md`](./design.md): cream canvas, saturated section cards that cycle
pink → teal → lavender → peach → ochre → cream, and canvas bookmark cards inside them.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # reducer + URL validation tests
npm run build      # typecheck + production build into dist/
```

## Features

- Category tabs (URL hash routing, e.g. `#/cafe`, so refresh and shared links keep the tab)
- Add / rename / reorder / delete sections per category
- Add / edit / delete bookmarks (link, title, note, optional cover image), move between sections
- Search inside the current category, section jump chips
- Export / import a JSON backup

## How data is stored

Everything lives in the browser's `localStorage` (`wall-ewoll:board:v1`). No backend, no account.
That means bookmarks don't sync between devices; use Export/Import to move them.
All reads/writes go through `src/lib/storage.ts`, so switching to an API or database later is a one-file change.

Only `http(s)` links are accepted (bare domains get `https://`), so a saved card can never run `javascript:` code.
Imported files are validated the same way.

## Structure

```
src/
  types.ts               data model (Category, Section, Bookmark)
  lib/board.ts           reducer + validation of untrusted JSON
  lib/storage.ts         localStorage + export/import
  lib/seed.ts            default categories and sections
  lib/url.ts             URL normalising
  components/            SectionBlock, BookmarkCard, dialogs, hero illustration
  styles/tokens.css      design.md tokens as CSS variables
  styles/app.css         component styles
```
