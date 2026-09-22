import { describe, it, expect } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { HttpLinkFetcher, resolveSafeAddress } from '../src/adapters/fetch/http-link-fetcher.js';

// The real SSRF guard correctly blocks 127.0.0.1 (loopback) — which is also
// the only host a same-machine test server can bind to. To exercise the
// pinned-connection/read/strip code paths for real (not just the guard
// itself, which has its own dedicated tests below), these tests inject a
// resolver that approves 127.0.0.1 and pins to it, exactly like the real
// resolver would for a genuinely public address. Production code never sets
// this option — see the constructor doc comment.
const allowLoopback = async (hostname: string) => ({ blocked: false, ip: hostname });

/** Spin up a tiny local server for the "reachable link" happy path. */
async function withServer(
  handler: http.RequestListener,
  run: (url: string) => Promise<void>,
): Promise<void> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}/`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('resolveSafeAddress (the DNS-rebinding fix)', () => {
  it('returns the exact validated address to pin, for a safe literal IP', async () => {
    // A public-shaped literal IP: not blocked, and the "ip to pin" is itself
    // — this is the value the caller must connect to, not re-resolve.
    const result = await resolveSafeAddress('93.184.216.34');
    expect(result).toEqual({ blocked: false, ip: '93.184.216.34' });
  });

  it('blocks a private literal IP and returns no pin address', async () => {
    const result = await resolveSafeAddress('10.1.2.3');
    expect(result.blocked).toBe(true);
    expect(result.ip).toBeUndefined();
  });

  it('blocks "localhost" without needing a DNS lookup', async () => {
    const result = await resolveSafeAddress('localhost');
    expect(result).toEqual({ blocked: true });
  });
});

describe('HttpLinkFetcher', () => {
  const fetcher = new HttpLinkFetcher();

  it('never throws on an invalid URL', async () => {
    const result = await fetcher.fetch('not a url');
    expect(result).toEqual({ ok: false, reason: 'invalid URL' });
  });

  it('blocks non-http(s) schemes', async () => {
    const result = await fetcher.fetch('file:///etc/passwd');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/blocked scheme/);
  });

  it('blocks literal loopback/private IPs', async () => {
    for (const url of [
      'http://127.0.0.1/',
      'http://localhost/',
      'http://10.0.0.5/',
      'http://192.168.1.1/',
      'http://169.254.169.254/latest/meta-data/', // cloud metadata endpoint
    ]) {
      const result = await fetcher.fetch(url);
      expect(result.ok, `expected ${url} to be blocked`).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/private|loopback/);
    }
  });

  it('fetches plain text from a reachable, resolver-approved host (pinned connection)', async () => {
    const test = new HttpLinkFetcher({ resolveAddress: allowLoopback });
    await withServer(
      (_req, res) => {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('the design doc says: ship it');
      },
      async (url) => {
        const result = await test.fetch(url);
        expect(result).toEqual({ ok: true, text: 'the design doc says: ship it' });
      },
    );
  });

  it('strips HTML to plain text', async () => {
    const test = new HttpLinkFetcher({ resolveAddress: allowLoopback });
    await withServer(
      (_req, res) => {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<html><body><h1>Plan</h1><p>Do the thing.</p></body></html>');
      },
      async (url) => {
        const result = await test.fetch(url);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.text).toContain('Plan');
      },
    );
  });

  it('does not follow redirects', async () => {
    const test = new HttpLinkFetcher({ resolveAddress: allowLoopback });
    await withServer(
      (_req, res) => {
        res.writeHead(302, { location: 'http://127.0.0.1:1/private' });
        res.end();
      },
      async (url) => {
        const result = await test.fetch(url);
        expect(result).toEqual({ ok: false, reason: 'redirects are not followed' });
      },
    );
  });

  it('caps the response body size', async () => {
    const small = new HttpLinkFetcher({ maxBytes: 10, resolveAddress: allowLoopback });
    await withServer(
      (_req, res) => {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('this response is way over the ten byte cap');
      },
      async (url) => {
        const result = await small.fetch(url);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toMatch(/exceeds/);
      },
    );
  });
});
