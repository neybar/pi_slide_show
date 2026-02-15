import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, request as httpRequest } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRouter } from '../../lib/routes.mjs';
import { SlideShow } from '../../lib/slideshow.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', 'fixtures', 'mock-photos');
const wwwDir = join(__dirname, '..', 'fixtures', 'mock-www');

// Valid EXIF orientation values (1-8 per EXIF spec)
const VALID_ORIENTATIONS = [1, 2, 3, 4, 5, 6, 7, 8];

let server;
let baseUrl;

function testFetch(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = httpRequest(url, { method }, (res) => {
      const chunks = [];

      res.on('data', (chunk) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body,
          json: () => JSON.parse(body.toString())
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

describe('API Contract Tests', () => {
  beforeAll(async () => {
    // Ensure mock-www directory exists (avoid dependency on routes.test.mjs run order)
    await mkdir(join(wwwDir, 'css'), { recursive: true });
    await mkdir(join(wwwDir, 'js'), { recursive: true });
    await writeFile(join(wwwDir, 'index.html'), '<!DOCTYPE html><html><body>Test</body></html>');

    const slideshow = new SlideShow({
      photo_library: fixturesDir,
      web_photo_dir: 'photos',
      default_count: 25
    });

    const router = createRouter(slideshow, wwwDir);
    server = createServer(router);

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  describe('/album/:count response schema', () => {
    it('should have exactly two top-level properties: count and images', async () => {
      const res = await testFetch('/album/5');
      const data = res.json();
      const keys = Object.keys(data);

      expect(keys).toContain('count');
      expect(keys).toContain('images');
      expect(keys.length).toBe(2);
    });

    it('should return count as a non-negative integer', async () => {
      const res = await testFetch('/album/5');
      const data = res.json();

      expect(typeof data.count).toBe('number');
      expect(Number.isInteger(data.count)).toBe(true);
      expect(data.count).toBeGreaterThanOrEqual(0);
    });

    it('should return images as an array', async () => {
      const res = await testFetch('/album/5');
      const data = res.json();

      expect(Array.isArray(data.images)).toBe(true);
    });

    it('should have count matching images array length', async () => {
      const res = await testFetch('/album/5');
      const data = res.json();

      expect(data.count).toBe(data.images.length);
    });

    it('should return each image with exactly two properties: file and Orientation', async () => {
      const res = await testFetch('/album/3');
      const data = res.json();

      for (const img of data.images) {
        const keys = Object.keys(img);
        expect(keys).toContain('file');
        expect(keys).toContain('Orientation');
        expect(keys.length).toBe(2);
      }
    });

    it('should return file as a non-empty string starting with web photo dir', async () => {
      const res = await testFetch('/album/3');
      const data = res.json();

      for (const img of data.images) {
        expect(typeof img.file).toBe('string');
        expect(img.file.length).toBeGreaterThan(0);
        expect(img.file.startsWith('photos/')).toBe(true);
      }
    });

    it('should return file paths with valid image extensions', async () => {
      const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.heic', '.webp'];
      const res = await testFetch('/album/5');
      const data = res.json();

      for (const img of data.images) {
        const ext = img.file.substring(img.file.lastIndexOf('.')).toLowerCase();
        expect(validExtensions).toContain(ext);
      }
    });

    it('should return Orientation as a valid EXIF orientation value (1-8)', async () => {
      const res = await testFetch('/album/3');
      const data = res.json();

      for (const img of data.images) {
        expect(typeof img.Orientation).toBe('number');
        expect(Number.isInteger(img.Orientation)).toBe(true);
        expect(VALID_ORIENTATIONS).toContain(img.Orientation);
      }
    });

    it('should not contain path traversal sequences in file paths', async () => {
      const res = await testFetch('/album/5');
      const data = res.json();

      for (const img of data.images) {
        expect(img.file).not.toContain('..');
        expect(img.file).not.toMatch(/^[/\\]/);
      }
    });
  });

  describe('/album/:count count parameter behavior', () => {
    it('should return 0 photos for count=0', async () => {
      const res = await testFetch('/album/0');
      const data = res.json();

      expect(res.status).toBe(200);
      expect(data.count).toBe(0);
      expect(data.images).toEqual([]);
    });

    it('should return at most the requested count', async () => {
      const res = await testFetch('/album/3');
      const data = res.json();

      expect(res.status).toBe(200);
      expect(data.count).toBeLessThanOrEqual(3);
      expect(data.images.length).toBeLessThanOrEqual(3);
    });

    it('should return at most 1 photo for count=1', async () => {
      const res = await testFetch('/album/1');
      const data = res.json();

      expect(res.status).toBe(200);
      expect(data.count).toBeLessThanOrEqual(1);
    });

    it('should accept count=100 (maximum allowed)', async () => {
      const res = await testFetch('/album/100');

      expect(res.status).toBe(200);
    });

    it('should return 400 for count=101 (exceeds maximum)', async () => {
      const res = await testFetch('/album/101');

      expect(res.status).toBe(400);
      const data = res.json();
      expect(data).toHaveProperty('error');
      expect(typeof data.error).toBe('string');
    });

    it('should return 404 for non-numeric count', async () => {
      const res = await testFetch('/album/abc');

      expect(res.status).toBe(404);
    });

    it('should return 404 for negative count', async () => {
      const res = await testFetch('/album/-5');

      expect(res.status).toBe(404);
    });

    it('should return 404 for decimal count', async () => {
      const res = await testFetch('/album/2.5');

      expect(res.status).toBe(404);
    });
  });

  describe('/album/:count response headers', () => {
    it('should return application/json content type', async () => {
      const res = await testFetch('/album/1');

      expect(res.headers['content-type']).toContain('application/json');
    });

    it('should include security headers', async () => {
      const res = await testFetch('/album/1');

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    });

    it('should include content-length header', async () => {
      const res = await testFetch('/album/1');

      const contentLength = parseInt(res.headers['content-length']);
      expect(contentLength).toBeGreaterThan(0);
    });
  });

  describe('/album/:count error response schema', () => {
    it('should return error object with error property for 400 responses', async () => {
      const res = await testFetch('/album/101');

      expect(res.status).toBe(400);
      const data = res.json();
      expect(Object.keys(data)).toContain('error');
      expect(typeof data.error).toBe('string');
      expect(data.error.length).toBeGreaterThan(0);
    });
  });

  describe('/album/:count backward compatibility', () => {
    it('should use capital-O Orientation (not lowercase)', async () => {
      const res = await testFetch('/album/3');
      const data = res.json();

      for (const img of data.images) {
        expect(img).toHaveProperty('Orientation');
        expect(img).not.toHaveProperty('orientation');
      }
    });

    it('should use "file" as the path property name (not "path" or "src")', async () => {
      const res = await testFetch('/album/3');
      const data = res.json();

      for (const img of data.images) {
        expect(img).toHaveProperty('file');
        expect(img).not.toHaveProperty('path');
        expect(img).not.toHaveProperty('src');
        expect(img).not.toHaveProperty('url');
      }
    });

    it('should use "count" as the total property name (not "total" or "length")', async () => {
      const res = await testFetch('/album/3');
      const data = res.json();

      expect(data).toHaveProperty('count');
      expect(data).not.toHaveProperty('total');
      expect(data).not.toHaveProperty('length');
    });
  });

  describe('/album/fixture/:year response schema', () => {
    it('should match the same schema as /album/:count', async () => {
      const res = await testFetch('/album/fixture/2010');
      const data = res.json();

      // Same top-level structure
      expect(data).toHaveProperty('count');
      expect(data).toHaveProperty('images');
      expect(typeof data.count).toBe('number');
      expect(Array.isArray(data.images)).toBe(true);
      expect(data.count).toBe(data.images.length);

      // Same image schema (fixtures should not expose _metadata)
      for (const img of data.images) {
        expect(img).toHaveProperty('file');
        expect(img).toHaveProperty('Orientation');
        expect(typeof img.file).toBe('string');
        expect(typeof img.Orientation).toBe('number');
        expect(VALID_ORIENTATIONS).toContain(img.Orientation);
        expect(img.file.startsWith('photos/')).toBe(true);
      }
    });

    it('should strip _metadata from fixture response', async () => {
      const res = await testFetch('/album/fixture/2010');
      const data = res.json();

      expect(data._metadata).toBeUndefined();
    });

    it('should return 400 for invalid year with error schema', async () => {
      const res = await testFetch('/album/fixture/1999');

      expect(res.status).toBe(400);
      const data = res.json();
      expect(data).toHaveProperty('error');
      expect(typeof data.error).toBe('string');
    });
  });

  describe('API idempotency', () => {
    it('should return consistent schema across multiple requests', async () => {
      const responses = await Promise.all([
        testFetch('/album/3'),
        testFetch('/album/3'),
        testFetch('/album/3')
      ]);

      for (const res of responses) {
        expect(res.status).toBe(200);
        const data = res.json();

        // Schema is consistent even if content differs (random selection)
        expect(Object.keys(data).sort()).toEqual(['count', 'images']);
        expect(typeof data.count).toBe('number');
        expect(Array.isArray(data.images)).toBe(true);
        expect(data.count).toBe(data.images.length);

        for (const img of data.images) {
          expect(Object.keys(img).sort()).toEqual(['Orientation', 'file']);
        }
      }
    });
  });
});
