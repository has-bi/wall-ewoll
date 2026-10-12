import { canEdit, json, unauthorized } from '../server/auth.js';
import { getPreview } from '../server/preview.js';
import { fetchThumbnail, toDataUrl } from '../server/thumbs.js';

// POST { url } → { title, description, image, site, imageData }.
// Needs the edit key so the server can't be used as an open fetch proxy.
// imageData is the resized thumbnail as a data URL, because many platform CDNs
// refuse to show their images on other sites.
export async function POST(request: Request): Promise<Response> {
  if (!canEdit(request)) return unauthorized();
  let url: unknown;
  try {
    ({ url } = (await request.json()) as { url?: unknown });
  } catch {
    return json({ error: 'Body must be JSON' }, 400);
  }
  if (typeof url !== 'string' || url.length > 2048) return json({ error: 'url is required' }, 400);
  try {
    const preview = await getPreview(url);
    const imageData = preview.image ? await fetchThumbnail(preview.image).then(toDataUrl, () => null) : null;
    return json({ ...preview, imageData });
  } catch (err) {
    console.warn('Preview failed:', url, err instanceof Error ? err.message : err);
    return json({ error: "Couldn't read that link" }, 422);
  }
}
