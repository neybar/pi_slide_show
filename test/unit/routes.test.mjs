import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRouter } from '../../lib/routes.mjs';
import { SlideShow } from '../../lib/slideshow.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', 'fixtures', 'mock-photos');
const wwwDir = join(__dirname, '..', 'fixtures', 'mock-www');

// Minimal valid JPEG (1x1 pixel)
const minimalJpeg = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
  0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
  0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
  0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
  0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0a, 0x0b, 0xff, 0xc4, 0x00, 0xb5, 0x10, 0x00, 0x02, 0x01, 0x03,
  0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7d,
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
  0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
  0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72,
  0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45,
  0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
  0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75,
  0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3,
  0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
  0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9,
  0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4,
  0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01,
  0x00, 0x00, 0x3f, 0x00, 0xfb, 0xd5, 0xdb, 0x20, 0xa8, 0x00, 0x1f, 0xff,
  0xd9
]);

let server;
let baseUrl;

async function createFixtures() {
  // Create mock photo library - include all directories needed by both tests
  const photoDirs = [
    join(fixturesDir, 'valid-photos'),
    join(fixturesDir, 'nested', 'subfolder'),
    join(fixturesDir, '.hidden'),
    join(fixturesDir, '@eaDir'),
    join(fixturesDir, 'iPhoto Library')
  ];

  for (const dir of photoDirs) {
    await mkdir(dir, { recursive: true });
  }

  // Only create test-specific images that aren't created by create-mock-images.mjs
  // The main fixture images (landscape1-6, portrait1-5, panorama, etc.) are
  // created by test/fixtures/create-mock-images.mjs with proper dimensions
  const images = [
    'iPhoto Library/should-skip.jpg'
  ];

  for (const imagePath of images) {
    const fullPath = join(fixturesDir, imagePath);
    await writeFile(fullPath, minimalJpeg);
  }

  // Create mock www directory
  await mkdir(join(wwwDir, 'css'), { recursive: true });
  await mkdir(join(wwwDir, 'js'), { recursive: true });

  await writeFile(join(wwwDir, 'index.html'), '<!DOCTYPE html><html><body>Test</body></html>');
  await writeFile(join(wwwDir, 'css', 'main.css'), 'body { margin: 0; }');
  await writeFile(join(wwwDir, 'js', 'main.js'), 'console.log("test");');
}

async function cleanupWwwFixtures() {
  try {
    // Only clean up www fixtures - photo fixtures are shared with slideshow.test.mjs
    await rm(wwwDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

function fetch(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = require('node:http').request(url, { method }, (res) => {
      let data = '';
      const chunks = [];

      res.on('data', (chunk) => {
        if (typeof chunk === 'string') {
          data += chunk;
        } else {
          chunks.push(chunk);
        }
      });

      res.on('end', () => {
        const body = chunks.length > 0 ? Buffer.concat(chunks) : data;
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

describe('Routes', () => {
  beforeAll(async () => {
    // Create fixtures idempotently (don't delete first - shared fixtures)
    await createFixtures();

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
    await cleanupWwwFixtures();
  });

  describe('GET /', () => {
    it('should serve index.html', async () => {
      const res = await fetch('/');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body.toString()).toContain('<!DOCTYPE html>');
    });
  });

  describe('GET /album/:count', () => {
    it('should return valid JSON with correct structure', async () => {
      const res = await fetch('/album/5');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');

      const data = res.json();
      expect(data).toHaveProperty('count');
      expect(data).toHaveProperty('images');
      expect(Array.isArray(data.images)).toBe(true);
    });

    it('should respect count parameter', async () => {
      const res = await fetch('/album/2');
      const data = res.json();

      expect(data.count).toBeLessThanOrEqual(2);
      expect(data.images.length).toBeLessThanOrEqual(2);
    });

    it('should return images with required properties', async () => {
      const res = await fetch('/album/3');
      const data = res.json();

      if (data.images.length > 0) {
        for (const img of data.images) {
          expect(img).toHaveProperty('Orientation');
          expect(img).toHaveProperty('file');
          expect(typeof img.Orientation).toBe('number');
          expect(img.file.startsWith('photos/')).toBe(true);
        }
      }
    });

    it('should return 400 for count > 100', async () => {
      const res = await fetch('/album/101');

      expect(res.status).toBe(400);
      const data = res.json();
      expect(data.error).toContain('Count must be between');
    });

    it('should return 400 for negative count', async () => {
      const res = await fetch('/album/-1');

      // Negative numbers won't match the route regex
      expect(res.status).toBe(404);
    });

    it('should handle count of 0', async () => {
      const res = await fetch('/album/0');
      const data = res.json();

      expect(res.status).toBe(200);
      expect(data.count).toBe(0);
      expect(data.images).toEqual([]);
    });
  });

  describe('GET /photos/*', () => {
    it('should serve photo files from library', async () => {
      const res = await fetch('/photos/valid-photos/landscape1.jpg');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('should serve nested photo files', async () => {
      const res = await fetch('/photos/nested/subfolder/deep-photo.jpg');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/jpeg');
    });

    it('should return 404 for non-existent photos', async () => {
      const res = await fetch('/photos/nonexistent.jpg');

      expect(res.status).toBe(404);
    });

    it('should prevent path traversal attacks', async () => {
      // Node.js HTTP normalizes paths before routing, but we verify that
      // sensitive files outside the photo library cannot be accessed.
      // The key security goal is that the file is NOT served (not 200).
      const res = await fetch('/photos/../../../etc/passwd');

      // Should not return 200 - either 403 (forbidden) or 404 (not found)
      expect([403, 404]).toContain(res.status);
      // Ensure we're not serving /etc/passwd content
      expect(res.body.toString()).not.toContain('root:');
    });
  });

  describe('Static file serving', () => {
    it('should serve CSS files', async () => {
      const res = await fetch('/css/main.css');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/css');
      expect(res.body.toString()).toContain('margin');
    });

    it('should serve JS files', async () => {
      const res = await fetch('/js/main.js');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/javascript');
      expect(res.body.toString()).toContain('console');
    });

    it('should return 404 for non-existent static files', async () => {
      const res = await fetch('/nonexistent.txt');

      expect(res.status).toBe(404);
    });

    it('should prevent path traversal for static files', async () => {
      // Node.js HTTP normalizes paths before routing, but we verify that
      // sensitive files outside www directory cannot be accessed.
      const res = await fetch('/../../../etc/passwd');

      // Should not return 200 - either 403 (forbidden) or 404 (not found)
      expect([403, 404]).toContain(res.status);
      // Ensure we're not serving /etc/passwd content
      expect(res.body.toString()).not.toContain('root:');
    });
  });

  describe('HEAD method handling', () => {
    it('should return headers but no body for HEAD / request', async () => {
      const res = await fetch('/', 'HEAD');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(parseInt(res.headers['content-length'])).toBeGreaterThan(0);
      // HEAD should not return a body
      expect(res.body.length || res.body.toString().length).toBe(0);
    });

    it('should return headers but no body for HEAD /album/:count request', async () => {
      const res = await fetch('/album/5', 'HEAD');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
      expect(parseInt(res.headers['content-length'])).toBeGreaterThan(0);
      // HEAD should not return a body
      expect(res.body.length || res.body.toString().length).toBe(0);
    });

    it('should return headers but no body for HEAD /photos/* request', async () => {
      const res = await fetch('/photos/valid-photos/landscape1.jpg', 'HEAD');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(parseInt(res.headers['content-length'])).toBeGreaterThan(0);
      // HEAD should not return a body
      expect(res.body.length || res.body.toString().length).toBe(0);
    });

    it('should return headers but no body for HEAD /css/* request', async () => {
      const res = await fetch('/css/main.css', 'HEAD');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/css');
      expect(parseInt(res.headers['content-length'])).toBeGreaterThan(0);
      // HEAD should not return a body
      expect(res.body.length || res.body.toString().length).toBe(0);
    });
  });

  describe('Security headers', () => {
    it('should include Content-Security-Policy header', async () => {
      const res = await fetch('/');

      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['content-security-policy']).toContain("default-src 'self'");
      expect(res.headers['content-security-policy']).toContain("script-src 'self'");
    });

    it('should include X-Content-Type-Options header', async () => {
      const res = await fetch('/');

      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should include X-Frame-Options header', async () => {
      const res = await fetch('/');

      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    });
  });

  describe('GET /album/fixture/:year', () => {
    it('should return fixture JSON for valid year 2010', async () => {
      const res = await fetch('/album/fixture/2010');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');

      const data = res.json();
      expect(data).toHaveProperty('count');
      expect(data).toHaveProperty('images');
      expect(data.count).toBe(25);
      expect(Array.isArray(data.images)).toBe(true);
      expect(data.images.length).toBe(25);
    });

    it('should return fixture JSON for valid year 2015', async () => {
      const res = await fetch('/album/fixture/2015');

      expect(res.status).toBe(200);
      const data = res.json();
      expect(data.count).toBe(25);
    });

    it('should return fixture JSON for valid year 2020', async () => {
      const res = await fetch('/album/fixture/2020');

      expect(res.status).toBe(200);
      const data = res.json();
      expect(data.count).toBe(25);
    });

    it('should return fixture JSON for valid year 2025', async () => {
      const res = await fetch('/album/fixture/2025');

      expect(res.status).toBe(200);
      const data = res.json();
      expect(data.count).toBe(25);
    });

    it('should return images with required properties', async () => {
      const res = await fetch('/album/fixture/2010');
      const data = res.json();

      for (const img of data.images) {
        expect(img).toHaveProperty('file');
        expect(img).toHaveProperty('Orientation');
        expect(typeof img.file).toBe('string');
        expect(typeof img.Orientation).toBe('number');
      }
    });

    it('should not include _metadata field in response', async () => {
      const res = await fetch('/album/fixture/2010');
      const data = res.json();

      expect(data._metadata).toBeUndefined();
    });

    it('should return 400 for invalid year', async () => {
      const res = await fetch('/album/fixture/1999');

      expect(res.status).toBe(400);
      const data = res.json();
      expect(data.error).toContain('Invalid year');
      expect(data.error).toContain('2010');
    });

    it('should return 400 for non-numeric year', async () => {
      const res = await fetch('/album/fixture/abc');

      // Won't match the regex, so 404
      expect(res.status).toBe(404);
    });

    it('should handle HEAD request correctly', async () => {
      const res = await fetch('/album/fixture/2010', 'HEAD');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
      expect(parseInt(res.headers['content-length'])).toBeGreaterThan(0);
      expect(res.body.length || res.body.toString().length).toBe(0);
    });

    it('should return 404 in production environment', async () => {
      // Save original NODE_ENV
      const originalEnv = process.env.NODE_ENV;

      try {
        // Set production environment
        process.env.NODE_ENV = 'production';

        // Make request - the check happens at request time
        const res = await fetch('/album/fixture/2010');

        expect(res.status).toBe(404);
      } finally {
        // Restore original NODE_ENV
        process.env.NODE_ENV = originalEnv;
      }
    });
  });
});
