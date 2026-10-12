import { useState } from 'react';
import type { Bookmark, Section } from '../types';
import type { BookmarkInput } from '../lib/board';
import { normalizeUrl } from '../lib/url';
import { Modal } from './Modal';

interface Props {
  sections: Section[];
  initial?: Bookmark;
  defaultSectionId: string;
  onSave: (input: BookmarkInput) => void;
  onClose: () => void;
}

export function BookmarkDialog({ sections, initial, defaultSectionId, onSave, onClose }: Props) {
  const [url, setUrl] = useState(initial?.url ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '');
  const [sectionId, setSectionId] = useState(initial?.sectionId ?? defaultSectionId);
  const [touched, setTouched] = useState(false);

  const urlValid = normalizeUrl(url) !== null;
  const imageValid = !imageUrl.trim() || normalizeUrl(imageUrl) !== null;
  const canSave = urlValid && imageValid && !!sectionId;

  return (
    <Modal
      title={initial ? 'Edit bookmark' : 'New bookmark'}
      submitLabel={initial ? 'Save changes' : 'Add bookmark'}
      onClose={onClose}
      submitDisabled={!canSave}
      onSubmit={() => {
        setTouched(true);
        if (canSave) onSave({ id: initial?.id, url, title, note, imageUrl, sectionId });
      }}
    >
      <label className="field">
        <span className="field__label">Link</span>
        <input
          className="input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="instagram.com/some.venue"
          inputMode="url"
          autoFocus
          required
          aria-invalid={touched && !urlValid}
        />
        {touched && !urlValid && <span className="field__error">Enter a valid http(s) link.</span>}
      </label>
      <label className="field">
        <span className="field__label">Title</span>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Leave empty to use the domain"
          maxLength={120}
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
      <label className="field">
        <span className="field__label">Note</span>
        <textarea
          className="input input--area"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Price range, capacity, why you liked it…"
          rows={3}
          maxLength={500}
        />
      </label>
      <label className="field">
        <span className="field__label">Cover image URL (optional)</span>
        <input
          className="input"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://…/photo.jpg"
          inputMode="url"
          aria-invalid={!imageValid}
        />
        {!imageValid && <span className="field__error">Image must be an http(s) link.</span>}
      </label>
    </Modal>
  );
}
