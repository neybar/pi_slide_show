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

- [ ] Add `PROGRESSIVE_LOADING_ENABLED` constant (default: `true`)
- [ ] Add `INITIAL_BATCH_SIZE` constant (default: `15`)
- [ ] Add `INITIAL_QUALITY` constant (default: `'M'`)
- [ ] Add `FINAL_QUALITY` constant (default: `'XL'`)
- [ ] Add `UPGRADE_BATCH_SIZE` constant (default: `5`)
- [ ] Add `UPGRADE_DELAY_MS` constant (default: `100`)
- [ ] Add `LOAD_BATCH_SIZE` constant (default: `5`) - for throttling initial load
- [ ] Export all new constants

---

## Phase 2: Core Function Modifications

**File:** `www/js/main.js`

### Modify `buildThumbnailPath()`

- [ ] Add `size` parameter with default value `'XL'`
- [ ] Update function to use `'SYNOPHOTO_THUMB_' + size + '.jpg'`
- [ ] Verify backward compatibility (no size param = XL)

### Add Helper Functions

- [ ] Add `qualityLevel(quality)` function
  - Maps quality string to numeric level: `{ 'M': 1, 'XL': 2, 'original': 3 }`

- [ ] Add `preloadImageWithQuality(photoData, quality)` function
  - Wrapper around `preloadImage()` that includes quality metadata
  - Returns `Promise<{value, result, quality, originalFilePath}>`

- [ ] Add `delay(ms)` helper function
  - Returns a Promise that resolves after `ms` milliseconds
  - Used for throttling between operations

### Add Throttled Loading Function

- [ ] Add `loadPhotosInBatches(photos, quality, batchSize)` function
  - Splits photos into batches of `batchSize`
  - Loads each batch with `Promise.all()`
  - Waits for batch to complete before starting next
  - Returns array of all loaded results
  - Prevents network/CPU saturation

### Add Quality Upgrade Functions

- [ ] Add `upgradesPaused` flag variable (default: `false`)
  - Set to `true` during animations
  - Checked before upgrading images

- [ ] Add `upgradeImageQuality($imgBox, targetQuality)` function
  - Check `upgradesPaused` flag, return early if true
  - Check current quality level from data attribute
  - Skip if already at target quality or higher
  - Preload higher quality version
  - Update img `src` attribute when loaded
  - Update `data-quality-level` attribute
  - Null out Image reference after src update (help GC)

- [ ] Add `upgradePhotosInBatches(targetQuality)` function
  - Get all `.img_box` elements from `#photo_store`
  - Process in batches of `UPGRADE_BATCH_SIZE` (5)
  - Wait `UPGRADE_DELAY_MS` (100ms) between batches
  - Sequential batch processing to prevent CPU/memory spikes
  - Log progress at intervals

- [ ] Add `startBackgroundUpgrades()` function
  - Upgrade all photos to XL quality
  - Called after initial display is complete
  - Add error handling with `.catch()`

### Modify `animateSwap()` Function

- [ ] Set `upgradesPaused = true` at start of animation
- [ ] Set `upgradesPaused = false` after animation completes
- [ ] Prevents quality upgrades during photo transitions

### Modify `stage_photos()` Function

- [ ] Check `PROGRESSIVE_LOADING_ENABLED` flag
- [ ] If disabled, keep original behavior (load all 25 with XL)
- [ ] If enabled, implement progressive loading:
  - [ ] Fetch `/album/25` (get all metadata)
  - [ ] Split into `initialBatch` (first 15) and `remainingBatch` (last 10)
  - [ ] Load initial batch using `loadPhotosInBatches()` with M quality
  - [ ] Process and display initial batch
  - [ ] Call `finish_staging()` to start slideshow immediately
  - [ ] In background: load remaining batch with M quality
  - [ ] In background: add remaining photos to grid
  - [ ] In background: call `startBackgroundUpgrades()`

### Update img_box Creation

- [ ] When creating img_box divs, add `data-quality-level` attribute
- [ ] When creating img_box divs, add `data-original-file-path` attribute
- [ ] Ensure these attributes are set in the initial photo processing logic

---

## Phase 3: Unit Tests

**File:** `test/unit/progressive-loading.test.mjs` (new file)

- [ ] Create new test file with proper imports
- [ ] Test `buildThumbnailPath()` with size parameter:
  - [ ] Default to 'XL' when no size provided (backward compatibility)
  - [ ] Correctly build path for 'M' size
  - [ ] Correctly build path for 'XL' size

- [ ] Test `qualityLevel()` function:
  - [ ] Returns correct numeric levels (M=1, XL=2, original=3)
  - [ ] Handles invalid quality strings (return 0)

- [ ] Test `upgradeImageQuality()`:
  - [ ] Returns early when `upgradesPaused` is true
  - [ ] Skips upgrade if already at target quality
  - [ ] Updates img src when upgrade succeeds
  - [ ] Updates data-quality-level attribute

- [ ] Test `loadPhotosInBatches()`:
  - [ ] Correctly batches photos
  - [ ] Returns all results in order

---

## Phase 4: E2E Tests

**File:** `test/e2e/progressive-loading.spec.mjs` (new file)

- [ ] Create new test file with Playwright imports
- [ ] Test initial load speed:
  - [ ] Measure time to first photo visible
  - [ ] Verify photos appear within 3 seconds

- [ ] Test progressive upgrades:
  - [ ] Wait for page load
  - [ ] Use MutationObserver to track img src changes
  - [ ] Verify img src changes from THUMB_M to THUMB_XL
  - [ ] Verify no THUMB_B requests (skipped)

- [ ] Test quality consistency:
  - [ ] Wait for all upgrades to complete (~15 seconds)
  - [ ] Verify all photos have XL quality data attribute

- [ ] Test feature flag:
  - [ ] Set `PROGRESSIVE_LOADING_ENABLED = false`
  - [ ] Verify old behavior (all photos load with XL)

---

## Phase 5: Documentation Updates

**File:** `README.md`

- [ ] Update "Frontend Configuration" table with new constants:
  - [ ] `PROGRESSIVE_LOADING_ENABLED` (default: `true`)
  - [ ] `INITIAL_BATCH_SIZE` (default: `15`)
  - [ ] `INITIAL_QUALITY` (default: `'M'`)
  - [ ] `FINAL_QUALITY` (default: `'XL'`)
  - [ ] `UPGRADE_BATCH_SIZE` (default: `5`)
  - [ ] `UPGRADE_DELAY_MS` (default: `100`)

- [ ] Add note about Pi optimization (sequential upgrades, skipping B quality)

**File:** `CLAUDE.md`

- [ ] Update "Key Implementation Details" with progressive loading mechanism

---

## Phase 6: Verification & Testing

- [ ] Build SCSS: `cd www && npm run build`
- [ ] Run unit tests: `npm test`
  - [ ] All existing tests pass
  - [ ] New progressive loading tests pass
- [ ] Run E2E tests: `npm run test:e2e`
  - [ ] All existing tests pass
  - [ ] New progressive loading tests pass

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
