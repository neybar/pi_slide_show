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
