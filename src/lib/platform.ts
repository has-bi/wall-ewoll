import { hostnameOf } from './url.js';

export type PlatformId = 'instagram' | 'tiktok' | 'x' | 'threads' | 'facebook' | 'youtube' | 'maps' | 'web';

const LABELS: Record<PlatformId, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  x: 'X',
  threads: 'Threads',
  facebook: 'Facebook',
  youtube: 'YouTube',
  maps: 'Google Maps',
  web: 'Web',
};

const is = (host: string, ...domains: string[]) => domains.some((d) => host === d || host.endsWith(`.${d}`));

export function platformOf(url: string): PlatformId {
  const host = hostnameOf(url).toLowerCase();
  if (is(host, 'instagram.com', 'instagr.am')) return 'instagram';
  if (is(host, 'tiktok.com')) return 'tiktok';
  if (is(host, 'x.com', 'twitter.com')) return 'x';
  if (is(host, 'threads.net', 'threads.com')) return 'threads';
  if (is(host, 'facebook.com', 'fb.com', 'fb.watch')) return 'facebook';
  if (is(host, 'youtube.com', 'youtu.be')) return 'youtube';
  if (host === 'maps.app.goo.gl' || (/^(www\.)?google\.[a-z.]+$/.test(host) && url.includes('/maps'))) return 'maps';
  return 'web';
}

export function platformLabel(url: string): string {
  const id = platformOf(url);
  return id === 'web' ? hostnameOf(url) : LABELS[id];
}
