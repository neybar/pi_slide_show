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
npm run test:all        # All tests

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

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Serve `www/index.html` |
| `/css/*`, `/js/*` | GET | Serve static assets from `www/` |
| `/album/:count` | GET | Return JSON with `:count` random photos |
| `/photos/*` | GET | Serve photo files from `PHOTO_LIBRARY` |

### Frontend Component

- `www/index.html` - Single-page app using Pure CSS grid, jQuery, and Underscore.js
- `www/js/main.js` - Fetches `/album/25`, preloads images, builds responsive grid with fade transitions
- Photos organized in two rows (top/bottom shelves), auto-refreshes every 15 minutes
- Uses Synology thumbnail paths (`@eaDir/SYNOPHOTO_THUMB_XL.jpg`) for optimized loading

## Available Review Agents

### `/review-nodejs` - Code Review
Expert Node.js reviewer that checks:
- Security vulnerabilities (XSS, injection, exposed secrets)
- Performance issues (memory leaks, async patterns)
- Code quality (naming, DRY, error handling)
- Test coverage gaps

### `/review-docs` - Documentation Guardian
Obsessive documentation reviewer that checks:
- README.md completeness and accuracy
- Cross-file consistency (README ↔ package.json ↔ Dockerfile ↔ TODO.md)
- Stale or outdated references
- Installation instructions that actually work

## Key Implementation Details

- Path traversal protection with symlink validation prevents security exploits
- YAML safe schema (`JSON_SCHEMA`) prevents deserialization attacks
- Server timeouts configured to prevent slow-loris attacks
- Skips iPhoto Library, Synology `@eaDir`, and hidden directories during photo discovery
- Frontend preloads all images before display swap (prevents dark screen)
- Frontend adapts column count based on window aspect ratio (5 columns for wide, 4 for normal)
- EXIF orientation extraction using `exifr` library
- MIME type detection using `file-type` library
