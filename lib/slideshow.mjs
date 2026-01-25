import { access, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileTypeFromFile } from 'file-type';
import exifr from 'exifr';

const DEFAULT_LIBRARY_PATHS = ['/mnt/photo', '/media/photo', '/Volumes/photo'];
const EXCLUDED_PATTERNS = ['iPhoto Library', '@eaDir', 'eaDir', '#recycle'];
const SKIP_MARKER_FILE = '.noslideshow';
const HIDDEN_PREFIX = '.';
const MAX_DIRECTORY_DEPTH = 20;
const MAX_DIRECTORY_SEARCH_ATTEMPTS = 10;

export class SlideShow {
  #photoLibrary;
  #webPhotoDir;
  #defaultCount;

  constructor(config = {}) {
    this.#photoLibrary = config.photo_library || null;
    this.#webPhotoDir = config.web_photo_dir || 'photos';
    this.#defaultCount = config.default_count || 25;
  }

  get photoLibrary() {
    return this.#photoLibrary;
  }

  get webPhotoDir() {
    return this.#webPhotoDir;
  }

  get defaultCount() {
    return this.#defaultCount;
  }

  async findLibrary() {
    if (this.#photoLibrary) {
      return this.#photoLibrary;
    }

    for (const path of DEFAULT_LIBRARY_PATHS) {
      try {
        const stats = await stat(path);
        if (stats.isDirectory()) {
          this.#photoLibrary = path;
          return path;
        }
      } catch {
        // Directory doesn't exist, try next
      }
    }

    throw new Error('Missing photo_library: No photo library found in standard locations');
  }

  async hasSkipMarker(dir) {
    try {
      await access(join(dir, SKIP_MARKER_FILE));
      return true;
    } catch {
      return false;
    }
  }

  async collectDirectories(rootDir = null) {
    const baseDir = rootDir || await this.findLibrary();
    const directories = [];

    const walk = async (dir, depth = 0) => {
      if (depth > MAX_DIRECTORY_DEPTH) {
        return;
      }

      try {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (!entry.isDirectory()) {
            continue;
          }

          const fullPath = join(dir, entry.name);

          // Skip hidden directories
          if (entry.name.startsWith(HIDDEN_PREFIX)) {
            continue;
          }

          // Skip excluded patterns
          if (EXCLUDED_PATTERNS.some(pattern => fullPath.includes(pattern))) {
            continue;
          }

          // Skip directories with marker file
          if (await this.hasSkipMarker(fullPath)) {
            continue;
          }

          directories.push(fullPath);
          await walk(fullPath, depth + 1);
        }
      } catch {
        // Skip directories we can't read
      }
    };

    // Check if root directory has skip marker
    if (await this.hasSkipMarker(baseDir)) {
      return directories;
    }

    directories.push(baseDir);
    await walk(baseDir, 0);

    return directories;
  }

  async findImagesInDir(dir) {
    const images = [];

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isFile()) {
          continue;
        }

        // Skip hidden files
        if (entry.name.startsWith(HIDDEN_PREFIX)) {
          continue;
        }

        const fullPath = join(dir, entry.name);

        // Skip files in excluded directories
        if (EXCLUDED_PATTERNS.some(pattern => fullPath.includes(pattern))) {
          continue;
        }

        try {
          const type = await fileTypeFromFile(fullPath);
          if (type && type.mime.startsWith('image/')) {
            images.push(fullPath);
          }
        } catch {
          // Skip files we can't read type from
        }
      }
    } catch {
      // Skip directories we can't read
    }

    return images;
  }

  selectRandomPhotos(photos, count) {
    if (photos.length === 0) {
      return [];
    }

    if (photos.length <= count) {
      return [...photos];
    }

    // Fisher-Yates shuffle and take first `count` elements
    const shuffled = [...photos];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, count);
  }

  async extractOrientation(filePath) {
    try {
      const orient = await exifr.orientation(filePath);
      // EXIF orientation values: 1, 2, 3, 4, 5, 6, 7, 8
      // Most common: 1 (normal), 3 (180°), 6 (90° CW), 8 (90° CCW)
      return orient || 1;
    } catch {
      // Default to normal orientation if extraction fails
      return 1;
    }
  }

  async getRandomAlbum(count = null) {
    const photoCount = count ?? this.#defaultCount;
    const library = await this.findLibrary();
    const directories = await this.collectDirectories();

    let images = [];
    let maxTries = 0;

    // Try to find a directory with images
    while (images.length === 0 && maxTries < MAX_DIRECTORY_SEARCH_ATTEMPTS) {
      maxTries++;
      const randomIndex = Math.floor(Math.random() * directories.length);
      const randomDir = directories[randomIndex];
      images = await this.findImagesInDir(randomDir);
    }

    if (images.length === 0) {
      return { count: 0, images: [] };
    }

    const selectedPhotos = this.selectRandomPhotos(images, photoCount);

    const imageData = await Promise.all(
      selectedPhotos.map(async (filePath) => {
        const orientValue = await this.extractOrientation(filePath);
        const relativePath = relative(library, filePath);
        const webPath = join(this.#webPhotoDir, relativePath);

        return {
          Orientation: orientValue,
          file: webPath
        };
      })
    );

    return {
      count: imageData.length,
      images: imageData
    };
  }
}
