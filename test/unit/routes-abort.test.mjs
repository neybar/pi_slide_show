import { describe, it, expect } from 'vitest';
import { createServer, request } from 'node:http';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRouter } from '../../lib/routes.mjs';

// Regression: a client abort mid-download must close the FileHandle (not leave it to GC).
describe('file serving closes handles on client abort', () => {
  it('releases file descriptors when the client destroys the socket', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'abort-'));
    const wwwDir = await mkdtemp(join(tmpdir(), 'abort-www-'));
    await writeFile(join(dir, 'big.jpg'), Buffer.alloc(8 * 1024 * 1024, 1));
    await writeFile(join(wwwDir, 'big.js'), Buffer.alloc(8 * 1024 * 1024, 1));

    // close() is an own property of each handle, so detect leaks by counting open fds
    const fdCount = () => readdirSync(process.platform === 'linux' ? '/proc/self/fd' : '/dev/fd').length;
    const baseline = fdCount();

    const router = createRouter({ photoLibrary: dir, webPhotoDir: 'photos' }, wwwDir, { logger: { warn() {}, error() {}, info() {}, log() {} } });
    const server = createServer(router);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address();

    const abortAfterFirstChunk = (path) => new Promise((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path }, (res) => {
        res.once('data', () => { res.destroy(); resolve(); });
      });
      req.on('error', () => {});
      req.on('socket', () => {});
      req.end();
      setTimeout(() => reject(new Error('no data')), 5000);
    });

    try {
      await abortAfterFirstChunk('/photos/big.jpg');
      await abortAfterFirstChunk('/big.js');
      const deadline = Date.now() + 3000;
      while (fdCount() > baseline + 2 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
      // Slack covers the listening socket; two leaked file handles would exceed it
      expect(fdCount()).toBeLessThanOrEqual(baseline + 2);
    } finally {
      await new Promise((r) => server.close(r));
      await rm(dir, { recursive: true, force: true });
      await rm(wwwDir, { recursive: true, force: true });
    }
  });

  // Regression: an abort that lands between writeHead() and the stream starting must not make
  // an error path call writeHead() again (ERR_HTTP_HEADERS_SENT, uncaught, kills the server).
  it('survives clients that abort right after sending the request', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'abort-early-'));
    const wwwDir = await mkdtemp(join(tmpdir(), 'abort-early-www-'));
    await writeFile(join(dir, 'big.jpg'), Buffer.alloc(2 * 1024 * 1024, 1));
    await writeFile(join(wwwDir, 'big.js'), Buffer.alloc(2 * 1024 * 1024, 1));

    const uncaught = [];
    const onUncaught = (err) => uncaught.push(err);
    process.on('uncaughtException', onUncaught);

    const router = createRouter({ photoLibrary: dir, webPhotoDir: 'photos' }, wwwDir, { logger: { warn() {}, error() {}, info() {}, log() {} } });
    const server = createServer(router);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address();

    const abortEarly = (path, delayMs) => new Promise((resolve) => {
      const req = request({ host: '127.0.0.1', port, path });
      req.on('error', () => resolve());
      req.on('close', () => resolve());
      req.end();
      setTimeout(() => req.destroy(), delayMs);
    });
    const status = (path) => new Promise((resolve, reject) => {
      request({ host: '127.0.0.1', port, path }, (res) => { res.resume(); resolve(res.statusCode); })
        .on('error', reject).end();
    });

    try {
      const aborts = [];
      for (let i = 0; i < 40; i++) {
        aborts.push(abortEarly('/photos/big.jpg', i % 4), abortEarly('/big.js', i % 4));
      }
      await Promise.all(aborts);
      await new Promise((r) => setTimeout(r, 100));
      expect(uncaught.map((e) => e.code || e.message)).toEqual([]);
      expect(await status('/photos/big.jpg')).toBe(200);
    } finally {
      process.off('uncaughtException', onUncaught);
      await new Promise((r) => server.close(r));
      await rm(dir, { recursive: true, force: true });
      await rm(wwwDir, { recursive: true, force: true });
    }
  });
});
