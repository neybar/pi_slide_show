# TODO: Progressive Image Loading with Quality Upgrades

## Summary

Implement two-stage progressive loading optimized for Raspberry Pi devices:
1. **Stage 1**: Load first 15 photos with THUMB_M (~1-2 seconds to first display)
2. **Stage 2**: Load remaining 10 photos with THUMB_M (~3 seconds total)
3. **Stage 3**: Upgrade all photos M → XL in background (batches of 5, with delays)

Users see content immediately with images that sharpen over 10-15 seconds.

**Key optimizations for Pi:**
- Skip B quality (M → XL directly) to reduce requests and bandwidth
- Sequential batch upgrades (5 at a time) to prevent CPU/memory spikes
- Throttled initial loading to avoid saturating connections
- Guards against upgrades during animations

---

## Phase 1: Configuration Setup

**File:** `www/js/config.mjs`

- [x] Add `PROGRESSIVE_LOADING_ENABLED` constant (default: `true`)
- [x] Add `INITIAL_BATCH_SIZE` constant (default: `15`)
- [x] Add `INITIAL_QUALITY` constant (default: `'M'`)
- [x] Add `FINAL_QUALITY` constant (default: `'XL'`)
- [x] Add `UPGRADE_BATCH_SIZE` constant (default: `5`)
- [x] Add `UPGRADE_DELAY_MS` constant (default: `100`)
- [x] Add `LOAD_BATCH_SIZE` constant (default: `5`) - for throttling initial load
- [x] Export all new constants

---

## Phase 2: Core Function Modifications

**File:** `www/js/main.js`

### Modify `buildThumbnailPath()`

- [x] Add `size` parameter with default value `'XL'`
- [x] Update function to use `'SYNOPHOTO_THUMB_' + size + '.jpg'`
- [x] Verify backward compatibility (no size param = XL)

### Add Helper Functions

- [x] Add `qualityLevel(quality)` function
  - Maps quality string to numeric level: `{ 'M': 1, 'XL': 2, 'original': 3 }`

- [x] Add `preloadImageWithQuality(photoData, quality)` function
  - Wrapper around `preloadImage()` that includes quality metadata
  - Returns `Promise<{value, result, quality, originalFilePath}>`

- [x] Add `delay(ms)` helper function
  - Returns a Promise that resolves after `ms` milliseconds
  - Used for throttling between operations

### Add Throttled Loading Function

- [x] Add `loadPhotosInBatches(photos, quality, batchSize)` function
  - Splits photos into batches of `batchSize`
  - Loads each batch with `Promise.all()`
  - Waits for batch to complete before starting next
  - Returns array of all loaded results
  - Prevents network/CPU saturation

### Add Quality Upgrade Functions

- [x] Add `upgradesPaused` flag variable (default: `false`)
  - Set to `true` during animations
  - Checked before upgrading images

- [x] Add `upgradeImageQuality($imgBox, targetQuality)` function
  - Check `upgradesPaused` flag, return early if true
  - Check current quality level from data attribute
  - Skip if already at target quality or higher
  - Preload higher quality version
  - Update img `src` attribute when loaded
  - Update `data-quality-level` attribute
  - Null out Image reference after src update (help GC)

- [x] Add `upgradePhotosInBatches(targetQuality)` function
  - Get all `.img_box` elements from `#photo_store`
  - Process in batches of `UPGRADE_BATCH_SIZE` (5)
  - Wait `UPGRADE_DELAY_MS` (100ms) between batches
  - Sequential batch processing to prevent CPU/memory spikes
  - Log progress at intervals

- [x] Add `startBackgroundUpgrades()` function
  - Upgrade all photos to XL quality
  - Called after initial display is complete
  - Add error handling with `.catch()`

### Modify `animateSwap()` Function

- [x] Set `upgradesPaused = true` at start of animation
- [x] Set `upgradesPaused = false` after animation completes
- [x] Prevents quality upgrades during photo transitions

### Modify `stage_photos()` Function

- [x] Check `PROGRESSIVE_LOADING_ENABLED` flag
- [x] If disabled, keep original behavior (load all 25 with XL)
- [x] If enabled, implement progressive loading:
  - [x] Fetch `/album/25` (get all metadata)
  - [x] Split into `initialBatch` (first 15) and `remainingBatch` (last 10)
  - [x] Load initial batch using `loadPhotosInBatches()` with M quality
  - [x] Process and display initial batch
  - [x] Call `finish_staging()` to start slideshow immediately
  - [x] In background: load remaining batch with M quality
  - [x] In background: add remaining photos to grid
  - [x] In background: call `startBackgroundUpgrades()`

### Update img_box Creation

- [x] When creating img_box divs, add `data-quality-level` attribute
- [x] When creating img_box divs, add `data-original-file-path` attribute
- [x] Ensure these attributes are set in the initial photo processing logic

---

## Phase 3: Unit Tests

**File:** `test/unit/progressive-loading.test.mjs` (new file)

- [x] Create new test file with proper imports
- [x] Test `buildThumbnailPath()` with size parameter:
  - [x] Default to 'XL' when no size provided (backward compatibility)
  - [x] Correctly build path for 'M' size
  - [x] Correctly build path for 'XL' size

- [x] Test `qualityLevel()` function:
  - [x] Returns correct numeric levels (M=1, XL=2, original=3)
  - [x] Handles invalid quality strings (return 0)

- [x] Test `upgradeImageQuality()`:
  - [x] Returns early when `upgradesPaused` is true
  - [x] Skips upgrade if already at target quality
  - [x] Updates img src when upgrade succeeds
  - [x] Updates data-quality-level attribute

- [x] Test `loadPhotosInBatches()`:
  - [x] Correctly batches photos
  - [x] Returns all results in order

---

## Phase 4: E2E Tests

**File:** `test/e2e/progressive-loading.spec.mjs` (new file)

- [x] Create new test file with Playwright imports
- [x] Test initial load speed:
  - [x] Measure time to first photo visible
  - [x] Verify photos appear within 3 seconds (allows 5s for CI)

- [x] Test progressive upgrades:
  - [x] Wait for page load
  - [x] Use MutationObserver to track img src changes
  - [x] Verify img src changes from THUMB_M to THUMB_XL (or fallback to originals)
  - [x] Verify no THUMB_B requests (skipped)

- [x] Test quality consistency:
  - [x] Wait for all upgrades to complete (~30 seconds)
  - [x] Verify all photos have quality data (XL, M, or original fallback)

- [x] Test feature flag:
  - [x] Verify `PROGRESSIVE_LOADING_ENABLED` flag exists and defaults to `true`
  - [x] Note: Runtime config override complex due to ES module caching; flag behavior verified indirectly

---

## Phase 5: Documentation Updates

**File:** `README.md`

- [x] Update "Frontend Configuration" table with new constants:
  - [x] `PROGRESSIVE_LOADING_ENABLED` (default: `true`)
  - [x] `INITIAL_BATCH_SIZE` (default: `15`)
  - [x] `INITIAL_QUALITY` (default: `'M'`)
  - [x] `FINAL_QUALITY` (default: `'XL'`)
  - [x] `UPGRADE_BATCH_SIZE` (default: `5`)
  - [x] `UPGRADE_DELAY_MS` (default: `100`)

- [x] Add note about Pi optimization (sequential upgrades, skipping B quality)

**File:** `CLAUDE.md`

- [x] Update "Key Implementation Details" with progressive loading mechanism

---

## Phase 6: Verification & Testing

- [x] Build SCSS: `cd www && npm run build`
- [x] Run unit tests: `npm test`
  - [x] All existing tests pass (261 tests)
  - [x] New progressive loading tests pass (46 tests)
- [x] Run E2E tests: `npm run test:e2e`
  - [x] All existing tests pass
  - [x] New progressive loading tests pass (12 tests)

- [ ] Manual testing on Raspberry Pi:
  - [ ] Clear browser cache
  - [ ] Load slideshow and verify fast initial display (~1-2 seconds)
  - [ ] Open browser DevTools Network tab
  - [ ] Verify M-sized thumbnails load first (in batches)
  - [ ] Verify XL-sized thumbnails load in background (in batches)
  - [ ] Verify NO B-sized thumbnail requests
  - [ ] Verify images progressively sharpen
  - [ ] Monitor CPU usage - should not spike to 100%
  - [ ] Monitor memory usage - should remain stable
  - [ ] Let slideshow run for 5 minutes, verify photo swapping still works
  - [ ] Verify no visual glitches during swap + upgrade overlap

- [ ] Test with feature flag disabled:
  - [ ] Set `PROGRESSIVE_LOADING_ENABLED = false` in config.mjs
  - [ ] Rebuild and reload
  - [ ] Verify old behavior (all 25 load with XL at once)

---

## Files to Modify

| File | Changes | Est. Lines |
|------|---------|------------|
| `www/js/config.mjs` | Add progressive loading constants | +15 |
| `www/js/main.js` | Modify buildThumbnailPath, stage_photos; add upgrade functions | +180 |
| `test/unit/progressive-loading.test.mjs` | Unit tests for new functions | +150 (new) |
| `test/e2e/progressive-loading.spec.mjs` | E2E tests for loading flow | +120 (new) |
| `README.md` | Update configuration table | +15 |
| `CLAUDE.md` | Update implementation details | +10 |

---

## Key Code Locations

- `www/js/main.js:1494` - `buildThumbnailPath()` function to modify
- `www/js/main.js:1501` - `stage_photos()` function to refactor
- `www/js/main.js:1451` - `preloadImage()` function (reference for wrapper)
- `www/js/main.js:592` - `animateSwap()` function (add pause flag)
- `www/js/config.mjs` - Configuration constants

---

## Performance Impact (Revised)

### Bandwidth Usage
- **Before**: ~25MB (25 photos × 1MB XL)
- **After**: ~30MB (25 × 200KB M + 25 × 1MB XL)
- **Increase**: +20% (down from +68% by skipping B)

### HTTP Requests
- **Before**: 25 requests
- **After**: 50 requests (but throttled in batches)

### Time to First Photo
- **Before**: 5-10 seconds
- **After**: 1-2 seconds
- **Improvement**: 3-8 seconds faster

### Resource Usage (Pi-optimized)
- CPU: Minimal spikes (batched upgrades with delays)
- Memory: Stable (sequential processing, explicit cleanup)
- Network: Throttled (batches of 5)

---

## Rollback Plan

If progressive loading causes issues:
1. Set `PROGRESSIVE_LOADING_ENABLED = false` in `www/js/config.mjs`
2. Code falls back to original behavior (load all 25 with XL at once)
3. No other changes needed (backward compatible)

---

## Code Review Issues (Phase 3)

### Important

- [x] **Use Promise.allSettled in upgradePhotosInBatches** (`www/js/main.js:1703`)
  - ~~Current `Promise.all` will fail entire batch if single upgrade rejects~~
  - Already implemented with `Promise.allSettled()` for graceful partial failure handling

### Suggestions (Nice to Have)

- [x] **Extract pure functions to shared module** (`www/js/utils.mjs`)
  - ~~Test file duplicates `buildThumbnailPath`, `qualityLevel`, `delay`, `loadPhotosInBatches`~~
  - Created `www/js/utils.mjs` shared module with pure functions
  - Test file now imports from shared module
  - Browser uses `window.SlideshowUtils` global

- [x] **Add debug flag for console logging** (`www/js/main.js`)
  - ~~Multiple `console.log` statements for progress tracking~~
  - Added `DEBUG_PROGRESSIVE_LOADING` config flag in `www/js/config.mjs`
  - Added `debugLog()` and `debugWarn()` helper functions
  - Progressive loading logs now controlled by config flag (default: false)

- [x] **Remove unused variable in test** (`test/unit/progressive-loading.test.mjs:333`)
  - ~~`let currentBatch = 0;` is never used~~
  - Removed unused variable

---

## Phase 7: Docker Performance Tests (Local Only)

Performance tests that measure real-world progressive loading benefit. Runs against Docker container with NFS-mounted photos and Synology thumbnails.

**Requirements:**
- Docker container running (`docker compose up -d`)
- Photos mounted via NFS with Synology thumbnails
- NOT run in GitHub CI (local development only)

**Observed thumbnail sizes:**
- THUMB_M: ~50KB
- THUMB_XL: ~450KB
- Original: ~920KB

### Test Infrastructure

**File:** `test/perf/progressive-loading.perf.mjs` (new)

- [x] Create performance test file using Playwright
- [x] Configure to run against `http://localhost:3000` (Docker container)
- [x] Add prerequisite check: verify Docker container is running
- [x] Add prerequisite check: verify thumbnails exist (HTTP 200 for THUMB_M)

**File:** `playwright.config.mjs`

- [x] Add separate project for Docker performance tests
- [x] Do NOT use webServer config (assumes Docker already running)
- [x] Set longer timeouts for performance measurements

**File:** `package.json`

- [x] Add `test:perf:docker` script for local performance tests
- [x] Ensure CI workflows do NOT include Docker perf tests

### Performance Test Cases

- [x] **Test 1: Time to First Photo**
  - Measure with `PROGRESSIVE_LOADING_ENABLED = true`
  - ~~Measure with `PROGRESSIVE_LOADING_ENABLED = false`~~ (runtime config toggle complex)
  - ~~Calculate and report speedup factor~~ (manual comparison recommended)
  - Target: Progressive should be 2-5x faster

- [x] **Test 2: Network Bandwidth**
  - Track HTTP requests during initial load
  - Calculate bytes transferred before first photo visible
  - Compare M thumbnail bytes vs XL thumbnail bytes
  - Report bandwidth savings percentage

- [x] **Test 3: Full Load Time**
  - Measure time until all 25 photos loaded (progressive ON)
  - ~~Measure time until all 25 photos loaded (progressive OFF)~~ (runtime config toggle complex)
  - Document tradeoff (faster first photo vs total load time)

- [x] **Test 4: Upgrade Timing**
  - Measure time from first photo visible to all upgrades complete
  - Track upgrade batch timing
  - Verify upgrades don't block initial display

### Reporting

- [x] Output human-readable comparison table
- [x] Save results to `perf-results/perf-history.json`
- [x] Track results over time for regression detection (implemented in `phase-timing.perf.mjs`)

### Documentation

**File:** `README.md`

- [x] Document how to run Docker performance tests
- [x] Note requirements: Docker, NFS photos, Synology thumbnails

**File:** `.github/workflows/test.yml`

- [x] Add comment explaining perf tests are local-only
- [x] Verify Docker perf tests NOT included in CI

### Expected Results

| Metric | Progressive ON | Progressive OFF | Expected Improvement |
|--------|----------------|-----------------|----------------------|
| Time to first photo | ~500ms | ~4500ms | ~9x faster |
| Bytes before first photo | ~750KB (15×50KB) | ~6.75MB (15×450KB) | ~90% reduction |
| Total bandwidth | ~12.5MB | ~11.25MB | ~10% increase (tradeoff) |
