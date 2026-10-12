-- Idempotent: safe to run on every deploy via `npm run db:setup`.
CREATE TABLE IF NOT EXISTS categories (
  id       text PRIMARY KEY,
  name     text NOT NULL,
  tagline  text NOT NULL DEFAULT '',
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
  id         text PRIMARY KEY,
  section_id text NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  title      text NOT NULL,
  url        text NOT NULL,
  note       text NOT NULL DEFAULT '',
  image_url  text NOT NULL DEFAULT '',
  -- Epoch milliseconds, same as Bookmark.createdAt on the client.
  created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS bookmarks_section_idx ON bookmarks (section_id, created_at DESC);
