import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Bookmark } from '../types';
import { platformLabel } from '../lib/platform';
import { Icon } from './Icon';

// design.md palette, cycled so neighbouring fallback tiles rarely share a colour.
export const TONES = ['pink', 'teal', 'lavender', 'peach', 'ochre', 'cream'] as const;
const RATIOS = ['4 / 5', '1 / 1', '3 / 4', '4 / 5', '5 / 4'];

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function thumbSrc(b: Pick<Bookmark, 'id' | 'thumb' | 'imageUrl'>): string {
  return b.thumb ? `/api/thumb?id=${encodeURIComponent(b.id)}&v=${b.thumb}` : b.imageUrl;
}

/** Shown when a link has no image (or it failed to load), so every card still has a thumbnail. */
export function FallbackTile({ url }: { url: string }) {
  const h = hash(url);
  const label = platformLabel(url);
  return (
    <div className={`fallback-tile tone-${TONES[h % TONES.length]}`} style={{ aspectRatio: RATIOS[h % RATIOS.length] }}>
      {/* The title is already under the tile; the tile names the source instead. */}
      <span className={`fallback-tile__label${label.length > 12 ? ' fallback-tile__label--long' : ''}`}>{label}</span>
    </div>
  );
}

export function Thumb({ src, url }: { src: string; url: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <FallbackTile url={url} />;
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

interface PinCardProps {
  bookmark: Bookmark;
  sectionName?: string;
  onEdit: () => void;
}

export function PinCard({ bookmark, sectionName, onEdit }: PinCardProps) {
  const src = thumbSrc(bookmark);
  return (
    <article className="pin">
      <div className="pin__media">
        {/* key: retry loading when the image changes after an edit */}
        <Thumb key={src} src={src} url={bookmark.url} />
        <button type="button" className="pin__more" onClick={onEdit} aria-label={`Edit ${bookmark.title}`}>
          <Icon name="more" size={18} />
        </button>
      </div>
      <div className="pin__body">
        <h3 className="title-sm pin__title">
          {/* Stretched link: the whole card opens the bookmark; the edit button sits above it. */}
          <a href={bookmark.url} target="_blank" rel="noopener noreferrer" className="stretched-link">
            {bookmark.title}
          </a>
        </h3>
        {bookmark.description && <p className="body-sm pin__desc">{bookmark.description}</p>}
        <p className="caption pin__meta">
          {platformLabel(bookmark.url)}
          {sectionName && <span className="muted"> · {sectionName}</span>}
        </p>
      </div>
    </article>
  );
}

/**
 * Masonry like the reference: N columns, items dealt left→right so reading order is kept,
 * each column stacks cards of their natural height.
 */
export function Masonry<T>({ items, render }: { items: T[]; render: (item: T) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(2);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (w: number) => setCount(w < 560 ? 2 : w < 860 ? 3 : w < 1140 ? 4 : 5);
    measure(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const columns: T[][] = Array.from({ length: count }, () => []);
  items.forEach((item, i) => columns[i % count].push(item));

  return (
    <div ref={ref} className="masonry">
      {columns.map((col, i) => (
        <div key={i} className="masonry__col">
          {col.map(render)}
        </div>
      ))}
    </div>
  );
}
