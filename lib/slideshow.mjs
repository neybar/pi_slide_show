import { access, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { randomInt } from 'node:crypto';
import { fileTypeFromFile } from 'file-type';
import exifr from 'exifr';

const DEFAULT_LIBRARY_PATHS = ['/mnt/photo', '/media/photo', '/Volumes/photo'];
const EXCLUDED_PATTERNS = ['iPhoto Library', '@eaDir', 'eaDir', '#recycle'];
const SKIP_MARKER_FILE = '.noslideshow';
const HIDDEN_PREFIX = '.';
const MAX_DIRECTORY_DEPTH = 20;
const MAX_DIRECTORY_SEARCH_ATTEMPTS = 10;
const DIRECTORY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// EXIF orientation cache settings (reduces repeated file reads)
const EXIF_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const EXIF_CACHE_MAX_SIZE = 5000; // Max entries before LRU eviction

// Concurrency limit for EXIF reads (prevents I/O spike on slow storage)
const EXIF_CONCURRENCY_LIMIT = 4;

export class SlideShow {
  #photoLibrary;
  #webPhotoDir;
  #defaultCount;
  #directoryCache;
  #directoryCacheTimestamp;
  #exifCache;

  constructor(config = {}) {
    this.#photoLibrary = config.photo_library || null;
    this.#webPhotoDir = config.web_photo_dir || 'photos';
    this.#defaultCount = config.default_count || 25;
    this.#directoryCache = null;
    this.#directoryCacheTimestamp = 0;
    this.#exifCache = new Map(); // filePath → { orientation, timestamp }
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

  /**
   * Invalidate the directory cache, forcing a rescan on next request.
   * Call this if you know the photo library has changed.
   */
  invalidateCache() {
    this.#directoryCache = null;
    this.#directoryCacheTimestamp = 0;
  }

  /**
   * Invalidate the EXIF orientation cache, forcing re-reads on next request.
   * Call this if photos have been modified in place or rotated externally.
   */
  invalidateExifCache() {
    this.#exifCache.clear();
  }

  /**
   * Check if the directory cache is valid (not expired).
   */
  #isCacheValid() {
    if (!this.#directoryCache) {
      return false;
    }
    return Date.now() - this.#directoryCacheTimestamp < DIRECTORY_CACHE_TTL_MS;
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
      } catch (err) {
        // Directory doesn't exist or not accessible, try next
        if (err.code !== 'ENOENT' && err.code !== 'EACCES') {
          console.warn(`Warning: Error checking library path ${path}:`, err.message);
        }
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

  async collectDirectories(rootDir = null, bypassCache = false) {
    // Return cached directories if valid (only when using default root)
    if (!rootDir && !bypassCache && this.#isCacheValid()) {
      return this.#directoryCache;
    }

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
      } catch (err) {
        // Skip directories we can't read, but log unexpected errors
        if (err.code !== 'ENOENT' && err.code !== 'EACCES' && err.code !== 'EPERM') {
          console.warn(`Warning: Error reading directory ${dir}:`, err.message);
        }
      }
    };

    // Check if root directory has skip marker
    if (await this.hasSkipMarker(baseDir)) {
      return directories;
    }

    directories.push(baseDir);
    await walk(baseDir, 0);

    // Cache the result (only when using default root)
    if (!rootDir) {
      this.#directoryCache = directories;
      this.#directoryCacheTimestamp = Date.now();
    }

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
        } catch (err) {
          // Skip files we can't read type from, but log unexpected errors
          if (err.code !== 'ENOENT' && err.code !== 'EACCES' && err.code !== 'EPERM') {
            console.warn(`Warning: Error detecting file type for ${fullPath}:`, err.message);
          }
        }
      }
    } catch (err) {
      // Skip directories we can't read, but log unexpected errors
      if (err.code !== 'ENOENT' && err.code !== 'EACCES' && err.code !== 'EPERM') {
        console.warn(`Warning: Error reading directory ${dir}:`, err.message);
      }
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
    // Using crypto.randomInt for better randomness than Math.random()
    const shuffled = [...photos];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = randomInt(0, i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, count);
  }

  /**
   * Evict oldest EXIF cache entries when over max size (LRU-style).
   */
  #evictOldestExifEntries() {
    if (this.#exifCache.size <= EXIF_CACHE_MAX_SIZE) {
      return;
    }

    // Remove oldest entries (by timestamp)
    const entriesToRemove = this.#exifCache.size - EXIF_CACHE_MAX_SIZE + 100; // Remove 100 extra for headroom
    const sorted = [...this.#exifCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, entriesToRemove);

    for (const [path] of sorted) {
      this.#exifCache.delete(path);
    }
  }

  async extractOrientation(filePath) {
    const now = Date.now();

    // Check cache first
    const cached = this.#exifCache.get(filePath);
    if (cached && (now - cached.timestamp) < EXIF_CACHE_TTL_MS) {
      return cached.orientation;
    }

    // Cache miss or expired - read from file
    let orientation = 1;
    try {
      const orient = await exifr.orientation(filePath);
      // EXIF orientation values: 1, 2, 3, 4, 5, 6, 7, 8
      // Most common: 1 (normal), 3 (180°), 6 (90° CW), 8 (90° CCW)
      orientation = orient || 1;
    } catch (err) {
      // Default to normal orientation if extraction fails
      // Don't log - many images legitimately don't have EXIF data
      orientation = 1;
    }

    // Cache the result
    this.#evictOldestExifEntries();
    this.#exifCache.set(filePath, { orientation, timestamp: now });

    return orientation;
  }

  /**
   * Process items with limited concurrency to prevent I/O spikes.
   * @param {number} concurrency - Maximum concurrent operations
   * @param {Array} items - Items to process
   * @param {Function} fn - Async function to apply to each item
   * @returns {Promise<Array>} - Results in same order as input
   */
  async #asyncPool(concurrency, items, fn) {
    const results = [];
    const executing = new Set();

    for (const [index, item] of items.entries()) {
      const promise = Promise.resolve().then(() => fn(item, index));
      results[index] = promise;
      executing.add(promise);

      const cleanup = () => executing.delete(promise);
      promise.then(cleanup, cleanup);

      if (executing.size >= concurrency) {
        await Promise.race(executing);
      }
    }

    return Promise.all(results);
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
      const randomIndex = randomInt(0, directories.length);
      const randomDir = directories[randomIndex];
      images = await this.findImagesInDir(randomDir);
    }

    if (images.length === 0) {
      return { count: 0, images: [] };
    }

    const selectedPhotos = this.selectRandomPhotos(images, photoCount);

    // Use concurrency-limited pool instead of Promise.all to prevent I/O spikes
    const imageData = await this.#asyncPool(
      EXIF_CONCURRENCY_LIMIT,
      selectedPhotos,
      async (filePath) => {
        const orientValue = await this.extractOrientation(filePath);
        const relativePath = relative(library, filePath);
        const webPath = join(this.#webPhotoDir, relativePath);

        return {
          Orientation: orientValue,
          file: webPath
        };
      }
    );

    return {
      count: imageData.length,
      images: imageData
    };
  }
}
