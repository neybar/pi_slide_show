# TODO: Individual Photo Swap Algorithm

## Summary

Replace the current "swap entire row" mechanism with a gradual, weighted individual photo swap system. Photos are replaced one at a time every 30 seconds, with older photos having higher probability of being replaced.

## Configuration

| Setting | Value |
|---------|-------|
| Swap interval | 30 seconds |
| Minimum display time | 1 minute (before eligible for swap) |
| Row selection | Alternating (top/bottom) |
| Weight formula | Linear (weight = time on screen) |
| Recycling | Swapped photos return to pool |
| Panoramas | Treated same as other photos |

---

## Phase 1: Add Configuration Constants

- [ ] Add `SWAP_INTERVAL = 30 * 1000` constant in `www/js/main.js`
- [ ] Add `MIN_DISPLAY_TIME = 60 * 1000` constant in `www/js/main.js`
- [ ] Add `nextRowToSwap = 'top'` variable to track alternating rows

---

## Phase 2: Add Data Tracking to Photos

- [ ] Modify `build_row()` to add `display_time` data attribute to each photo
- [ ] Modify `build_row()` to add `columns` data attribute to each photo
- [ ] Test that data attributes are correctly set on initial row build

---

## Phase 3: Helper Functions

- [ ] Add `getPhotoColumns($photo)` function to extract column count from Pure CSS class
- [ ] Add `getAdjacentPhoto($photo, direction)` function to get left/right neighbor
- [ ] Add `selectRandomPhotoFromStore()` function to pick random photo with metadata

---

## Phase 4: Weighted Random Selection

- [ ] Add `selectPhotoToReplace(row)` function implementing weighted random selection
  - [ ] Filter photos to only those displayed >= MIN_DISPLAY_TIME
  - [ ] Calculate weight for each eligible photo (weight = time on screen)
  - [ ] Implement weighted random selection algorithm
  - [ ] Return null if no photos are eligible yet

---

## Phase 5: Space Management

- [ ] Add `makeSpaceForPhoto(row, $targetPhoto, neededColumns)` function
  - [ ] Track photos to remove and available columns
  - [ ] Remove adjacent photos (random direction) until enough space
  - [ ] Try opposite direction if one side has no more photos
  - [ ] Return list of photos to remove and insertion index

- [ ] Add `fillRemainingSpace(row, $newPhoto, remainingColumns)` function
  - [ ] Select photos from store that fit remaining columns
  - [ ] Prefer matching column requirements (portrait=1, landscape=2)
  - [ ] Insert after new photo with opacity 0 for fade-in

---

## Phase 6: Animation (Slide with Bounce)

- [ ] Add slide direction constants and helper
  - [ ] Define `SLIDE_DIRECTIONS = ['up', 'down', 'left', 'right']`
  - [ ] Add `getRandomSlideDirection()` helper function

- [ ] Add `animateSwap(row, photosToRemove, newPhotoDiv, extraColumns)` function
  - [ ] Pick random slide direction for this swap
  - [ ] Insert new photo at target position, offset off-screen in slide direction
  - [ ] Simultaneously:
    - [ ] Slide old photos out in opposite direction (500ms)
    - [ ] Slide new photo into place with bounce (500ms)
  - [ ] No gap between animations (concurrent transitions)
  - [ ] Return old photos' img_box elements to photo_store after slide out
  - [ ] Call fillRemainingSpace if extra columns exist
  - [ ] Slide in any additional fill photos with bounce

- [ ] CSS for slide animations with gravity bounce in `www/css/main.scss`
  - [ ] Add `.photo` overflow hidden to parent container
  - [ ] Add `@keyframes` for each slide-in direction with bounce:
    - [ ] `slide-in-from-top`: starts above (translateY: -100%), overshoots down ~5%, settles at 0
    - [ ] `slide-in-from-bottom`: starts below (translateY: 100%), overshoots up ~5%, settles at 0
    - [ ] `slide-in-from-left`: starts left (translateX: -100%), overshoots right ~5%, settles at 0
    - [ ] `slide-in-from-right`: starts right (translateX: 100%), overshoots left ~5%, settles at 0
  - [ ] Bounce keyframe timing: 0% (off-screen) → 70% (at position) → 85% (overshoot ~5%) → 100% (settled)
  - [ ] Use `ease-out` timing for natural deceleration feel
  - [ ] Animation duration: 500ms total
  - [ ] Slide-out animations: simple translateX/Y to opposite direction (no bounce needed)

---

## Phase 7: Main Swap Algorithm

- [ ] Add `swapSinglePhoto()` function orchestrating the swap
  - [ ] Determine row to swap (alternating top/bottom)
  - [ ] Toggle nextRowToSwap for next iteration
  - [ ] Call selectPhotoToReplace() to get target
  - [ ] Skip if no eligible photos (log message)
  - [ ] Call selectRandomPhotoFromStore() to get new photo
  - [ ] Calculate column requirements
  - [ ] Call makeSpaceForPhoto() if needed
  - [ ] Build new photo div with display_time and columns data
  - [ ] Handle panorama special styling (container class, panning animation)
  - [ ] Call animateSwap()

---

## Phase 8: Timer Integration

- [ ] Add `new_shuffle_show(end_time)` timer function
  - [ ] Check if past end_time and reload if so
  - [ ] Call swapSinglePhoto()
  - [ ] Schedule next call with SWAP_INTERVAL delay

- [ ] Modify `slide_show()` to use new_shuffle_show instead of shuffle_show
  - [ ] Change timer interval from time_to_shuffle to SWAP_INTERVAL

- [ ] Remove or deprecate `shuffle_show()` function
- [ ] Remove `shuffle_row()` stub function

---

## Phase 9: CSS Compilation

- [ ] Compile SCSS: `cd www && npm run build`
- [ ] Verify slide animation classes are properly compiled

---

## Phase 10: Testing

- [ ] Add unit tests for weighted selection algorithm
- [ ] Add unit tests for space management logic
- [ ] Manual test: Observe swaps every 30 seconds
- [ ] Manual test: Verify rows alternate (top, bottom, top, ...)
- [ ] Manual test: Verify photos stay at least 1 minute before swap
- [ ] Manual test: Verify older photos get swapped more frequently
- [ ] Manual test: Test panorama insertion and removal
- [ ] Run `npm test` to ensure no regressions

---

## Files to Modify

| File | Changes |
|------|---------|
| `www/js/main.js` | New constants, helper functions, swap algorithm, timer changes |
| `www/css/main.scss` | Optional opacity transition for smoother animations |

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

## Future Improvements (from code review)

- [x] Add division-by-zero guard in `calculatePanoramaColumns()` for edge case where viewport height is 0
  - File: `www/js/main.js:60-63`
  - Implemented: `if (viewportHeight <= 0) return Math.max(2, totalColumns - 1);`
- [x] Add sync comment between `www/js/main.js` and `test/unit/panorama.test.mjs`
  - SYNC comments added to both files referencing each other
- [x] Extract magic number as a named constant in `www/js/main.js`
  - Implemented: `PAN_SPEED_PX_PER_SEC = 10` at line 32

---

## Files to Modify

| File | Changes |
|------|---------|
| `www/index.html` | Add `#panorama` storage div |
| `www/css/main.scss` | Panorama container, overflow, and animation styles |
| `www/js/main.js` | Detection, column calculation, panning logic |
