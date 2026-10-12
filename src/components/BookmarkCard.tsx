import { useState } from 'react';
import type { Bookmark } from '../types';
import { hostnameOf } from '../lib/url';
import { Icon } from './Icon';

interface Props {
  bookmark: Bookmark;
  onEdit: () => void;
  onDelete: () => void;
}

export function BookmarkCard({ bookmark, onEdit, onDelete }: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const host = hostnameOf(bookmark.url);
  const showImage = bookmark.imageUrl && !imageFailed;

  return (
    <article className="bookmark-card">
      {showImage && (
        <div className="bookmark-card__cover">
          <img src={bookmark.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />
        </div>
      )}
      <div className="bookmark-card__head">
        <span className="avatar" aria-hidden="true">
          {host.charAt(0).toUpperCase()}
        </span>
        <span className="badge-pill">{host}</span>
      </div>
      <h3 className="title-sm bookmark-card__title">
        {/* The stretched link makes the whole card clickable while the action buttons stay separate controls. */}
        <a href={bookmark.url} target="_blank" rel="noopener noreferrer" className="stretched-link">
          {bookmark.title}
        </a>
      </h3>
      {bookmark.note && <p className="body-sm bookmark-card__note">{bookmark.note}</p>}
      <div className="bookmark-card__actions">
        <span className="caption muted bookmark-card__open">
          Open <Icon name="external" size={14} />
        </span>
        <button type="button" className="icon-btn" onClick={onEdit} aria-label={`Edit ${bookmark.title}`}>
          <Icon name="edit" size={16} />
        </button>
        <button type="button" className="icon-btn" onClick={onDelete} aria-label={`Delete ${bookmark.title}`}>
          <Icon name="trash" size={16} />
        </button>
      </div>
    </article>
  );
}
