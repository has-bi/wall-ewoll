import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { BoardState, Bookmark, Section } from './types';
import { boardReducer, newId, type Action } from './lib/board';
import { cacheBoard, clearLegacyBoard, exportBoard, loadCachedBoard, loadLegacyBoard, readBoardFile } from './lib/storage';
import { fetchBoard, getEditKey, sendAction, setEditKey, UnauthorizedError } from './lib/api';
import { hostnameOf } from './lib/url';
import { SectionBlock } from './components/SectionBlock';
import { BookmarkDialog } from './components/BookmarkDialog';
import { HeroArt } from './components/HeroArt';
import { Modal } from './components/Modal';
import { Icon } from './components/Icon';

type DialogState =
  | { kind: 'none' }
  | { kind: 'bookmark'; bookmark?: Bookmark; sectionId: string }
  | { kind: 'section'; section?: Section }
  | { kind: 'delete-section'; section: Section; count: number }
  | { kind: 'delete-bookmark'; bookmark: Bookmark }
  | { kind: 'edit-key'; pending: Action; onSuccess?: () => void; error: string };

type SyncStatus = 'loading' | 'online' | 'offline';

const categoryFromHash = () => decodeURIComponent(window.location.hash.replace(/^#\/?/, ''));

export default function App() {
  const [board, dispatch] = useReducer(boardReducer, undefined, loadCachedBoard);
  const [status, setStatus] = useState<SyncStatus>('loading');
  const [hasKey, setHasKey] = useState(() => !!getEditKey());
  const [keyDraft, setKeyDraft] = useState('');
  const [legacy, setLegacy] = useState<BoardState | null>(loadLegacyBoard);
  const [categoryId, setCategoryId] = useState(() => categoryFromHash());
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [sectionName, setSectionName] = useState('');
  const [notice, setNotice] = useState('');
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
    const onHash = () => setCategoryId(categoryFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const category = board.categories.find((c) => c.id === categoryId) ?? board.categories[0];
  const sections = useMemo(() => board.sections.filter((s) => s.categoryId === category.id), [board.sections, category.id]);

  const q = query.trim().toLowerCase();
  const bookmarksBySection = useMemo(() => {
    const map = new Map<string, Bookmark[]>(sections.map((s) => [s.id, []]));
    for (const b of board.bookmarks) {
      const list = map.get(b.sectionId);
      if (!list) continue;
      if (q && ![b.title, b.note, hostnameOf(b.url)].some((t) => t.toLowerCase().includes(q))) continue;
      list.push(b);
    }
    return map;
  }, [board.bookmarks, sections, q]);
  const totalInCategory = board.bookmarks.filter((b) => sections.some((s) => s.id === b.sectionId)).length;

  const close = () => setDialog({ kind: 'none' });
  const openSectionDialog = (section?: Section) => {
    setSectionName(section?.name ?? '');
    setDialog({ kind: 'section', section });
  };
  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 3000);
  };

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
        // Retried with the same onSuccess once the user enters the key.
        setKeyDraft('');
        setDialog({ kind: 'edit-key', pending: action, onSuccess, error: getEditKey() ? err.message : '' });
      } else {
        flash(err instanceof Error ? err.message : 'Save failed.');
      }
      void refresh();
    }
  };

  return (
    <>
      <nav className="top-nav">
        <div className="container top-nav__inner">
          <a href={`#/${board.categories[0].id}`} className="brand">
            <span className="brand__mark" aria-hidden="true" />
            Wall Ewoll
          </a>
          <div className="tabs" role="tablist" aria-label="Categories">
            {board.categories.map((c) => (
              <a
                key={c.id}
                href={`#/${c.id}`}
                role="tab"
                aria-selected={c.id === category.id}
                className={c.id === category.id ? 'category-tab category-tab--active' : 'category-tab'}
              >
                {c.name}
              </a>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary top-nav__cta"
            disabled={sections.length === 0}
            onClick={() => setDialog({ kind: 'bookmark', sectionId: sections[0].id })}
          >
            <Icon name="plus" size={16} /> <span className="hide-sm">Add bookmark</span>
          </button>
        </div>
      </nav>

      <main>
        <header className="container hero">
          <div className="hero__copy">
            <p className="caption-uppercase muted">
              {sections.length} sections · {totalInCategory} bookmarks
            </p>
            <h1 className="display-xl">{category.name}</h1>
            <p className="title-md hero__lead">{category.tagline}</p>
            <div className="hero__actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={sections.length === 0}
                onClick={() => setDialog({ kind: 'bookmark', sectionId: sections[0].id })}
              >
                Add bookmark
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => openSectionDialog()}>
                New section
              </button>
            </div>
          </div>
          <HeroArt categoryId={category.id} />
        </header>

        <div className="container toolbar">
          <label className="search">
            <Icon name="search" />
            <input
              className="input search__input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${category.name.toLowerCase()} bookmarks`}
              aria-label="Search bookmarks"
            />
          </label>
          <div className="chips" aria-label="Jump to section">
            {sections.map((s) => (
              <a key={s.id} href={`#section-${s.id}`} className="badge-pill" onClick={(e) => {
                // Hash links would change the category route, so scroll manually.
                e.preventDefault();
                document.getElementById(`section-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}>
                {s.name} <span className="muted">{bookmarksBySection.get(s.id)?.length ?? 0}</span>
              </a>
            ))}
          </div>
        </div>

        {status === 'offline' && (
          <div className="container">
            <div className="banner" role="status">
              <span>Can't reach the server. You're seeing the last saved copy.</span>
              <button type="button" className="btn btn-on-color" onClick={() => void refresh()}>
                Retry
              </button>
            </div>
          </div>
        )}
        {legacy && status === 'online' && board.bookmarks.length === 0 && (
          <div className="container">
            <div className="banner" role="status">
              <span>
                This browser still has {legacy.bookmarks.length} bookmarks from before the database. Move them in?
              </span>
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
          </div>
        )}

        <div className="container sections">
          {sections.map((s, i) => (
            <SectionBlock
              key={s.id}
              section={s}
              index={i}
              total={sections.length}
              bookmarks={bookmarksBySection.get(s.id) ?? []}
              filtering={!!q}
              onAdd={() => setDialog({ kind: 'bookmark', sectionId: s.id })}
              onRename={() => openSectionDialog(s)}
              onMove={(dir) => void commit({ type: 'section/move', id: s.id, dir })}
              onDelete={() =>
                setDialog({ kind: 'delete-section', section: s, count: board.bookmarks.filter((b) => b.sectionId === s.id).length })
              }
              onEditBookmark={(b) => setDialog({ kind: 'bookmark', bookmark: b, sectionId: b.sectionId })}
              onDeleteBookmark={(b) => setDialog({ kind: 'delete-bookmark', bookmark: b })}
            />
          ))}

          <section className="cta-band">
            <div>
              <h2 className="display-md">Need another pile?</h2>
              <p className="body-md muted">Make a section for anything — catering, photographers, cafes with good playlists.</p>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => openSectionDialog()}>
              <Icon name="plus" size={16} /> New section
            </button>
          </section>
        </div>
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
          onSave={(input) => {
            void commit({ type: 'bookmark/save', input, id: newId(), now: Date.now() });
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
            if (dialog.section) void commit({ type: 'section/rename', id: dialog.section.id, name: sectionName });
            else void commit({ type: 'section/add', categoryId: category.id, name: sectionName, id: newId() });
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
          submitLabel="Unlock & save"
          submitDisabled={!keyDraft.trim()}
          onClose={close}
          onSubmit={() => {
            setEditKey(keyDraft.trim());
            setHasKey(true);
            const { pending, onSuccess } = dialog;
            close();
            void commit(pending, onSuccess);
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
