import type { Bookmark, Section } from '../types';
import { BookmarkCard } from './BookmarkCard';
import { Icon } from './Icon';

// Design system: cycle pink → teal → lavender → peach → ochre → cream, never the same tone twice in a row.
export const TONES = ['pink', 'teal', 'lavender', 'peach', 'ochre', 'cream'] as const;

interface Props {
  section: Section;
  index: number;
  total: number;
  bookmarks: Bookmark[];
  filtering: boolean;
  onAdd: () => void;
  onRename: () => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onEditBookmark: (b: Bookmark) => void;
  onDeleteBookmark: (b: Bookmark) => void;
}

export function SectionBlock(props: Props) {
  const { section, index, total, bookmarks, filtering } = props;
  const tone = TONES[index % TONES.length];

  return (
    <section id={`section-${section.id}`} className={`feature-card tone-${tone}`} aria-labelledby={`h-${section.id}`}>
      <header className="feature-card__head">
        <div>
          <p className="caption-uppercase feature-card__eyebrow">
            Section {String(index + 1).padStart(2, '0')} · {bookmarks.length} {bookmarks.length === 1 ? 'link' : 'links'}
          </p>
          <h2 id={`h-${section.id}`} className="display-sm">
            {section.name}
          </h2>
        </div>
        <div className="feature-card__tools">
          <button type="button" className="icon-btn icon-btn--on-color" onClick={() => props.onMove(-1)} disabled={index === 0} aria-label={`Move ${section.name} up`}>
            <Icon name="up" size={16} />
          </button>
          <button type="button" className="icon-btn icon-btn--on-color" onClick={() => props.onMove(1)} disabled={index === total - 1} aria-label={`Move ${section.name} down`}>
            <Icon name="down" size={16} />
          </button>
          <button type="button" className="icon-btn icon-btn--on-color" onClick={props.onRename} aria-label={`Rename ${section.name}`}>
            <Icon name="edit" size={16} />
          </button>
          <button type="button" className="icon-btn icon-btn--on-color" onClick={props.onDelete} aria-label={`Delete ${section.name}`}>
            <Icon name="trash" size={16} />
          </button>
          <button type="button" className="btn btn-on-color" onClick={props.onAdd}>
            <Icon name="plus" size={16} /> Add
          </button>
        </div>
      </header>

      {bookmarks.length > 0 ? (
        <div className="card-grid">
          {bookmarks.map((b) => (
            <BookmarkCard key={b.id} bookmark={b} onEdit={() => props.onEditBookmark(b)} onDelete={() => props.onDeleteBookmark(b)} />
          ))}
        </div>
      ) : (
        <div className="empty-slot">
          <p className="body-sm">{filtering ? 'No matches in this section.' : 'Nothing saved here yet.'}</p>
          {!filtering && (
            <button type="button" className="btn-text-link" onClick={props.onAdd}>
              Save the first link →
            </button>
          )}
        </div>
      )}
    </section>
  );
}
