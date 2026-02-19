# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow Rules

- All work must be done in a feature branch, not directly on master
- **Before every git commit**, run both review agents:
  1. `/review-nodejs` - Code review for security, performance, and best practices
  2. `/review-docs` - Documentation consistency check
- Address any CRITICAL issues before committing
- Update TODO.md to mark completed tasks with `[x]`
- **Migration rule**: When replacing Perl files with Node.js equivalents, move the old files to `reference/` folder instead of deleting them. This preserves the original logic for reference during the rewrite.

## Project Overview

A Raspberry Pi photo slideshow application with two components:
1. **Node.js backend** - HTTP server providing dynamic API for random photo selection
2. **JavaScript frontend** - Lightweight web viewer that displays photos in a randomized grid layout

The original Perl implementation is preserved in `reference/` for historical reference.

**See [ARCHITECTURE.md](ARCHITECTURE.md)** for architectural decisions, design principles, and project intent. Consult this before making significant design changes.

**See [docs/visual-algorithm.md](docs/visual-algorithm.md)** for the visual layout algorithm, animation system, and photo selection logic.

## Build & Run Commands

### Node.js Backend

```bash
# Install dependencies
npm install

# Run the server (default port 3000)
npm start

# Development mode with auto-reload
npm run dev

# Run tests
npm test                # Unit and performance tests
npm run test:e2e        # E2E tests (requires: npx playwright install chromium)
npm run test:smoke      # Quick deployment health checks (< 10 seconds)
npm run test:all        # Unit, perf, and E2E tests
npm run test:coverage   # Unit tests with coverage report

# Run long-running stability tests (optional, ~7 minutes)
LONG_RUNNING_TEST=1 npm run test:e2e -- --grep "Column Stability"

# Docker build and run
docker build -t pi_slide_show .
docker run -p 3000:3000 -v /path/to/photos:/photos:ro pi_slide_show
```

### Frontend SCSS (www/)

```bash
cd www
npm install          # Install dependencies
npm run build        # One-time SCSS compilation
npm run dev          # Watch for SCSS changes
```

## Architecture

### Node.js Backend

- `server.mjs` - HTTP server entry point; loads YAML config, starts server on configurable port
- `lib/slideshow.mjs` - SlideShow class with photo discovery and random selection
- `lib/routes.mjs` - Route handlers for API endpoints and static files
- Configuration via `generate_slideshow.yml` or environment variables:
  - `PHOTO_LIBRARY` - Source directory path (default: `/mnt/photo`)
  - `PORT` - Server port (default: `3000`)
  - `WEB_PHOTO_DIR` - URL path prefix for photos
  - `DEFAULT_COUNT` - Number of random photos per batch (default: `25`)
  - `LOG_LEVEL` - Logging verbosity: error, warn, info, debug (default: `info`, Docker: `error`)
  - `RATE_LIMIT_MAX_REQUESTS` - Max requests per minute per IP (default: `100`, localhost gets 50x multiplier)

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Serve `www/index.html` |
| `/css/*`, `/js/*` | GET | Serve static assets from `www/` |
| `/album/:count` | GET | Return JSON with `:count` random photos |
| `/album/fixture/:year` | GET | Return fixed JSON fixture for perf testing (disabled in production) |
| `/photos/*` | GET | Serve photo files from `PHOTO_LIBRARY` |

### Frontend Component

- `www/index.html` - Single-page app using Pure CSS grid, jQuery, and Underscore.js
- `www/js/config.mjs` - **Shared configuration constants** (used by both frontend and tests)
- `www/js/main.js` - Fetches `/album/25`, preloads images, builds responsive grid with slide animations (bounce effect)
- `www/js/photo-store.mjs` - **Photo selection and layout module** with functions for random photo selection, orientation matching, panorama detection, stacked landscape creation, and space management for the grid layout
- `www/js/prefetch.mjs` - **Album pre-fetch module** with functions for pre-fetching next album, memory checks, and AbortController management
- `www/js/utils.mjs` - **Utility functions** for thumbnail URL construction, image preloading, and progressive loading helpers
- Photos organized in two rows (top/bottom shelves), transitions to a new album every 15 minutes (seamless fade with pre-fetch, or page reload as fallback)
- Uses Synology thumbnail paths (`@eaDir/SYNOPHOTO_THUMB_XL.jpg`) with fallback to original images when thumbnails unavailable

### Frontend Configuration (`www/js/config.mjs`)

Shared constants for animation timing, layout probabilities, and thresholds:

| Constant | Default | Description |
|----------|---------|-------------|
| `SWAP_INTERVAL` | `10000` | Photo swap interval in ms |
| `PANORAMA_ASPECT_THRESHOLD` | `2.0` | Aspect ratio for panorama detection |
| `ORIENTATION_MATCH_PROBABILITY` | `0.7` | Probability to match photo orientation to slot |
| `STACKED_LANDSCAPES_PROBABILITY` | `0.3` | Probability for stacked landscapes in 1-col slots |
| `SHRINK_ANIMATION_DURATION` | `400` | Phase A: Shrink-to-corner duration (ms) |
| `SLIDE_IN_ANIMATION_DURATION` | `800` | Phase B & C: Gravity fill and slide-in duration (ms) |
| `PHASE_OVERLAP_DELAY` | `200` | Delay before Phase C starts while Phase B animates (ms) |
| `FILL_STAGGER_DELAY` | `100` | Stagger delay between fill photo slide-in animations (ms) |
| `ENABLE_SHRINK_ANIMATION` | `true` | Set to `false` for low-powered devices |
| `PROGRESSIVE_LOADING_ENABLED` | `true` | Enable two-stage progressive loading |
| `INITIAL_BATCH_SIZE` | `15` | Photos to load in first batch (fast display) |
| `INITIAL_QUALITY` | `'M'` | Initial thumbnail quality (M = medium) |
| `FINAL_QUALITY` | `'XL'` | Final thumbnail quality after upgrade |
| `UPGRADE_BATCH_SIZE` | `5` | Photos per upgrade batch (prevents CPU spikes) |
| `UPGRADE_DELAY_MS` | `100` | Delay between upgrade batches (ms) |
| `LOAD_BATCH_SIZE` | `5` | Photos per batch during initial load |
| `DEBUG_PROGRESSIVE_LOADING` | `false` | Enable console logging for progressive loading |
| `IMAGE_PRELOAD_TIMEOUT` | `30000` | Timeout for image preloading (ms) |
| `PREFETCH_LEAD_TIME` | `60000` | Start pre-fetching next album 1 minute before transition (ms) |
| `ALBUM_TRANSITION_ENABLED` | `true` | Enable seamless album transitions (rollback flag) |
| `ALBUM_TRANSITION_FADE_DURATION` | `1000` | Fade out/in duration for album transitions (ms) |
| `PREFETCH_MEMORY_THRESHOLD_MB` | `100` | Skip prefetch if available memory below threshold (MB) |
| `FORCE_RELOAD_INTERVAL` | `8` | Force full page reload every N transitions (memory hygiene) |
| `MIN_PHOTOS_FOR_TRANSITION` | `15` | Minimum photos required for seamless transition |
| `WATCHDOG_INTERVAL_MS` | `3000` | Watchdog scan frequency (ms) |
| `WATCHDOG_STUCK_GRACE_PERIOD_MS` | `1000` | Grace period before marking cell as stuck (ms) |
| `WATCHDOG_LOAD_ERROR_DELAY_MS` | `500` | Delay before recovering failed image loads (ms) |
| `WATCHDOG_SWAP_DEFER_MS` | `100` | Deferral time for swap queueing (ms) |

Additional constants available in `config.mjs`:
- `PANORAMA_USE_PROBABILITY`, `PANORAMA_STEAL_PROBABILITY`, `PANORAMA_POSITION_LEFT_PROBABILITY` - Panorama placement behavior
- `PAN_SPEED_PX_PER_SEC` - Panorama pan animation speed
- `FILL_RIGHT_TO_LEFT_PROBABILITY`, `INTER_ROW_DIFFER_PROBABILITY` - Layout variety settings

Edit `www/js/config.mjs` to adjust these values. Changes apply to both the browser and tests.

## Available Skills

Use these skills proactively when working on tasks. Match the skill to the task type for enhanced effectiveness.

### Review Skills (use before committing)

#### `/review-nodejs` - Code Review
Expert Node.js reviewer that checks:
- Security vulnerabilities (XSS, injection, exposed secrets)
- Performance issues (memory leaks, async patterns)
- Code quality (naming, DRY, error handling)
- Test coverage gaps

#### `/review-docs` - Documentation Guardian
Obsessive documentation reviewer that checks:
- README.md completeness and accuracy
- Cross-file consistency (README ↔ package.json ↔ Dockerfile ↔ TODO.md)
- Stale or outdated references
- Installation instructions that actually work

#### `/review-qa` - QA Expert
Senior QA specialist that evaluates:
- Test coverage analysis (unit, integration, E2E)
- Test quality and anti-patterns
- Testing strategy and test pyramid balance
- Quality metrics and recommendations

### Development Skills (use during implementation)

#### `/js-coder` - JavaScript Expert
Use when building or refactoring JavaScript code:
- Modern ES2023+ features and patterns
- Async/await and promise patterns
- Performance-critical implementations
- Browser and Node.js best practices

#### `/architect` - System Design
Use for architecture decisions and reviews:
- System design evaluation
- Scalability assessment
- Technical debt analysis
- Design pattern recommendations

### Skill Usage Guidelines

1. **Before writing code**: Consider `/architect` for design decisions
2. **While implementing**: Use `/js-coder` for complex JavaScript work
3. **After implementation**: Run `/review-nodejs` for code review
4. **Before committing**: Run `/review-docs` for documentation consistency
5. **For test improvements**: Use `/review-qa` to identify coverage gaps

## Key Implementation Details

- Rate limiting (100 requests/minute per IP, 5000/min for localhost) prevents DoS attacks
- URL length limit (2048 chars) prevents memory abuse
- Path traversal protection with symlink validation prevents security exploits
- TOCTOU-safe file serving using file handles (open, fstat, stream from handle)
- YAML safe schema (`JSON_SCHEMA`) prevents deserialization attacks
- Server timeouts configured to prevent slow-loris attacks
- Skips iPhoto Library, Synology `@eaDir`, `#recycle`, and hidden directories during photo discovery
- Supports `.noslideshow` marker file to exclude specific folders from photo discovery
- Progressive loading: Initial display uses M-quality thumbnails (~1-2s), then upgrades to XL in background batches
- Album pre-fetch: Fetches next album 1 minute before transition, with memory guard and AbortController cancellation
- Seamless album transitions: Fade-out/fade-in replaces page reload (configurable via `ALBUM_TRANSITION_ENABLED`); `build_row()` uses `skipAnimation` mode during transitions to avoid redundant nested fade animations
- Periodic forced reload every 8 transitions for memory hygiene (configurable via `FORCE_RELOAD_INTERVAL`)
- Frontend preloads all images before display swap (prevents dark screen)
- XSS protection: Album name display uses `.text()` instead of `.html()` to prevent injection
- Frontend adapts column count based on window aspect ratio (5 columns for wide, 4 for normal)
- EXIF orientation extraction using `exifr` library
- MIME type detection using `file-type` library
- Cache-busting for static assets (CSS/JS/MJS) - version changes on server restart
- Accessibility: `lang="en"` on HTML element, alt text on images (derived from filenames), WCAG 2.0 AA tested via `@axe-core/playwright`

## Performance Testing Methodology

Two distinct testing approaches for different concerns:

1. **Album Lookup Tests** (`test/perf/album-lookup.perf.mjs`)
   - Tests `/album/25` API endpoint performance
   - Uses random photos (tests real-world usage)
   - Measures filesystem crawling and JSON generation speed

2. **Photo Loading Tests** (`test/perf/loading-by-year.perf.mjs`, `test/perf/compare-prod.perf.mjs`)
   - Uses **fixed JSON fixtures** in `test/fixtures/albums/`
   - Pre-selected photos from different eras (2010, 2015, 2020, 2025)
   - Enables reproducible benchmarks and valid cross-environment comparisons
   - Fixtures served via `/album/fixture/:year` endpoint

**Why fixed fixtures?** Random photos cause invalid comparisons - a 2MB photo from 2010 vs a 25MB photo from 2025 have vastly different load characteristics
