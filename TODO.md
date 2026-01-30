# TODO: Individual Photo Swap Algorithm

## Summary

Replace the current "swap entire row" mechanism with a gradual, weighted individual photo swap system. Photos are replaced one at a time every 20 seconds, with older photos having higher probability of being replaced.

## Configuration

| Setting | Value |
|---------|-------|
| Swap interval | 20 seconds |
| Minimum display time | 1 minute (before eligible for swap) |
| Row selection | Alternating (top/bottom) |
| Weight formula | Linear (weight = time on screen) |
| Recycling | Swapped photos return to pool |
| Panoramas | Treated same as other photos |
| First swap | Immediate (skips minimum display time) |

---

## Phase 1: Add Configuration Constants

- [x] Add `SWAP_INTERVAL = 20 * 1000` constant in `www/js/main.js`
- [x] Add `MIN_DISPLAY_TIME = 60 * 1000` constant in `www/js/main.js`
- [x] Add `nextRowToSwap = 'top'` variable to track alternating rows
- [x] Add `isFirstSwap = true` flag to skip time check on first swap

---

## Phase 2: Add Data Tracking to Photos

- [x] Modify `build_row()` to add `display_time` data attribute to each photo
- [x] Modify `build_row()` to add `columns` data attribute to each photo
- [x] Test that data attributes are correctly set on initial row build

---

## Phase 3: Helper Functions

- [x] Add `getPhotoColumns($photo)` function to extract column count from Pure CSS class
- [x] Add `getAdjacentPhoto($photo, direction)` function to get left/right neighbor
- [x] Add `selectRandomPhotoFromStore()` function to pick random photo with metadata
- [x] Add `selectPhotoForContainer(aspectRatio)` function to prefer matching orientation

---

## Phase 4: Weighted Random Selection

- [x] Add `selectPhotoToReplace(row, skipTimeCheck)` function implementing weighted random selection
  - [x] Filter photos to only those displayed >= MIN_DISPLAY_TIME (unless skipTimeCheck)
  - [x] Calculate weight for each eligible photo (weight = time on screen)
  - [x] Implement weighted random selection algorithm
  - [x] Return null if no photos are eligible yet

---

## Phase 5: Space Management

- [x] Add `makeSpaceForPhoto(row, $targetPhoto, neededColumns)` function
  - [x] Track photos to remove and available columns
  - [x] Remove adjacent photos (random direction) until enough space
  - [x] Try opposite direction if one side has no more photos
  - [x] Return list of photos to remove and insertion index

- [x] Add `fillRemainingSpace(row, $newPhoto, remainingColumns)` function
  - [x] Select photos from store that fit remaining columns
  - [x] Prefer matching orientation based on container aspect ratio
  - [x] Insert after new photo with opacity 0 for slide-in animation

---

## Phase 6: Animation (Slide with Heavy Ball Bounce)

- [x] Add slide direction constants and helper
  - [x] Define `SLIDE_DIRECTIONS = ['up', 'down', 'left', 'right']`
  - [x] Add `getRandomSlideDirection()` helper function
  - [x] Add `getOppositeDirection(direction)` helper function

- [x] Add `animateSwap(row, photosToRemove, newPhotoDiv, insertionIndex, extraColumns, totalColumnsInGrid)` function
  - [x] Pick random slide direction for this swap
  - [x] Clear pending animation timers before starting new animation
  - [x] Insert new photo at target position, offset off-screen in slide direction
  - [x] Simultaneously slide old photos out and new photo in
  - [x] Track all setTimeout IDs in `pendingAnimationTimers` array for cleanup
  - [x] Return old photos' img_box elements to photo_store after slide out
  - [x] Call fillRemainingSpace if extra columns exist
  - [x] Slide in any additional fill photos with staggered timing

- [x] CSS for slide animations with heavy ball bounce in `www/css/main.scss`
  - [x] Add `.photo` overflow hidden to parent container
  - [x] Add `@keyframes` for each slide-in direction with 3-bounce physics:
    - [x] `slide-in-from-top`: drops down, bounces down 10%, 4%, 1.5%, settles
    - [x] `slide-in-from-bottom`: rises up, bounces up with same amplitudes
    - [x] `slide-in-from-left`: slides right, bounces right with same amplitudes
    - [x] `slide-in-from-right`: slides left, bounces left with same amplitudes
  - [x] Bounce timing: 0-35% (slide in) → 50% (1st bounce) → 62% (rebound) → 74% (2nd bounce) → 84% (rebound) → 92% (3rd bounce) → 100% (settled)
  - [x] Use `ease-out` timing for natural deceleration feel
  - [x] Animation duration: 1200ms total for smooth rendering
  - [x] Slide-out animations: simple translateX/Y to opposite direction (no bounce)

---

## Phase 7: Main Swap Algorithm

- [x] Add `swapSinglePhoto()` function orchestrating the swap
  - [x] Determine row to swap (alternating top/bottom)
  - [x] Toggle nextRowToSwap for next iteration
  - [x] Call selectPhotoToReplace() with isFirstSwap flag
  - [x] Set isFirstSwap = false after first successful swap
  - [x] Skip if no eligible photos (log message)
  - [x] Call selectRandomPhotoFromStore() to get new photo
  - [x] Calculate column requirements
  - [x] Call makeSpaceForPhoto() if needed
  - [x] Build new photo div with display_time and columns data
  - [x] Handle panorama special styling (container class, panning animation)
  - [x] Call animateSwap()

---

## Phase 8: Timer Integration

- [x] Add `new_shuffle_show(end_time)` timer function
  - [x] Check if past end_time and reload if so
  - [x] Call swapSinglePhoto()
  - [x] Schedule next call with SWAP_INTERVAL delay

- [x] Modify `slide_show()` to use new_shuffle_show instead of shuffle_show
  - [x] Change timer interval to SWAP_INTERVAL

- [x] Remove `shuffle_show()` function (replaced by new_shuffle_show)
- [x] Remove `shuffle_row()` stub function (not needed)
- [x] Remove `time_to_shuffle` variable (no longer used)

---

## Phase 9: CSS Compilation

- [x] Compile SCSS: `cd www && npm run build`
- [x] Verify slide animation classes are properly compiled

---

## Phase 10: Testing

- [x] Add unit tests for weighted selection algorithm (`test/unit/photo-swap.test.mjs`)
- [x] Add unit tests for space management logic
- [x] Add E2E tests for layout coverage (`test/e2e/slideshow.spec.mjs`)
- [x] Run `npm test` to ensure no regressions (105 tests passing)
- [ ] Manual test: Observe swaps every 20 seconds *(user verification)*
- [ ] Manual test: Verify rows alternate (top, bottom, top, ...) *(user verification)*
- [ ] Manual test: Verify first swap happens immediately *(user verification)*
- [ ] Manual test: Verify subsequent photos need 1 minute before swap *(user verification)*
- [ ] Manual test: Verify older photos get swapped more frequently *(user verification)*
- [ ] Manual test: Test panorama insertion and removal *(user verification)*

---

## Deployment

**Status: IMPLEMENTED** - Individual photo swap feature complete, pending manual verification.

---

## Files Modified

| File | Changes |
|------|---------|
| `www/js/main.js` | Constants, helper functions, swap algorithm, timer integration, animation cleanup |
| `www/css/main.scss` | Slide animations with 3-bounce physics, layout coverage (object-fit: cover) |
| `test/unit/photo-swap.test.mjs` | 34 unit tests for swap algorithm |
| `test/e2e/slideshow.spec.mjs` | 5 layout coverage E2E tests |

---

---

# TODO: Panoramic Photo Display

## Summary

Improve display of panoramic photos (aspect ratio > 2:1) by allowing them to span multiple columns, fill vertical space with horizontal overflow, and smoothly pan back and forth when content is hidden.

---

## Phase 1: HTML Structure

- [x] Add `<div id="panorama"></div>` storage div inside `#photo_store` in `www/index.html`

---

## Phase 2: CSS Styling

- [x] Add `.panorama-container` styles in `www/css/main.scss`
  - [x] Set `width: 100%` and `height: 100%` on `.img_box`
  - [x] Set `height: 100%`, `width: auto`, `max-width: none` on `img`
- [x] Add `.panorama-overflow` styles for images needing panning
- [x] Add `@keyframes panorama-pan` animation (translateX 0 to var(--pan-distance))
- [x] Compile SCSS: `cd www && npm run build`

---

## Phase 3: JavaScript - Photo Detection

- [x] Update panorama threshold from 1.5 to 2.0 in `stage_photos()` (`www/js/main.js` line 247)
- [x] Store aspect ratio: `div.data('aspect_ratio', width / height)`
- [x] Add reference to `#panorama` storage div in `stage_photos()`
- [x] Route panoramas to `#panorama` storage instead of `#landscape`

---

## Phase 4: JavaScript - Column Calculator

- [x] Add `calculatePanoramaColumns(imageRatio, totalColumns)` function
  - [x] Calculate cell aspect ratio from viewport dimensions
  - [x] Calculate columns needed: `Math.ceil(imageRatio / cellRatio)`
  - [x] Clamp result between 2 and totalColumns

---

## Phase 5: JavaScript - Build Row Logic

- [x] Update `build_row()` to return panoramas to `#panorama` storage when detaching
- [x] Add panorama placement logic at start of row building:
  - [x] Check for available panoramas in `#panorama` storage
  - [x] Calculate columns needed via `calculatePanoramaColumns()`
  - [x] Create div with `panorama-container` class
  - [x] Check for overflow and add `panorama-overflow` class if needed
  - [x] Set CSS custom properties (`--pan-distance`, `--pan-duration`) for animation
- [x] Fill remaining columns with existing landscape/portrait logic

---

## Phase 6: Test Fixtures

- [x] Create panorama test image in fixtures: `test/fixtures/mock-photos/valid-photos/panorama.jpg` (900x300, 3:1 aspect ratio)
- [x] Verify panorama aspect ratio > 2:1

---

## Phase 7: Unit Tests

- [x] Add test for `calculatePanoramaColumns()` in `test/unit/panorama.test.mjs`
  - [x] 2:1 ratio with 5 columns returns 3 columns
  - [x] 3:1 ratio with 5 columns returns 4-5 columns
  - [x] 4:1+ ratio returns max columns (clamped)
  - [x] Result is always between 2 and totalColumns
- [x] Add test that photos with aspect ratio > 2.0 are detected as panoramas

---

## Phase 8: E2E Tests

- [x] Add panorama tests to `test/e2e/slideshow.spec.mjs`
  - [x] Panorama container has `.panorama-container` class
  - [x] Panorama spans multiple columns (check `pure-u-*` class is not `pure-u-2-*`)
  - [x] Overflowing panorama has `.panorama-overflow` class
  - [x] CSS custom properties `--pan-distance` and `--pan-duration` are set on overflow
  - [x] Animation is running: use `page.waitForFunction()` to verify `transform` style changes over time

---

## Phase 9: Manual Visual Testing

- [x] Start server: `PHOTO_LIBRARY=test/fixtures/mock-photos npm start`
- [x] Open browser to `http://localhost:3000`
- [x] Verify panorama fills vertical shelf height
- [x] Verify panorama spans appropriate number of columns
- [x] Verify panning animation moves smoothly right-to-left and back
- [x] Verify animation timing feels natural (not too fast/slow)
- [x] Verify portrait photos display correctly alongside panorama
- [x] Wait for shuffle (1 min) and verify panorama rotates correctly

---

## Verification Checklist

- [x] `cd www && npm run build` compiles without errors
- [x] `npm test` unit tests pass (including new panorama tests)
- [x] `npm run test:e2e` E2E tests pass (including new panorama tests)
- [x] Manual visual verification confirms panning animation works

---

## Deployment

**Status: DEPLOYED** - Panoramic photo display feature merged and deployed January 2026.

---

## Future Improvements (from code review)

- [x] Add division-by-zero guard in `calculatePanoramaColumns()` for edge case where viewport height is 0
  - File: `www/js/main.js:61-63`
  - Implementation: `if (viewportHeight <= 0) return Math.max(2, totalColumns - 1);`
- [x] Add sync comment between `www/js/main.js` and `test/unit/panorama.test.mjs`
  - Added `// SYNC:` comment in www/js/main.js:54
- [x] Extract pan speed as a named constant
  - Added `PAN_SPEED_PX_PER_SEC = 10` in `www/js/main.js:37`

---

## Files to Modify

| File | Changes |
|------|---------|
| `www/index.html` | Add `#panorama` storage div |
| `www/css/main.scss` | Panorama container, overflow, and animation styles |
| `www/js/main.js` | Detection, column calculation, panning logic |
