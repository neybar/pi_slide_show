# pi_slide_show

A Raspberry Pi photo slideshow application that displays random photos from your library in a beautiful grid layout.

## Features

- **Dynamic photo selection** - Randomly selects photos from your library on each refresh
- **Individual photo swap** - Photos swap one at a time every 10 seconds with weighted random selection (older photos more likely to be replaced)
- **Slide animations with bounce** - Heavy ball bounce effect with 3 decreasing bounces (10%, 4%, 1.5% amplitude)
- **Panoramic photo support** - Wide photos (>2:1 ratio) span multiple columns with smooth panning animation
- **Responsive grid layout** - Two-row shelf display using Pure CSS with full layout coverage (object-fit: cover)
- **Progressive image loading** - Fast initial display with M thumbnails, XL upgrades in background
- **Image preloading** - Smooth transitions with no dark screens
- **EXIF orientation support** - Photos display correctly regardless of camera orientation
- **Synology NAS support** - Uses thumbnail paths for optimized loading
- **Cache-busting assets** - CSS/JS versioned on server restart for remote displays
- **Docker ready** - Easy deployment with Docker Compose

## Quick Start

### Using Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/neybar/pi_slide_show.git
cd pi_slide_show

# Edit docker-compose.yml to set your photo library path
# Then start the container
docker compose up -d

# Visit http://localhost:3000
```

### Using Node.js

```bash
# Clone and install
git clone https://github.com/neybar/pi_slide_show.git
cd pi_slide_show
npm install

# Configure (optional - defaults to /mnt/photo)
export PHOTO_LIBRARY=/path/to/your/photos

# Start the server
npm start

# Visit http://localhost:3000
```

## Configuration

Configuration can be set via `generate_slideshow.yml` or environment variables:

| Setting | Environment Variable | Default | Description |
|---------|---------------------|---------|-------------|
| `photo_library` | `PHOTO_LIBRARY` | `/mnt/photo` | Path to photo directory |
| `default_count` | `DEFAULT_COUNT` | `25` | Photos per page load |
| `web_photo_dir` | `WEB_PHOTO_DIR` | `photos` | URL prefix for photos |
| - | `PORT` | `3000` | Server port |
| - | `LOG_LEVEL` | `info` (Docker: `error`) | Logging verbosity (error/warn/info/debug) |
| - | `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per minute per IP (localhost gets 50x) |

### Excluding Folders

To exclude a folder from the slideshow, create an empty `.noslideshow` file in that folder:

```bash
touch /path/to/photos/private-folder/.noslideshow
```

The folder and all its subfolders will be skipped during photo discovery.

The following folders are always excluded:
- Hidden folders (starting with `.`)
- `iPhoto Library`
- `@eaDir` (Synology thumbnail directories)
- `#recycle` (Synology recycle bin)

### Frontend Settings

Animation timing and layout behavior can be adjusted in `www/js/config.mjs`:

| Setting | Default | Description |
|---------|---------|-------------|
| `SWAP_INTERVAL` | `10000` | Time between photo swaps (ms) |
| `PANORAMA_ASPECT_THRESHOLD` | `2.0` | Aspect ratio threshold for panorama detection |
| `ORIENTATION_MATCH_PROBABILITY` | `0.7` | Probability to match photo orientation to container |
| `STACKED_LANDSCAPES_PROBABILITY` | `0.3` | Probability for stacked landscapes in 1-col slots |
| `SHRINK_ANIMATION_DURATION` | `400` | Phase A: Shrink-to-corner duration (ms) |
| `SLIDE_IN_ANIMATION_DURATION` | `800` | Phase B & C: Gravity fill and slide-in duration (ms) |
| `PHASE_OVERLAP_DELAY` | `200` | Delay before Phase C starts while Phase B animates (ms) |
| `ENABLE_SHRINK_ANIMATION` | `true` | Set to `false` for low-powered devices |
| `PROGRESSIVE_LOADING_ENABLED` | `true` | Enable two-stage progressive loading |
| `INITIAL_BATCH_SIZE` | `15` | Photos to load in first batch (fast display) |
| `INITIAL_QUALITY` | `'M'` | Initial thumbnail quality (M = medium) |
| `FINAL_QUALITY` | `'XL'` | Final thumbnail quality after upgrade |
| `UPGRADE_BATCH_SIZE` | `5` | Photos per upgrade batch (prevents CPU spikes) |
| `UPGRADE_DELAY_MS` | `100` | Delay between upgrade batches (ms) |
| `LOAD_BATCH_SIZE` | `5` | Photos per batch during initial load |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Serve the slideshow viewer |
| `GET /album/:count` | Get JSON with random photos |
| `GET /photos/*` | Serve photo files |

## Development

```bash
# Install dependencies
npm install

# Run with auto-reload
npm run dev

# Run tests
npm test              # Unit and performance tests
npm run test:e2e      # E2E tests (requires: npx playwright install chromium)
npm run test:all      # All tests

# Run long-running stability tests (optional, ~7 minutes)
LONG_RUNNING_TEST=1 npm run test:e2e -- --grep "Column Stability"
```

## Docker

```bash
# Build the image
docker build -t pi_slide_show .

# Run with photo library mounted
docker run -p 3000:3000 -v /path/to/photos:/photos:ro pi_slide_show

# Or use docker-compose
docker compose up -d
```

## Security Features

- **Rate limiting** - 100 requests per minute per IP (5000/min for localhost; configurable via `RATE_LIMIT_MAX_REQUESTS`)
- **URL length limit** - Maximum 2048 characters (returns 414 URI Too Long)
- **Path traversal protection** - Symlink validation prevents directory escape attacks
- **Security headers** - X-Content-Type-Options, X-Frame-Options, Content-Security-Policy
- **Server timeouts** - Prevents slow-loris attacks
- **YAML safe schema** - Prevents deserialization attacks

## Requirements

- Node.js 22+
- Photo library with JPEG images

## License

MIT
