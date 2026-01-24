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

async function loadConfig() {
  const configPath = join(__dirname, CONFIG_FILE);

  let fileConfig = {};
  try {
    const content = await readFile(configPath, 'utf-8');
    fileConfig = jsYaml.load(content, { schema: jsYaml.JSON_SCHEMA }) || {};
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`Warning: Could not parse ${CONFIG_FILE}:`, err.message);
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
    console.log(`Photo library: ${slideshow.photoLibrary}`);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    console.error('Set PHOTO_LIBRARY environment variable or configure photo_library in generate_slideshow.yml');
    process.exit(1);
  }

  const router = createRouter(slideshow, wwwPath);
  const server = createServer(router);

  // Set timeouts to prevent slow-loris attacks
  server.timeout = 30000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;

  server.listen(config.port, () => {
    console.log(`Server running at http://localhost:${config.port}/`);
    console.log(`Album endpoint: http://localhost:${config.port}/album/${config.default_count}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('\nSIGINT received, shutting down...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
