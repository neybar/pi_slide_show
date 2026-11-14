import { open, realpath, readFile } from 'node:fs/promises';
import { join, extname, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream';
import { fileTypeFromBuffer } from 'file-type';

const MAX_ALBUM_COUNT = 100;

// Cache-busting version: timestamp when server started
const CACHE_VERSION = Date.now().toString(36);

// Cache for processed index.html (valid for server lifetime since CACHE_VERSION is constant)
let cachedIndexHtml = null;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json'
};

function getMimeType(filePath) {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function sendJSON(res, data, statusCode = 200, method = 'GET') {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  // HEAD requests: send headers only, no body
  res.end(method === 'HEAD' ? undefined : body);
}

function sendError(res, statusCode, message) {
  // A failure after writeHead() (e.g. the client aborted mid-response) can't change the status;
  // a second writeHead would throw ERR_HTTP_HEADERS_SENT and crash the server. Abort instead.
  if (res.headersSent) {
    if (!res.destroyed) res.destroy();
    return;
  }
  sendJSON(res, { error: message }, statusCode);
}

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  // CSP: Allow same-origin resources; 'unsafe-inline' needed for jQuery .css() dynamic styling
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'");
}

async function serveIndexWithCacheBust(res, indexPath, method = 'GET', logger = null) {
  try {
    // Use cached version if available (valid for server lifetime)
    if (!cachedIndexHtml) {
      let html = await readFile(indexPath, 'utf8');

      // Inject cache-busting query parameter into CSS and JS references
      // Matches href="..." for CSS and src="..." for JS/MJS
      html = html.replace(
        /(href|src)="([^"]+\.(css|m?js))"/g,
        (match, attr, url, ext) => {
          // Don't double-add version if already present
          if (url.includes('?')) {
            return match;
          }
          return `${attr}="${url}?v=${CACHE_VERSION}"`;
        }
      );

      cachedIndexHtml = Buffer.from(html, 'utf8');
    }

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': cachedIndexHtml.length,
      'Cache-Control': 'no-cache'
    });

    // HEAD requests: send headers only, no body
    res.end(method === 'HEAD' ? undefined : cachedIndexHtml);
    return true;
  } catch (err) {
    if (logger) {
      logger.warn(`Failed to serve index: ${err.message}`);
    }
    return false;
  }
}

// Stream an open FileHandle to the response. pipeline() destroys the read stream when the client
// aborts or either side errors; the stream (autoClose) then closes the handle. Plain pipe() would
// leave the handle open until GC, which throws on newer Node versions.
// Callers have already called writeHead(), so on error we can only abort the response.
function streamHandle(fileHandle, res) {
  // The client may have aborted while we awaited stat/MIME detection; pipeline() would then
  // throw ERR_STREAM_UNABLE_TO_PIPE synchronously.
  if (res.destroyed) {
    fileHandle.close().catch(() => {});
    return;
  }
  const stream = fileHandle.createReadStream();
  pipeline(stream, res, (err) => {
    if (err && !res.destroyed) {
      res.destroy();
    }
  });
}

async function serveStaticFile(res, filePath, method = 'GET') {
  let fileHandle = null;
  try {
    // Open file first to avoid TOCTOU race condition
    fileHandle = await open(filePath, 'r');
    const stats = await fileHandle.stat();

    if (!stats.isFile()) {
      await fileHandle.close();
      return false;
    }

    const mimeType = getMimeType(filePath);
    res.writeHead(200, {
      'Content-Type': mimeType,
      'Content-Length': stats.size,
      'Cache-Control': 'public, max-age=3600'
    });

    // HEAD requests: send headers only, no body
    if (method === 'HEAD') {
      await fileHandle.close();
      res.end();
      return true;
    }

    // Create stream from file handle to ensure we read the same file we stat'd
    streamHandle(fileHandle, res);

    return true;
  } catch {
    if (fileHandle) {
      await fileHandle.close().catch(() => {});
    }
    return false;
  }
}

/**
 * True if target is root itself or lies inside it. Compares on a path
 * separator boundary so /lib/photo-old is not inside /lib/photo.
 */
export function isPathWithin(root, target) {
  const base = root.endsWith(sep) ? root : root + sep;
  return target === root || target.startsWith(base);
}

async function servePhotoFile(res, filePath, photoLibrary, method = 'GET') {
  let fileHandle = null;
  try {
    const resolvedPath = resolve(photoLibrary, filePath);

    // Prevent path traversal attacks - check before symlink resolution
    if (!isPathWithin(resolve(photoLibrary), resolvedPath)) {
      sendError(res, 403, 'Forbidden');
      return;
    }

    // Resolve symlinks and verify path is still within library
    const realPath = await realpath(resolvedPath);
    const realLibrary = await realpath(photoLibrary);
    if (!isPathWithin(realLibrary, realPath)) {
      sendError(res, 403, 'Forbidden');
      return;
    }

    // Open file first to avoid TOCTOU race condition
    fileHandle = await open(realPath, 'r');
    const stats = await fileHandle.stat();

    if (!stats.isFile()) {
      await fileHandle.close();
      sendError(res, 404, 'File not found');
      return;
    }

    // Detect MIME type from file content for photos
    let mimeType = getMimeType(resolvedPath);
    try {
      // Sniff from the already-open handle so the type matches the bytes served
      const head = Buffer.alloc(Math.min(4100, stats.size));
      const { bytesRead } = await fileHandle.read(head, 0, head.length, 0);
      const type = await fileTypeFromBuffer(head.subarray(0, bytesRead));
      if (type && type.mime) {
        mimeType = type.mime;
      }
    } catch {
      // Fall back to extension-based MIME type
    }

    res.writeHead(200, {
      'Content-Type': mimeType,
      'Content-Length': stats.size,
      'Cache-Control': 'public, max-age=86400'
    });

    // HEAD requests: send headers only, no body
    if (method === 'HEAD') {
      await fileHandle.close();
      res.end();
      return;
    }

    // Create stream from file handle to ensure we read the same file we stat'd
    streamHandle(fileHandle, res);
  } catch (err) {
    if (fileHandle) {
      await fileHandle.close().catch(() => {});
    }
    if (err.code === 'ENOENT') {
      sendError(res, 404, 'File not found');
    } else {
      sendError(res, 500, 'Internal server error');
    }
  }
}

export function createRouter(slideshow, wwwPath, options = {}) {
  const photoLibrary = slideshow.photoLibrary;
  const webPhotoDir = slideshow.webPhotoDir;
  const log = options.logger || console;

  return async function router(req, res) {
    // Set security headers on all responses
    setSecurityHeaders(res);

    // Only allow GET and HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendError(res, 405, 'Method Not Allowed');
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);

    // GET / - Serve index.html with cache-busting for assets
    if (pathname === '/') {
      const indexPath = join(wwwPath, 'index.html');
      const served = await serveIndexWithCacheBust(res, indexPath, req.method, log);
      if (!served) {
        sendError(res, 404, 'Index not found');
      }
      return;
    }

    // GET /album/:count - Return JSON with random photos
    const albumMatch = pathname.match(/^\/album\/(\d+)$/);
    if (albumMatch) {
      const count = parseInt(albumMatch[1], 10);

      if (count < 0 || count > MAX_ALBUM_COUNT) {
        sendError(res, 400, `Count must be between 0 and ${MAX_ALBUM_COUNT}`);
        return;
      }

      try {
        const album = await slideshow.getRandomAlbum(count);
        sendJSON(res, album, 200, req.method);
      } catch (err) {
        log.error('Album generation error:', err);
        sendError(res, 500, 'Failed to generate album');
      }
      return;
    }

    // GET /album/fixture/:year - Return fixture JSON for performance testing
    // Valid years: 2010, 2015, 2020, 2025
    // Only available in development/test environments
    const fixtureMatch = pathname.match(/^\/album\/fixture\/(\d{4})$/);
    if (fixtureMatch) {
      // Disable fixture endpoint in production for security
      if (process.env.NODE_ENV === 'production') {
        sendError(res, 404, 'Not found');
        return;
      }

      const year = fixtureMatch[1];
      const validYears = ['2010', '2015', '2020', '2025'];

      if (!validYears.includes(year)) {
        sendError(res, 400, `Invalid year. Valid years: ${validYears.join(', ')}`);
        return;
      }

      try {
        const fixturePath = join(process.cwd(), 'test', 'fixtures', 'albums', `album-${year}.json`);
        const fixtureData = await readFile(fixturePath, 'utf8');
        const fixture = JSON.parse(fixtureData);

        // Remove _metadata field (internal use only)
        delete fixture._metadata;

        sendJSON(res, fixture, 200, req.method);
      } catch (err) {
        if (err.code === 'ENOENT') {
          sendError(res, 404, `Fixture for year ${year} not found`);
        } else {
          log.error('Fixture load error:', err);
          sendError(res, 500, 'Failed to load fixture');
        }
      }
      return;
    }

    // GET /photos/* - Serve photo files from library
    const photosPrefix = `/${webPhotoDir}/`;
    if (pathname.startsWith(photosPrefix)) {
      const photoPath = pathname.slice(photosPrefix.length);

      // Early check for path traversal attempts
      if (photoPath.includes('..')) {
        sendError(res, 403, 'Forbidden');
        return;
      }

      await servePhotoFile(res, photoPath, photoLibrary, req.method);
      return;
    }

    // Serve static files from www/ (css, js, node_modules, etc.)
    // Detect path traversal attempts before processing
    if (pathname.includes('..')) {
      sendError(res, 403, 'Forbidden');
      return;
    }

    const staticPath = join(wwwPath, pathname);

    // Double-check: prevent path traversal by checking resolved path
    const resolvedStatic = resolve(staticPath);
    const resolvedWww = resolve(wwwPath);

    if (!isPathWithin(resolvedWww, resolvedStatic)) {
      sendError(res, 403, 'Forbidden');
      return;
    }

    const served = await serveStaticFile(res, staticPath, req.method);
    if (!served) {
      sendError(res, 404, 'Not found');
    }
  };
}
