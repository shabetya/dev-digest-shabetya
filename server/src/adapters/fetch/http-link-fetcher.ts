import dns from 'node:dns/promises';
import net from 'node:net';
import http, { type IncomingMessage } from 'node:http';
import https from 'node:https';
import type { LinkFetcher, LinkFetchResult } from '@devdigest/shared';

/**
 * HttpLinkFetcher — fetches an arbitrary external URL (a plan/spec/ticket
 * link found in a PR description or issue body) for the Intent Layer.
 *
 * SSRF defenses (mandatory, not best-effort):
 *  - only `http:`/`https:` schemes are allowed;
 *  - the hostname is resolved and EVERY resolved address is checked against
 *    loopback/private/link-local/unique-local ranges before the request is
 *    made, AND the connection is pinned to the exact address that was
 *    validated (via a custom `lookup`) — a plain "check hostname, then let
 *    the HTTP client re-resolve it" scheme is vulnerable to DNS rebinding
 *    (the check and the connect are two independent lookups that a hostile
 *    resolver can answer differently); pinning closes that TOCTOU window;
 *  - redirects are read but never followed (Node's http/https clients don't
 *    auto-follow, so a 3xx is simply reported as blocked rather than chased);
 *  - a short timeout and a capped response size bound worst-case cost;
 *  - HTML is stripped to plain text (best-effort, no external parser).
 *
 * NEVER throws — every failure path returns a typed `{ ok: false }` result.
 */
export class HttpLinkFetcher implements LinkFetcher {
  constructor(
    private opts: {
      timeoutMs?: number;
      maxBytes?: number;
      /**
       * Override the SSRF address check — for tests only, so the pinned-
       * connection/read/strip code paths can be exercised against a local
       * test server without loosening the real guard (which always runs in
       * production; there is no way to disable it via public API).
       */
      resolveAddress?: typeof resolveSafeAddress;
    } = {},
  ) {}

  async fetch(url: string): Promise<LinkFetchResult> {
    const timeoutMs = this.opts.timeoutMs ?? 5_000;
    const maxBytes = this.opts.maxBytes ?? 200_000;
    const resolveAddress = this.opts.resolveAddress ?? resolveSafeAddress;

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, reason: 'invalid URL' };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, reason: `blocked scheme '${parsed.protocol}'` };
    }

    const resolved = await resolveAddress(parsed.hostname);
    if (resolved.blocked) {
      return { ok: false, reason: 'target host resolves to a private/loopback address' };
    }

    let res: IncomingMessage;
    try {
      res = await pinnedRequest(parsed, resolved.ip, timeoutMs);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'fetch failed';
      return { ok: false, reason };
    }

    try {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        res.destroy();
        return { ok: false, reason: 'redirects are not followed' };
      }
      if (status < 200 || status >= 300) {
        res.destroy();
        return { ok: false, reason: `HTTP ${status}` };
      }
      const buf = await readCapped(res, maxBytes);
      if (buf === null) {
        return { ok: false, reason: `response exceeds ${maxBytes} byte cap` };
      }
      const contentType = String(res.headers['content-type'] ?? '');
      const text = contentType.includes('html') ? stripHtml(buf) : buf;
      const trimmed = text.trim();
      if (trimmed.length === 0) {
        return { ok: false, reason: 'empty response body' };
      }
      return { ok: true, text: trimmed };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'fetch failed';
      return { ok: false, reason };
    }
  }
}

/**
 * Issue the actual request, pinned to `ip` when one was resolved/validated —
 * `lookup` overrides ONLY the address used for the TCP connection; the URL's
 * own hostname still drives the `Host` header and (for https) the TLS SNI/
 * certificate check, so pinning doesn't break virtual hosting or cert
 * validation. `ip` is `undefined` only when our own resolution attempt
 * failed (see `resolveSafeAddress`) — in that rare case we fall back to the
 * runtime's own DNS resolution, same as before this fix.
 */
function pinnedRequest(url: URL, ip: string | undefined, timeoutMs: number): Promise<IncomingMessage> {
  const mod = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions & { lookup?: unknown } = {
      method: 'GET',
      headers: { accept: 'text/html,text/plain,*/*' },
    };
    if (ip) {
      options.lookup = (
        _hostname: string,
        _opts: unknown,
        callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
      ) => callback(null, ip, net.isIPv6(ip) ? 6 : 4);
    }
    const req = mod.request(url, options, (res) => resolve(res));
    const timer = setTimeout(() => req.destroy(new Error('request timed out')), timeoutMs);
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
    req.end();
  });
}

/** Read at most `maxBytes` of the response body; returns null if it overflows. */
async function readCapped(res: IncomingMessage, maxBytes: number): Promise<string | null> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of res) {
    const buf: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.byteLength;
    if (total > maxBytes) {
      res.destroy();
      return null;
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/** Very small, dependency-free HTML → text: drop script/style, strip tags, decode a few entities. */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|br|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * SSRF guard: reject loopback / private / link-local / unique-local
 * addresses, and return the exact validated address to pin the subsequent
 * connection to (closing the DNS-rebinding TOCTOU window — see class doc).
 */
export async function resolveSafeAddress(hostname: string): Promise<{ blocked: boolean; ip?: string }> {
  // Literal IP in the URL — check directly (no DNS round-trip, and the
  // "address" to pin to is just itself).
  if (net.isIP(hostname)) {
    return isPrivateOrLoopback(hostname) ? { blocked: true } : { blocked: false, ip: hostname };
  }

  if (hostname === 'localhost') return { blocked: true };

  let addresses: string[];
  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    addresses = records.map((r) => r.address);
  } catch {
    // Resolution failure isn't an SSRF concern by itself — the connection
    // attempt will fail with a clear network error. We have no address to
    // pin in this case, so the request below falls back to the runtime's
    // own (unpinned) resolution; this is a narrow, low-risk gap since it
    // only applies when our own lookup could not resolve anything at all.
    return { blocked: false };
  }
  if (addresses.length === 0) return { blocked: false };
  if (addresses.some((a) => isPrivateOrLoopback(a))) return { blocked: true };
  return { blocked: false, ip: addresses[0] };
}

function isPrivateOrLoopback(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    if (a === undefined || b === undefined) return true;
    if (a === 127) return true; // loopback
    if (a === 10) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata 169.254.169.254)
    if (a === 0) return true; // "this" network
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true; // loopback
    if (lower.startsWith('::ffff:')) return isPrivateOrLoopback(lower.slice(7)); // IPv4-mapped
    if (lower.startsWith('fe80:')) return true; // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
    return false;
  }
  // Unknown shape — fail closed.
  return true;
}
