import sharp from 'sharp';
import { safeFetch } from './safe-fetch.js';

export interface Thumbnail {
  contentType: 'image/webp';
  data: Buffer;
}

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'heif', 'tiff']);

/**
 * Downloads an image and re-encodes it as a small WebP. Re-encoding also means we never
 * serve the original bytes back, so a hostile "image" (SVG with script, HTML) can't ride along.
 */
export async function fetchThumbnail(url: string): Promise<Thumbnail> {
  const res = await safeFetch(url, {
    maxBytes: 10 * 1024 * 1024,
    timeoutMs: 8000,
    headers: {
      accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    },
  });
  if (res.status !== 200) throw new Error(`Image HTTP ${res.status}`);
  if (res.truncated) throw new Error('Image too large');
  const input = sharp(res.body, { limitInputPixels: 40_000_000, animated: false });
  const { format } = await input.metadata();
  if (!format || !ALLOWED_FORMATS.has(format)) throw new Error(`Unsupported image format: ${format}`);
  const data = await input
    .rotate()
    .resize({ width: 720, height: 1440, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();
  return { contentType: 'image/webp', data };
}

export const toDataUrl = (t: Thumbnail) => `data:${t.contentType};base64,${t.data.toString('base64')}`;
