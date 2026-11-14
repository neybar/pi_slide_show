# pi_slide_show

A photo slideshow application that runs in a browser on a small always-on computer (currently a Chromebox; it started on a Raspberry Pi, hence the repo name) and displays random photos from your library in a beautiful grid layout.

## Features

- **Dynamic photo selection** - Randomly selects photos from your library on each refresh
- **Individual photo swap** - In grid albums, photos swap one at a time every 10 seconds with weighted random selection (older photos more likely to be replaced)
- **Display modes** - A one-photo album fills the screen over a blurred backdrop, and a 2-10 photo album shows a large hero with a filmstrip; both play shorter than grid albums ([spec](docs/visual-algorithm.md#display-modes))
- **Slide animations with bounce** - Heavy ball bounce effect with 3 decreasing bounces (10%, 4%, 1.5% amplitude)
- **Panoramic photo support** - Wide photos (>2:1 ratio) span multiple columns with smooth panning animation
- **Responsive grid layout** - Two-row shelf display using Pure CSS with full layout coverage (object-fit: cover)
- **Progressive image loading** - Grid albums: fast initial display with M thumbnails, XL upgrades in background
- **Seamless album transitions** - Pre-fetches next album in background, fades between albums with no black screen
- **Image preloading** - Smooth transitions with no dark screens
- **Automatic recovery system** - Watchdog monitors for stuck/invisible cells and failed image loads, automatically recovers with photo swaps (single and tiny albums: reloads or drops the failed photo)
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

Note: The default `docker-compose.yml` uses NFS to mount photos from a Synology NAS. Edit the `volumes` section to match your network storage or use a local bind mount instead.

### Using Node.js

```bash
# Clone and install
git clone https://github.com/neybar/pi_slide_show.git
cd pi_slide_show
npm install
npm install --prefix www   # frontend libraries (jQuery, etc.); without them no photos load

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
| `default_count` | `DEFAULT_COUNT` | `35` | Photos per page load |
| `web_photo_dir` | `WEB_PHOTO_DIR` | `photos` | URL prefix for photos |
| - | `PORT` | `3000` | Server port |
| - | `LOG_LEVEL` | `info` (Docker: `error`) | Logging verbosity (error/warn/info/debug) |
| - | `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per minute per IP (localhost gets 50x) |
| - | `DIAG_ENABLED` | off | `1` or `true` turns on [on-device diagnostics](#on-device-diagnostics) (`/diag`) |

### On-device diagnostics

The display runs in kiosk mode with no keyboard, so the page can report what it sees back to the
server. It is off by default; production behaviour does not change unless you enable it.

Set `DIAG_ENABLED=1` on the server (for the NAS container, uncomment it in `docker-compose.yml` and
run `docker compose up -d`, then reload or wait for the display to reload). The server then adds a
`<meta name="diagnostics" content="on">` tag to the page, and `www/js/diagnostics.mjs` starts
collecting: uncaught errors, unhandled promise rejections, CSP violations, `console.error` calls, the
current mode (`grid`/`single`/`tiny`) and album name, user agent, viewport, `performance.memory` and
a frame-time summary (p50/p95/max, from `requestAnimationFrame`, which only runs while enabled). It
sends a report every `DIAG_INTERVAL_MS` and right away on an error (at most one per
`DIAG_ERROR_MIN_GAP_MS`).

View the last 100 reports from any machine on the LAN:

```bash
curl -s http://<nas-host>:3000/diag | jq '.reports[-1]'
curl -s http://<nas-host>:3000/diag | jq '.reports[] | select(.events | length > 0)'
```

The server also logs one line per report (`diag ip=... reason=error mode=grid ...`) at `info` level;
the Docker default `LOG_LEVEL=error` hides it. Reports live in memory only and are lost on restart.

`/diag` accepts only JSON (16 KB max, 60 reports per minute across all clients) and only from
loopback or private (LAN) socket addresses; `X-Forwarded-For` is ignored for this check. If you put
a reverse proxy on the LAN in front of the server, it must not forward untrusted traffic to `/diag`.
With diagnostics off, `/diag` does not exist (404).

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
| `PANORAMA_USE_PROBABILITY` | `0.5` | Chance to use an available grid panorama |
| `PANORAMA_POSITION_LEFT_PROBABILITY` | `0.5` | Chance a grid panorama appears on the left rather than the right |
| `PAN_SPEED_PX_PER_SEC` | `10` | Grid panorama pan speed (px/s) |
| `SINGLE_PANORAMA_MAX_PAN_PX_PER_SEC` | `40` | Fastest a single-photo panorama pans (px/s); a wide one fills the screen height and pans, and the album plays one full round trip (up to `ALBUM_DURATION_MS`) |
| `HERO_USE_ORIGINAL` | `true` | Single-photo hero: after the XL thumbnail shows, swap in the original file once it has decoded (sharper on 1080p and larger). Costs RAM: a 24 MP photo decodes to about 96 MB. Set `false` to stay at XL |
| `HERO_ORIGINAL_MIN_SCREEN_PX` | `1600` | The original is used only when screen width x devicePixelRatio is above this (px) |
| `HERO_ORIGINAL_MAX_PIXELS` | `24000000` | An original with more pixels than this is never requested (the server reports its size in the album JSON) and the hero stays at XL |
| `HERO_ORIGINAL_MAX_BYTES` | `26214400` | Same for the file size (25 MB). An album entry without size fields also stays at XL |
| `ALBUM_DURATION_MS` | `900000` | Grid album play time (ms, 15 min); also the cap for tiny and single-panorama play time. See [Display Modes](docs/visual-algorithm.md#display-modes) |
| `SINGLE_PHOTO_DURATION_MS` | `90000` | Single-photo album play time (ms); a slow-panning panorama may play longer |
| `TINY_ALBUM_MAX` | `10` | Albums of 2 to this many photos are tiny (a hero with a filmstrip); more photos is a grid |
| `TINY_MIN_DURATION_MS` | `120000` | Floor for tiny album play time (ms) |
| `TINY_HERO_LAPS` | `1` | Full rotations a tiny album gets; sets its play time when that is above the floor |
| `HERO_MARGIN_PX` | `0` | Safe margin around the single-photo hero (px). Tiny albums use the full viewport |
| `BACKDROP_ENABLED` | `true` | Blurred backdrop behind contain-fit photos. `false` shows a solid `#111` fill |
| `BACKDROP_SIZE_PX` | `64` | Long edge of the downscaled copy used for the backdrop (px) |
| `BACKDROP_BLUR_PX` | `4` | Blur radius of the backdrop (px) |
| `BACKDROP_BRIGHTNESS` | `0.55` | Backdrop darkening (`1` = unchanged) |
| `BACKDROP_FADE_MS` | `800` | Backdrop crossfade duration (ms) |
| `FILMSTRIP_HEIGHT_PCT` | `20` | Tiny album: strip height below the hero (% of viewport height) |
| `FILMSTRIP_WIDTH_PCT` | `16` | Tiny album: strip width beside a portrait hero (% of viewport width) |
| `FILMSTRIP_GAP_PX` | `8` | Gap between filmstrip cells, and between the strip and the hero (px) |
| `FILMSTRIP_MAX_CELL_ASPECT` | `2.0` | Cap on a filmstrip cell's long axis, as a multiple of the strip size |
| `TINY_RELOCATE_FADE_OUT_MS` | `250` | Tiny album: the strip fades out before a rotation that moves it between the bottom and the right (ms) |
| `TINY_RELOCATE_FADE_IN_MS` | `400` | ...then fades back in at its new side (ms) |
| `ORIENTATION_MATCH_PROBABILITY` | `0.7` | Probability to match photo orientation to container |
| `STACKED_LANDSCAPES_PROBABILITY` | `0.3` | Probability for stacked landscapes in 1-col slots |
| `FILL_RIGHT_TO_LEFT_PROBABILITY` | `0.5` | Probability to fill a grid row right to left |
| `INTER_ROW_DIFFER_PROBABILITY` | `0.7` | Probability to prefer a different pattern from the other grid row |
| `SHRINK_ANIMATION_DURATION` | `400` | Phase A: Shrink-to-corner duration (ms) |
| `SLIDE_IN_ANIMATION_DURATION` | `800` | Phase B & C: Gravity fill and slide-in duration (ms) |
| `PHASE_OVERLAP_DELAY` | `200` | Delay before Phase C starts while Phase B animates (ms) |
| `FILL_STAGGER_DELAY` | `100` | Stagger delay between fill photo slide-in animations (ms) |
| `ENABLE_SHRINK_ANIMATION` | `true` | Set to `false` for low-powered devices |
| `PROGRESSIVE_LOADING_ENABLED` | `true` | Enable two-stage progressive loading |
| `INITIAL_BATCH_SIZE` | `15` | Photos to load in first batch (fast display) |
| `INITIAL_QUALITY` | `'M'` | Initial thumbnail quality for grid albums (M = medium); single and tiny albums load at `FINAL_QUALITY` |
| `FINAL_QUALITY` | `'XL'` | Final thumbnail quality after upgrade |
| `UPGRADE_BATCH_SIZE` | `5` | Photos per upgrade batch (prevents CPU spikes) |
| `UPGRADE_DELAY_MS` | `100` | Delay between upgrade batches (ms) |
| `UPGRADE_MAX_SWEEPS` | `3` | Extra upgrade scans after the first pass, for photos it missed (mid-swap, clones) |
| `LOAD_BATCH_SIZE` | `5` | Photos per batch during initial load |
| `DEBUG_PROGRESSIVE_LOADING` | `false` | Enable console logging for progressive loading |
| `IMAGE_PRELOAD_TIMEOUT` | `30000` | Timeout for image preloading (ms) |
| `WATCHDOG_INTERVAL_MS` | `3000` | Watchdog scan frequency (ms); grid and hero watchdogs |
| `WATCHDOG_STUCK_GRACE_PERIOD_MS` | `1000` | Grace period before a cell or hero counts as stuck (ms) |
| `WATCHDOG_LOAD_ERROR_DELAY_MS` | `500` | Delay before recovering a failed image load (ms) |
| `WATCHDOG_SWAP_DEFER_MS` | `100` | Deferral for grid swap queueing (ms) |
| `DIAG_INTERVAL_MS` | `60000` | Diagnostics report interval and frame-timing window (ms); only used with `DIAG_ENABLED` |
| `DIAG_ERROR_MIN_GAP_MS` | `5000` | Minimum gap between immediate error reports (ms); only used with `DIAG_ENABLED` |
| `PREFETCH_LEAD_TIME` | `60000` | Start pre-fetching next album 1 minute before transition (ms) |
| `ALBUM_TRANSITION_ENABLED` | `true` | Enable seamless transitions (set false to fallback to location.reload) |
| `ALBUM_TRANSITION_FADE_DURATION` | `1000` | Fade out/in duration for album transitions (ms) |
| `TRANSITION_READY_TIMEOUT_MS` | `5000` | Max wait for the new album's backdrop before fading in anyway (ms) |
| `STAGE_RETRY_BASE_MS` | `5000` | First retry delay after a failed initial load; doubles each failure (ms) |
| `STAGE_RETRY_MAX_MS` | `60000` | Cap for the initial-load retry backoff (ms) |
| `PREFETCH_MEMORY_THRESHOLD_MB` | `100` | Skip prefetch if available memory below threshold (MB) |
| `FORCE_RELOAD_INTERVAL` | `8` | Force full page reload every N transitions (memory hygiene) |
| `MIN_PHOTOS_FOR_TRANSITION` | `15` | Grid albums: photos loaded for a seamless transition (the whole album if it has fewer); single and tiny albums need 1 |

Every constant exported from `config.mjs` is listed above. The file comments give the details.

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Serve the slideshow viewer |
| `GET /album/:count` | Get JSON with random photos |
| `GET /album/fixture/:year` | Get JSON with fixed photos for testing (disabled in production) |
| `GET /photos/*` | Serve photo files |

## Development

```bash
# Install dependencies (server and frontend)
npm install
npm install --prefix www

# Run with auto-reload
npm run dev

# Run tests
npm test              # Unit and performance tests
npm run test:e2e      # E2E tests (requires: npm install --prefix www, npx playwright install chromium)
npm run test:smoke    # Quick deployment health checks (< 10 seconds)
npm run test:all      # Unit, perf, and E2E tests
npm run lint:compat   # Check www/ JS and CSS against the display browser (browserslist in package.json)
npm run test:coverage # Unit tests with coverage report

# Run long-running stability tests (optional, ~7 minutes)
LONG_RUNNING_TEST=1 npm run test:e2e -- --grep "Column Stability"

# Run Docker performance tests (local only, requires Docker running)
docker compose up -d                    # Start container
npm run test:perf:docker                # Run perf tests
cat perf-results/perf-history.json      # View results (tracks history over time)
```

### E2E Helpers

Tests that depend on play time or layout use two helpers in `test/e2e/helpers/`. Call both before `page.goto()`:

- `overrideConfig(page, {...})` (`config-override.mjs`) merges values into `window.SlideshowConfig` before `main.js` reads it, for example a short `SWAP_INTERVAL` or `ALBUM_DURATION_MS`. It does not edit `config.mjs`.
- `mockAlbums(page, albums)` (`mock-album.mjs`) routes `/album/35` and the photo URLs in the browser, so a test picks the photo count and aspect ratios without server changes.

### Performance Tests

There are two types of performance tests, each designed for a specific purpose:

**1. Album Lookup Performance** (`test/perf/album-lookup.perf.mjs`)

Tests the `/album/35` API endpoint performance (filesystem crawling and random selection):
- Measures response time across multiple iterations
- Calculates min, max, average, and p95 statistics
- Uses random photos by design (tests real-world usage)
- Results tracked in `perf-results/album-lookup-history.json`

```bash
npm run test:perf:docker -- --grep "Album Lookup"
```

**2. Photo Loading Performance** (`test/perf/loading-by-year.perf.mjs`, `test/perf/compare-prod.perf.mjs`)

Tests progressive loading performance using fixed, reproducible datasets:
- Uses JSON fixture files with pre-selected photos from different eras (2010, 2015, 2020, 2025)
- Enables valid apples-to-apples comparisons between environments
- Measures time-to-first-photo, thumbnail loading, and XL upgrade phases
- Results tracked in `perf-results/loading-by-year-history.json`

```bash
# Test all fixture years
npm run test:perf:docker -- --grep "Loading by Year"

# Compare local vs production (uses 2020 fixture)
PROD_URL=http://192.168.0.6:8531 npm run test:perf:docker -- --grep "Comparison"
```

**Why Fixed Datasets?**

Random photos cause inconsistent results:
- Photos from 2010 (~2MB) vs 2025 (~25MB) have vastly different load times
- Comparing runs with different photos is invalid
- Fixed fixtures ensure reproducible benchmarks

**Creating New Fixtures**

Fixture files are in `test/fixtures/albums/album-YYYY.json`:

```json
{
  "count": 25,
  "images": [
    { "file": "photos/2020/January/IMG_001.JPG", "Orientation": 1 },
    ...
  ],
  "_metadata": {
    "note": "25 photos from 2018-2022 era",
    "expectedSizes": { "M": "~50KB", "XL": "~450KB" }
  }
}
```

To add a fixture:
1. Create `album-YYYY.json` with 25 photos from your library
2. Include a mix of orientations (1, 3, 6, 8)
3. Add the year to `validYears` array in `lib/routes.mjs`

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
- **Diagnostics endpoint** - `/diag` exists only with `DIAG_ENABLED`, accepts JSON only (16 KB cap, global rate limit), serves LAN addresses only, validates every field and never echoes input
- **URL length limit** - Maximum 2048 characters (returns 414 URI Too Long)
- **Path traversal protection** - Symlink validation prevents directory escape attacks
- **Security headers** - X-Content-Type-Options, X-Frame-Options, Content-Security-Policy
- **Server timeouts** - Prevents slow-loris attacks
- **YAML safe schema** - Prevents deserialization attacks

## Requirements

- Node.js 22+
- Photo library with JPEG images

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - Design decisions and project intent
- [docs/visual-algorithm.md](docs/visual-algorithm.md) - Visual layout and animation system

## License

MIT
