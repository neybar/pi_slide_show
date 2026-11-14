/**
 * Replaces the 1x1 placeholder photos in test/fixtures/perf-photos/ (album1-5
 * and nested/deep/album6) with generated abstract images. Run with
 * `npm run fixtures:perf-photos`; output is committed.
 *
 * Every existing file name is kept, so counts and names do not change. The
 * album1/panorama.jpg is regenerated panorama-shaped (3:1). The rest alternate
 * landscape and portrait. scenarios/ is not touched (see create-scenario-photos.mjs).
 *
 * Deterministic: seeds derive from album path + file name, so regenerating on
 * the same machine yields no git diff.
 */
import { readdir, writeFile } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateAbstractJpeg, LANDSCAPE_4_3, PORTRAIT, PANORAMA,
} from './lib/abstract-image.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PERF_PHOTOS_DIR = join(__dirname, 'perf-photos');
const LONG_EDGE = 320;
const QUALITY = 55;

/** Album directories (relative to perf-photos) that hold placeholder photos. */
export const ALBUM_DIRS = [
  'album1', 'album2', 'album3', 'album4', 'album5', join('nested', 'deep', 'album6'),
];

const dims = (ratio) => {
  const k = LONG_EDGE / Math.max(ratio.w, ratio.h);
  return { width: Math.round(ratio.w * k), height: Math.round(ratio.h * k) };
};

export async function generatePerfPhotos() {
  for (const rel of ALBUM_DIRS) {
    const dir = join(PERF_PHOTOS_DIR, rel);
    const names = (await readdir(dir)).filter((f) => f.endsWith('.jpg')).sort();
    const label = rel.split(/[\\/]/).pop().toUpperCase();
    for (let i = 0; i < names.length; i++) {
      const file = names[i];
      const ratio = file === 'panorama.jpg' ? PANORAMA : (i % 2 === 0 ? LANDSCAPE_4_3 : PORTRAIT);
      const seed = `${relative(PERF_PHOTOS_DIR, dir)}-${file}`;
      const buf = await generateAbstractJpeg({
        ...dims(ratio),
        seed,
        label: `${label} ${String(i + 1).padStart(2, '0')}`,
        quality: QUALITY,
      });
      await writeFile(join(dir, file), buf);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await generatePerfPhotos();
  console.log(`Perf photos written to ${PERF_PHOTOS_DIR}`);
}
