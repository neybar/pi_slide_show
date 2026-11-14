import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRouter } from '../../lib/routes.mjs';
import {
  sanitizeReport, isPrivateAddress, createDiagnosticsStore, formatLogLine, cleanString,
  MAX_BODY_BYTES, MAX_REPORTS, MAX_EVENTS, GLOBAL_RATE_MAX
} from '../../lib/diagnostics.mjs';
import { summarizeFrames, modeFromClassName, describe as describeValue } from '../../www/js/diagnostics.mjs';

const silent = { info() {}, warn() {}, error() {}, debug() {} };
const slideshow = { photoLibrary: '/nonexistent', webPhotoDir: 'photos' };
const JSON_HEADERS = { 'Content-Type': 'application/json' };

let wwwDir;
const servers = [];

async function start(options) {
  const router = createRouter(slideshow, wwwDir, { logger: silent, ...options });
  const server = createServer(router);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

beforeAll(async () => {
  wwwDir = await mkdtemp(join(tmpdir(), 'diag-www-'));
  await writeFile(join(wwwDir, 'index.html'), '<html><head><title>t</title></head><body></body></html>');
});

afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await rm(wwwDir, { recursive: true, force: true });
});

const post = (base, body, headers = JSON_HEADERS) =>
  fetch(`${base}/diag`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

describe('/diag disabled (default)', () => {
  it('is a 404 for GET and POST, and index.html has no diagnostics flag', async () => {
    const base = await start({});
    expect((await fetch(`${base}/diag`)).status).toBe(404);
    expect((await post(base, { reason: 'error' })).status).toBe(405);
    expect(await (await fetch(`${base}/`)).text()).not.toContain('name="diagnostics"');
  });
});

describe('/diag enabled', () => {
  let base;
  beforeAll(async () => { base = await start({ diagnostics: true }); });

  it('injects the meta flag into index.html (CSP-safe, no inline script)', async () => {
    const html = await (await fetch(`${base}/`)).text();
    expect(html).toContain('<meta name="diagnostics" content="on">');
    expect(html).not.toContain('<script');
  });

  it('accepts a report, answers 204 with no body, and returns it from GET as JSON', async () => {
    const res = await post(base, {
      reason: 'error', mode: 'grid', album: 'Holiday 2019', userAgent: 'Chrome/76',
      viewport: { w: 1920, h: 1080 }, uptimeMs: 1234,
      frames: { n: 100, p50: 16.7, p95: 33.3, max: 80 },
      memory: { usedMB: 90, totalMB: 120, limitMB: 2048 },
      events: [{ type: 'error', message: 'boom', source: 'main.js', line: 3, col: 4 }]
    });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');

    const get = await fetch(`${base}/diag`);
    expect(get.status).toBe(200);
    expect(get.headers.get('content-type')).toContain('application/json');
    expect(get.headers.get('cache-control')).toBe('no-store');
    const data = await get.json();
    const last = data.reports[data.reports.length - 1];
    expect(last).toMatchObject({ reason: 'error', mode: 'grid', album: 'Holiday 2019' });
    expect(last.events[0].message).toBe('boom');
    expect(last.receivedAt).toMatch(/^\d{4}-/);
    expect(last.ip).toBeTruthy();
  });

  it('rejects non-JSON content types with 415', async () => {
    expect((await post(base, '{}', { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await post(base, '{}', { 'Content-Type': 'application/x-www-form-urlencoded' })).status).toBe(415);
  });

  it('rejects bad JSON and non-object bodies with 400', async () => {
    expect((await post(base, '{not json')).status).toBe(400);
    expect((await post(base, '[1,2]')).status).toBe(400);
    expect((await post(base, 'null')).status).toBe(400);
  });

  it('rejects an oversized body with 413', async () => {
    const big = JSON.stringify({ reason: 'error', album: 'x'.repeat(MAX_BODY_BYTES) });
    expect((await post(base, big)).status).toBe(413);
  });

  it('rejects methods other than GET, HEAD and POST', async () => {
    const res = await fetch(`${base}/diag`, { method: 'DELETE' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toContain('POST');
  });

  it('answers HEAD with no body', async () => {
    const res = await fetch(`${base}/diag`, { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });

  it('never reflects input as HTML', async () => {
    await post(base, { album: '<script>alert(1)</script>', events: [{ type: 'error', message: '<img src=x onerror=1>' }] });
    const res = await fetch(`${base}/diag`);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('rate limits reports globally with 429', async () => {
    const limited = await start({ diagnostics: true });
    let last;
    for (let i = 0; i < GLOBAL_RATE_MAX + 1; i++) last = await post(limited, { reason: 'interval' });
    expect(last.status).toBe(429);
    expect(last.headers.get('retry-after')).toBe('60');
  });

  it('refuses non-LAN socket addresses (X-Forwarded-For is ignored)', async () => {
    const router = createRouter(slideshow, wwwDir, { logger: silent, diagnostics: true });
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, writeHead(c) { this.status = c; }, end() {} };
    const req = {
      url: '/diag', method: 'GET', headers: { 'x-forwarded-for': '192.168.1.5' },
      socket: { remoteAddress: '8.8.8.8' }, resume() {}
    };
    await router(req, res);
    expect(res.status).toBe(403);
  });
});

describe('sanitizeReport', () => {
  it('whitelists fields, caps strings and events, strips control characters', () => {
    const r = sanitizeReport({
      mode: 'weird', album: 'a\u0000b\nc'.padEnd(500, 'x'), evil: 'dropped',
      events: Array.from({ length: 100 }, () => ({ type: 'error', message: 'm'.repeat(1000) }))
        .concat([{ type: 'bogus' }]),
      frames: { n: 'NaN' }, memory: { usedMB: Infinity }
    });
    expect(r.mode).toBe('unknown');
    expect(r.album.length).toBe(120);
    expect(r.album).not.toMatch(/[\u0000-\u001f]/);
    expect(r).not.toHaveProperty('evil');
    expect(r.events.length).toBe(MAX_EVENTS);
    expect(r.events[0].message.length).toBe(300);
    expect(r.frames).toBeNull();
    expect(r.memory).toBeNull();
  });

  it('drops events with unknown types and non-string values become empty', () => {
    expect(sanitizeReport({ events: [{ type: 'x' }, null, 5] }).events).toEqual([]);
    expect(cleanString(42, 10)).toBe('');
  });

  it('returns null for non-objects', () => {
    expect(sanitizeReport(null)).toBeNull();
    expect(sanitizeReport('x')).toBeNull();
    expect(sanitizeReport([])).toBeNull();
  });
});

describe('createDiagnosticsStore', () => {
  it('keeps only the newest maxReports (bounded ring buffer)', () => {
    const store = createDiagnosticsStore({ maxReports: 3 });
    for (let i = 0; i < 10; i++) store.add({ n: i, events: [] }, '127.0.0.1');
    const { reports, total, count } = store.list();
    expect(reports.map((r) => r.n)).toEqual([7, 8, 9]);
    expect(total).toBe(10);
    expect(count).toBe(3);
  });

  it('defaults to MAX_REPORTS', () => {
    const store = createDiagnosticsStore();
    for (let i = 0; i < MAX_REPORTS + 20; i++) store.add({ events: [] }, 'x');
    expect(store.list().count).toBe(MAX_REPORTS);
  });

  it('rate limit window resets after a minute', () => {
    let t = 1_000_000;
    const store = createDiagnosticsStore({ rateMax: 2, now: () => t });
    expect([store.allow(), store.allow(), store.allow()]).toEqual([true, true, false]);
    t += 61_000;
    expect(store.allow()).toBe(true);
  });
});

describe('isPrivateAddress', () => {
  it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1', '10.1.2.3', '192.168.0.9', '172.16.0.1', '172.31.255.1',
    '169.254.1.1', 'fd00::1', 'fe80::1', '::ffff:192.168.1.1'])('allows %s', (a) => {
    expect(isPrivateAddress(a)).toBe(true);
  });
  it.each(['8.8.8.8', '172.32.0.1', '172.15.0.1', '2001:db8::1', '', undefined, 'garbage'])('refuses %s', (a) => {
    expect(isPrivateAddress(a)).toBe(false);
  });
});

describe('formatLogLine', () => {
  it('is a single line with capped, quoted message text', () => {
    const report = sanitizeReport({ reason: 'error', mode: 'grid', events: [{ type: 'error', message: 'x'.repeat(300) + '\nforged line' }] });
    const line = formatLogLine(report, '10.0.0.2');
    expect(line).not.toContain('\n');
    expect(line.length).toBeLessThan(250);
    expect(line).toContain('reason=error mode=grid');
  });
});

describe('client helpers', () => {
  it('summarizeFrames computes p50/p95/max', () => {
    const deltas = new Float32Array(100);
    for (let i = 0; i < 100; i++) deltas[i] = i + 1;
    expect(summarizeFrames(deltas, 100)).toEqual({ n: 100, p50: 51, p95: 96, max: 100 });
    expect(summarizeFrames(deltas, 0)).toBeNull();
  });
  it('modeFromClassName reads the body class', () => {
    expect(modeFromClassName('mode-tiny')).toBe('tiny');
    expect(modeFromClassName('foo mode-grid bar')).toBe('grid');
    expect(modeFromClassName('')).toBe('');
  });
  it('describe never throws', () => {
    const circular = {};
    circular.self = circular;
    expect(describeValue(new TypeError('x'))).toBe('TypeError: x');
    expect(typeof describeValue(circular)).toBe('string');
  });
});
