-- Idempotent: runs on every deploy via `npm run db:setup`.
-- Keep DO blocks on one line: the setup script splits statements on a trailing ";".
CREATE TABLE IF NOT EXISTS categories (
  id       text PRIMARY KEY,
  name     text NOT NULL,
  tagline  text NOT NULL DEFAULT '',
  icon     text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sections (
  id          text PRIMARY KEY,
  category_id text NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name        text NOT NULL,
  position    integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS sections_category_idx ON sections (category_id, position);

CREATE TABLE IF NOT EXISTS bookmarks (
  id          text PRIMARY KEY,
  section_id  text NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  title       text NOT NULL,
  url         text NOT NULL,
  description text NOT NULL DEFAULT '',
  image_url   text NOT NULL DEFAULT '',
  -- Epoch milliseconds, same as Bookmark.createdAt on the client.
  created_at  bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS bookmarks_section_idx ON bookmarks (section_id, created_at DESC);

-- v2: the free-text "note" became the card description.
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookmarks' AND column_name = 'note') THEN ALTER TABLE bookmarks RENAME COLUMN note TO description; END IF; END $$;

-- v3: categories pick an icon for the bottom nav.
ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon text NOT NULL DEFAULT '';
UPDATE categories SET icon = 'ring' WHERE id = 'wedding' AND icon = '';
UPDATE categories SET icon = 'cup' WHERE id = 'cafe' AND icon = '';
UPDATE categories SET icon = 'grid' WHERE icon = '';

-- Server-side copy of each bookmark's image, resized to WebP. Platform image URLs
-- (Instagram, TikTok, X) are signed and expire, so cards can't rely on them.
CREATE TABLE IF NOT EXISTS thumbnails (
  bookmark_id  text PRIMARY KEY REFERENCES bookmarks(id) ON DELETE CASCADE,
  source_url   text NOT NULL,
  content_type text NOT NULL,
  data         bytea NOT NULL
);
