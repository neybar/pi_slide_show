import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  generateAbstractJpeg, LANDSCAPE_4_3, LANDSCAPE_3_2, PORTRAIT, PANORAMA, SQUARE,
} from '../fixtures/lib/abstract-image.mjs';
import { PANORAMA_ASPECT_THRESHOLD } from '../../www/js/config.mjs';

const base = { width: 600, height: 400, seed: 1, label: 'B07 3:2' };
const region = async (buf, top) => sharp(
  await sharp(buf).extract({ left: 0, top, width: 600, height: 80 }).toBuffer()).stats();
const sum =(s) => s.channels[0].mean + s.channels[1].mean + s.channels[2].mean;

describe('generateAbstractJpeg', () => {
  it('is deterministic for the same seed and differs across seeds', async () => {
    const a = await generateAbstractJpeg(base);
    const b = await generateAbstractJpeg(base);
    const c = await generateAbstractJpeg({ ...base, seed: 2 });
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it('accepts string seeds', async () => {
    const a = await generateAbstractJpeg({ ...base, seed: 'album-3' });
    const b = await generateAbstractJpeg({ ...base, seed: 'album-3' });
    expect(a.equals(b)).toBe(true);
  });

  it('decodes at the requested size and is not a solid colour', async () => {
    const buf = await generateAbstractJpeg(base);
    const meta = await sharp(buf).metadata();
    expect([meta.width, meta.height]).toEqual([600, 400]);
    const { channels } = await sharp(buf).stats();
    for (const ch of channels.slice(0, 3)) expect(ch.stdev).toBeGreaterThan(10);
  });

  it('puts a lighter sky above a darker ground', async () => {
    const buf = await generateAbstractJpeg({ ...base, label: '' });
    const top = await region(buf, 0);
    const bottom = await region(buf, 320);
    expect(sum(top)).toBeGreaterThan(sum(bottom));
  });

  it('gives neighbouring seeds clearly different palettes', async () => {
    const mean = async (seed) => (await sharp(await generateAbstractJpeg({ ...base, seed, label: '' })).stats())
      .channels.slice(0, 3).map((c) => c.mean);
    const [a, b] = [await mean(5), await mean(6)];
    expect(Math.hypot(...a.map((v, i) => v - b[i]))).toBeGreaterThan(15);
  });

  it.each([6, 8])('stores EXIF orientation %i so rotate() yields the displayed shape', async (o) => {
    const buf = await generateAbstractJpeg({ ...base, exifOrientation: o });
    const meta = await sharp(buf).metadata();
    expect(meta.orientation).toBe(o);
    expect([meta.width, meta.height]).toEqual([400, 600]);   // stored swapped
    const { info } = await sharp(buf).rotate().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([600, 400]);
  });

  it('keeps the sky on top after applying EXIF rotation', async () => {
    for (const o of [6, 8]) {
      const buf = await sharp(await generateAbstractJpeg({ ...base, label: '', exifOrientation: o }))
        .rotate().toBuffer();
      const top = await region(buf, 0);
      const bottom = await region(buf, 320);
      expect(sum(top)).toBeGreaterThan(sum(bottom));
    }
  });

  it('rejects unsupported orientations', async () => {
    await expect(generateAbstractJpeg({ ...base, exifOrientation: 3 })).rejects.toThrow(RangeError);
  });

  it('stays small at 1200 px long edge', async () => {
    const buf = await generateAbstractJpeg({ width: 1200, height: 800, seed: 9, label: 'A0-12' });
    expect(buf.length).toBeLessThan(50 * 1024);
  });
});

describe('size presets', () => {
  it('has the expected ratios', () => {
    expect(LANDSCAPE_4_3.w / LANDSCAPE_4_3.h).toBeCloseTo(4 / 3);
    expect(LANDSCAPE_3_2.w / LANDSCAPE_3_2.h).toBeCloseTo(1.5);
    expect(PORTRAIT.w).toBeLessThan(PORTRAIT.h);
    expect(SQUARE.w).toBe(SQUARE.h);
    expect(PANORAMA.w / PANORAMA.h).toBeGreaterThan(PANORAMA_ASPECT_THRESHOLD);
  });
});
