import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, get as httpGet } from 'node:http';
import { writeFile, mkdir, rm, symlink, mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { createRouter } from '../../lib/routes.mjs';
import { SlideShow } from '../../lib/slideshow.mjs';

// GET /album/scenario/:name, run against a temporary library so the shared
// mock-photos fixtures (and random-album tests) are untouched.
describe('GET /album/scenario/:name', () => {
  let root;
  let server;
  let baseUrl;

  function get(path) {
    return new Promise((resolve, reject) => {
      httpGet(new URL(path, baseUrl), (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString();
          resolve({ status: res.statusCode, json: () => JSON.parse(body) });
        });
      }).on('error', reject);
    });
  }

  async function writePhoto(file, orientation) {
    await sharp({ create: { width: 8, height: 6, channels: 3, background: '#808080' } })
      .jpeg()
      .withMetadata({ orientation })
      .toFile(file);
  }

  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'scenario-route-')));
    const library = join(root, 'library');
    const outside = join(root, 'outside');
    const dir = join(library, 'scenarios', 'small');
    await mkdir(dir, { recursive: true });
    await mkdir(outside, { recursive: true });
    await writePhoto(join(dir, 'a.jpg'), 6);
    await writePhoto(join(dir, 'b.jpg'), 1);
    await writePhoto(join(dir, 'c.jpg'), 3);
    await writePhoto(join(outside, 'x.jpg'), 1);
    await writeFile(join(dir, '.noslideshow'), '');
    await mkdir(join(library, 'scenarios', 'empty'));
    await symlink(outside, join(library, 'scenarios', 'escape'));

    const slideshow = new SlideShow({ photo_library: library, web_photo_dir: 'photos', default_count: 2 });
    server = createServer(createRouter(slideshow, join(root, 'www')));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  });

  it('returns sampled scenario photos with EXIF Orientation, ignoring .noslideshow', async () => {
    const res = await get('/album/scenario/small');
    expect(res.status).toBe(200);
    const data = res.json();
    // server default count (2 here) samples the 3-photo directory
    expect(data.count).toBe(2);
    const expected = { 'a.jpg': 6, 'b.jpg': 1, 'c.jpg': 3 };
    for (const img of data.images) {
      expect(img.file).toMatch(/^photos\/scenarios\/small\/[abc]\.jpg$/);
      expect(img.Orientation).toBe(expected[img.file.split('/').pop()]);
    }
  });

  it('returns an empty album for an empty scenario', async () => {
    const res = await get('/album/scenario/empty');
    expect(res.status).toBe(200);
    expect(res.json()).toEqual({ count: 0, images: [] });
  });

  it('rejects invalid names with 400', async () => {
    for (const name of ['..%2Fx', 'A%20B', 'UPPER', 'a_b', '']) {
      const res = await get(`/album/scenario/${name}`);
      expect(res.status, name).toBe(400);
    }
  });

  it('returns 404 for an unknown scenario', async () => {
    expect((await get('/album/scenario/nope')).status).toBe(404);
  });

  it('rejects a symlinked scenario that points outside scenarios/', async () => {
    expect((await get('/album/scenario/escape')).status).toBe(404);
  });

  it('returns 404 in production', async () => {
    const original = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      expect((await get('/album/scenario/small')).status).toBe(404);
    } finally {
      if (original === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = original;
    }
  });
});
