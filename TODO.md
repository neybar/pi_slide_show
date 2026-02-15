# TODO: Architecture Improvements and Code Simplification

## Summary

Address gaps between documented architecture and implementation, plus code simplification opportunities. Prioritized by impact and effort.

**Gaps Addressed:**
1. Pre-fetch next album (HIGH - prevents black screen on transition)
2. Vertical gravity for stacked landscapes (MEDIUM - animation physics)
3. Independent stacked swaps (LOW - future enhancement)
4. Off-screen photo weighting (LOW - fair rotation)
5. Small album layout evolution (LOW - edge case)

**Simplifications:**
1. Remove deprecated constants (EASY)
2. Extract photo store module (MEDIUM)
3. Remove unused CSS (EASY)

**Future Considerations (from ARCHITECTURE.md):**
1. Animation phase overlap (LOW - visual polish)
2. Adaptive animation timing (LOW - device optimization)
3. Thumbnail strategy abstraction (LOW - NAS portability)

---

## Phase 1: Code Cleanup (Quick Wins)

Quick wins that improve maintainability without behavioral changes.

### 1.1 Remove Deprecated Constants

**File:** `www/js/config.mjs`

- [x] Remove `GRAVITY_ANIMATION_DURATION` (line 27, marked DEPRECATED)
- [x] Remove `SLIDE_ANIMATION_DURATION` (line 29, legacy alias)
- [x] Update `window.SlideshowConfig` export to remove these constants

**File:** `www/js/main.js`

- [x] Remove fallback reference to `SLIDE_ANIMATION_DURATION` (line 97)

**Testing:**
- [x] Run `npm test` - all unit tests pass
- [x] Run `npm run test:e2e` - all E2E tests pass (pre-existing timeout failures unrelated to this change)

**Estimated effort:** 15 minutes
**Risk:** Very Low

---

### 1.2 Remove Unused CSS

**File:** `www/css/main.scss`

- [x] Remove `slide-out-to-left` keyframes
- [x] Remove `slide-out-to-right` keyframes
- [x] Remove `.slide-out-to-left` class
- [x] Remove `.slide-out-to-right` class

**Also removed:** `$slide-duration` (legacy alias) and `$gravity-duration` (unused variable).

**Note:** Keep `slide-in-from-top` and `slide-in-from-bottom` for future vertical gravity implementation (Phase 5).

**Testing:**
- [x] Run `cd www && npm run build` - SCSS compiles
- [x] Run `npm run test:e2e` - visual tests pass

**Estimated effort:** 20 minutes
**Risk:** Very Low

---

## Phase 2: Pre-fetch Next Album (High Impact)

Addresses the most important architectural gap: "Performance = No Black Screen" from ARCHITECTURE.md.

### Problem Statement

Current behavior (`www/js/main.js:1405-1418`):
```javascript
var new_shuffle_show = function(end_time) {
    if (_.now() > end_time) {
        clearAllPendingTimers();
        location.reload();  // <-- CAUSES BLACK SCREEN FLASH
    }
    // ...
};
```

Per ARCHITECTURE.md: "Pre-fetch the next album while the current one displays."

### 2.1 Configuration Setup

**File:** `www/js/config.mjs`

- [x] Add `PREFETCH_LEAD_TIME` constant (default: `60000` - 1 minute before transition)
- [x] Add `ALBUM_TRANSITION_ENABLED` constant (default: `true` - rollback flag)
- [x] Add `ALBUM_TRANSITION_FADE_DURATION` constant (default: `1000` - 1 second fade)
- [x] Add `PREFETCH_MEMORY_THRESHOLD_MB` constant (default: `100` - skip prefetch if < 100MB available)
- [x] Add `FORCE_RELOAD_INTERVAL` constant (default: `8` - force full reload every N transitions for memory hygiene)
- [x] Add `MIN_PHOTOS_FOR_TRANSITION` constant (default: `15` - require at least 15 photos for seamless transition)
- [x] Export new constants in `window.SlideshowConfig`

---

### 2.2 Core Implementation

**File:** `www/js/main.js`

**State Variables:**
- [ ] Add `nextAlbumData` variable (null) - holds pre-fetched album JSON
- [ ] Add `nextAlbumPhotos` array ([]) - holds pre-loaded img_box elements
- [ ] Add `prefetchStarted` flag (false) - prevents duplicate prefetch
- [ ] Add `prefetchComplete` flag (false) - signals ready for transition
- [ ] Add `transitionCount` counter (0) - tracks successful transitions for periodic reload
- [ ] Add `prefetchAbortController` variable (null) - AbortController for canceling stale prefetch requests

**Add `hasEnoughMemoryForPrefetch()` function:**
- [ ] Wrap in try/catch - API can throw in some contexts, not just be undefined
- [ ] Use `performance.memory.usedJSHeapSize` if available (Chrome/Chromium)
- [ ] Calculate available memory: `jsHeapSizeLimit - usedJSHeapSize`
- [ ] Return `true` if available > `PREFETCH_MEMORY_THRESHOLD_MB * 1024 * 1024`
- [ ] Return `true` if API unavailable or throws (graceful degradation)
- [ ] Log memory status with debug flags

**Add `prefetchNextAlbum()` function:**
- [ ] **Memory guard**: Check `hasEnoughMemoryForPrefetch()` first
- [ ] If insufficient memory: log warning, set `prefetchComplete = false`, return early
- [ ] Create new `AbortController` and store in `prefetchAbortController`
- [ ] Fetch `/album/25` for next album data (pass AbortSignal to fetch)
- [ ] Use `loadPhotosInBatches()` with INITIAL_QUALITY (M) for fast preload
- [ ] Create img_box elements and store in `nextAlbumPhotos`
- [ ] Set `prefetchComplete = true` when done
- [ ] Log progress with debug flags
- [ ] Handle errors gracefully (fall back to reload on failure)
- [ ] Handle AbortError separately (not an error, just cancellation)

**Add `transitionToNextAlbum()` function:**

Albums are thematically cohesive batches - mixing old and new photos would break the "event/moment" grouping. The transition uses a deliberate fade-out → fade-in sequence to create a clear "chapter break" between albums.

- [ ] **Check if forced reload due**: If `transitionCount >= FORCE_RELOAD_INTERVAL`:
  - [ ] Log "Periodic reload for memory hygiene"
  - [ ] Call `location.reload()` and return
- [ ] **Check prefetch status**: If `!prefetchComplete` or `nextAlbumPhotos.length < MIN_PHOTOS_FOR_TRANSITION`:
  - [ ] Fall back to `location.reload()` (safe recovery)
  - [ ] Log reason for fallback (prefetch incomplete or partial load)
- [ ] **Phase 1: Fade Out** - Fade out both shelves simultaneously (ALBUM_TRANSITION_FADE_DURATION)
- [ ] Return current photos to a temp storage (for cleanup)
- [ ] Clear `#top_row` and `#bottom_row` (while faded out)
- [ ] Move `nextAlbumPhotos` to photo_store (categorized by orientation)
- [ ] Call `build_row('#top_row')` and `build_row('#bottom_row')` (still hidden)
- [ ] Update album name display
- [ ] **Phase 2: Fade In** - Fade in both shelves with new photos (ALBUM_TRANSITION_FADE_DURATION)
- [ ] Reset `end_time` and restart shuffle cycle
- [ ] **Cleanup**: Remove old img_box elements from DOM and null references (help GC)
- [ ] **Cleanup**: Clear any data attributes holding references to Image objects
- [ ] Cancel any in-flight prefetch by calling `prefetchAbortController.abort()` if exists
- [ ] Reset prefetch flags for next cycle (`prefetchStarted`, `prefetchComplete`, `prefetchAbortController`)
- [ ] **Increment `transitionCount`** for periodic reload tracking
- [ ] Start background quality upgrades for new photos

**Modify `new_shuffle_show()` function:**
- [ ] Add prefetch trigger check:
  ```javascript
  if (!prefetchStarted && _.now() > end_time - PREFETCH_LEAD_TIME) {
      prefetchStarted = true;
      prefetchNextAlbum();
  }
  ```
- [ ] Replace `location.reload()` with:
  ```javascript
  if (ALBUM_TRANSITION_ENABLED) {
      transitionToNextAlbum();
  } else {
      location.reload();
  }
  ```

---

### 2.3 Rollback Plan

**File:** `www/js/config.mjs`

If issues arise:
- [ ] Set `ALBUM_TRANSITION_ENABLED = false`
- [ ] Code falls back to `location.reload()` behavior
- [ ] No other changes needed

---

### 2.4 Testing

**File:** `test/unit/prefetch.test.mjs` (new file)

- [ ] Test `prefetchNextAlbum()` fetches album data
- [ ] Test `prefetchNextAlbum()` preloads images
- [ ] Test `transitionToNextAlbum()` moves photos to store
- [ ] Test `transitionToNextAlbum()` rebuilds rows
- [ ] Test prefetch triggers at correct lead time
- [ ] Test fallback when `ALBUM_TRANSITION_ENABLED = false`
- [ ] Test error handling (network failure)
- [ ] Test `hasEnoughMemoryForPrefetch()` returns true when memory available
- [ ] Test `hasEnoughMemoryForPrefetch()` returns true when API unavailable (graceful degradation)
- [ ] Test prefetch skipped when memory below threshold (falls back to reload)
- [ ] Test partial load (< MIN_PHOTOS_FOR_TRANSITION) falls back to reload
- [ ] Test forced reload after FORCE_RELOAD_INTERVAL transitions
- [ ] Test transitionCount increments on successful transition
- [ ] Test transitionCount does NOT increment on reload fallback
- [ ] Test AbortController cancels in-flight prefetch when transition starts
- [ ] Test AbortError is handled gracefully (not logged as error)
- [ ] Test memory doesn't grow unbounded after 10 transitions (if `performance.memory` available)

**File:** `test/e2e/album-transition.spec.mjs` (new file)

- [ ] Test fade-out animation occurs (shelves become invisible)
- [ ] Test fade-in animation occurs (shelves become visible with new photos)
- [ ] Test no photo mixing (old photos fully gone before new appear)
- [ ] Test album name updates during transition
- [ ] Test photos change after transition (different src paths)
- [ ] Test shuffle continues after transition
- [ ] Test photo quality upgrades work after transition

**Manual Testing:**
- [ ] Run slideshow for 15+ minutes on development machine
- [ ] Verify no black screen on transition
- [ ] Verify album name updates
- [ ] Verify new photos appear
- [ ] Test on Raspberry Pi device (if available)

**Estimated effort:** 4-6 hours
**Risk:** Medium (core flow change, but has rollback)

---

## Phase 3: Extract Photo Store Module

Improves testability and maintainability by extracting photo selection logic.

### 3.1 Create Photo Store Module

**File:** `www/js/photo-store.mjs` (new file)

Extract from `www/js/main.js` (~280 lines):

- [ ] `getPhotoColumns($photo)` - extract column count from CSS class
- [ ] `getAdjacentPhoto($photo, direction)` - get left/right neighbor
- [ ] `selectRandomPhotoFromStore(containerAspectRatio, isEdgePosition)`
- [ ] `selectPhotoToReplace(row)` - weighted random selection
- [ ] `selectPhotoForContainer(containerAspectRatio, forceRandom)`
- [ ] `fillRemainingSpace(row, $newPhoto, remainingColumns, totalColumnsInGrid)`
- [ ] `clonePhotoFromPage(preferOrientation)`
- [ ] `createStackedLandscapes(photo_store, columns)`
- [ ] `makeSpaceForPhoto(row, $targetPhoto, neededColumns)`

**Module structure:**
```javascript
// Import config for probabilities
import { ORIENTATION_MATCH_PROBABILITY, ... } from './config.mjs';

// Functions need jQuery $ - pass as parameter or use window.$
export function selectRandomPhotoFromStore($, containerAspectRatio, isEdgePosition) {
    const photo_store = $('#photo_store');
    // ...
}

// Export all functions
export {
    getPhotoColumns,
    selectRandomPhotoFromStore,
    selectPhotoToReplace,
    // ...
};

// Browser global for non-module scripts
if (typeof window !== 'undefined') {
    window.SlideshowPhotoStore = {
        getPhotoColumns,
        selectRandomPhotoFromStore,
        selectPhotoToReplace,
        // ...
    };
}
```

---

### 3.2 Update Main.js

**File:** `www/js/main.js`

- [ ] Remove extracted functions (~280 lines)
- [ ] Add imports at top (or use window.SlideshowPhotoStore)
- [ ] Update function calls to use imported versions
- [ ] Verify all internal references updated

**File:** `www/index.html`

- [ ] Add script tag for new module (before main.js):
  ```html
  <script type="module" src="js/photo-store.mjs"></script>
  ```

---

### 3.3 Testing

**File:** `test/unit/photo-store.test.mjs` (new file)

- [ ] Test `getPhotoColumns()` - parses Pure CSS classes correctly
- [ ] Test `selectPhotoToReplace()` - weighted selection favors older photos
- [ ] Test `selectPhotoForContainer()` - orientation matching probability
- [ ] Test `fillRemainingSpace()` - fills remaining columns correctly
- [ ] Test `clonePhotoFromPage()` - clones with correct data attributes
- [ ] Test `createStackedLandscapes()` - creates stacked container
- [ ] Test edge cases: empty store, insufficient photos

**Existing tests:**
- [ ] Run `npm test` - photo-swap.test.mjs still passes
- [ ] Run `npm run test:e2e` - all visual tests pass

**Estimated effort:** 3-4 hours
**Risk:** Low (refactoring, no behavior change)

---

## Phase 4: Documentation Updates

### 4.1 Update CLAUDE.md

**File:** `CLAUDE.md`

- [ ] Document pre-fetch album mechanism in "Key Implementation Details"
- [ ] Add new constants to config table:
  - `PREFETCH_LEAD_TIME` (default: `60000`) - When to start pre-fetching next album
  - `ALBUM_TRANSITION_ENABLED` (default: `true`) - Enable seamless transitions
  - `ALBUM_TRANSITION_FADE_DURATION` (default: `1000`) - Fade animation duration
  - `PREFETCH_MEMORY_THRESHOLD_MB` (default: `100`) - Skip prefetch if available memory below threshold
  - `FORCE_RELOAD_INTERVAL` (default: `8`) - Force full page reload every N transitions (memory hygiene)
  - `MIN_PHOTOS_FOR_TRANSITION` (default: `15`) - Minimum photos required for seamless transition
- [ ] Note photo-store module extraction

---

### 4.2 Update ARCHITECTURE.md

**File:** `ARCHITECTURE.md`

- [ ] Update "Open Questions / Future Decisions" section
- [ ] Mark "Pre-fetch implementation" as IMPLEMENTED
- [ ] Document the album transition approach:
  - Pre-fetch next album 1 minute before transition
  - Fade out current album (both shelves simultaneously)
  - Fade in new album (clear visual "chapter break")
  - No mixing of photos between albums (preserves thematic cohesion)

---

### 4.3 Update visual-algorithm.md

**File:** `docs/visual-algorithm.md`

- [ ] Add new section "## Album Transitions" documenting:
  - Transition triggers after 15-minute display cycle
  - Pre-fetch begins 1 minute before transition
  - Animation sequence: Fade Out (1s) → Swap → Fade In (1s)
  - Both shelves animate together (unlike photo swaps which target single shelf)
  - Album name updates during the fade-out phase
  - Why: Preserves "thematically cohesive batches" principle
- [ ] Note that vertical gravity for stacked landscapes remains pending
- [ ] Update "Future Enhancements" section

---

## Future Phases (Lower Priority)

Documented for future work but not prioritized in this iteration.

### Phase 5: Vertical Gravity for Stacked Landscapes

**Status:** CSS keyframes exist (`slide-in-from-top/bottom`), JS integration needed.

**Architecture says:**
- Top shelf stacked: gravity pulls down, new photo enters from top
- Bottom shelf stacked: gravity pulls up, new photo enters from bottom

**Implementation notes:**
- Modify `animateSwap()` to detect stacked landscape slots
- Use vertical animations instead of horizontal for stacked cells
- E2E tests currently verify vertical animations are NOT used (update tests)

---

### Phase 6: Independent Stacked Swaps

**Status:** Listed as "Future Enhancement" in visual-algorithm.md

**Current behavior:** Entire stacked unit is replaced when selected.

**Target behavior:** Swap individual photos within stacked cells.

---

### Phase 7: Off-Screen Photo Weighting

**Status:** Low priority - random selection works adequately.

**Architecture says:** Weight off-screen photos by "time since last shown."

**Implementation:** Track `last_shown_time` on img_box elements, use in selection.

---

### Phase 8: Small Album Layout Evolution

**Status:** Low priority - edge case for very small albums.

**Architecture says:** Layout evolves via rearrangement even with no new photos.

---

### Phase 9: Animation Phase Overlap

**Status:** Low priority - visual polish enhancement.

**Architecture says:** (visual-algorithm.md line 257) "Overlap phases so neighbors start falling while removal is still crushing, creating more fluid physics."

**Implementation notes:**
- Modify animation sequencing to start Phase B (fall) while Phase A (crush) is ~80% complete
- Requires timing coordination to avoid visual glitches
- Test on low-powered devices to ensure performance

---

### Phase 10: Adaptive Animation Timing

**Status:** Low priority - device performance optimization.

**Architecture says:** (visual-algorithm.md line 374) "Adjust animation speeds based on device performance."

**Implementation notes:**
- Detect device capabilities (requestAnimationFrame timing, available memory)
- Reduce animation complexity on slower devices (already have `ENABLE_SHRINK_ANIMATION` flag)
- Could use `navigator.hardwareConcurrency` as a proxy for device power

---

### Phase 11: Thumbnail Strategy Abstraction

**Status:** Low priority - future NAS portability.

**Architecture says:** (ARCHITECTURE.md line 169) Extract thumbnail strategy from Synology-specific code for vendor independence.

**Implementation notes:**
- Create pluggable thumbnail locator interface
- Support Synology `@eaDir`, custom paths, or self-generated thumbnails
- Would enable migration to FreeNAS/TrueNAS or other storage solutions

---

### Phase 12: Cross-Browser Testing

**Status:** Low priority - single Chromebox client currently.

**Rationale:** Current deployment is a single Asus Chromebox in kiosk mode running Chrome. Cross-browser testing adds value when targeting multiple browsers or web distribution.

**Implementation notes:**
- Add Firefox and WebKit projects to `playwright.config.mjs`
- Add `npm run test:e2e:all-browsers` script
- May expose browser-specific CSS/JS bugs

**When to implement:** If slideshow is deployed to non-Chrome clients or made publicly accessible.

---

### NOT Recommended: jQuery Reduction

**Status:** Large undertaking, high disruption risk.

**Rationale:** Heavy jQuery usage throughout codebase. Migration to vanilla JS would require significant refactoring with minimal user-visible benefit. Not recommended for this iteration.

---

### Open Questions (From ARCHITECTURE.md)

These items from ARCHITECTURE.md are documented but not planned for implementation:

1. **Multi-client coordination** (Line 171) - Should multiple displays avoid showing the same album simultaneously? Not prioritized - single-client usage is the norm.

2. **Album weighting** (Line 172) - Should newer folders have higher selection probability? Current pure-random approach is acceptable and aligns with "forgotten memories" goal.

---

## Files to Modify Summary

| File | Phase | Changes |
|------|-------|---------|
| `www/js/config.mjs` | 1.1, 2.1 | Remove deprecated, add prefetch constants |
| `www/js/main.js` | 1.1, 2.2, 3.2 | Remove deprecated, add prefetch, extract functions |
| `www/css/main.scss` | 1.2 | Remove unused slide-out CSS |
| `www/js/photo-store.mjs` | 3.1 | New module with extracted functions |
| `www/index.html` | 3.2 | Add photo-store.mjs script tag |
| `test/unit/prefetch.test.mjs` | 2.4 | New test file |
| `test/unit/photo-store.test.mjs` | 3.3 | New test file |
| `test/e2e/album-transition.spec.mjs` | 2.4 | New E2E test |
| `CLAUDE.md` | 4.1 | Documentation updates |
| `ARCHITECTURE.md` | 4.2 | Mark pre-fetch implemented |
| `docs/visual-algorithm.md` | 4.3 | Update future enhancements |

---

## Key Code Locations

- `www/js/main.js:1405-1418` - `new_shuffle_show()` with `location.reload()`
- `www/js/main.js:217-498` - Photo store selection functions to extract
- `www/css/main.scss:322-385` - Vertical slide animations (keep for Phase 5)

---

## Rollback Plans

### Phase 1 (Cleanup)
- Git revert file changes
- No runtime fallback needed

### Phase 2 (Pre-fetch)
- Set `ALBUM_TRANSITION_ENABLED = false` in config.mjs
- Falls back to `location.reload()` behavior

### Phase 3 (Module extraction)
- Git revert to inline functions in main.js
- No config flag needed (pure refactor)

---

## Performance Impact

### Phase 2 (Pre-fetch)
- **Memory:** Temporarily holds two albums in memory (~2.5MB for M thumbnails, more after XL upgrades)
- **Memory Guard:** Checks available heap before prefetch; skips if < 100MB available (falls back to reload)
- **Periodic Reload:** Every 8 transitions (~2 hours), forces full reload to clear accumulated memory (configurable)
- **Partial Load Handling:** If < 15 photos loaded, falls back to reload instead of partial display
- **Target Hardware:** Tested on 2GB Asus Chromebox in kiosk mode
- **Network:** One additional `/album/25` request per 15-minute cycle
- **CPU:** Background preload is throttled (existing `loadPhotosInBatches`)
- **User Experience:** Eliminates black screen flash on album transition (when memory allows)

---

## Verification Checklist

### Phase 1 Complete When:
- [x] `npm test` passes (all unit tests)
- [x] `npm run test:e2e` passes (all E2E tests)
- [x] `cd www && npm run build` succeeds (SCSS compiles)
- [ ] Visual spot-check of animations

### Phase 2 Complete When:
- [ ] New unit tests pass (`test/unit/prefetch.test.mjs`)
- [ ] New E2E tests pass (`test/e2e/album-transition.spec.mjs`)
- [ ] 15+ minute manual test shows smooth fade transition
- [ ] Fade-out and fade-in are visually distinct (clear "chapter break")
- [ ] No photo mixing between albums during transition
- [ ] Album name updates correctly on transition
- [ ] Rollback flag works (reload behavior when disabled)

### Phase 3 Complete When:
- [ ] New unit tests pass (`test/unit/photo-store.test.mjs`)
- [ ] Existing tests still pass
- [ ] `main.js` reduced by ~280 lines
- [ ] No behavioral changes (pure refactor)

### Phase 4 Complete When:
- [ ] CLAUDE.md updated with new features
- [ ] ARCHITECTURE.md marks pre-fetch implemented
- [ ] visual-algorithm.md notes remaining future work

---

## QA Improvements (Quality Assurance)

Identified gaps from QA review. Prioritized by impact on quality confidence.

### QA-1: Add Code Coverage Reporting

**Status:** Not implemented
**Priority:** HIGH

- [ ] Configure vitest coverage in `vitest.config.mjs`
- [ ] Add coverage thresholds (recommend: 70% lines, 60% branches)
- [ ] Add `npm run test:coverage` script to package.json
- [ ] Add coverage badge to README.md (optional)

**Implementation:**
```javascript
// vitest.config.mjs
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['lib/**/*.mjs', 'www/js/**/*.mjs'],
      exclude: ['test/**', 'node_modules/**'],
      thresholds: {
        lines: 70,
        branches: 60,
        functions: 70
      }
    }
  }
});
```

**Estimated effort:** 30 minutes
**Risk:** None

---

### QA-2: Add Network Error Handling Tests

**Status:** Gap identified
**Priority:** HIGH

Tests for graceful degradation when network fails:

**File:** `test/unit/network-errors.test.mjs` (new file)

- [ ] Test `/album/25` fetch failure triggers retry or fallback
- [ ] Test image preload timeout doesn't block entire slideshow
- [ ] Test partial album response (e.g., 10 of 25 photos) is handled
- [ ] Test server disconnect during photo loading

**File:** `test/e2e/network-resilience.spec.mjs` (new file)

- [ ] Test slideshow continues working after brief network interruption
- [ ] Test error message shown when album fetch fails completely
- [ ] Test recovery after network restored

**Estimated effort:** 2-3 hours
**Risk:** Low

---

### QA-3: Add Accessibility Testing (Optional)

**Status:** Not implemented
**Priority:** MEDIUM

Photo slideshow should be accessible for screen readers.

**File:** `test/e2e/accessibility.spec.mjs` (new file)

- [ ] Install `@axe-core/playwright` dependency
- [ ] Test no critical accessibility violations on page load
- [ ] Test photos have appropriate alt text or ARIA labels
- [ ] Test color contrast for any text overlays
- [ ] Test keyboard navigation (if applicable)

**Implementation:**
```javascript
import AxeBuilder from '@axe-core/playwright';

test('should not have critical accessibility violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations.filter(v => v.impact === 'critical')).toEqual([]);
});
```

**Estimated effort:** 2 hours
**Risk:** Low

---

### QA-4: Add Smoke Test Suite

**Status:** Not implemented
**Priority:** MEDIUM

Quick deployment verification tests that run fast.

**File:** `test/smoke/health.spec.mjs` (new file)

- [ ] Test server responds to `/` within 500ms
- [ ] Test `/album/1` returns valid JSON
- [ ] Test at least one photo can be served
- [ ] Test all critical static assets load (CSS, JS)
- [ ] Add `npm run test:smoke` script (target: < 10 seconds)

**Use case:** Run after deployment to verify system health.

**Estimated effort:** 1 hour
**Risk:** None

---

### QA-5: Add Visual Regression Testing

**Status:** Not implemented
**Priority:** LOW

Catch unintended visual changes to layout/animations.

**File:** `test/e2e/visual-regression.spec.mjs` (new file)

- [ ] Configure Playwright visual comparisons
- [ ] Capture baseline screenshots of initial load
- [ ] Test layout consistency across page refreshes
- [ ] Document how to update baseline screenshots

**Note:** Visual tests can be flaky due to timing. Consider only for major release validation.

**Estimated effort:** 3 hours
**Risk:** Medium (flakiness)

---

### QA-6: Add Memory Leak Detection Tests

**Status:** Gap identified (related to Phase 2 prefetch)
**Priority:** MEDIUM

**File:** `test/e2e/memory-stability.spec.mjs` (new file)

- [ ] Test heap size doesn't grow unbounded after multiple photo swaps
- [ ] Test DOM node count stays stable over time
- [ ] Test image elements are properly garbage collected

**Implementation approach:**
```javascript
test('memory stability over swap cycles', async ({ page }) => {
  await page.goto('/');
  const initialHeap = await page.evaluate(() =>
    performance.memory?.usedJSHeapSize
  );

  // Trigger multiple swap cycles
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => window.swap_random_photo?.('#top_row'));
    await page.waitForTimeout(500);
  }

  const finalHeap = await page.evaluate(() =>
    performance.memory?.usedJSHeapSize
  );

  // Allow 50% growth tolerance
  expect(finalHeap).toBeLessThan(initialHeap * 1.5);
});
```

**Note:** Requires Chromium (performance.memory API)

**Estimated effort:** 2 hours
**Risk:** Low

---

### QA-7: Add API Contract Tests

**Status:** Not implemented
**Priority:** LOW

Ensure API responses maintain expected structure over time.

**File:** `test/unit/api-contracts.test.mjs` (new file)

- [ ] Define JSON schema for `/album/:count` response
- [ ] Test response matches schema exactly
- [ ] Test backward compatibility (old clients can parse new responses)
- [ ] Document API versioning strategy if breaking changes needed

**Estimated effort:** 1.5 hours
**Risk:** None

---

### QA-8: Improve Test Naming Consistency

**Status:** Minor issue
**Priority:** LOW

Current tests mix naming styles:
- `'should serve index.html'` (BDD style)
- `'page loads without errors'` (descriptive style)

- [ ] Audit test descriptions for consistency
- [ ] Recommend BDD style: `'should [expected behavior] when [condition]'`
- [ ] No code changes required unless enforcing via linting

**Estimated effort:** Optional (documentation only)
**Risk:** None

---

### QA Verification Checklist

### QA-1 Complete When:
- [ ] `npm run test:coverage` produces report
- [ ] Coverage thresholds enforced (fails if below)
- [ ] HTML coverage report viewable

### QA-2 Complete When:
- [ ] Network error tests pass
- [ ] E2E resilience tests pass
- [ ] No uncaught exceptions in browser console during failures

### QA-3 Complete When (if implemented):
- [ ] No critical a11y violations
- [ ] Accessibility report generated

### QA-4 Complete When:
- [ ] `npm run test:smoke` completes in < 10 seconds
- [ ] Smoke tests cover all critical paths
