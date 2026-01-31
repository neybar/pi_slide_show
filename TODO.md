# TODO: Shrink-to-Corner + Gravity Photo Swap Animation

## Summary

Replace the current slide-out animation with a three-phase sequence:
1. **Shrink-to-corner**: Photo shrinks towards a corner (or instant vanish on low-powered devices)
2. **Gravity fill**: Adjacent photos slide into the empty space
3. **Slide-in**: New photo enters from screen edge with bounce effect

## Animation Behavior

### Direction: Left/Right Only
Remove up/down directions - only horizontal swaps.

### Shrink Corner Selection
Based on direction + shelf position:

| Direction | Shelf  | Shrink Corner |
|-----------|--------|---------------|
| left      | top    | bottom-left   |
| left      | bottom | top-left      |
| right     | top    | bottom-right  |
| right     | bottom | top-right     |

### Progressive Enhancement
- **Capable devices**: Full shrink-to-corner animation
- **Low-powered (older Pis)**: Instant vanish
- Detection: `prefers-reduced-motion` media query + manual `ENABLE_SHRINK_ANIMATION` constant

### Timing
- Phase A (shrink): 400ms
- Phase B (gravity): 300ms
- Phase C (slide-in): 800ms with bounce
- Total: ~1500ms

---

## Phase 1: CSS Changes (`www/css/main.scss`) ✅ COMPLETE

- [x] Add shrink-to-corner keyframes (4 corners)
  - Use `transform: scale(0)` with `transform-origin` for corner anchoring
  - Duration: 400ms, ease-in timing
- [x] Add gravity slide keyframes (left/right)
  - Use CSS custom property `--gravity-distance` for dynamic distance
  - Duration: 300ms, ease-out timing
- [x] Add `.instant-vanish` class for low-powered fallback
- [x] Update slide-in duration to 800ms (keep bounce keyframes)
- [x] Remove up/down slide-out keyframes (cleanup)

---

## Phase 2: JavaScript Changes (`www/js/main.js`) ✅ COMPLETE

- [x] Update `SLIDE_DIRECTIONS` to `['left', 'right']` only (line 96)
- [x] Add timing constants:
  - `SHRINK_ANIMATION_DURATION = 400`
  - `GRAVITY_ANIMATION_DURATION = 300`
  - `SLIDE_IN_ANIMATION_DURATION = 800`
- [x] Add `ENABLE_SHRINK_ANIMATION` config constant (default: true)
- [x] Add `supportsFullAnimation()` capability detection function
- [x] Add `getShrinkCornerClass(direction, isTopRow)` helper
- [x] Add `animatePhaseA()` - shrink or vanish photos
- [x] Add `animatePhaseBGravity()` - slide remaining photos into gap
- [x] Add `animatePhaseC()` - slide in new photo with bounce
- [x] Refactor `animateSwap()` to use Promise chain for three phases
- [x] ~~Remove `getOppositeDirection()`~~ (see Bug Fix section below - function is now needed)

---

## Phase 3: Tests ✅ COMPLETE

- [x] Unit tests for `getShrinkCornerClass()` corner calculation
- [x] Unit tests for direction validation (only left/right)
- [x] E2E test: verify no up/down animations occur
- [x] E2E test: verify `prefers-reduced-motion` triggers instant vanish

---

## Files to Modify

| File | Changes |
|------|---------|
| `www/css/main.scss` | Add shrink/gravity keyframes, update durations |
| `www/js/main.js` | Refactor `animateSwap()`, add phase functions |
| `test/unit/photo-swap.test.mjs` | New tests for corner calculation |
| `test/e2e/slideshow.spec.mjs` | New tests for animation behavior |

---

## Key Code Locations

- `www/js/main.js:94` - `SLIDE_DIRECTIONS` constant
- `www/js/main.js:469-543` - `animateSwap()` function to refactor
- `www/css/main.scss:296-340` - Slide-out keyframes to replace

---

## Verification

- [x] Build SCSS: `cd www && npm run build`
- [x] Run unit tests: `npm test`
- [x] Run E2E tests: `npm run test:e2e` (26 passed, 2 skipped)
- [x] Manual testing: (covered by E2E tests - see `test/e2e/slideshow.spec.mjs`)
  - E2E test validates no up/down animations occur
  - E2E test validates prefers-reduced-motion triggers instant-vanish
  - Animation classes (shrink-to-*, slide-in-from-left/right) verified via MutationObserver

---

## Bug Fix: Slide-In Direction (Entry from Screen Edge)

### Problem

New photos currently enter from the same side as the gravity direction. They should enter from the **opposite** edge - like an invisible stack of photos hiding off-screen.

**Current behavior:**
- Direction 'left' → photo shrinks left → gravity pulls left → new photo enters from LEFT (wrong)

**Expected behavior:**
- Direction 'left' → photo shrinks left → gravity pulls left → gap opens on RIGHT → new photo enters from RIGHT edge

### Example Flow

Layout: `[Landscape1] [Landscape2] [Portrait]`
- Middle landscape selected for replacement, direction = "left"
1. Landscape2 shrinks toward left corner
2. Portrait slides LEFT to fill the empty slot (gravity)
3. Gap opens on the RIGHT edge
4. New photo(s) slide in from the RIGHT edge

### Phase 1: Add `getOppositeDirection()` Helper ✅ COMPLETE

- [x] Add `getOppositeDirection(direction)` function after `getShrinkCornerClass()` (line 152)
  ```javascript
  var getOppositeDirection = function(direction) {
      return direction === 'left' ? 'right' : 'left';
  };
  ```

### Phase 2: Modify `animateSwap()` to Use Entry Direction ✅ COMPLETE

- [x] Calculate `entryDirection` after `slideDirection` is set (line 645)
  ```javascript
  var entryDirection = getOppositeDirection(slideDirection);
  ```

- [x] Change Phase C to use entry direction (line 690)
  - From: `animatePhaseC($newPhotoDiv, slideDirection)`
  - To: `animatePhaseC($newPhotoDiv, entryDirection)`

- [x] Change fill photo animation to use entry direction (line 704)
  - From: `$fillPhoto.addClass('slide-in-from-' + slideDirection)`
  - To: `$fillPhoto.addClass('slide-in-from-' + entryDirection)`

- [x] Update cleanup to use entry direction (line 712)
  - From: `$fillPhoto.removeClass('slide-in-from-' + slideDirection)`
  - To: `$fillPhoto.removeClass('slide-in-from-' + entryDirection)`

### Phase 3: Unit Tests ✅ COMPLETE

- [x] Add `getOppositeDirection()` function to test file
- [x] Add tests for `getOppositeDirection()` in `test/unit/shrink-gravity-animation.test.mjs`
  - Returns 'right' when direction is 'left'
  - Returns 'left' when direction is 'right'

---

### Files to Modify

| File | Changes |
|------|---------|
| `www/js/main.js` | Add `getOppositeDirection()`, use entry direction in Phase C |
| `test/unit/shrink-gravity-animation.test.mjs` | Add tests for `getOppositeDirection()` |

### Animation Flow Summary (After Fix)

| Direction | Phase A (Shrink) | Phase B (Gravity) | Phase C (Entry) |
|-----------|------------------|-------------------|-----------------|
| left | Shrinks to left corner | Adjacent photos slide left | New photos from RIGHT edge |
| right | Shrinks to right corner | Adjacent photos slide right | New photos from LEFT edge |

### Phase 4: Code Review Findings (Address While Implementing) ✅ COMPLETE

**IMPORTANT - Fix misleading comment in Phase B:**
- [x] Update comment in `animatePhaseBGravity()` (lines 564-565)
  - Comment correctly states: "If direction is 'left', photos shrink toward left, gravity pulls photos left, gap opens on right"

**SUGGESTION - Add error handling (optional):**
- [x] Add `.catch()` handler to Promise chain in `animateSwap()` for debugging

---

### Verification ✅ COMPLETE

- [x] Run unit tests: `npm test`
- [x] Run E2E tests: `npm run test:e2e`
- [x] Manual verification (covered by E2E tests):
  - When photo shrinks left, new photos enter from right edge
  - When photo shrinks right, new photos enter from left edge
