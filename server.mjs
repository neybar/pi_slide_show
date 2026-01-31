import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import jsYaml from 'js-yaml';
import { SlideShow } from './lib/slideshow.mjs';
import { createRouter } from './lib/routes.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_PORT = 3000;
const CONFIG_FILE = 'generate_slideshow.yml';

// Log levels: error < warn < info < debug
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LOG_LEVELS.info;

const logger = {
  error: (...args) => LOG_LEVEL >= LOG_LEVELS.error && console.error(...args),
  warn: (...args) => LOG_LEVEL >= LOG_LEVELS.warn && console.warn(...args),
  info: (...args) => LOG_LEVEL >= LOG_LEVELS.info && console.log(...args),
  debug: (...args) => LOG_LEVEL >= LOG_LEVELS.debug && console.log('[DEBUG]', ...args)
};

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000;  // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 100;      // Max requests per window per IP
const MAX_URL_LENGTH = 2048;              // Maximum URL length to prevent abuse

// Simple in-memory rate limiter
class RateLimiter {
  constructor(windowMs, maxRequests) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.requests = new Map();

    // Clean up old entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  cleanup() {
    const now = Date.now();
    for (const [ip, data] of this.requests.entries()) {
      if (now - data.windowStart > this.windowMs) {
        this.requests.delete(ip);
      }
    }
  }

  isAllowed(ip) {
    const now = Date.now();
    const data = this.requests.get(ip);

    if (!data || now - data.windowStart > this.windowMs) {
      // New window
      this.requests.set(ip, { windowStart: now, count: 1 });
      return true;
    }

    if (data.count >= this.maxRequests) {
      return false;
    }

    data.count++;
    return true;
  }

  stop() {
    clearInterval(this.cleanupInterval);
  }
}

async function loadConfig() {
  const configPath = join(__dirname, CONFIG_FILE);

  let fileConfig = {};
  try {
    const content = await readFile(configPath, 'utf-8');
    fileConfig = jsYaml.load(content, { schema: jsYaml.JSON_SCHEMA }) || {};
    logger.debug(`Loaded config from ${CONFIG_FILE}`);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.warn(`Warning: Could not parse ${CONFIG_FILE}:`, err.message);
    }
  }

  // Environment variables override file config
  const config = {
    photo_library: process.env.PHOTO_LIBRARY || fileConfig.photo_library,
    web_photo_dir: process.env.WEB_PHOTO_DIR || fileConfig.web_photo_dir || 'photos',
    default_count: parseInt(process.env.DEFAULT_COUNT, 10) || fileConfig.default_count || 25,
    port: parseInt(process.env.PORT, 10) || DEFAULT_PORT
  };

  return config;
}

async function main() {
  const config = await loadConfig();
  const wwwPath = join(__dirname, 'www');

  const slideshow = new SlideShow({
    photo_library: config.photo_library,
    web_photo_dir: config.web_photo_dir,
    default_count: config.default_count
  });

  // Verify photo library is accessible
  try {
    await slideshow.findLibrary();
    logger.info(`Photo library: ${slideshow.photoLibrary}`);
  } catch (err) {
    logger.error(`Error: ${err.message}`);
    logger.error('Set PHOTO_LIBRARY environment variable or configure photo_library in generate_slideshow.yml');
    process.exit(1);
  }

  const router = createRouter(slideshow, wwwPath, { logger });
  const rateLimiter = new RateLimiter(RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS);

  const server = createServer((req, res) => {
    // Check URL length to prevent abuse
    if (req.url && req.url.length > MAX_URL_LENGTH) {
      res.writeHead(414, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'URI Too Long' }));
      return;
    }

    // Get client IP (support for proxies via X-Forwarded-For)
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.socket.remoteAddress ||
               'unknown';

    // Check rate limit
    if (!rateLimiter.isAllowed(ip)) {
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': '60'
      });
      res.end(JSON.stringify({ error: 'Too Many Requests' }));
      logger.warn(`${req.method} ${req.url} 429 - rate limited ${ip}`);
      return;
    }

    // Request logging: capture start time and log on finish
    const startTime = Date.now();
    logger.debug(`${req.method} ${req.url} - started`);
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      if (res.statusCode >= 400) {
        logger.warn(`${req.method} ${req.url} ${res.statusCode} ${duration}ms`);
      } else {
        logger.info(`${req.method} ${req.url} ${res.statusCode} ${duration}ms`);
      }
    });

    // Pass to router
    router(req, res);
  });

  // Set timeouts to prevent slow-loris attacks
  server.timeout = 30000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;

  server.listen(config.port, () => {
    logger.info(`Server running at http://localhost:${config.port}/`);
    logger.info(`Album endpoint: http://localhost:${config.port}/album/${config.default_count}`);
    logger.debug(`Log level: ${Object.keys(LOG_LEVELS).find(k => LOG_LEVELS[k] === LOG_LEVEL)}`);
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down...`);
    rateLimiter.stop();
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('\nSIGINT'));
}

main().catch(err => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
