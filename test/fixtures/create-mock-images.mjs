import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mockPhotosDir = join(__dirname, 'mock-photos');

// Create a solid color JPEG with specified dimensions
async function createColorJpeg(width, height, color = { r: 128, g: 128, b: 128 }) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color
    }
  }).jpeg({ quality: 80 }).toBuffer();
}

async function createMockImages() {
  // Standard images with specific dimensions
  // Need enough photos for a full collage (2 rows x 5 columns = ~10 photos minimum)
  const images = [
    // Landscape photos (various colors)
    { path: 'valid-photos/landscape1.jpg', width: 800, height: 600, color: { r: 100, g: 150, b: 200 } },
    { path: 'valid-photos/landscape2.jpg', width: 800, height: 600, color: { r: 150, g: 200, b: 100 } },
    { path: 'valid-photos/landscape3.jpg', width: 800, height: 600, color: { r: 200, g: 100, b: 150 } },
    { path: 'valid-photos/landscape4.jpg', width: 800, height: 600, color: { r: 100, g: 200, b: 200 } },
    { path: 'valid-photos/landscape5.jpg', width: 800, height: 600, color: { r: 200, g: 200, b: 100 } },
    { path: 'valid-photos/landscape6.jpg', width: 800, height: 600, color: { r: 180, g: 140, b: 100 } },

    // Portrait photos (various colors)
    { path: 'valid-photos/portrait1.jpg', width: 600, height: 800, color: { r: 200, g: 150, b: 100 } },
    { path: 'valid-photos/portrait2.jpg', width: 600, height: 800, color: { r: 100, g: 150, b: 200 } },
    { path: 'valid-photos/portrait3.jpg', width: 600, height: 800, color: { r: 150, g: 100, b: 200 } },
    { path: 'valid-photos/portrait4.jpg', width: 600, height: 800, color: { r: 200, g: 100, b: 100 } },
    { path: 'valid-photos/portrait5.jpg', width: 600, height: 800, color: { r: 100, g: 200, b: 100 } },

    // Panorama photo (3:1 aspect ratio, > 2:1 threshold)
    { path: 'valid-photos/panorama.jpg', width: 900, height: 300, color: { r: 180, g: 120, b: 160 } },

    // Nested folder photo
    { path: 'nested/subfolder/deep-photo.jpg', width: 800, height: 600, color: { r: 120, g: 180, b: 140 } },

    // Photos that should be skipped (hidden, @eaDir)
    { path: '.hidden/should-skip.jpg', width: 100, height: 100, color: { r: 50, g: 50, b: 50 } },
    { path: '@eaDir/SYNOPHOTO_THUMB_XL.jpg', width: 100, height: 100, color: { r: 60, g: 60, b: 60 } }
  ];

  for (const image of images) {
    const fullPath = join(mockPhotosDir, image.path);
    await mkdir(dirname(fullPath), { recursive: true });
    const buffer = await createColorJpeg(image.width, image.height, image.color);
    await writeFile(fullPath, buffer);
    console.log(`Created: ${image.path} (${image.width}x${image.height})`);
  }
}

createMockImages().catch(console.error);
