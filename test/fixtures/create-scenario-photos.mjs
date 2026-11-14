/**
 * Generates the committed on-disk album scenarios under
 * test/fixtures/perf-photos/scenarios/<name>/ using the shared abstract-image
 * generator. Run with `npm run fixtures:scenarios`; output is committed.
 *
 * Each scenario directory holds a .noslideshow marker so random discovery
 * (/album/35) never serves it; the test-only GET /album/scenario/:name route
 * ignores the marker. scenarios/ itself also gets a marker.
 *
 * Deterministic: seeds derive from scenario name + index, so regenerating on
 * the same machine yields no git diff.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateAbstractJpeg, LANDSCAPE_4_3, LANDSCAPE_3_2, PORTRAIT, PANORAMA,
} from './lib/abstract-image.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SCENARIOS_DIR = join(__dirname, 'perf-photos', 'scenarios');

const L4 = LANDSCAPE_4_3;
const L3 = LANDSCAPE_3_2;
const P = PORTRAIT;
const PANO = PANORAMA;

// Shapes: { ratio, exif? }. EXIF 6/8 photos are stored rotated and display as
// the given ratio.
const MIXED = [L4, L3, P, L4, P, L3, L4, P, L3, L4, P, L3];
const mixedShapes = (n, panoramaAt = []) =>
  Array.from({ length: n }, (_, i) => ({ ratio: panoramaAt.includes(i) ? PANO : MIXED[i % MIXED.length] }));

/** name -> { label, long (px, long edge), quality, shapes, thumbs? } */
export const SCENARIOS = {
  'full-panorama': { label: 'FP', long: 640, quality: 55, shapes: mixedShapes(36, [7, 23]) },
  'full-no-panorama': { label: 'FN', long: 640, quality: 55, shapes: mixedShapes(36) },
  'partial-12': { label: 'P12', long: 640, quality: 55, shapes: mixedShapes(12, [5]) },
  'boundary-10': { label: 'B10', long: 640, quality: 55, shapes: mixedShapes(10) },
  'tiny-4-mixed': {
    label: 'T4',
    long: 960,
    quality: 55,
    thumbs: true,
    shapes: [
      { ratio: L4 },
      { ratio: PANO },
      { ratio: P, exif: 6 },
      { ratio: P, exif: 8 },
    ],
  },
  'tiny-6-portrait': {
    label: 'T6',
    long: 800,
    quality: 55,
    shapes: [{ ratio: P }, { ratio: P }, { ratio: L4 }, { ratio: P }, { ratio: P }, { ratio: P }],
  },
  'single-landscape': { label: 'SL', long: 1600, quality: 60, shapes: [{ ratio: L3 }] },
  'single-portrait': { label: 'SP', long: 1600, quality: 60, shapes: [{ ratio: P }] },
  'single-panorama': { label: 'SW', long: 1600, quality: 60, shapes: [{ ratio: PANO }] },
  'single-exif6': { label: 'SE6', long: 1600, quality: 60, shapes: [{ ratio: P, exif: 6 }] },
};

export const fileName = (i) => `p${String(i + 1).padStart(2, '0')}.jpg`;

function dims(ratio, long) {
  const k = long / Math.max(ratio.w, ratio.h);
  return { width: Math.round(ratio.w * k), height: Math.round(ratio.h * k) };
}

async function writeScenario(name, spec) {
  const dir = join(SCENARIOS_DIR, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, '.noslideshow'), '');
  for (let i = 0; i < spec.shapes.length; i++) {
    const { ratio, exif = 1 } = spec.shapes[i];
    const seed = `${name}-${i}`;
    const label = `${spec.label} ${String(i + 1).padStart(2, '0')}`;
    const { width, height } = dims(ratio, spec.long);
    await writeFile(join(dir, fileName(i)),
      await generateAbstractJpeg({ width, height, seed, label, exifOrientation: exif, quality: spec.quality }));

    if (spec.thumbs) {
      // Synology layout: @eaDir/<file>/SYNOPHOTO_THUMB_<size>.jpg. Real thumbnails
      // are pre-rotated, so no EXIF here. Same seed so they look like the original.
      const eaDir = join(dir, '@eaDir', fileName(i));
      await mkdir(eaDir, { recursive: true });
      for (const [size, tLong] of [['M', 320], ['XL', 1280]]) {
        const t = dims(ratio, tLong);
        await writeFile(join(eaDir, `SYNOPHOTO_THUMB_${size}.jpg`),
          await generateAbstractJpeg({ ...t, seed, label: `${label} ${size}`, quality: 50 }));
      }
    }
  }
}

export async function generateScenarios() {
  await rm(SCENARIOS_DIR, { recursive: true, force: true });
  await mkdir(SCENARIOS_DIR, { recursive: true });
  await writeFile(join(SCENARIOS_DIR, '.noslideshow'), '');
  for (const [name, spec] of Object.entries(SCENARIOS)) {
    await writeScenario(name, spec);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await generateScenarios();
  console.log(`Scenarios written to ${SCENARIOS_DIR}`);
}
