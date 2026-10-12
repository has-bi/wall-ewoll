import { useEffect, useRef, useState } from 'react';
import type { Bookmark, Section } from '../types';
import type { BookmarkInput } from '../lib/board';
import { fetchPreview, UnauthorizedError } from '../lib/api';
import { normalizeUrl } from '../lib/url';
import { platformLabel } from '../lib/platform';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { Thumb, thumbSrc } from './PinCard';

interface Props {
  sections: Section[];
  initial?: Bookmark;
  defaultSectionId: string;
  onSave: (input: BookmarkInput) => void;
  onDelete?: () => void;
  onClose: () => void;
}

type Field = 'title' | 'description' | 'imageUrl';
type FetchState = { status: 'idle' | 'loading' | 'done' } | { status: 'error'; message: string };

export function BookmarkDialog({ sections, initial, defaultSectionId, onSave, onDelete, onClose }: Props) {
  const [url, setUrl] = useState(initial?.url ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '');
  const [imageData, setImageData] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState(initial?.sectionId ?? defaultSectionId);
  const [fetchState, setFetchState] = useState<FetchState>({ status: 'idle' });
  const [touchedUrl, setTouchedUrl] = useState(false);
  // Fields the user typed in themselves; auto-fill never overwrites those.
  const edited = useRef(new Set<Field>());
  const lastFetched = useRef(initial ? normalizeUrl(initial.url) : null);
  const inflight = useRef<AbortController | null>(null);

  const normalized = normalizeUrl(url);
  const imageValid = !imageUrl.trim() || normalizeUrl(imageUrl) !== null;
  const canSave = !!normalized && imageValid && !!sectionId && fetchState.status !== 'loading';

  const fill = async (target: string, overwrite: boolean) => {
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    lastFetched.current = target;
    setFetchState({ status: 'loading' });
    try {
      const p = await fetchPreview(target, ctrl.signal);
      const set = (field: Field, value: string, setter: (v: string) => void) => {
        if (overwrite || !edited.current.has(field)) setter(value);
      };
      set('title', p.title, setTitle);
      set('description', p.description, setDescription);
      if (overwrite || !edited.current.has('imageUrl')) {
        setImageUrl(p.image);
        setImageData(p.imageData);
      }
      setFetchState({ status: 'done' });
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setFetchState({
        status: 'error',
        message:
          err instanceof UnauthorizedError
            ? 'Auto-fill needs a valid edit key. You can still fill the card in by hand.'
            : "Couldn't read that link. Fill in the card by hand, or try again.",
      });
    }
  };

  // Auto-fill shortly after a new link is typed or pasted.
  useEffect(() => {
    if (!normalized || normalized === lastFetched.current) return;
    const t = window.setTimeout(() => void fill(normalized, false), 450);
    return () => window.clearTimeout(t);
  }, [normalized]);

  useEffect(() => () => inflight.current?.abort(), []);

  const previewSrc =
    imageData ?? (initial && imageUrl === initial.imageUrl ? thumbSrc(initial) : imageUrl && normalizeUrl(imageUrl) ? imageUrl : '');
  const edit = (field: Field, setter: (v: string) => void) => (v: string) => {
    edited.current.add(field);
    setter(v);
  };

  return (
    <Modal
      title={initial ? 'Edit bookmark' : 'New bookmark'}
      submitLabel={fetchState.status === 'loading' ? 'Reading link…' : initial ? 'Save changes' : 'Add bookmark'}
      onClose={onClose}
      submitDisabled={!canSave}
      footerStart={
        onDelete && (
          <button type="button" className="btn-text-link btn-text-link--danger" onClick={onDelete}>
            Delete
          </button>
        )
      }
      onSubmit={() => {
        setTouchedUrl(true);
        if (canSave) onSave({ id: initial?.id, url, title, description, imageUrl, sectionId });
      }}
    >
      <label className="field">
        <span className="field__label">Link</span>
        <span className="field__row">
          <input
            className="input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => setTouchedUrl(true)}
            placeholder="Paste an Instagram, TikTok, X, Threads or any web link"
            inputMode="url"
            autoFocus={!initial}
            required
            aria-invalid={touchedUrl && !normalized}
          />
          <button
            type="button"
            className="icon-btn icon-btn--boxed"
            onClick={() => normalized && void fill(normalized, true)}
            disabled={!normalized || fetchState.status === 'loading'}
            aria-label="Read title, description and thumbnail from the link again"
            title="Refresh from link"
          >
            <Icon name="refresh" size={16} />
          </button>
        </span>
        {touchedUrl && !normalized && <span className="field__error">Enter a valid http(s) link.</span>}
        {fetchState.status === 'error' && <span className="field__hint">{fetchState.message}</span>}
      </label>

      <div className={`pin pin--preview${fetchState.status === 'loading' ? ' is-loading' : ''}`} aria-live="polite">
        <div className="pin__media">
          <Thumb key={previewSrc} src={previewSrc} url={normalized ?? 'https://link'} />
        </div>
        <div className="pin__body">
          <p className="title-sm pin__title">{title || (fetchState.status === 'loading' ? 'Reading link…' : 'Title')}</p>
          <p className="body-sm pin__desc">{description || 'Short description from the link shows here.'}</p>
          <p className="caption pin__meta">{normalized ? platformLabel(normalized) : 'Source'}</p>
        </div>
      </div>

      <label className="field">
        <span className="field__label">Title</span>
        <input className="input" value={title} onChange={(e) => edit('title', setTitle)(e.target.value)} placeholder="Filled in from the link" maxLength={120} />
      </label>
      <label className="field">
        <span className="field__label">Description</span>
        <textarea
          className="input input--area"
          value={description}
          onChange={(e) => edit('description', setDescription)(e.target.value)}
          placeholder="Filled in from the link — keep it short"
          rows={3}
          maxLength={280}
        />
      </label>
      <label className="field">
        <span className="field__label">Section</span>
        <select className="input" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <details className="field-details" open={!imageValid}>
        <summary className="caption">Use a different thumbnail</summary>
        <label className="field">
          <span className="field__label">Image URL</span>
          <input
            className="input"
            value={imageUrl}
            onChange={(e) => {
              edited.current.add('imageUrl');
              setImageUrl(e.target.value);
              setImageData(null);
            }}
            placeholder="https://…/photo.jpg"
            inputMode="url"
            aria-invalid={!imageValid}
          />
          {!imageValid && <span className="field__error">Image must be an http(s) link.</span>}
        </label>
      </details>
    </Modal>
  );
}
