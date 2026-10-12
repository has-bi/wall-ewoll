import { readThumbnail } from '../server/db.js';

// GET /api/thumb?id=<bookmarkId>&v=<version>. The version changes whenever the image does,
// so responses can be cached forever.
export async function GET(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!id || id.length > 100) return new Response(null, { status: 400 });
  try {
    const thumb = await readThumbnail(id);
    if (!thumb) return new Response(null, { status: 404, headers: { 'cache-control': 'public, max-age=60' } });
    return new Response(new Uint8Array(thumb.data), {
      headers: {
        'content-type': thumb.contentType,
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'",
      },
    });
  } catch (err) {
    console.error(err);
    return new Response(null, { status: 500 });
  }
}
