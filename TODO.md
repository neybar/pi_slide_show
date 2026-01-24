# TODO: Rewrite Perl Backend to Node.js

## Summary

Rewrite `generate_slideshow.pl` and `lib/Photo/SlideShow.pm` to a unified Node.js application that:
1. Serves the frontend static files (HTML/CSS/JS)
2. Provides a dynamic API endpoint for random photo selection

---

## Phase 1: Core Node.js Backend

### Tasks

- [x] Create root `package.json` with dependencies and `"type": "module"`
- [x] Create `lib/slideshow.mjs` - SlideShow class
  - [x] `findLibrary()` - search for photo library in standard mount paths
  - [x] `collectDirectories()` - recursive directory walk with filters
  - [x] `findImagesInDir(dir)` - find image files using MIME detection
  - [x] `selectRandomPhotos(count)` - random selection algorithm
  - [x] `extractOrientation(filePath)` - EXIF orientation extraction
  - [x] `getRandomAlbum(count)` - main method, returns JSON-ready object
- [x] Create `lib/routes.mjs` - Route handlers
  - [x] `GET /` - Serve static frontend
  - [x] `GET /album/:count` - Return JSON with random photos
  - [x] `GET /photos/*` - Serve photo files from library
  - [x] Static file serving for `www/` assets
- [x] Create `server.mjs` - HTTP server entry point
  - [x] Load YAML config on startup
  - [x] Support environment variable overrides
  - [x] Start HTTP server on configurable port

### Dependencies

```json
{
  "dependencies": {
    "exifr": "^7.1.3",
    "file-type": "^19.6.0",
    "js-yaml": "^4.1.0"
  }
}
```

---

## Phase 2: Frontend Updates

### Tasks

- [x] Update `www/js/main.js` - fetch from `/album/25` instead of static JSON
- [x] Implement image preloading before display swap
  - [x] Fetch new photo list in background
  - [x] Preload all images before showing
  - [x] Swap display only after all images cached (no dark screen)

### Frontend Preload Logic

```javascript
async function refreshSlideshow() {
  const data = await fetch('/album/25').then(r => r.json());

  await Promise.all(data.images.map(img => {
    return new Promise(resolve => {
      const image = new Image();
      image.onload = resolve;
      image.onerror = resolve;
      image.src = '/' + img.file;
    });
  }));

  renderPhotos(data.images);
}
```

---

## Phase 3: Test Harness

### Setup Tasks

- [x] Install test dependencies (`vitest`, `@playwright/test`)
- [x] Create `vitest.config.mjs`
- [ ] Create `playwright.config.mjs`
- [x] Create test fixtures directory with mock photos

### Unit Tests (`test/unit/`)

- [x] Create `slideshow.test.mjs`
  - [x] Returns correct count (request 25, get 25)
  - [x] Returns valid structure (`Orientation` and `file` properties)
  - [x] Respects count parameter
  - [x] Handles edge cases (count=0, count > available)
  - [x] Filters excluded directories (`@eaDir`, `iPhoto Library`, hidden)
  - [x] Path translation uses `web_photo_dir` prefix
  - [x] Orientation values are valid (1, 3, 6, 8)
  - [x] Multiple calls return different orderings (randomness)
- [x] Create `routes.test.mjs`
  - [x] `/album/:count` returns valid JSON
  - [x] `/photos/*` serves files correctly
  - [x] Static files served from `www/`
- [x] Create `server.test.mjs`
  - [x] Server starts and serves index.html
  - [x] Environment variables override config
  - [x] Security headers are set

### Performance Tests (`test/perf/`)

- [x] Create `getRandomAlbum.perf.mjs`
  - [x] `getRandomAlbum(25)` completes in < 100ms
  - [x] 100 sequential requests average < 50ms each
  - [x] Memory usage stable across repeated calls

### E2E Tests (`test/e2e/`)

- [ ] Create `slideshow.spec.mjs`
  - [ ] Page loads without errors
  - [ ] All 25 photo slots populated
  - [ ] No broken images (no 404s)
  - [ ] Refresh shows different photo order
  - [ ] Grid layout correct (top/bottom shelves)

### Test Fixtures

- [x] Create `test/fixtures/mock-photos/` structure
  - [x] `valid-photos/` - landscape.jpg, portrait.jpg, rotated180.jpg
  - [x] `nested/subfolder/` - deep-photo.jpg
  - [x] `.hidden/` - should-skip.jpg (filtered out)
  - [x] `@eaDir/` - SYNOPHOTO_THUMB_XL.jpg (filtered out)
  - [x] `iPhoto Library/` - should-skip.jpg (filtered out)

### npm Scripts

```json
{
  "scripts": {
    "start": "node server.mjs",
    "dev": "node --watch server.mjs",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:unit": "vitest run test/unit",
    "test:perf": "vitest run test/perf",
    "test:e2e": "playwright test",
    "test:e2e:headed": "playwright test --headed",
    "test:all": "npm run test:unit && npm run test:perf && npm run test:e2e"
  }
}
```

---

## Phase 4: Docker

### Tasks

- [ ] Rewrite `Dockerfile` for Node.js
- [ ] Create `docker-compose.yml`
- [ ] Test container build and run
- [ ] Verify photo library mount works

### Dockerfile

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY server.mjs ./
COPY lib/ ./lib/
COPY www/ ./www/
COPY generate_slideshow.yml ./
EXPOSE 3000
ENV PHOTO_LIBRARY=/photos
ENV PORT=3000
CMD ["node", "server.mjs"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  slideshow:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - /mnt/photo:/photos:ro
    environment:
      - PHOTO_LIBRARY=/photos
      - PORT=3000
    restart: unless-stopped
```

---

## Phase 5: CI/CD

### Tasks

- [ ] Create `.github/workflows/test.yml`
- [ ] Verify all tests pass in CI
- [ ] Update `.github/workflows/docker-publish.yml` if needed

### GitHub Actions Workflow

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:perf
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
```

---

## Verification Checklist

- [ ] `node server.mjs` starts without errors
- [ ] `http://localhost:3000` serves frontend
- [ ] `curl http://localhost:3000/album/25` returns valid JSON
- [ ] Photos display in browser
- [x] All unit tests pass
- [x] All performance tests pass
- [ ] All E2E tests pass
- [ ] Docker container builds and runs
- [ ] CI pipeline passes

---

## Reference

### Decisions

- **Module format**: ES Modules (import/export)
- **Perl files**: Keep as backup alongside Node.js
- **Photo serving**: Node.js serves photos directly from `photo_library` path
- **Photo library**: `/mnt/photo` default, configurable via YAML/env for Docker
- **Selection algorithm**: Keep current (random directory first, then photos) - preserves story grouping
- **Cache strategy**: Rescan on each request, frontend handles smooth transitions
- **Max photos**: Configurable limit with sensible default (e.g., 100)
- **Frontend refresh**: Preload all images before swap (no dark screen)
- **Node.js version**: Node 22+ locally, Node 22-alpine in Docker
- **Package structure**: Root `package.json` for server, keep `www/package.json` for SCSS

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Serve `www/index.html` |
| `/css/*`, `/js/*` | GET | Serve static assets from `www/` |
| `/album/:count` | GET | Return JSON with `:count` random photos |
| `/photos/*` | GET | Serve photo files from `photo_library` |

### Output Format

```json
{
  "count": 25,
  "images": [
    { "Orientation": 1, "file": "photos/path/to/image.jpg" }
  ]
}
```

### Configuration Priority

1. `generate_slideshow.yml` (file defaults)
2. Environment variables (`PHOTO_LIBRARY`, `PORT`, `MAX_PHOTOS`)

### Files Summary

| File | Action |
|------|--------|
| `package.json` | Create - dependencies, `"type": "module"` |
| `server.mjs` | Create - HTTP server entry point |
| `lib/slideshow.mjs` | Create - Photo selection logic |
| `lib/routes.mjs` | Create - Route handlers |
| `www/js/main.js` | Modify - fetch from `/album/25`, add preloading |
| `vitest.config.mjs` | Create - Vitest configuration |
| `playwright.config.mjs` | Create - Playwright configuration |
| `test/unit/slideshow.test.mjs` | Create - Unit tests |
| `test/unit/routes.test.mjs` | Create - Route tests |
| `test/unit/server.test.mjs` | Create - Server integration tests |
| `test/perf/getRandomAlbum.perf.mjs` | Create - Performance tests |
| `test/e2e/slideshow.spec.mjs` | Create - E2E tests |
| `test/fixtures/mock-photos/` | Create - Test fixtures |
| `Dockerfile` | Rewrite - Node.js |
| `docker-compose.yml` | Create - Convenience file |
| `.github/workflows/test.yml` | Create - CI workflow |
| `generate_slideshow.pl` | Keep (backup) |
| `lib/Photo/SlideShow.pm` | Keep (backup) |
