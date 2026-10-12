import { hostnameOf, normalizeUrl } from '../src/lib/url.js';
import { platformLabel, platformOf } from '../src/lib/platform.js';
import { safeFetch } from './safe-fetch.js';

/** What every card needs, whatever the link points at. */
export interface LinkPreview {
  url: string;
  title: string;
  description: string;
  image: string;
  site: string;
}

interface Raw {
  title?: string;
  description?: string;
  image?: string;
  site?: string;
}

export const LIMITS = { title: 120, description: 280 };

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';
// Meta and many other sites serve full Open Graph tags to their own link-preview crawler.
const PREVIEW_BOT_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

// ---------- text helpers ----------

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

const squash = (text = '') => text.replace(/\s+/g, ' ').trim();
const unquote = (text: string) => text.replace(/^["“'](.*)["”']$/s, '$1').trim();

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:!?-]+$/, '')}…`;
}

// ---------- HTML meta tags ----------

export function parseHtmlMeta(html: string, baseUrl: string): Raw {
  const meta = new Map<string, string>();
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs: Record<string, string> = {};
    for (const [, name, , dq, sq, bare] of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attrs[name.toLowerCase()] = dq ?? sq ?? bare ?? '';
    }
    const key = (attrs.property ?? attrs.name ?? attrs.itemprop)?.toLowerCase();
    if (key && attrs.content !== undefined && !meta.has(key)) meta.set(key, decodeEntities(attrs.content));
  }
  const pick = (...keys: string[]) => keys.map((k) => meta.get(k)).find((v) => v && v.trim());
  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  const imageSrc = html.match(/<link\b[^>]*rel=["']image_src["'][^>]*>/i)?.[0].match(/href=["']([^"']+)["']/i)?.[1];
  const image = pick('og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src', 'image') ?? imageSrc;
  return {
    title: pick('og:title', 'twitter:title') ?? (titleTag ? decodeEntities(titleTag) : undefined),
    description: pick('og:description', 'twitter:description', 'description'),
    image: image ? absolutize(decodeEntities(image), baseUrl) : undefined,
    site: pick('og:site_name'),
  };
}

function absolutize(src: string, base: string): string | undefined {
  try {
    return normalizeUrl(new URL(src, base).href) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Instagram/Threads/Facebook wrap captions in boilerplate:
 *   og:title       `Kopi Kebun on Instagram: "Garden cafe …"`
 *   og:description `1,204 likes, 31 comments - kopikebun on March 3, 2025: "Garden cafe …"`
 * Normalise to title = who posted, description = the caption.
 */
export function cleanSocial(raw: Raw): Raw {
  let title = squash(raw.title);
  let description = squash(raw.description);
  const post = title.match(/^(.+?) on (?:Instagram|Threads|Facebook|TikTok)\s*:\s*(.*)$/s);
  if (post) {
    title = post[1];
    if (!description || /^[\d.,]+[KkMm]? (likes?|comments?)/.test(description)) description = post[2];
  }
  title = title
    .replace(/\s+on Threads$/i, '')
    .replace(/\s*[•|·-]\s*Instagram photos and videos$/i, '')
    .replace(/\s*\|\s*Facebook$/i, '');
  description = description
    .replace(/^[\d.,]+[KkMm]? likes?, [\d.,]+[KkMm]? comments? - [\w.]+ on [^:]{3,40}:\s*/i, '')
    .replace(/\s*-\s*See Instagram photos and videos from .*$/i, '');
  return { ...raw, title, description: unquote(description) };
}

// ---------- platform APIs ----------

async function getJson(url: string): Promise<unknown> {
  const res = await safeFetch(url, { maxBytes: 512 * 1024, headers: { accept: 'application/json', 'user-agent': BROWSER_UA } });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  return JSON.parse(new TextDecoder().decode(res.body));
}

interface TikTokOembed {
  title?: string;
  author_name?: string;
  author_unique_id?: string;
  thumbnail_url?: string;
}

export function fromTikTok(data: TikTokOembed): Raw {
  return {
    title: data.author_name || (data.author_unique_id ? `@${data.author_unique_id}` : undefined),
    description: data.title,
    image: data.thumbnail_url,
    site: 'TikTok',
  };
}

interface Tweet {
  text?: string;
  user?: { name?: string; screen_name?: string; profile_image_url_https?: string };
  photos?: { url?: string }[];
  mediaDetails?: { media_url_https?: string }[];
  video?: { poster?: string };
  card?: { binding_values?: Record<string, { image_value?: { url?: string } }> };
}

export function fromTweet(data: Tweet): Raw {
  const user = data.user ?? {};
  const cardImage = Object.entries(data.card?.binding_values ?? {}).find(([k, v]) => k.startsWith('thumbnail_image') && v.image_value?.url)?.[1]
    .image_value?.url;
  return {
    title: user.name ? `${user.name}${user.screen_name ? ` (@${user.screen_name})` : ''}` : undefined,
    description: data.text?.replace(/https:\/\/t\.co\/\w+/g, ''),
    image:
      data.photos?.[0]?.url ??
      data.mediaDetails?.[0]?.media_url_https ??
      data.video?.poster ??
      cardImage ??
      user.profile_image_url_https?.replace('_normal.', '_400x400.'),
    site: 'X',
  };
}

/** Same token the official embed widget computes for the syndication endpoint. */
export function tweetToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

async function fetchHtmlMeta(url: string, userAgent: string): Promise<{ raw: Raw; finalUrl: string }> {
  const res = await safeFetch(url, {
    maxBytes: 1.5 * 1024 * 1024,
    headers: { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en,id;q=0.8' },
  });
  if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
  const charset = res.contentType.match(/charset=([\w-]+)/i)?.[1] ?? 'utf-8';
  let html: string;
  try {
    html = new TextDecoder(charset).decode(res.body);
  } catch {
    html = new TextDecoder().decode(res.body);
  }
  return { raw: parseHtmlMeta(html, res.url), finalUrl: res.url };
}

async function fromHtml(url: string, botFirst: boolean): Promise<Raw> {
  const agents = botFirst ? [PREVIEW_BOT_UA, BROWSER_UA] : [BROWSER_UA, PREVIEW_BOT_UA];
  let best: Raw = {};
  for (const ua of agents) {
    try {
      const { raw } = await fetchHtmlMeta(url, ua);
      if (raw.title && raw.image) return raw;
      if (!best.title || (raw.image && !best.image)) best = { ...best, ...raw };
    } catch {
      // Try the next user agent.
    }
  }
  return best;
}

// ---------- entry point ----------

export async function getPreview(input: string): Promise<LinkPreview> {
  const url = normalizeUrl(input);
  if (!url) throw new Error('Not an http(s) link');
  const platform = platformOf(url);
  let raw: Raw = {};

  try {
    if (platform === 'x') {
      const id = url.match(/\/status(?:es)?\/(\d+)/)?.[1];
      if (id) raw = fromTweet((await getJson(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${tweetToken(id)}`)) as Tweet);
    } else if (platform === 'tiktok') {
      raw = fromTikTok((await getJson(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`)) as TikTokOembed);
    }
  } catch {
    // Fall through to the HTML scrape below.
  }

  if (!raw.title || !raw.image) {
    const isMeta = platform === 'instagram' || platform === 'threads' || platform === 'facebook';
    const html = await fromHtml(url, isMeta || platform === 'tiktok' || platform === 'x');
    raw = { title: raw.title || html.title, description: raw.description || html.description, image: raw.image || html.image, site: raw.site || html.site };
    if (isMeta || platform === 'tiktok') raw = cleanSocial(raw);
  }

  return normalizePreview(url, raw);
}

export function normalizePreview(url: string, raw: Raw): LinkPreview {
  const title = squash(decodeEntities(raw.title ?? '')).replace(/\s+[|–—-]\s+(YouTube|TikTok)$/i, '');
  const description = unquote(squash(decodeEntities(raw.description ?? '')));
  return {
    url,
    title: truncate(title || hostnameOf(url), LIMITS.title),
    description: truncate(description === title ? '' : description, LIMITS.description),
    image: (raw.image && normalizeUrl(raw.image)) || '',
    site: platformOf(url) === 'web' ? squash(raw.site) || platformLabel(url) : platformLabel(url),
  };
}
