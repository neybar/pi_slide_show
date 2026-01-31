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

## Phase 1: CSS Changes (`www/css/main.scss`)

- [ ] Add shrink-to-corner keyframes (4 corners)
  - Use `transform: scale(0)` with `transform-origin` for corner anchoring
  - Duration: 400ms, ease-in timing
- [ ] Add gravity slide keyframes (left/right)
  - Use CSS custom property `--gravity-distance` for dynamic distance
  - Duration: 300ms, ease-out timing
- [ ] Add `.instant-vanish` class for low-powered fallback
- [ ] Update slide-in duration to 800ms (keep bounce keyframes)
- [ ] Remove up/down slide-out keyframes (cleanup)

---

## Phase 2: JavaScript Changes (`www/js/main.js`)

- [ ] Update `SLIDE_DIRECTIONS` to `['left', 'right']` only (line 94)
- [ ] Add timing constants:
  - `SHRINK_ANIMATION_DURATION = 400`
  - `GRAVITY_ANIMATION_DURATION = 300`
  - `SLIDE_IN_ANIMATION_DURATION = 800`
- [ ] Add `ENABLE_SHRINK_ANIMATION` config constant (default: true)
- [ ] Add `supportsFullAnimation()` capability detection function
- [ ] Add `getShrinkCornerClass(direction, isTopRow)` helper
- [ ] Add `animatePhaseA()` - shrink or vanish photos
- [ ] Add `animatePhaseBGravity()` - slide remaining photos into gap
- [ ] Add `animatePhaseC()` - slide in new photo with bounce
- [ ] Refactor `animateSwap()` to use Promise chain for three phases
- [ ] Remove `getOppositeDirection()` (no longer needed)

---

## Phase 3: Tests

- [ ] Unit tests for `getShrinkCornerClass()` corner calculation
- [ ] Unit tests for direction validation (only left/right)
- [ ] E2E test: verify no up/down animations occur
- [ ] E2E test: verify `prefers-reduced-motion` triggers instant vanish

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

- [ ] Build SCSS: `cd www && npm run build`
- [ ] Run unit tests: `npm test`
- [ ] Run E2E tests: `npm run test:e2e`
- [ ] Manual testing:
  - Start server: `PHOTO_LIBRARY=test/fixtures/mock-photos npm start`
  - Open `http://localhost:3000`
  - Wait for photo swap (10 seconds)
  - Verify: photos shrink to corner, gravity fills gap, new photo slides in
  - Test reduced motion: Chrome DevTools → Rendering → Emulate CSS media "prefers-reduced-motion: reduce"
