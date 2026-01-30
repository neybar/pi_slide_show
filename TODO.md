# TODO: Layout Variety Improvements

## Summary

The current layout algorithm produces repetitive "Landscape, Landscape, Portrait" patterns on both rows due to deterministic left-to-right filling based on container aspect ratio. This improvement adds randomness at multiple levels to create more visually interesting and varied layouts.

## Problem Analysis

The current `build_row()` algorithm is deterministic:
- Always fills left-to-right
- Always prefers matching orientation (landscape for wide containers)
- Both rows use identical logic, producing mirror patterns
- For 5-column wide displays: remaining cols 5→wide→L, 3→wide→L, 1→narrow→P = always "L,L,P"

## Improvements

| Improvement | Description |
|-------------|-------------|
| Randomized orientation selection | 70% prefer matching orientation, 30% random pick |
| Randomized fill direction | Sometimes fill right-to-left instead of left-to-right |
| Variable portrait positions | Portraits can appear anywhere, not just at row end |
| Inter-row pattern variation | Top and bottom rows weighted to differ |
| Stacked landscapes | Preserve and expand existing two-landscapes-in-one-column feature |

## Configuration

| Setting | Value |
|---------|-------|
| Orientation match probability | 70% (0.7) |
| Fill direction randomization | 50% left-to-right, 50% right-to-left |
| Inter-row difference weight | Soft preference (not forced) |

---

## Phase 1: Add Configuration Constants

- [x] Add `ORIENTATION_MATCH_PROBABILITY = 0.7` constant in `www/js/main.js`
- [x] Add `FILL_RIGHT_TO_LEFT_PROBABILITY = 0.5` constant in `www/js/main.js`
- [x] Add `INTER_ROW_DIFFER_PROBABILITY = 0.7` constant in `www/js/main.js`

---

## Phase 2: Randomize Orientation Selection

- [ ] Modify `selectPhotoForContainer(containerAspectRatio)` to accept optional `forceRandom` parameter
- [ ] Add probability-based selection logic:
  - [ ] Roll random number against `ORIENTATION_MATCH_PROBABILITY`
  - [ ] If within probability: use current matching logic (prefer landscape for wide, portrait for narrow)
  - [ ] If outside probability: pick randomly from all available photos regardless of container shape
- [ ] Ensure fallback behavior when only one type is available

---

## Phase 3: Randomize Fill Direction

- [ ] Add `getRandomFillDirection()` helper function returning 'ltr' or 'rtl'
- [ ] Modify `build_row()` to use random fill direction:
  - [ ] For 'ltr': current behavior (append photos to row)
  - [ ] For 'rtl': prepend photos to row (or build array and reverse)
- [ ] Adjust `remainingColumns` calculation based on fill direction
- [ ] Ensure panorama positioning still works correctly with both directions

---

## Phase 4: Variable Portrait Positions

- [ ] Add `generateRowPattern(totalColumns, availablePhotos)` function
  - [ ] Generate array of slot widths that sum to totalColumns
  - [ ] Randomly decide portrait (1-col) vs landscape (2-col) for each position
  - [ ] Consider available photos to avoid impossible patterns
  - [ ] Return pattern array like `[2, 1, 2]` or `[1, 2, 2]` or `[2, 2, 1]`
- [ ] Modify `build_row()` to use generated pattern instead of greedy filling
- [ ] Handle edge cases:
  - [ ] Not enough photos of required orientation → fall back to available
  - [ ] Panorama present → adjust pattern to accommodate

---

## Phase 5: Stacked Landscapes Enhancement

- [ ] Extract stacked-landscapes logic into `createStackedLandscapes(column)` helper
- [ ] Allow stacked landscapes in any 1-column slot (not just final position)
- [ ] Add probability for choosing stacked-landscapes vs single-portrait for 1-col slots
- [ ] Ensure proper styling for stacked landscapes (half-height each)

---

## Phase 6: Inter-Row Pattern Variation

- [ ] Add `lastTopRowPattern` variable to track top row's pattern
- [ ] After building top row, store its pattern signature (e.g., "LLP" or "PLL")
- [ ] When building bottom row:
  - [ ] Generate candidate pattern
  - [ ] With `INTER_ROW_DIFFER_PROBABILITY`, prefer patterns different from top row
  - [ ] Not forced - if random selection produces same pattern, that's acceptable
- [ ] Reset pattern tracking on full page refresh

---

## Phase 7: Update Individual Photo Swap

- [ ] Update `selectRandomPhotoFromStore()` to use randomized orientation selection
- [ ] Update `fillRemainingSpace()` to use randomized selection
- [ ] Ensure swapped photos don't always follow the same orientation preference
- [ ] Consider swap position when selecting orientation (edge vs middle)

---

## Phase 8: Unit Tests

- [ ] Add tests for `selectPhotoForContainer()` with randomization
  - [ ] Test that matching orientation is selected ~70% of time (statistical)
  - [ ] Test fallback when only one orientation available
- [ ] Add tests for `generateRowPattern()`
  - [ ] Test patterns sum to correct total columns
  - [ ] Test various column counts (4 and 5)
  - [ ] Test with limited photo availability
- [ ] Add tests for fill direction
  - [ ] Test 'ltr' produces expected layout
  - [ ] Test 'rtl' produces reversed layout
- [ ] Add tests for stacked landscapes helper

---

## Phase 9: E2E Tests

- [ ] Add layout variety test
  - [ ] Load slideshow multiple times
  - [ ] Capture row patterns
  - [ ] Verify patterns are not always identical (statistical check)
- [ ] Add inter-row difference test
  - [ ] Verify top and bottom rows don't always match

---

## Phase 10: Manual Testing

- [ ] Start server: `PHOTO_LIBRARY=test/fixtures/mock-photos npm start`
- [ ] Open browser to `http://localhost:3000`
- [ ] Refresh multiple times and observe:
  - [ ] Layouts vary between refreshes
  - [ ] Top and bottom rows often have different patterns
  - [ ] Portraits appear in different positions (not always last)
  - [ ] Stacked landscapes appear occasionally
- [ ] Let slideshow run and observe swaps maintain variety

---

## Verification Checklist

- [ ] `npm test` unit tests pass (including new variety tests)
- [ ] `npm run test:e2e` E2E tests pass
- [ ] Manual verification confirms visible variety in layouts
- [ ] No performance regression from added randomization

---

## Deployment

**Status: IN PROGRESS** - Phase 1 complete, continuing implementation.

---

## Files to Modify

| File | Changes |
|------|---------|
| `www/js/main.js` | Configuration constants, randomized selection, pattern generation, fill direction |
| `test/unit/layout-variety.test.mjs` | New unit tests for variety features |
| `test/e2e/slideshow.spec.mjs` | New E2E tests for layout variety |
