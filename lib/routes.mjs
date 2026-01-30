import { open, realpath } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { fileTypeFromFile } from 'file-type';

const MAX_ALBUM_COUNT = 100;

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

function sendJSON(res, data, statusCode = 200) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function sendError(res, statusCode, message) {
  sendJSON(res, { error: message }, statusCode);
}

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
}

async function serveStaticFile(res, filePath) {
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

    // Create stream from file handle to ensure we read the same file we stat'd
    const stream = fileHandle.createReadStream();
    stream.pipe(res);
    stream.on('error', () => {
      if (!res.headersSent) {
        sendError(res, 500, 'Error reading file');
      } else {
        res.end();
      }
    });
    stream.on('close', () => {
      fileHandle.close().catch(() => {});
    });

    return true;
  } catch {
    if (fileHandle) {
      await fileHandle.close().catch(() => {});
    }
    return false;
  }
}

async function servePhotoFile(res, filePath, photoLibrary) {
  let fileHandle = null;
  try {
    const resolvedPath = resolve(photoLibrary, filePath);

    // Prevent path traversal attacks - check before symlink resolution
    if (!resolvedPath.startsWith(resolve(photoLibrary))) {
      sendError(res, 403, 'Forbidden');
      return;
    }

    // Resolve symlinks and verify path is still within library
    const realPath = await realpath(resolvedPath);
    const realLibrary = await realpath(photoLibrary);
    if (!realPath.startsWith(realLibrary)) {
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
      const type = await fileTypeFromFile(realPath);
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

    // Create stream from file handle to ensure we read the same file we stat'd
    const stream = fileHandle.createReadStream();
    stream.pipe(res);
    stream.on('error', () => {
      if (!res.headersSent) {
        sendError(res, 500, 'Error reading file');
      } else {
        res.end();
      }
    });
    stream.on('close', () => {
      fileHandle.close().catch(() => {});
    });
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

export function createRouter(slideshow, wwwPath) {
  const photoLibrary = slideshow.photoLibrary;
  const webPhotoDir = slideshow.webPhotoDir;

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

    // GET / - Serve index.html
    if (pathname === '/') {
      const indexPath = join(wwwPath, 'index.html');
      const served = await serveStaticFile(res, indexPath);
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
        sendJSON(res, album);
      } catch (err) {
        console.error('Album generation error:', err);
        sendError(res, 500, 'Failed to generate album');
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

      await servePhotoFile(res, photoPath, photoLibrary);
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

    if (!resolvedStatic.startsWith(resolvedWww)) {
      sendError(res, 403, 'Forbidden');
      return;
    }

    const served = await serveStaticFile(res, staticPath);
    if (!served) {
      sendError(res, 404, 'Not found');
    }
  };
}
