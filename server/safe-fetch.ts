import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

// The server fetches URLs that users paste, so it must never be steered at private
// networks (cloud metadata endpoints, localhost services). Every hop is checked.

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 3],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv6');
}

export function isPrivateAddress(address: string): boolean {
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return isPrivateAddress(mapped[1]);
  const family = isIP(address);
  if (family === 4) return blocked.check(address, 'ipv4');
  if (family === 6) return blocked.check(address, 'ipv6');
  return true;
}

export class FetchBlockedError extends Error {}

export async function assertPublicUrl(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new FetchBlockedError('Only http(s) URLs');
  if (url.port && url.port !== '80' && url.port !== '443') throw new FetchBlockedError('Non-standard port');
  if (url.username || url.password) throw new FetchBlockedError('Credentials in URL');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new FetchBlockedError('Private host');
  }
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw new FetchBlockedError('Private address');
}

export interface FetchedResource {
  url: string;
  status: number;
  contentType: string;
  body: Uint8Array;
  truncated: boolean;
}

interface SafeFetchOptions {
  headers?: Record<string, string>;
  maxBytes: number;
  timeoutMs?: number;
}

/** GET with manual redirects (each target re-validated), a timeout and a body size cap. */
export async function safeFetch(input: string, { headers, maxBytes, timeoutMs = 7000 }: SafeFetchOptions): Promise<FetchedResource> {
  const signal = AbortSignal.timeout(timeoutMs);
  let url = new URL(input);
  for (let hop = 0; hop <= 5; hop++) {
    await assertPublicUrl(url);
    const res = await fetch(url, { headers, redirect: 'manual', signal });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      url = new URL(location, url);
      continue;
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    let truncated = false;
    if (res.body) {
      const reader = res.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.byteLength;
        if (size >= maxBytes) {
          truncated = true;
          await reader.cancel();
          break;
        }
      }
    }
    const body = new Uint8Array(Math.min(size, maxBytes));
    let offset = 0;
    for (const chunk of chunks) {
      const part = chunk.subarray(0, body.byteLength - offset);
      body.set(part, offset);
      offset += part.byteLength;
    }
    return { url: url.href, status: res.status, contentType: res.headers.get('content-type') ?? '', body, truncated };
  }
  throw new Error('Too many redirects');
}
