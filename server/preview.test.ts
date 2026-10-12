// @vitest-environment node
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanSocial, getPreview, parseHtmlMeta, truncate, tweetToken } from './preview';
import { assertPublicUrl, isPrivateAddress, safeFetch } from './safe-fetch';
import { fetchThumbnail } from './thumbs';

// Fixtures follow the shapes these platforms actually return; the network is mocked.
vi.mock('./safe-fetch.js', async (orig) => ({ ...(await orig<typeof import('./safe-fetch')>()), safeFetch: vi.fn() }));
const fetchMock = vi.mocked(safeFetch);

type Route = { status?: number; type?: string; body: string | Uint8Array };
function serve(routes: Record<string, Route | ((ua: string) => Route)>) {
  fetchMock.mockImplementation(async (url, opts) => {
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) return { url, status: 404, contentType: 'text/html', body: new Uint8Array(), truncated: false };
    const r = routes[key];
    const route = typeof r === 'function' ? r(opts.headers?.['user-agent'] ?? '') : r;
    const body = typeof route.body === 'string' ? new TextEncoder().encode(route.body) : route.body;
    return { url, status: route.status ?? 200, contentType: route.type ?? 'text/html; charset=utf-8', body, truncated: false };
  });
}

const page = (meta: Record<string, string>, title = '') =>
  `<html><head><title>${title}</title>${Object.entries(meta)
    .map(([k, v]) => `<meta ${k.startsWith('og:') ? 'property' : 'name'}="${k}" content="${v}">`)
    .join('')}</head><body></body></html>`;

beforeEach(() => {
  fetchMock.mockReset();
});

describe('parseHtmlMeta', () => {
  it('reads og tags in any attribute order, decodes entities, resolves relative images', () => {
    const html = `<head><title>Fallback</title>
      <meta content="Tom &amp; Jerry&#39;s Caf&#xE9;" property="og:title" />
      <meta name='description' content='Plain description'>
      <meta property="og:image" content="/img/cover.jpg"></head>`;
    expect(parseHtmlMeta(html, 'https://cafe.id/menu')).toEqual({
      title: "Tom & Jerry's Café",
      description: 'Plain description',
      image: 'https://cafe.id/img/cover.jpg',
      site: undefined,
    });
  });

  it('falls back to <title> and twitter:image', () => {
    const raw = parseHtmlMeta('<title>Just a page</title><meta name="twitter:image" content="https://x.io/a.png">', 'https://x.io');
    expect(raw).toMatchObject({ title: 'Just a page', image: 'https://x.io/a.png' });
  });

  it('ignores javascript: images', () => {
    expect(parseHtmlMeta('<meta property="og:image" content="javascript:alert(1)">', 'https://a.com').image).toBeUndefined();
  });
});

describe('cleanSocial', () => {
  it('splits an Instagram post into author + caption', () => {
    expect(
      cleanSocial({
        title: 'Kopi Kebun on Instagram: "Hidden garden cafe in Bintaro 🌿 #cafe"',
        description: '1,204 likes, 31 comments - kopikebun on March 3, 2025: "Hidden garden cafe in Bintaro 🌿 #cafe"',
      }),
    ).toMatchObject({ title: 'Kopi Kebun', description: 'Hidden garden cafe in Bintaro 🌿 #cafe' });
  });

  it('cleans Instagram profiles and Threads posts', () => {
    expect(
      cleanSocial({
        title: 'Kopi Kebun (@kopikebun) • Instagram photos and videos',
        description: '12K Followers, 300 Following, 450 Posts - See Instagram photos and videos from Kopi Kebun (@kopikebun)',
      }),
    ).toMatchObject({ title: 'Kopi Kebun (@kopikebun)', description: '12K Followers, 300 Following, 450 Posts' });
    expect(cleanSocial({ title: 'Rani (@rani.id) on Threads', description: 'Best WFC spots in Jaksel 🧵' })).toMatchObject({
      title: 'Rani (@rani.id)',
      description: 'Best WFC spots in Jaksel 🧵',
    });
  });
});

describe('truncate', () => {
  it('cuts on a word boundary and adds an ellipsis', () => {
    expect(truncate('one two three four five six', 15)).toBe('one two three…');
    expect(truncate('short', 15)).toBe('short');
  });
});

describe('getPreview', () => {
  it('Instagram: uses the preview-bot user agent and normalises the caption', async () => {
    serve({
      'https://instagram.com/p/abc': (ua) =>
        ua.startsWith('facebookexternalhit')
          ? {
              body: page({
                'og:title': 'Kopi Kebun on Instagram: &quot;Hidden garden cafe&quot;',
                'og:description': '1,204 likes, 31 comments - kopikebun on March 3, 2025: &quot;Hidden garden cafe&quot;',
                'og:image': 'https://scontent.cdninstagram.com/v/t51/abc.jpg?oe=6800',
              }),
            }
          : { body: '<html><title>Instagram</title></html>' },
    });
    expect(await getPreview('instagram.com/p/abc')).toEqual({
      url: 'https://instagram.com/p/abc',
      title: 'Kopi Kebun',
      description: 'Hidden garden cafe',
      image: 'https://scontent.cdninstagram.com/v/t51/abc.jpg?oe=6800',
      site: 'Instagram',
    });
  });

  it('TikTok: uses oEmbed', async () => {
    serve({
      'https://www.tiktok.com/oembed': {
        type: 'application/json',
        body: JSON.stringify({
          title: 'Cheesecake basque paling creamy di Jaksel!! #kuliner',
          author_name: 'Jajan Terus',
          author_unique_id: 'jajanterus',
          thumbnail_url: 'https://p16-sign.tiktokcdn.com/obj/cover.jpeg?x-expires=1',
        }),
      },
    });
    const p = await getPreview('https://www.tiktok.com/@jajanterus/video/7311111111111111111');
    expect(p).toMatchObject({
      title: 'Jajan Terus',
      description: 'Cheesecake basque paling creamy di Jaksel!! #kuliner',
      image: 'https://p16-sign.tiktokcdn.com/obj/cover.jpeg?x-expires=1',
      site: 'TikTok',
    });
  });

  it('X: uses the syndication API, strips t.co links, prefers the photo', async () => {
    serve({
      'https://cdn.syndication.twimg.com/tweet-result?id=1790000000000000000': {
        type: 'application/json',
        body: JSON.stringify({
          text: 'Venue outdoor paling cakep buat akad 💍 https://t.co/AbC123',
          user: { name: 'Wedding Notes', screen_name: 'weddingnotes', profile_image_url_https: 'https://pbs.twimg.com/p_normal.jpg' },
          photos: [{ url: 'https://pbs.twimg.com/media/venue.jpg' }],
        }),
      },
    });
    const p = await getPreview('https://x.com/weddingnotes/status/1790000000000000000?s=20');
    expect(p).toMatchObject({
      title: 'Wedding Notes (@weddingnotes)',
      description: 'Venue outdoor paling cakep buat akad 💍',
      image: 'https://pbs.twimg.com/media/venue.jpg',
      site: 'X',
    });
    expect(fetchMock.mock.calls[0][0]).toContain(`token=${tweetToken('1790000000000000000')}`);
  });

  it('Articles: og tags, long description truncated', async () => {
    const long = 'Panduan lengkap memilih wedding organizer. '.repeat(20);
    serve({ 'https://blog.example.com/wo': { body: page({ 'og:title': '10 Tips Memilih WO', 'og:description': long, 'og:image': '/cover.png', 'og:site_name': 'Blog Nikah' }) } });
    const p = await getPreview('https://blog.example.com/wo');
    expect(p.title).toBe('10 Tips Memilih WO');
    expect(p.description.length).toBeLessThanOrEqual(280);
    expect(p.description.endsWith('…')).toBe(true);
    expect(p).toMatchObject({ image: 'https://blog.example.com/cover.png', site: 'Blog Nikah' });
  });

  it('always returns all three fields, even for a page with no metadata', async () => {
    serve({ 'https://bare.example.com': { body: '<html><body>hi</body></html>' } });
    expect(await getPreview('https://bare.example.com/x')).toEqual({
      url: 'https://bare.example.com/x',
      title: 'bare.example.com',
      description: '',
      image: '',
      site: 'bare.example.com',
    });
  });
});

describe('SSRF guard', () => {
  it('flags private and special addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '::1', 'fd00::1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '151.101.1.69', '2606:4700::6810:84e5']) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it('rejects private hosts, odd ports and credentials before any request', async () => {
    for (const u of ['http://localhost/', 'http://127.0.0.1/', 'http://[::1]/', 'http://169.254.169.254/latest', 'http://1.1.1.1:8080/', 'http://a:b@1.1.1.1/', 'file:///etc/passwd']) {
      await expect(assertPublicUrl(new URL(u)), u).rejects.toThrow();
    }
    await expect(assertPublicUrl(new URL('https://1.1.1.1/'))).resolves.toBeUndefined();
  });
});

describe('fetchThumbnail', () => {
  it('re-encodes real images to a small WebP', async () => {
    const png = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: '#ff4d8b' } }).png().toBuffer();
    fetchMock.mockResolvedValue({ url: 'https://i.example.com/a.png', status: 200, contentType: 'image/png', body: png, truncated: false });
    const t = await fetchThumbnail('https://i.example.com/a.png');
    const meta = await sharp(t.data).metadata();
    expect(t.contentType).toBe('image/webp');
    expect(meta).toMatchObject({ format: 'webp', width: 720, height: 540 });
  });

  it('refuses SVG and non-images', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
    fetchMock.mockResolvedValue({ url: 'https://i.example.com/a.svg', status: 200, contentType: 'image/svg+xml', body: svg, truncated: false });
    await expect(fetchThumbnail('https://i.example.com/a.svg')).rejects.toThrow(/Unsupported/);
    fetchMock.mockResolvedValue({ url: 'https://i.example.com/x', status: 200, contentType: 'text/html', body: new TextEncoder().encode('<html>'), truncated: false });
    await expect(fetchThumbnail('https://i.example.com/x')).rejects.toThrow();
  });
});
