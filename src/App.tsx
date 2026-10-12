import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { BoardState, Bookmark, Section } from './types';
import { boardReducer, newId, type Action } from './lib/board';
import { cacheBoard, clearLegacyBoard, exportBoard, loadCachedBoard, loadLegacyBoard, readBoardFile } from './lib/storage';
import { fetchBoard, fetchPreview, getEditKey, sendAction, setEditKey, UnauthorizedError } from './lib/api';
import { hostnameOf } from './lib/url';
import { BookmarkDialog } from './components/BookmarkDialog';
import { Masonry, PinCard } from './components/PinCard';
import { Modal } from './components/Modal';
import { Icon, type IconName } from './components/Icon';

type DialogState =
  | { kind: 'none' }
  | { kind: 'bookmark'; bookmark?: Bookmark; sectionId: string }
  | { kind: 'section'; section?: Section }
  | { kind: 'delete-section'; section: Section; count: number }
  | { kind: 'delete-bookmark'; bookmark: Bookmark }
  /** `then` runs once a key has been entered: a retried save, or opening the add dialog. */
  | { kind: 'edit-key'; then: () => void; error: string };

type SyncStatus = 'loading' | 'online' | 'offline';

// Routes: #/<categoryId> or #/<categoryId>/<sectionId>
const readHash = () => {
  const [categoryId = '', sectionId = ''] = window.location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  return { categoryId, sectionId };
};
const hrefFor = (categoryId: string, sectionId?: string) =>
  `#/${encodeURIComponent(categoryId)}${sectionId ? `/${encodeURIComponent(sectionId)}` : ''}`;

const CATEGORY_ICONS: Record<string, IconName> = { wedding: 'ring', cafe: 'cup' };

export default function App() {
  const [board, dispatch] = useReducer(boardReducer, undefined, loadCachedBoard);
  const [status, setStatus] = useState<SyncStatus>('loading');
  const [hasKey, setHasKey] = useState(() => !!getEditKey());
  const [keyDraft, setKeyDraft] = useState('');
  const [legacy, setLegacy] = useState<BoardState | null>(loadLegacyBoard);
  const [route, setRoute] = useState(readHash);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [sectionName, setSectionName] = useState('');
  const [notice, setNotice] = useState('');
  const [bulk, setBulk] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => cacheBoard(board), [board]);

  const refresh = useCallback(async () => {
    try {
      dispatch({ type: 'board/replace', state: await fetchBoard() });
      setStatus('online');
    } catch {
      setStatus('offline');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const category = board.categories.find((c) => c.id === route.categoryId) ?? board.categories[0];
  const sections = useMemo(() => board.sections.filter((s) => s.categoryId === category.id), [board.sections, category.id]);
  const activeSection = sections.find((s) => s.id === route.sectionId);
  const sectionNames = useMemo(() => new Map(sections.map((s) => [s.id, s.name])), [sections]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      board.bookmarks.filter(
        (b) =>
          (activeSection ? b.sectionId === activeSection.id : sectionNames.has(b.sectionId)) &&
          (!q || [b.title, b.description, hostnameOf(b.url)].some((t) => t.toLowerCase().includes(q))),
      ),
    [board.bookmarks, activeSection, sectionNames, q],
  );
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of board.bookmarks) map.set(b.sectionId, (map.get(b.sectionId) ?? 0) + 1);
    return map;
  }, [board.bookmarks]);
  const totalInCategory = sections.reduce((n, s) => n + (counts.get(s.id) ?? 0), 0);
  const missingPreviews = board.bookmarks.filter((b) => !b.thumb).length;

  const close = () => setDialog({ kind: 'none' });
  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 3000);
  };
  const askForKey = (then: () => void, error = '') => {
    setKeyDraft('');
    setDialog({ kind: 'edit-key', then, error });
  };
  /** Runs fn now if this device has an edit key, otherwise after the user enters one. */
  const requireKey = (fn: () => void) => (getEditKey() ? fn() : askForKey(fn));

  /** Applies a change locally right away, then saves it. On failure the board is reloaded from the server. */
  const commit = async (action: Action, onSuccess?: () => void): Promise<void> => {
    if (status !== 'online') {
      flash(status === 'loading' ? 'Still loading — try again in a second.' : "Offline — changes can't be saved right now.");
      return;
    }
    dispatch(action);
    try {
      await sendAction(action);
      onSuccess?.();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        askForKey(() => void commit(action, onSuccess), getEditKey() ? err.message : '');
      } else {
        flash(err instanceof Error ? err.message : 'Save failed.');
      }
      void refresh();
    }
  };

  const openSectionDialog = (section?: Section) => {
    setSectionName(section?.name ?? '');
    setDialog({ kind: 'section', section });
  };
  const openAdd = () => {
    const sectionId = activeSection?.id ?? sections[0]?.id;
    if (!sectionId) return openSectionDialog();
    requireKey(() => setDialog({ kind: 'bookmark', sectionId }));
  };

  /** Re-reads title/description/thumbnail for bookmarks that have no cached thumbnail yet. */
  const fillMissing = () =>
    requireKey(async () => {
      const todo = board.bookmarks.filter((b) => !b.thumb);
      let failed = 0;
      for (const [i, b] of todo.entries()) {
        setBulk(`Reading links ${i + 1}/${todo.length}…`);
        try {
          const p = await fetchPreview(b.url);
          const keepTitle = b.title && b.title !== hostnameOf(b.url);
          await sendAction({
            type: 'bookmark/save',
            id: b.id,
            now: b.createdAt,
            input: {
              id: b.id,
              sectionId: b.sectionId,
              url: b.url,
              title: keepTitle ? b.title : p.title,
              description: b.description || p.description,
              imageUrl: p.image || b.imageUrl,
            },
          });
        } catch (err) {
          if (err instanceof UnauthorizedError) {
            setBulk('');
            return askForKey(fillMissing, err.message);
          }
          failed++;
        }
      }
      setBulk('');
      await refresh();
      flash(failed ? `Done — ${failed} link${failed === 1 ? '' : 's'} couldn't be read.` : 'Previews updated.');
    });

  const half = Math.ceil(board.categories.length / 2);
  const navItem = (c: (typeof board.categories)[number]) => (
    <a key={c.id} href={hrefFor(c.id)} className={`bottom-nav__item${c.id === category.id ? ' is-active' : ''}`} aria-current={c.id === category.id ? 'page' : undefined}>
      <Icon name={CATEGORY_ICONS[c.id] ?? 'grid'} size={22} />
      <span>{c.name}</span>
    </a>
  );

  return (
    <>
      <header className="app-header">
        <div className="container app-header__row">
          <a href={hrefFor(board.categories[0].id)} className="brand" aria-label="Wall Ewoll home">
            <span className="brand__mark" aria-hidden="true" />
            <span className="brand__name">Wall Ewoll</span>
          </a>
          <p className="app-header__title" aria-hidden="true">
            {category.name}
          </p>
          <nav className="cat-pills" aria-label="Categories">
            {board.categories.map((c) => (
              <a key={c.id} href={hrefFor(c.id)} className={c.id === category.id ? 'category-tab category-tab--active' : 'category-tab'} aria-current={c.id === category.id ? 'page' : undefined}>
                {c.name}
              </a>
            ))}
          </nav>
          <div className="app-header__actions">
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                setSearchOpen((o) => !o);
                if (searchOpen) setQuery('');
              }}
              aria-label={searchOpen ? 'Close search' : 'Search'}
              aria-expanded={searchOpen}
            >
              <Icon name={searchOpen ? 'close' : 'search'} />
            </button>
            <button type="button" className="btn btn-primary hide-sm" onClick={openAdd}>
              <Icon name="plus" size={16} /> Add bookmark
            </button>
          </div>
        </div>
        {searchOpen && (
          <div className="container search-row">
            <input
              className="input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${category.name.toLowerCase()} bookmarks`}
              aria-label="Search bookmarks"
              autoFocus
            />
          </div>
        )}
      </header>

      <main className="container main">
        <div className="page-head">
          <h1 className="display-md">{category.name}</h1>
          <p className="body-md muted">{category.tagline}</p>
        </div>

        <nav className="section-tabs" aria-label={`${category.name} sections`}>
          <a href={hrefFor(category.id)} className={`section-tab${!activeSection ? ' is-active' : ''}`} aria-current={!activeSection ? 'page' : undefined}>
            All
          </a>
          {sections.map((s) => (
            <a key={s.id} href={hrefFor(category.id, s.id)} className={`section-tab${activeSection?.id === s.id ? ' is-active' : ''}`} aria-current={activeSection?.id === s.id ? 'page' : undefined}>
              {s.name}
            </a>
          ))}
          <button type="button" className="section-tab section-tab--add" onClick={() => openSectionDialog()} aria-label="New section">
            <Icon name="plus" size={16} />
          </button>
        </nav>

        <div className="section-bar">
          <p className="caption-uppercase muted">
            {activeSection
              ? `${counts.get(activeSection.id) ?? 0} ${(counts.get(activeSection.id) ?? 0) === 1 ? 'link' : 'links'}`
              : `${totalInCategory} links · ${sections.length} sections`}
            {q && ` · ${visible.length} match${visible.length === 1 ? '' : 'es'}`}
          </p>
          {activeSection && (
            <div className="section-bar__tools">
              <button type="button" className="icon-btn" onClick={() => void commit({ type: 'section/move', id: activeSection.id, dir: -1 })} disabled={sections[0]?.id === activeSection.id} aria-label={`Move ${activeSection.name} left`}>
                <Icon name="left" size={16} />
              </button>
              <button type="button" className="icon-btn" onClick={() => void commit({ type: 'section/move', id: activeSection.id, dir: 1 })} disabled={sections.at(-1)?.id === activeSection.id} aria-label={`Move ${activeSection.name} right`}>
                <Icon name="right" size={16} />
              </button>
              <button type="button" className="icon-btn" onClick={() => openSectionDialog(activeSection)} aria-label={`Rename ${activeSection.name}`}>
                <Icon name="edit" size={16} />
              </button>
              <button type="button" className="icon-btn" onClick={() => setDialog({ kind: 'delete-section', section: activeSection, count: counts.get(activeSection.id) ?? 0 })} aria-label={`Delete ${activeSection.name}`}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          )}
        </div>

        {status === 'offline' && (
          <div className="banner" role="status">
            <span>Can't reach the server. You're seeing the last saved copy.</span>
            <button type="button" className="btn btn-on-color" onClick={() => void refresh()}>
              Retry
            </button>
          </div>
        )}
        {legacy && status === 'online' && board.bookmarks.length === 0 && (
          <div className="banner" role="status">
            <span>This browser still has {legacy.bookmarks.length} bookmarks from before the database. Move them in?</span>
            <span className="banner__actions">
              <button
                type="button"
                className="btn btn-on-color"
                onClick={() =>
                  void commit({ type: 'board/replace', state: legacy }, () => {
                    clearLegacyBoard();
                    setLegacy(null);
                    flash('Bookmarks moved to the database.');
                  })
                }
              >
                Move them
              </button>
              <button
                type="button"
                className="btn-text-link"
                onClick={() => {
                  clearLegacyBoard();
                  setLegacy(null);
                }}
              >
                Discard
              </button>
            </span>
          </div>
        )}

        {visible.length > 0 ? (
          <Masonry
            items={visible}
            render={(b) => (
              <PinCard
                key={b.id}
                bookmark={b}
                sectionName={activeSection ? undefined : sectionNames.get(b.sectionId)}
                onEdit={() => requireKey(() => setDialog({ kind: 'bookmark', bookmark: b, sectionId: b.sectionId }))}
              />
            )}
          />
        ) : (
          <div className="empty-state">
            <h2 className="display-sm">{q ? 'No matches' : 'Nothing saved here yet'}</h2>
            <p className="body-md">
              {q ? 'Try another word.' : 'Paste an Instagram, TikTok, X or any link — the thumbnail, title and description fill in automatically.'}
            </p>
            {!q && (
              <button type="button" className="btn btn-primary" onClick={openAdd}>
                <Icon name="plus" size={16} /> Add bookmark
              </button>
            )}
          </div>
        )}
      </main>

      <footer className="footer">
        <div className="container footer__inner">
          <div>
            <p className="title-sm">Wall Ewoll</p>
            <p className="body-sm">
              {status === 'offline'
                ? "Can't reach the server — showing the last copy saved in this browser. Changes are paused."
                : 'Bookmarks are saved to the database and show up on every device.'}
            </p>
          </div>
          <div className="footer__actions">
            {missingPreviews > 0 && status === 'online' && (
              <button type="button" className="btn btn-secondary" onClick={fillMissing} disabled={!!bulk}>
                <Icon name="refresh" size={16} /> {bulk || `Fill ${missingPreviews} missing preview${missingPreviews === 1 ? '' : 's'}`}
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => exportBoard(board)}>
              Export JSON
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => fileInput.current?.click()}>
              Import JSON
            </button>
            {hasKey && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setEditKey('');
                  setHasKey(false);
                  flash('Editing locked on this device.');
                }}
              >
                Lock editing
              </button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                const next = await readBoardFile(file);
                if (!next) return flash('That file is not a Wall Ewoll backup.');
                if (window.confirm('Replace everything in the database with this backup?')) {
                  void commit({ type: 'board/replace', state: next }, () => flash('Backup imported.'));
                }
              }}
            />
          </div>
        </div>
      </footer>

      <nav className="bottom-nav" aria-label="Categories">
        {board.categories.slice(0, half).map(navItem)}
        <button type="button" className="fab" onClick={openAdd} aria-label="Add bookmark">
          <Icon name="plus" size={24} />
        </button>
        {board.categories.slice(half).map(navItem)}
      </nav>

      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}

      {dialog.kind === 'bookmark' && (
        <BookmarkDialog
          sections={sections}
          initial={dialog.bookmark}
          defaultSectionId={dialog.sectionId}
          onClose={close}
          onDelete={dialog.bookmark && (() => setDialog({ kind: 'delete-bookmark', bookmark: dialog.bookmark! }))}
          onSave={(input) => {
            // Refresh afterwards to pick up the thumbnail the server just cached.
            void commit({ type: 'bookmark/save', input, id: newId(), now: Date.now() }, () => void refresh());
            close();
          }}
        />
      )}

      {dialog.kind === 'section' && (
        <Modal
          title={dialog.section ? 'Rename section' : `New ${category.name} section`}
          submitLabel={dialog.section ? 'Save' : 'Create section'}
          submitDisabled={!sectionName.trim()}
          onClose={close}
          onSubmit={() => {
            if (dialog.section) {
              void commit({ type: 'section/rename', id: dialog.section.id, name: sectionName });
            } else {
              const id = newId();
              void commit({ type: 'section/add', categoryId: category.id, name: sectionName, id });
              window.location.hash = hrefFor(category.id, id);
            }
            close();
          }}
        >
          <label className="field">
            <span className="field__label">Section name</span>
            <input
              className="input"
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              placeholder={category.id === 'cafe' ? 'e.g. Rooftop' : 'e.g. Catering'}
              maxLength={40}
              autoFocus
            />
          </label>
        </Modal>
      )}

      {dialog.kind === 'delete-section' && (
        <Modal
          title={`Delete “${dialog.section.name}”?`}
          submitLabel="Delete section"
          danger
          onClose={close}
          onSubmit={() => {
            void commit({ type: 'section/delete', id: dialog.section.id });
            window.location.hash = hrefFor(category.id);
            close();
          }}
        >
          <p className="body-md">
            {dialog.count > 0
              ? `Its ${dialog.count} ${dialog.count === 1 ? 'bookmark' : 'bookmarks'} will be deleted too. Move them to another section first if you want to keep them.`
              : 'This section is empty.'}
          </p>
        </Modal>
      )}

      {dialog.kind === 'edit-key' && (
        <Modal
          title="Enter edit key"
          submitLabel="Unlock"
          submitDisabled={!keyDraft.trim()}
          onClose={close}
          onSubmit={() => {
            setEditKey(keyDraft.trim());
            setHasKey(true);
            const { then } = dialog;
            close();
            then();
          }}
        >
          <p className="body-md">
            Anyone can view this wall, but changes need the edit key (the <code>WALL_EDIT_KEY</code> set in Vercel).
            It's remembered on this device.
          </p>
          <label className="field">
            <span className="field__label">Edit key</span>
            <input
              className="input"
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              autoComplete="current-password"
              autoFocus
              aria-invalid={!!dialog.error}
            />
            {dialog.error && <span className="field__error">{dialog.error}</span>}
          </label>
        </Modal>
      )}

      {dialog.kind === 'delete-bookmark' && (
        <Modal
          title="Delete bookmark?"
          submitLabel="Delete"
          danger
          onClose={close}
          onSubmit={() => {
            void commit({ type: 'bookmark/delete', id: dialog.bookmark.id });
            close();
          }}
        >
          <p className="body-md">“{dialog.bookmark.title}” will be removed from this wall.</p>
        </Modal>
      )}
    </>
  );
}
