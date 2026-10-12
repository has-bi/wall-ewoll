/**
 * Turns user input into a safe http(s) URL, or null if it can't be one.
 * Bare domains ("kopikenangan.com") get https:// prepended. Other schemes
 * (javascript:, data:, file:) are rejected so a saved card can't run code.
 */
export function normalizeUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw);
  const candidate = hasScheme ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
    return url.href;
  } catch {
    return null;
  }
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
