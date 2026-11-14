import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { SlideShow } from '../../lib/slideshow.mjs';

describe('SlideShow.extractOrientation', () => {
  let dir;
  let show;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'orient-'));
    show = new SlideShow({ photo_library: dir });
    const base = { create: { width: 4, height: 2, channels: 3, background: '#888' } };
    await sharp(base).jpeg().toFile(join(dir, 'plain.jpg'));
    await sharp(base).withMetadata({ orientation: 6 }).jpeg().toFile(join(dir, 'rot6.jpg'));
    await writeFile(join(dir, 'junk.jpg'), 'not a jpeg');
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it('returns 1 for a file without EXIF', async () => {
    expect(await show.extractOrientation(join(dir, 'plain.jpg'))).toBe(1);
  });
  it('returns the EXIF orientation when present', async () => {
    expect(await show.extractOrientation(join(dir, 'rot6.jpg'))).toBe(6);
  });
  it('falls back to 1 for unreadable or missing files', async () => {
    expect(await show.extractOrientation(join(dir, 'junk.jpg'))).toBe(1);
    expect(await show.extractOrientation(join(dir, 'missing.jpg'))).toBe(1);
  });
});
